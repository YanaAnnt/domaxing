import { describe, expect, it } from "vitest";
import { parseIcs } from "../supabase/functions/tidy/lib/ics.ts";
import { dateKeyIn } from "../supabase/functions/tidy/lib/time.ts";

const tz = "Asia/Singapore";

const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:STANDARD
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:exam-1
DTSTART;TZID=Europe/Berlin:20261201T090000
DTEND;TZID=Europe/Berlin:20261201T110000
SUMMARY:Midterm - Microeconomics
LOCATION:Hall A
END:VEVENT
BEGIN:VEVENT
UID:bday-1
DTSTART;VALUE=DATE:19950122
RRULE:FREQ=YEARLY
SUMMARY:Anna's birthday
END:VEVENT
BEGIN:VEVENT
UID:standup
DTSTART:20200106T080000Z
DTEND:20200106T081500Z
RRULE:FREQ=DAILY
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:standup
RECURRENCE-ID:20261120T080000Z
DTSTART:20261120T100000Z
DTEND:20261120T101500Z
SUMMARY:Standup (moved)
END:VEVENT
BEGIN:VEVENT
UID:gone
DTSTART:20261125T100000Z
SUMMARY:Cancelled thing
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

describe("parseIcs", () => {
  const events = parseIcs(ics, new Date("2026-11-16T00:00:00Z"), new Date("2027-01-31T00:00:00Z"), tz);
  const byTitle = (t: string) => events.filter((e) => e.title === t);

  it("applies the event's own time zone", () => {
    expect(byTitle("Midterm - Microeconomics")[0]?.start.toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });

  it("expands yearly all-day events inside the window", () => {
    const bday = byTitle("Anna's birthday");
    expect(bday.map((e) => dateKeyIn(e.start, tz))).toEqual(["2027-01-22"]);
    expect(bday[0]?.allDay).toBe(true);
  });

  it("expands daily events and applies moved occurrences", () => {
    expect(byTitle("Standup").length).toBeGreaterThan(70);
    const moved = byTitle("Standup (moved)")[0];
    expect(moved?.start.toISOString()).toBe("2026-11-20T10:00:00.000Z");
    expect(moved?.externalId).toBe("standup#2026-11-20T08:00:00Z");
  });

  it("flags cancelled events", () => {
    expect(byTitle("Cancelled thing")[0]?.cancelled).toBe(true);
  });
});
