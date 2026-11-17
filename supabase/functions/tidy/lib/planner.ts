// Rule-based preparation planner. Pure functions, no I/O.
// Used directly when AI is unavailable, and to validate/clean AI output.

import { addDays, dateKeyIn, diffDays, localParts, weekdayOf } from "./time.ts";

export type PrepCategory = "exam" | "travel" | "meeting" | "birthday" | "deadline";
export const CATEGORIES: PrepCategory[] = ["exam", "travel", "meeting", "birthday", "deadline"];

export interface PlanEvent {
  key: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end?: Date | null;
  allDay: boolean;
}

export interface PrepPrefs {
  timezone: string;
  prep: Record<PrepCategory, { enabled: boolean; leadDays: number }>;
  studyMinutes: number;
  workTime: "morning" | "afternoon" | "evening";
}

export interface DraftTask {
  title: string;
  notes: string;
  dueDate: string; // YYYY-MM-DD in user tz
  dueTime: string | null; // HH:mm
  priority: 0 | 1 | 2 | 3 | 4;
  subtasks: string[];
  reminder: boolean;
}

export interface DraftSuggestion {
  eventKey: string;
  category: PrepCategory | "other";
  title: string;
  reason: string;
  tasks: DraftTask[];
}

/** Number of tasks/busy-ness per day, used to spread work onto lighter days. */
export type LoadMap = Record<string, number>;

export const DEFAULT_PREP: PrepPrefs["prep"] = {
  exam: { enabled: true, leadDays: 14 },
  travel: { enabled: true, leadDays: 30 },
  meeting: { enabled: true, leadDays: 3 },
  birthday: { enabled: true, leadDays: 7 },
  deadline: { enabled: true, leadDays: 5 },
};

// ---------------- classification ----------------
const RX = {
  birthday: /\b(birthday|b-?day|geburtstag|cumpleaños|anniversaire|anniversary)\b|🎂|🎉/i,
  exam: /\b(exam|exams|midterm|mid-term|final exam|finals|quiz|test|prüfung|klausur|examen|oral exam|assessment|olympiad)\b/i,
  travel: /\b(flight|flights|fly to|flying|airport|boarding|trip to|travel|vacation|holiday in|getaway|hotel|train to|road trip)\b|✈/i,
  flightNo: /\b(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{2,4}\b/,
  deadline: /\b(deadline|due|submission|submit|hand-?in|abgabe|filing|tax return)\b/i,
  meeting: /\b(interview|presentation|present|pitch|review|demo|board|client|workshop|conference|keynote|defen[cs]e|1:1|one-on-one|meeting with|negotiation|appraisal|performance review|kick-?off)\b/i,
};

export function classify(e: Pick<PlanEvent, "title" | "description">): PrepCategory | null {
  const text = `${e.title} ${e.description ?? ""}`;
  if (RX.birthday.test(text)) return "birthday";
  if (RX.exam.test(e.title) || /\bexam\b/i.test(text)) return "exam";
  if (RX.travel.test(text) || (RX.flightNo.test(e.title) && /\bto\b|→|->|✈/i.test(e.title))) return "travel";
  if (RX.deadline.test(e.title)) return "deadline";
  if (RX.meeting.test(e.title)) return "meeting";
  return null;
}

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s:\u2013\u2014\-|·]+|[\s:\u2013\u2014\-|·]+$/g, "").trim();

export function subjectOf(title: string, category: PrepCategory): string {
  let s = title;
  if (category === "exam") s = s.replace(/\b(final exam|mid-?term|exams?|finals?|quiz|test|oral|prüfung|klausur|examen)\b/gi, "");
  if (category === "deadline") s = s.replace(/\b(deadline|due|submission|submit)\b/gi, "");
  s = clean(s.replace(/[()[\]]/g, " "));
  return s || title;
}

export function personOf(title: string): string {
  const m =
    title.match(/^(.+?)['’]s\s+(?:birthday|b-?day)/i) ??
    title.match(/(?:birthday|b-?day|geburtstag)[:\s-]+(?:of\s+)?(.+)$/i) ??
    title.match(/^(.+?)\s+(?:birthday|b-?day)/i);
  const name = m ? clean(m[1].replace(/🎂|🎉/g, "")) : "";
  return name || "them";
}

export function destinationOf(e: PlanEvent): string {
  const m = e.title.match(/\b(?:to|→|->)\s+([A-Z][\p{L}\s.'-]{1,40})/u);
  if (m) return clean(m[1]);
  if (e.location) return clean(e.location.split(",")[0]);
  return "your trip";
}

// ---------------- templates ----------------
interface Step {
  offset: number; // days before the event (0 = event day)
  title: string;
  notes?: string;
  priority?: DraftTask["priority"];
  subtasks?: string[];
  reminder?: boolean;
  time?: string | "work";
  fixed?: boolean; // keep on exactly this day (don't load-balance)
}

function templates(e: PlanEvent, cat: PrepCategory, prefs: PrepPrefs, daysUntil: number): { title: string; reason: string; steps: Step[] } {
  const lead = Math.min(prefs.prep[cat].leadDays, Math.max(daysUntil, 1));
  switch (cat) {
    case "exam": {
      const s = subjectOf(e.title, "exam");
      const sessions = Math.max(2, Math.min(6, Math.round(lead / 2.5)));
      const steps: Step[] = [
        { offset: lead, title: `Gather notes, slides and past papers for ${s}`, priority: 2 },
        {
          offset: Math.max(lead - 1, 1),
          title: `Make a study plan for ${s}`,
          subtasks: ["List every topic on the syllabus", "Mark your weakest topics", "Block study time in your calendar"],
          priority: 2,
        },
      ];
      const first = Math.max(lead - 2, 3);
      for (let i = 0; i < sessions; i++) {
        const offset = Math.round(first - ((first - 3) * i) / Math.max(sessions - 1, 1));
        steps.push({
          offset: Math.max(offset, 3),
          title: `Study session ${i + 1}/${sessions}: ${s}`,
          notes: `${prefs.studyMinutes} minutes of focused revision. Start with your weakest topics.`,
          priority: 2,
          time: "work",
          reminder: true,
        });
      }
      steps.push({ offset: 2, title: `Practice exam for ${s}`, notes: "Do a past paper under timed conditions, then review mistakes.", priority: 3, time: "work" });
      steps.push({
        offset: 1,
        title: `Final review and pack for ${s}`,
        subtasks: ["Skim your summary notes", "Pack ID, pens and calculator", "Check exam room and start time", "Sleep early"],
        priority: 3,
        reminder: true,
        fixed: true,
      });
      return { title: `Study plan for ${s}`, reason: `${s} is in ${daysUntil} days. Spreading revision over ${sessions} sessions on your lighter days.`, steps };
    }
    case "travel": {
      const d = destinationOf(e);
      const steps: Step[] = [
        { offset: 30, title: `Check passport, ID and visa requirements for ${d}`, priority: 3 },
        { offset: 21, title: `Order anything you need for ${d}`, notes: "Clothes, adapters, toiletries, travel insurance.", priority: 1 },
        { offset: 14, title: `Confirm hotel and reservations for ${d}`, priority: 2 },
        { offset: 7, title: `Plan transport to the airport`, priority: 1 },
        {
          offset: 3,
          title: `Write a packing list for ${d}`,
          subtasks: ["Passport and documents", "Chargers and adapters", "Clothes", "Toiletries", "Medication"],
        },
        { offset: 1, title: `Online check-in and download boarding pass`, priority: 3, reminder: true, fixed: true },
        { offset: 1, title: `Pack your luggage`, priority: 2, fixed: true },
      ];
      if (!e.allDay) {
        const local = localParts(new Date(e.start.getTime() - 3 * 3600_000), prefs.timezone);
        steps.push({ offset: 0, title: `Leave for the airport ✈️`, priority: 4, reminder: true, time: local.time, fixed: true });
      }
      return {
        title: `Trip prep for ${d}`,
        reason: `Your trip is in ${daysUntil} days. These steps start early so nothing is left for the last minute.`,
        steps: steps.filter((s) => s.offset <= Math.max(prefs.prep.travel.leadDays, 1)),
      };
    }
    case "meeting": {
      const t = clean(e.title);
      return {
        title: `Prepare for ${t}`,
        reason: `${t} is in ${daysUntil} ${daysUntil === 1 ? "day" : "days"}.`,
        steps: [
          { offset: 3, title: `Review agenda and background for ${t}` },
          { offset: 2, title: `Prepare talking points for ${t}`, priority: 2, time: "work" },
          { offset: 1, title: `Final prep for ${t}: questions and logistics`, priority: 2, reminder: true, fixed: true },
        ],
      };
    }
    case "birthday": {
      const p = personOf(e.title);
      const who = p === "them" ? "the birthday" : p;
      return {
        title: `Birthday: ${who}`,
        reason: `${p === "them" ? "A birthday" : `${p}'s birthday`} is in ${daysUntil} days. A little time to get a gift sorted.`,
        steps: [
          { offset: 7, title: `Choose a gift for ${who}` },
          { offset: 5, title: `Order or buy the gift for ${who}`, priority: 2 },
          { offset: 1, title: `Write a card for ${who}`, fixed: true },
          { offset: 0, title: `Wish ${who} a happy birthday 🎉`, priority: 2, reminder: true, time: "09:00", fixed: true },
        ],
      };
    }
    case "deadline": {
      const t = subjectOf(e.title, "deadline");
      return {
        title: `Get ${t} done on time`,
        reason: `${t} is due in ${daysUntil} days.`,
        steps: [
          { offset: 5, title: `Start working on ${t}`, priority: 2, time: "work" },
          { offset: 2, title: `Finish a complete draft of ${t}`, priority: 2, time: "work" },
          { offset: 1, title: `Final check and submit ${t}`, priority: 3, reminder: true, fixed: true },
        ],
      };
    }
  }
}

const WORK_TIME: Record<PrepPrefs["workTime"], string> = { morning: "09:00", afternoon: "14:00", evening: "19:00" };

/** Pick the lightest day near `target`, never before today and never after `latest`. */
export function placeDay(target: string, today: string, latest: string, load: LoadMap, slack = 1): string {
  let best = target < today ? today : target > latest ? latest : target;
  let bestScore = Infinity;
  for (let d = -slack; d <= slack; d++) {
    const k = addDays(target, d);
    if (k < today || k > latest) continue;
    const weekend = [0, 6].includes(weekdayOf(k)) ? 0.3 : 0;
    const score = (load[k] ?? 0) + Math.abs(d) * 0.6 + weekend;
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

export function planWithRules(e: PlanEvent, cat: PrepCategory, prefs: PrepPrefs, now: Date, load: LoadMap): DraftSuggestion | null {
  const tz = prefs.timezone;
  const today = dateKeyIn(now, tz);
  const eventDay = dateKeyIn(e.start, tz);
  const daysUntil = diffDays(eventDay, today);
  if (daysUntil < 0) return null;
  if (!prefs.prep[cat]?.enabled) return null;
  if (daysUntil > prefs.prep[cat].leadDays) return null;

  const tpl = templates(e, cat, prefs, daysUntil);
  const lead = prefs.prep[cat].leadDays;
  // Compress the plan if the event is closer than the usual lead time.
  // Exam plans already adapt to the time left; travel uses absolute offsets, so compress those.
  const scale = cat === "travel" && daysUntil < lead ? daysUntil / lead : 1;
  let floor = today; // keep steps in order
  const tasks: DraftTask[] = [];
  const seenTitles = new Set<string>();

  for (const s of tpl.steps) {
    if (daysUntil === 0 && s.offset !== 0) continue;
    let offset = s.fixed || s.offset <= 1 ? s.offset : Math.max(1, Math.round(s.offset * scale));
    if (offset > daysUntil) offset = daysUntil;
    const target = addDays(eventDay, -offset);
    const latest = addDays(eventDay, offset === 0 ? 0 : -1);
    const lo = floor > latest ? latest : floor;
    const due = s.fixed ? (target < today ? today : target) : placeDay(target < lo ? lo : target, lo, latest < lo ? lo : latest, load);
    if (!s.fixed) floor = due;
    if (due > eventDay) continue;
    const key = `${s.title}|${due}`;
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    load[due] = (load[due] ?? 0) + 1;
    tasks.push({
      title: s.title,
      notes: s.notes ?? "",
      dueDate: due,
      dueTime: s.time === "work" ? WORK_TIME[prefs.workTime] : s.time ?? null,
      priority: s.priority ?? 1,
      subtasks: s.subtasks ?? [],
      reminder: !!s.reminder,
    });
  }
  if (!tasks.length) return null;
  // Chronological by day; same-day steps keep the template's logical order.
  const order = new Map(tasks.map((t, i) => [t, i]));
  tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || order.get(a)! - order.get(b)!);
  return { eventKey: e.key, category: cat, title: tpl.title, reason: tpl.reason, tasks };
}

/** Make AI-produced tasks safe: valid dates inside [today, event day], sane fields, no duplicates. */
export function sanitizeTasks(tasks: Partial<DraftTask>[], today: string, eventDay: string): DraftTask[] {
  const out: DraftTask[] = [];
  const seen = new Set<string>();
  for (const t of tasks) {
    const title = String(t.title ?? "").trim().slice(0, 200);
    if (!title) continue;
    let due = /^\d{4}-\d{2}-\d{2}$/.test(String(t.dueDate)) ? String(t.dueDate) : eventDay;
    if (due < today) due = today;
    if (due > eventDay) due = eventDay;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t.dueTime ?? "")) ? String(t.dueTime) : null;
    const k = title.toLowerCase() + due;
    if (seen.has(k)) continue;
    seen.add(k);
    const p = Math.round(Number(t.priority ?? 1));
    out.push({
      title,
      notes: String(t.notes ?? "").slice(0, 2000),
      dueDate: due,
      dueTime: time,
      priority: (p >= 0 && p <= 4 ? p : 1) as DraftTask["priority"],
      subtasks: Array.isArray(t.subtasks) ? t.subtasks.map((s) => String(s).trim()).filter(Boolean).slice(0, 12) : [],
      reminder: !!t.reminder,
    });
  }
  return out.slice(0, 20).sort((a, b) => (a.dueDate + (a.dueTime ?? "")).localeCompare(b.dueDate + (b.dueTime ?? "")));
}
