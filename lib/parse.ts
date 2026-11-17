import { addDays, nextDay, type Day } from "date-fns";
import type { Category, List, Priority, Recurrence } from "./types";
import { toKey } from "./dates";

export interface ParsedTask {
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: Priority;
  tags: string[];
  listId?: string | null;
  categoryId?: string | null;
  recurrence?: Recurrence | null;
  tokens: { kind: "date" | "time" | "priority" | "tag" | "list" | "repeat"; label: string }[];
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Lightweight natural-language parsing for Quick Add.
 *   "Call Anna tomorrow at 3pm !high #calls @work"
 * Supported: today/tod, tomorrow/tmr, weekday names, "next week", "in N days",
 * "at 5pm" / "17:30", !low/!med/!high/!urgent or p1-p4, #tag, @list or @category,
 * "every day|week|month|year|weekday".
 */
export function parseQuickAdd(input: string, lists: List[], categories: Category[]): ParsedTask {
  let text = ` ${input} `;
  const out: ParsedTask = { title: "", tags: [], tokens: [] };
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      fn(m);
      text = text.replace(m[0], " ");
    }
  };
  const now = new Date();

  // recurrence first so "every week" isn't parsed as "next week"
  take(/\s(?:every|each)\s(day|weekday|week|month|year)s?(?=\s)/i, (m) => {
    const map: Record<string, Recurrence["freq"]> = {
      day: "daily", weekday: "weekdays", week: "weekly", month: "monthly", year: "yearly",
    };
    out.recurrence = { freq: map[m[1].toLowerCase()], interval: 1 };
    out.tokens.push({ kind: "repeat", label: `Every ${m[1].toLowerCase()}` });
    if (!out.dueDate) out.dueDate = toKey(now);
  });

  take(/\s(today|tod|tonight)(?=\s)/i, () => {
    out.dueDate = toKey(now);
    out.tokens.push({ kind: "date", label: "Today" });
  });
  if (!out.tokens.some((t) => t.kind === "date"))
    take(/\s(tomorrow|tmr|tmrw|tom)(?=\s)/i, () => {
      out.dueDate = toKey(addDays(now, 1));
      out.tokens.push({ kind: "date", label: "Tomorrow" });
    });
  if (!out.tokens.some((t) => t.kind === "date"))
    take(/\snext week(?=\s)/i, () => {
      out.dueDate = toKey(nextDay(now, 1));
      out.tokens.push({ kind: "date", label: "Next Monday" });
    });
  if (!out.tokens.some((t) => t.kind === "date"))
    take(/\sin (\d{1,3}) days?(?=\s)/i, (m) => {
      out.dueDate = toKey(addDays(now, Number(m[1])));
      out.tokens.push({ kind: "date", label: `In ${m[1]} days` });
    });
  if (!out.tokens.some((t) => t.kind === "date"))
    take(/\s(?:on\s)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?=\s)/i, (m) => {
      const w = m[1].toLowerCase().slice(0, 3);
      const idx = DAY_SHORT.indexOf(w);
      out.dueDate = toKey(nextDay(now, idx as Day));
      out.tokens.push({ kind: "date", label: DAYS[idx][0].toUpperCase() + DAYS[idx].slice(1) });
    });

  take(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i, (m) => {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") h += 12;
    out.dueTime = `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
    out.tokens.push({ kind: "time", label: `${m[1]}${m[2] ? ":" + m[2] : ""}${m[3].toLowerCase()}` });
  });
  if (!out.dueTime)
    take(/\sat\s([01]?\d|2[0-3]):([0-5]\d)(?=\s)|\s([01]\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => {
      const h = m[1] ?? m[3];
      const mi = m[2] ?? m[4];
      out.dueTime = `${h.padStart(2, "0")}:${mi}`;
      out.tokens.push({ kind: "time", label: `${h}:${mi}` });
    });
  if (out.dueTime && !out.dueDate) {
    out.dueDate = toKey(now);
    out.tokens.push({ kind: "date", label: "Today" });
  }

  take(/\s(?:!(urgent|high|med|medium|low)|!([1-4])|p([1-4]))(?=\s)/i, (m) => {
    let p: Priority = 0;
    const word = m[1]?.toLowerCase();
    if (word) p = ({ urgent: 4, high: 3, med: 2, medium: 2, low: 1 } as const)[word as "urgent"];
    const num = m[2] ?? m[3];
    if (num) p = (5 - Number(num)) as Priority; // p1 = urgent … p4 = low
    out.priority = p;
    out.tokens.push({ kind: "priority", label: ["", "Low", "Medium", "High", "Urgent"][p] });
  });

  let tm: RegExpMatchArray | null;
  const tagRe = /\s#([\p{L}\p{N}_-]+)(?=\s)/u;
  while ((tm = text.match(tagRe))) {
    out.tags.push(tm[1]);
    out.tokens.push({ kind: "tag", label: `#${tm[1]}` });
    text = text.replace(tm[0], " ");
  }

  const am = text.match(/\s@([\p{L}\p{N}_&-]+)(?=\s)/u);
  if (am) {
    const q = norm(am[1]);
    const exactList = q ? lists.find((l) => norm(l.name) === q) : undefined;
    const exactCat = q && !exactList ? categories.find((c) => norm(c.name) === q) : undefined;
    const list = exactList ?? (!exactCat && q ? lists.find((l) => norm(l.name).startsWith(q)) : undefined);
    const cat = exactCat ?? (!list && q ? categories.find((c) => norm(c.name).startsWith(q)) : undefined);
    if (list) {
      out.listId = list.id;
      out.categoryId = list.categoryId;
      out.tokens.push({ kind: "list", label: list.name });
      text = text.replace(am[0], " ");
    } else if (cat) {
      out.categoryId = cat.id;
      out.listId = null;
      out.tokens.push({ kind: "list", label: cat.name });
      text = text.replace(am[0], " ");
    } // unmatched mentions stay in the title
  }

  out.title = text.replace(/\s+/g, " ").trim();
  return out;
}
