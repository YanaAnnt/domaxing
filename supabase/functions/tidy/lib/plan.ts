// Turns upcoming calendar events into preparation suggestions (AI first, rules as fallback).
import { admin, ai, getPrefs, type UserPrefs } from "./db.ts";
import { aiPlan, type AiPlan } from "./ai.ts";
import { addDays, dateKeyIn, diffDays, localParts } from "./time.ts";
import { classify, planWithRules, sanitizeTasks, type DraftSuggestion, type LoadMap, type PlanEvent, type PrepCategory } from "./planner.ts";

const AI_HORIZON_DAYS = 35; // look this far ahead for events worth preparing
const UNKNOWN_HORIZON_DAYS = 10; // events the rules can't classify are only sent to AI when this close
const MAX_AI_EVENTS = 12;

export interface PlanResult {
  created: number;
  source: "ai" | "rules" | "none";
  aiError?: string;
}

async function loadMap(userId: string, prefs: UserPrefs, today: string): Promise<{ load: LoadMap; existing: { title: string; due: string | null }[] }> {
  const end = addDays(today, 60);
  const [{ data: tasks }, { data: events }] = await Promise.all([
    admin.from("tasks").select("title, due_date").eq("user_id", userId).eq("completed", false).eq("deleted", false)
      .gte("due_date", today).lte("due_date", end).limit(1000),
    admin.from("calendar_events").select("starts_at, ends_at, all_day").eq("user_id", userId).eq("status", "confirmed")
      .gte("starts_at", new Date().toISOString()).lte("starts_at", new Date(Date.now() + 60 * 86400000).toISOString()).limit(2000),
  ]);
  const load: LoadMap = {};
  for (const t of tasks ?? []) if (t.due_date) load[t.due_date] = (load[t.due_date] ?? 0) + 1;
  for (const e of events ?? []) {
    const k = dateKeyIn(new Date(e.starts_at), prefs.timezone);
    const hours = e.all_day ? 1 : e.ends_at ? (new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 3600000 : 1;
    load[k] = (load[k] ?? 0) + Math.min(4, Math.max(0.5, hours)) * 0.5;
  }
  return { load, existing: (tasks ?? []).map((t) => ({ title: t.title, due: t.due_date })) };
}

async function saveSuggestion(userId: string, ev: PlanEvent, s: DraftSuggestion, source: "ai" | "rules") {
  const { error } = await admin.from("ai_suggestions").upsert(
    {
      user_id: userId,
      dedupe_key: `prep:${ev.key}`,
      event_key: ev.key,
      kind: "prep",
      category: s.category,
      title: s.title.slice(0, 200),
      reason: s.reason.slice(0, 600),
      event_title: ev.title,
      event_start: ev.start.toISOString(),
      payload: { tasks: s.tasks },
      status: "pending",
      source,
      decided_at: null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,dedupe_key" },
  );
  if (error) throw error;
}

async function markPlanned(userId: string, keys: string[]) {
  if (!keys.length) return;
  await admin.from("notification_log").upsert(
    keys.map((k) => ({ user_id: userId, key: `plan:${k}` })),
    { onConflict: "user_id,key", ignoreDuplicates: true },
  );
}

export async function planUser(userId: string, opts: { force?: boolean } = {}): Promise<PlanResult> {
  const prefs = await getPrefs(userId);
  const now = new Date();
  const tz = prefs.timezone;
  const today = dateKeyIn(now, tz);

  const { data: rows } = await admin
    .from("calendar_events")
    .select("event_key, title, description, location, starts_at, ends_at, all_day")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + AI_HORIZON_DAYS * 86400000).toISOString())
    .order("starts_at")
    .limit(400);
  if (!rows?.length) return { created: 0, source: "none" };

  // Skip events we've already decided on (and events with an existing suggestion of any status).
  const [{ data: marks }, { data: existingSugg }] = await Promise.all([
    admin.from("notification_log").select("key").eq("user_id", userId).like("key", "plan:%"),
    admin.from("ai_suggestions").select("event_key, status").eq("user_id", userId).eq("kind", "prep").in("event_key", rows.map((r) => r.event_key)),
  ]);
  const done = new Set((marks ?? []).map((m) => m.key.slice(5)));
  for (const s of existingSugg ?? []) if (s.status !== "expired") done.add(s.event_key);

  const candidates: { ev: PlanEvent; cat: PrepCategory | null; days: number }[] = [];
  for (const r of rows) {
    if (done.has(r.event_key) && !opts.force) continue;
    const ev: PlanEvent = {
      key: r.event_key, title: r.title, description: r.description, location: r.location,
      start: new Date(r.starts_at), end: r.ends_at ? new Date(r.ends_at) : null, allDay: r.all_day,
    };
    const cat = classify(ev);
    const days = diffDays(dateKeyIn(ev.start, tz), today);
    const inWindow = cat ? prefs.prep[cat].enabled && days <= prefs.prep[cat].leadDays : days <= UNKNOWN_HORIZON_DAYS;
    if (!inWindow) continue; // too early: revisit when the lead window opens
    candidates.push({ ev, cat, days });
  }
  if (!candidates.length) return { created: 0, source: "none" };

  const { load, existing } = await loadMap(userId, prefs, today);
  const client = prefs.aiEnabled ? await ai() : null;
  let created = 0;
  let aiError: string | undefined;
  const handled = new Set<string>();

  if (client) {
    const batch = candidates.slice(0, MAX_AI_EVENTS);
    try {
      const plans = await aiPlan(client, {
        today,
        timezone: tz,
        weekday: new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now),
        preferences: {
          leadDays: Object.fromEntries(Object.entries(prefs.prep).map(([k, v]) => [k, v.leadDays])),
          enabledCategories: Object.entries(prefs.prep).filter(([, v]) => v.enabled).map(([k]) => k),
          studyMinutes: prefs.studyMinutes,
          preferredWorkTime: prefs.workTime,
        },
        events: batch.map(({ ev, cat }) => {
          const lp = localParts(ev.start, tz);
          return {
            event_key: ev.key,
            title: ev.title,
            start_local: ev.allDay ? lp.dateKey : `${lp.dateKey} ${lp.time}`,
            all_day: ev.allDay,
            location: ev.location ?? null,
            description: ev.description ? ev.description.slice(0, 600) : null,
            rule_category: cat,
          };
        }),
        busyDays: Object.fromEntries(Object.entries(load).filter(([k]) => k >= today && k <= addDays(today, 45)).map(([k, v]) => [k, Math.round(v * 10) / 10])),
        existingTasks: existing.slice(0, 150),
      });
      const byKey = new Map<string, AiPlan>(plans.map((p) => [p.event_key, p]));
      for (const { ev } of batch) {
        const p = byKey.get(ev.key);
        if (!p) continue;
        handled.add(ev.key);
        if (!p.needs_prep || !p.tasks?.length) continue;
        const tasks = sanitizeTasks(
          p.tasks.map((t) => ({ title: t.title, notes: t.notes, dueDate: t.due_date, dueTime: t.due_time || null, priority: t.priority as 0, subtasks: t.subtasks, reminder: t.reminder })),
          today,
          dateKeyIn(ev.start, tz),
        );
        if (!tasks.length) continue;
        await saveSuggestion(userId, ev, { eventKey: ev.key, category: p.category === "other" ? "other" : p.category, title: p.title, reason: p.reason, tasks }, "ai");
        created++;
      }
    } catch (e) {
      aiError = e instanceof Error ? e.message : String(e);
      console.warn("[plan] AI planning failed, using rules:", aiError);
    }
  }

  // Rules: anything AI didn't cover (or everything, without AI).
  for (const { ev, cat } of candidates) {
    if (handled.has(ev.key)) continue;
    if (!cat) continue; // only AI can judge events the rules don't recognise
    const s = planWithRules(ev, cat, prefs, now, load);
    handled.add(ev.key);
    if (s) {
      await saveSuggestion(userId, ev, s, "rules");
      created++;
    }
  }
  // Remember decisions so we don't re-plan (or re-spend AI tokens on) the same events.
  await markPlanned(userId, [...handled]);
  // Without AI, unrecognised events never need another look.
  if (!client) await markPlanned(userId, candidates.filter((c) => !c.cat).map((c) => c.ev.key));
  return { created, source: client && !aiError ? "ai" : "rules", aiError };
}
