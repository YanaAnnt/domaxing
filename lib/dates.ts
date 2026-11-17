import {
  addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, isValid, parseISO,
  startOfWeek, isWeekend,
} from "date-fns";
import type { Recurrence } from "./types";

export const toKey = (d: Date) => format(d, "yyyy-MM-dd");
export const todayKey = () => toKey(new Date());
export const fromKey = (k: string) => parseISO(k);
export const addDaysKey = (k: string, n: number) => toKey(addDays(fromKey(k), n));

export function diffFromToday(k: string) {
  return differenceInCalendarDays(fromKey(k), new Date());
}

export const isOverdue = (k: string | null) => !!k && diffFromToday(k) < 0;

export function weekStart(d: Date, weekStartsOn: 0 | 1) {
  return startOfWeek(d, { weekStartsOn });
}

/** Human, compact label: Today, Tomorrow, Yesterday, Wed, Nov 21, Nov 21 2027. */
export function relativeLabel(k: string): string {
  const diff = diffFromToday(k);
  const d = fromKey(k);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return format(d, "EEEE");
  if (d.getFullYear() === new Date().getFullYear()) return format(d, "MMM d");
  return format(d, "MMM d, yyyy");
}

export function longLabel(k: string): string {
  const diff = diffFromToday(k);
  const d = fromKey(k);
  const base = format(d, "EEEE, MMM d");
  if (diff === 0) return `Today · ${format(d, "EEE MMM d")}`;
  if (diff === 1) return `Tomorrow · ${format(d, "EEE MMM d")}`;
  return base;
}

export function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return format(d, m === 0 ? "h a" : "h:mm a");
}

export function nextOccurrence(fromDate: string, r: Recurrence): string {
  const d = fromKey(fromDate);
  const n = Math.max(1, r.interval || 1);
  switch (r.freq) {
    case "daily":
      return toKey(addDays(d, n));
    case "weekdays": {
      let x = addDays(d, 1);
      while (isWeekend(x)) x = addDays(x, 1);
      return toKey(x);
    }
    case "weekly":
      return toKey(addWeeks(d, n));
    case "monthly":
      return toKey(addMonths(d, n));
    case "yearly":
      return toKey(addYears(d, n));
  }
}

export function recurrenceLabel(r: Recurrence): string {
  const n = r.interval || 1;
  switch (r.freq) {
    case "daily":
      return n === 1 ? "Every day" : `Every ${n} days`;
    case "weekdays":
      return "Every weekday";
    case "weekly":
      return n === 1 ? "Every week" : `Every ${n} weeks`;
    case "monthly":
      return n === 1 ? "Every month" : `Every ${n} months`;
    case "yearly":
      return n === 1 ? "Every year" : `Every ${n} years`;
  }
}

export function safeDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}
