// iCalendar (.ics) feed parsing with recurrence expansion and timezone support.
import ICAL from "ical.js";
import { zonedToUtc } from "./time.ts";

export interface RawEvent {
  externalId: string; // stable per occurrence (uid + original start for recurring)
  title: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date | null;
  allDay: boolean;
  cancelled: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

// deno-lint-ignore no-explicit-any
function toDate(t: any, userTz: string): { date: Date; allDay: boolean } {
  if (t.isDate) {
    const key = `${t.year}-${pad(t.month)}-${pad(t.day)}`;
    return { date: zonedToUtc(key, "00:00", userTz), allDay: true };
  }
  const floating = !t.zone || t.zone === ICAL.Timezone.localTimezone;
  if (floating) {
    const key = `${t.year}-${pad(t.month)}-${pad(t.day)}`;
    return { date: zonedToUtc(key, `${pad(t.hour)}:${pad(t.minute)}`, userTz), allDay: false };
  }
  return { date: t.toJSDate(), allDay: false };
}

export function parseIcs(text: string, from: Date, to: Date, userTz: string, maxEvents = 1500): RawEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* ignore malformed timezone */
    }
  }

  const vevents = root.getAllSubcomponents("vevent");
  // deno-lint-ignore no-explicit-any
  const masters = new Map<string, any>();
  // deno-lint-ignore no-explicit-any
  const exceptions: any[] = [];
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const m = masters.get(ex.uid);
    if (m) m.relateException(ex);
  }

  const out: RawEvent[] = [];
  const push = (
    externalId: string,
    // deno-lint-ignore no-explicit-any
    item: any,
    // deno-lint-ignore no-explicit-any
    start: any,
    // deno-lint-ignore no-explicit-any
    end: any,
  ) => {
    const s = toDate(start, userTz);
    if (s.date > to) return;
    const e = end ? toDate(end, userTz).date : null;
    if ((e ?? s.date) < from) return;
    const status = String(item.component.getFirstPropertyValue("status") ?? "").toUpperCase();
    out.push({
      externalId,
      title: String(item.summary ?? "").trim() || "(No title)",
      description: item.description ? String(item.description).slice(0, 4000) : null,
      location: item.location ? String(item.location).slice(0, 500) : null,
      start: s.date,
      end: e,
      allDay: s.allDay,
      cancelled: status === "CANCELLED",
    });
  };

  for (const ev of masters.values()) {
    if (out.length >= maxEvents) break;
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) {
      push(ev.uid, ev, ev.startDate, ev.endDate);
      continue;
    }
    const it = ev.iterator();
    let next;
    let guard = 0;
    const early = new Date(from.getTime() - 2 * 86400000);
    while ((next = it.next()) && guard++ < 50000) {
      const occStart = toDate(next, userTz).date;
      if (occStart > to) break;
      if (occStart < early) continue;
      const details = ev.getOccurrenceDetails(next);
      const rid = details.recurrenceId ? details.recurrenceId.toString() : next.toString();
      push(`${ev.uid}#${rid}`, details.item, details.startDate, details.endDate);
      if (out.length >= maxEvents) break;
    }
  }
  return out;
}
