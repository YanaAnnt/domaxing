import { describe, expect, it } from "vitest";
import { classify, DEFAULT_PREP, personOf, planWithRules, subjectOf, type PrepPrefs } from "../supabase/functions/tidy/lib/planner.ts";
import { zonedToUtc } from "../supabase/functions/tidy/lib/time.ts";

const tz = "Asia/Singapore";
const prefs: PrepPrefs = { timezone: tz, prep: DEFAULT_PREP, studyMinutes: 60, workTime: "evening" };
const now = new Date("2026-11-17T02:00:00Z");

describe("classify", () => {
  it.each([
    ["Midterm - Microeconomics", "exam"],
    ["Flight to Tokyo (SQ 638)", "travel"],
    ["LH 401 FRA → JFK", "travel"],
    ["Anna's birthday", "birthday"],
    ["Quarterly review with client", "meeting"],
    ["Lunch", null],
  ])("%s → %s", (title, category) => {
    expect(classify({ title })).toBe(category);
  });
});

describe("title parsing", () => {
  it("finds the person in a birthday", () => {
    expect(personOf("Anna's birthday")).toBe("Anna");
    expect(personOf("Birthday: Tom Lee")).toBe("Tom Lee");
  });

  it("finds the subject of an exam", () => {
    expect(subjectOf("Midterm - Microeconomics", "exam")).toBe("Microeconomics");
  });
});

describe("planWithRules", () => {
  it("schedules exam prep before the exam and skips a busy day", () => {
    const load = { "2026-11-20": 6 };
    const exam = planWithRules(
      { key: "e1", title: "Midterm - Microeconomics", start: new Date("2026-12-01T01:00:00Z"), allDay: false },
      "exam", prefs, now, load,
    );
    expect(exam).not.toBeNull();
    const days = exam!.tasks.map((t) => t.dueDate);
    expect(days.every((d) => d >= "2026-11-17" && d <= "2026-11-30")).toBe(true);
    expect(days).not.toContain("2026-11-20");
  });

  it("squeezes a close exam into the days left", () => {
    const quiz = planWithRules(
      { key: "e2", title: "Statistics quiz", start: new Date("2026-11-21T01:00:00Z"), allDay: false },
      "exam", prefs, now, {},
    );
    expect(quiz!.tasks.every((t) => t.dueDate >= "2026-11-17" && t.dueDate <= "2026-11-20")).toBe(true);
  });

  it("plans trips and birthdays", () => {
    const trip = planWithRules({ key: "e3", title: "Flight to Tokyo", start: new Date("2026-12-10T08:00:00Z"), allDay: false }, "travel", prefs, now, {});
    const bday = planWithRules({ key: "e4", title: "Anna's birthday", start: zonedToUtc("2026-11-22", "00:00", tz), allDay: true }, "birthday", prefs, now, {});
    expect(trip!.tasks.length).toBeGreaterThan(0);
    expect(bday!.tasks.length).toBeGreaterThan(0);
  });

  it("waits until a far-away event is within its lead time", () => {
    const far = planWithRules({ key: "e5", title: "Final exam Physics", start: new Date("2027-01-30T01:00:00Z"), allDay: false }, "exam", prefs, now, {});
    expect(far).toBeNull();
  });
});
