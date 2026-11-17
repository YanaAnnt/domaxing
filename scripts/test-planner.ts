// Local tests for the planner and ICS parser: node scripts/test-planner.ts
import { parseIcs } from "../supabase/functions/tidy/lib/ics.ts";
import { classify, planWithRules, DEFAULT_PREP, personOf, subjectOf, type PrepPrefs } from "../supabase/functions/tidy/lib/planner.ts";
import { zonedToUtc, dateKeyIn, inQuietHours } from "../supabase/functions/tidy/lib/time.ts";

let fails = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`}`);
};

const tz = "Asia/Singapore";
eq("zonedToUtc", zonedToUtc("2026-11-18", "09:00", tz).toISOString(), "2026-11-18T01:00:00.000Z");
eq("zonedToUtc DST", zonedToUtc("2026-03-29", "12:00", "Europe/Berlin").toISOString(), "2026-03-29T10:00:00.000Z");
eq("quiet wrap", [inQuietHours("23:00", "22:00", "07:30"), inQuietHours("12:00", "22:00", "07:30")], [true, false]);

eq("classify exam", classify({ title: "Midterm - Microeconomics" }), "exam");
eq("classify flight", classify({ title: "Flight to Tokyo (SQ 638)" }), "travel");
eq("classify flight no", classify({ title: "LH 401 FRA → JFK" }), "travel");
eq("classify bday", classify({ title: "Anna's birthday" }), "birthday");
eq("classify meeting", classify({ title: "Quarterly review with client" }), "meeting");
eq("classify plain", classify({ title: "Lunch" }), null);
eq("person", personOf("Anna's birthday"), "Anna");
eq("person2", personOf("Birthday: Tom Lee"), "Tom Lee");
eq("subject", subjectOf("Midterm - Microeconomics", "exam"), "Microeconomics");

const prefs: PrepPrefs = { timezone: tz, prep: DEFAULT_PREP, studyMinutes: 60, workTime: "evening" };
const now = new Date("2026-11-17T02:00:00Z");
const load: Record<string, number> = { "2026-11-20": 6 };
const exam = planWithRules({ key: "e1", title: "Midterm - Microeconomics", start: new Date("2026-12-01T01:00:00Z"), allDay: false }, "exam", prefs, now, load)!;
console.log("\nExam plan:", exam.title, "-", exam.reason);
exam.tasks.forEach((t) => console.log("  ", t.dueDate, t.dueTime ?? "     ", t.title));
eq("exam tasks within window", exam.tasks.every((t) => t.dueDate >= "2026-11-17" && t.dueDate <= "2026-11-30"), true);
eq("exam avoids heavy day", exam.tasks.some((t) => t.dueDate === "2026-11-20"), false);

const close = planWithRules({ key: "e2", title: "Statistics quiz", start: new Date("2026-11-21T01:00:00Z"), allDay: false }, "exam", prefs, now, {})!;
console.log("\nClose exam:");
close.tasks.forEach((t) => console.log("  ", t.dueDate, t.title));
eq("close exam in range", close.tasks.every((t) => t.dueDate >= "2026-11-17" && t.dueDate <= "2026-11-20"), true);

const trip = planWithRules({ key: "e3", title: "Flight to Tokyo", start: new Date("2026-12-10T08:00:00Z"), allDay: false }, "travel", prefs, now, {})!;
console.log("\nTrip:");
trip.tasks.forEach((t) => console.log("  ", t.dueDate, t.dueTime ?? "     ", t.title));
const bd = planWithRules({ key: "e4", title: "Anna's birthday", start: zonedToUtc("2026-11-22", "00:00", tz), allDay: true }, "birthday", prefs, now, {})!;
console.log("\nBirthday:");
bd.tasks.forEach((t) => console.log("  ", t.dueDate, t.dueTime ?? "     ", t.title));
eq("far event not yet", planWithRules({ key: "e5", title: "Final exam Physics", start: new Date("2027-01-30T01:00:00Z"), allDay: false }, "exam", prefs, now, {}), null);

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
const evs = parseIcs(ics, new Date("2026-11-16T00:00:00Z"), new Date("2027-01-31T00:00:00Z"), tz);
const byTitle = (t: string) => evs.filter((e) => e.title === t);
eq("exam parsed with TZ", byTitle("Midterm - Microeconomics")[0]?.start.toISOString(), "2026-12-01T08:00:00.000Z");
eq("birthday yearly in window", byTitle("Anna's birthday").map((e) => dateKeyIn(e.start, tz)), ["2027-01-22"]);
eq("birthday all-day", byTitle("Anna's birthday")[0]?.allDay, true);
eq("standup moved occurrence", byTitle("Standup (moved)")[0]?.start.toISOString(), "2026-11-20T10:00:00.000Z");
eq("standup count ~ days", byTitle("Standup").length > 70, true);
eq("cancelled flagged", byTitle("Cancelled thing")[0]?.cancelled, true);
eq("stable ids", byTitle("Standup (moved)")[0]?.externalId, "standup#2026-11-20T08:00:00Z");
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
