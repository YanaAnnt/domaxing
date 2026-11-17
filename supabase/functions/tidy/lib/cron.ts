// Runs every 5 minutes (pg_cron → pg_net → this function).
// Delivers reminders even when the app is closed, sends the daily briefing,
// keeps calendars fresh and plans new suggestions, while respecting quiet hours and push limits.
import { admin, getPrefs, markOnce, type UserPrefs } from "./db.ts";
import { pushToUser, hasPush } from "./push.ts";
import { buildBriefing } from "./briefing.ts";
import { syncConnection, type Connection } from "./calendar.ts";
import { planUser } from "./plan.ts";
import { addDays, dateKeyIn, inQuietHours, localParts, minutesOf, zonedToUtc } from "./time.ts";

const prefsCache = new Map<string, UserPrefs>();
async function prefsFor(userId: string) {
  if (!prefsCache.has(userId)) prefsCache.set(userId, await getPrefs(userId));
  return prefsCache.get(userId)!;
}

/** Proactive (non-reminder) pushes are capped per day and silenced during quiet hours. */
async function proactiveAllowed(userId: string, prefs: UserPrefs): Promise<boolean> {
  const local = localParts(new Date(), prefs.timezone);
  if (inQuietHours(local.time, prefs.quietStart, prefs.quietEnd)) return false;
  const { count } = await admin.from("notification_log").select("id", { count: "exact", head: true })
    .eq("user_id", userId).like("key", `pro:${local.dateKey}:%`);
  return (count ?? 0) < prefs.maxDailyPush;
}

async function remindersExplicit(now: Date) {
  const { data } = await admin.from("tasks").select("id, user_id, title, reminder_at")
    .eq("completed", false).eq("deleted", false)
    .lte("reminder_at", now.toISOString()).gte("reminder_at", new Date(now.getTime() - 6 * 3600_000).toISOString())
    .limit(500);
  let sent = 0;
  for (const t of data ?? []) {
    if (!(await markOnce(t.user_id, `rem:${t.id}:${t.reminder_at}`))) continue;
    sent += await pushToUser(t.user_id, { title: "Reminder", body: t.title, tag: `task-${t.id}`, taskId: t.id, url: "/#/today" });
  }
  return sent;
}

/** Tasks with a due time get a nudge `defaultReminderMinutes` before, unless an explicit reminder exists. */
async function remindersDefault(now: Date) {
  const utcToday = now.toISOString().slice(0, 10);
  const { data } = await admin.from("tasks").select("id, user_id, title, due_date, due_time")
    .eq("completed", false).eq("deleted", false).is("reminder_at", null).not("due_time", "is", null)
    .gte("due_date", addDays(utcToday, -1)).lte("due_date", addDays(utcToday, 1)).limit(1000);
  let sent = 0;
  for (const t of data ?? []) {
    const prefs = await prefsFor(t.user_id);
    if (prefs.defaultReminderMinutes <= 0) continue;
    const due = zonedToUtc(t.due_date, t.due_time, prefs.timezone);
    const fireAt = due.getTime() - prefs.defaultReminderMinutes * 60_000;
    if (fireAt > now.getTime() || now.getTime() - fireAt > 20 * 60_000) continue;
    if (inQuietHours(localParts(now, prefs.timezone).time, prefs.quietStart, prefs.quietEnd)) continue;
    if (!(await markOnce(t.user_id, `due:${t.id}:${t.due_date}T${t.due_time}`))) continue;
    sent += await pushToUser(t.user_id, {
      title: `In ${prefs.defaultReminderMinutes} min`,
      body: t.title,
      tag: `task-${t.id}`,
      taskId: t.id,
      url: "/#/today",
    });
  }
  return sent;
}

async function briefings(now: Date) {
  const { data } = await admin.from("user_prefs").select("user_id").eq("briefing_enabled", true).limit(1000);
  let sent = 0;
  for (const { user_id } of data ?? []) {
    const prefs = await prefsFor(user_id);
    const local = localParts(now, prefs.timezone);
    const delta = minutesOf(local.time) - minutesOf(prefs.briefingTime);
    if (delta < 0 || delta >= 20) continue;
    if (!(await markOnce(user_id, `brief:${local.dateKey}`))) continue;
    const b = await buildBriefing(user_id);
    if (await hasPush(user_id) && (await proactiveAllowed(user_id, prefs))) {
      await markOnce(user_id, `pro:${local.dateKey}:brief`);
      sent += await pushToUser(user_id, { title: b.headline, body: b.body, tag: "briefing", url: "/#/today" });
    }
  }
  return sent;
}

async function calendarsAndPlanning(now: Date, budgetMs: number) {
  const stale = new Date(now.getTime() - 30 * 60_000).toISOString();
  const { data } = await admin.from("calendar_connections").select("*")
    .or(`last_synced_at.is.null,last_synced_at.lt.${stale}`).order("last_synced_at", { ascending: true, nullsFirst: true }).limit(15);
  const users = new Set<string>();
  const started = Date.now();
  for (const c of (data ?? []) as Connection[]) {
    if (Date.now() - started > budgetMs) break;
    try {
      await syncConnection(c, (await prefsFor(c.user_id)).timezone);
      users.add(c.user_id);
    } catch (e) {
      console.warn("[cron] sync failed", c.id, (e as Error).message);
    }
  }
  let suggestions = 0;
  for (const u of users) {
    if (Date.now() - started > budgetMs * 2) break;
    try {
      const r = await planUser(u);
      suggestions += r.created;
      if (r.created > 0) {
        const prefs = await prefsFor(u);
        const day = dateKeyIn(now, prefs.timezone);
        if (await hasPush(u) && (await proactiveAllowed(u, prefs)) && (await markOnce(u, `pro:${day}:sugg:${now.getUTCHours()}`))) {
          await pushToUser(u, {
            title: "New suggestions",
            body: `${r.created} ${r.created === 1 ? "plan is" : "plans are"} ready to review, based on your calendar.`,
            tag: "suggestions",
            url: "/#/assistant",
          });
        }
      }
    } catch (e) {
      console.warn("[cron] plan failed", u, (e as Error).message);
    }
  }
  return { synced: users.size, suggestions };
}

async function housekeeping(now: Date) {
  await admin.from("ai_suggestions").update({ status: "expired", decided_at: now.toISOString() })
    .eq("status", "pending").lt("event_start", now.toISOString());
  await admin.from("notification_log").delete().lt("sent_at", new Date(now.getTime() - 90 * 86400000).toISOString())
    .not("key", "like", "plan:%");
}

export async function runCron() {
  const now = new Date();
  prefsCache.clear();
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = `error: ${(e as Error).message}`;
      console.error(`[cron] ${name}`, e);
    }
  };
  await step("reminders", () => remindersExplicit(now));
  await step("dueNudges", () => remindersDefault(now));
  await step("briefings", () => briefings(now));
  await step("calendars", () => calendarsAndPlanning(now, 45_000));
  await step("housekeeping", () => housekeeping(now));
  return out;
}
