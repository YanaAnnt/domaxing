// Personalised daily briefing: rules-based summary, rewritten by Claude when available.
import { admin, ai, getPrefs } from "./db.ts";
import { aiBriefing } from "./ai.ts";
import { addDays, dateKeyIn, localParts, zonedToUtc } from "./time.ts";

export interface Briefing {
  headline: string;
  body: string;
  source: "ai" | "rules";
  stats: { events: number; due: number; overdue: number; suggestions: number };
}

function greeting(hour: number) {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export async function buildBriefing(userId: string, opts: { useAi?: boolean } = {}): Promise<Briefing> {
  const prefs = await getPrefs(userId);
  const tz = prefs.timezone;
  const now = new Date();
  const today = dateKeyIn(now, tz);
  const dayStart = zonedToUtc(today, "00:00", tz);
  const weekEnd = zonedToUtc(addDays(today, 7), "00:00", tz);

  const [{ data: events }, { data: tasks }, { count: suggestions }] = await Promise.all([
    admin.from("calendar_events").select("title, starts_at, all_day").eq("user_id", userId).eq("status", "confirmed")
      .gte("starts_at", dayStart.toISOString()).lt("starts_at", weekEnd.toISOString()).order("starts_at").limit(60),
    admin.from("tasks").select("title, due_date, due_time, priority").eq("user_id", userId).eq("completed", false).eq("deleted", false)
      .lte("due_date", addDays(today, 7)).order("priority", { ascending: false }).limit(200),
    admin.from("ai_suggestions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending"),
  ]);

  const todays = (events ?? []).filter((e) => dateKeyIn(new Date(e.starts_at), tz) === today);
  const later = (events ?? []).filter((e) => dateKeyIn(new Date(e.starts_at), tz) !== today);
  const due = (tasks ?? []).filter((t) => t.due_date === today);
  const overdue = (tasks ?? []).filter((t) => t.due_date && t.due_date < today);
  const stats = { events: todays.length, due: due.length, overdue: overdue.length, suggestions: suggestions ?? 0 };
  const hour = localParts(now, tz).hh;
  const timeOf = (iso: string) => localParts(new Date(iso), tz).time;

  // Rules version (always available, also the fallback)
  const parts: string[] = [];
  if (todays.length) {
    const first = todays.find((e) => !e.all_day) ?? todays[0];
    parts.push(
      `${todays.length} ${todays.length === 1 ? "event" : "events"} today` +
        (first.all_day ? `, starting with ${first.title}.` : `, first up ${first.title} at ${timeOf(first.starts_at)}.`),
    );
  } else parts.push("Your calendar is clear today.");
  if (due.length || overdue.length) {
    const top = [...overdue, ...due].sort((a, b) => b.priority - a.priority)[0];
    parts.push(
      `${due.length} ${due.length === 1 ? "task" : "tasks"} due${overdue.length ? ` and ${overdue.length} overdue` : ""}` +
        (top ? `. Start with “${top.title}”.` : "."),
    );
  } else parts.push("No tasks due. A good day to get ahead.");
  if (stats.suggestions) parts.push(`${stats.suggestions} ${stats.suggestions === 1 ? "suggestion is" : "suggestions are"} waiting for you.`);
  let out: Briefing = { headline: `${greeting(hour)}`, body: parts.join(" "), source: "rules", stats };

  if (opts.useAi !== false && prefs.aiEnabled) {
    const client = await ai();
    if (client) {
      try {
        const r = await aiBriefing(client, {
          localTime: `${today} ${localParts(now, tz).time}`,
          weekday: new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now),
          eventsToday: todays.map((e) => ({ title: e.title, time: e.all_day ? "all day" : timeOf(e.starts_at) })),
          eventsThisWeek: later.slice(0, 15).map((e) => ({ title: e.title, day: dateKeyIn(new Date(e.starts_at), tz) })),
          tasksDueToday: due.slice(0, 20).map((t) => ({ title: t.title, time: t.due_time, priority: t.priority })),
          overdue: overdue.slice(0, 10).map((t) => ({ title: t.title, due: t.due_date, priority: t.priority })),
          pendingSuggestions: stats.suggestions,
        });
        out = { headline: r.headline.slice(0, 80), body: r.body.slice(0, 800), source: "ai", stats };
      } catch (e) {
        console.warn("[briefing] AI failed:", (e as Error).message);
      }
    }
  }

  await admin.from("briefings").upsert(
    { user_id: userId, day: today, content: JSON.stringify(out), source: out.source, created_at: new Date().toISOString() },
    { onConflict: "user_id,day" },
  );
  return out;
}
