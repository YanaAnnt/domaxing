import { describe, expect, it } from "vitest";
import { runTool, TOOLS, type Snapshot } from "../lib/ai/tools.ts";
import type { Category, List, Task } from "../lib/types.ts";

const meta = { createdAt: "2026-11-01T08:00:00.000Z", updatedAt: "2026-11-01T08:00:00.000Z" };
const cat = (id: string, name: string, order: number): Category => ({ id, name, order, color: "blue", icon: "work", collapsed: false, ...meta });
const list = (id: string, categoryId: string, name: string, order: number): List => ({ id, categoryId, name, order, ...meta });
let n = 0;
const task = (p: Partial<Task>): Task => ({
  id: `t${++n}`,
  title: "Task",
  notes: "",
  categoryId: null,
  listId: null,
  dueDate: null,
  dueTime: null,
  priority: 0,
  subtasks: [],
  recurrence: null,
  reminderAt: null,
  tags: [],
  completed: false,
  completedAt: null,
  order: n,
  ...meta,
  ...p,
});

const snap: Snapshot = {
  today: "2026-11-18",
  categories: [cat("work", "Work", 0), cat("uni", "University", 1)],
  lists: [list("exams", "uni", "Exams", 0), list("reports", "work", "Reports", 0)],
  tasks: [
    task({ title: "Send the Q4 report", categoryId: "work", listId: "reports", dueDate: "2026-11-16", priority: 3 }),
    task({ title: "Study chapter 4", categoryId: "uni", listId: "exams", dueDate: "2026-11-18", dueTime: "18:00", notes: "Focus on proofs", subtasks: [{ id: "s1", title: "Read", done: true }, { id: "s2", title: "Exercises", done: false }] }),
    task({ title: "Buy milk", dueDate: "2026-11-18", tags: ["errands"] }),
    task({ title: "Call the bank", completed: true, completedAt: new Date(2026, 10, 18, 9, 30).toISOString(), dueDate: "2026-11-18" }),
    task({ title: "Plan the trip", categoryId: "work" }),
    task({ title: "Calculus exam", categoryId: "uni", listId: "exams", dueDate: "2026-11-26", recurrence: { freq: "weekly", interval: 1 } }),
  ],
  events: [
    { title: "Team meeting", location: "Room 3", starts_at: new Date(2026, 10, 18, 10, 0).toISOString(), ends_at: new Date(2026, 10, 18, 11, 0).toISOString(), all_day: false },
    { title: "Mum's birthday", location: null, starts_at: new Date(2026, 10, 22, 0, 0).toISOString(), ends_at: null, all_day: true },
  ],
  calendarConnected: true,
};

const run = (name: string, input: unknown = {}, s = snap) => {
  const out = runTool(name, input, s);
  return { ...out, data: out.isError ? null : JSON.parse(out.content) };
};

describe("tool definitions", () => {
  it("are all object schemas that stream their input", () => {
    for (const t of TOOLS) {
      expect(t.input_schema.type).toBe("object");
      expect(t.eager_input_streaming).toBe(true);
    }
  });
});

describe("get_today", () => {
  it("returns overdue, due today, done today and today's events", () => {
    const { data } = run("get_today");
    expect(data.weekday).toBe("Wednesday");
    expect(data.overdue).toEqual([{ title: "Send the Q4 report", list: "Work / Reports", due: "2026-11-16", priority: "high", overdue: true }]);
    expect(data.due_today.map((t: { title: string }) => t.title)).toEqual(["Study chapter 4", "Buy milk"]);
    expect(data.due_today[0]).toMatchObject({ time: "18:00", subtasks: "1/2 done", notes: "Focus on proofs", list: "University / Exams" });
    expect(data.due_today[1]).toMatchObject({ list: "Inbox", tags: ["errands"] });
    expect(data.completed_today).toEqual(["Call the bank"]);
    expect(data.calendar).toEqual([{ title: "Team meeting", date: "2026-11-18", start: "10:00", end: "11:00", location: "Room 3" }]);
  });

  it("says when no calendar is connected", () => {
    expect(run("get_today", {}, { ...snap, calendarConnected: false, events: [] }).data.calendar).toBe("No calendar is connected.");
  });
});

describe("list_tasks", () => {
  it("returns open tasks by due date, with undated tasks last", () => {
    const { data } = run("list_tasks");
    expect(data.total).toBe(5);
    expect(data.tasks.map((t: { title: string }) => t.title)).toEqual(["Send the Q4 report", "Study chapter 4", "Buy milk", "Calculus exam", "Plan the trip"]);
    expect(data.tasks[3].repeats).toBe("weekly");
  });

  it("filters by date range, list or category name, text and status", () => {
    expect(run("list_tasks", { due_from: "2026-11-18", due_to: "2026-11-30" }).data.total).toBe(3);
    expect(run("list_tasks", { list: "exams" }).data.tasks.map((t: { title: string }) => t.title)).toEqual(["Study chapter 4", "Calculus exam"]);
    expect(run("list_tasks", { list: "University" }).data.total).toBe(2);
    expect(run("list_tasks", { list: "Inbox" }).data.tasks.map((t: { title: string }) => t.title)).toEqual(["Buy milk"]);
    expect(run("list_tasks", { query: "PROOFS" }).data.tasks[0].title).toBe("Study chapter 4");
    expect(run("list_tasks", { no_due_date: true }).data.tasks[0].title).toBe("Plan the trip");
    expect(run("list_tasks", { status: "completed" }).data.tasks).toEqual([{ title: "Call the bank", list: "Inbox", due: "2026-11-18", completed: true, completed_at: snap.tasks[3].completedAt }]);
    expect(run("list_tasks", { status: "all", limit: 2 }).data).toMatchObject({ total: 6, shown: 2 });
  });

  it("rejects bad input with a message the model can act on", () => {
    expect(run("list_tasks", { due_from: "next week" })).toMatchObject({ isError: true, content: "due_from must be a date like 2026-11-18." });
    expect(run("list_tasks", { status: "done" })).toMatchObject({ isError: true });
    expect(run("list_tasks", { limit: 0 })).toMatchObject({ isError: true });
    expect(run("list_tasks", "everything")).toMatchObject({ isError: true });
  });
});

describe("list_lists", () => {
  it("counts open tasks per category and list", () => {
    expect(run("list_lists").data).toEqual({
      inbox_open: 1,
      categories: [
        { name: "Work", open: 2, lists: [{ name: "Reports", open: 1 }] },
        { name: "University", open: 2, lists: [{ name: "Exams", open: 2 }] },
      ],
    });
  });
});

describe("get_calendar", () => {
  it("defaults to the next two weeks", () => {
    const { data } = run("get_calendar");
    expect(data).toMatchObject({ from: "2026-11-18", to: "2026-12-01" });
    expect(data.events.map((e: { title: string }) => e.title)).toEqual(["Team meeting", "Mum's birthday"]);
    expect(data.events[1]).toEqual({ title: "Mum's birthday", date: "2026-11-22", all_day: true });
  });

  it("checks the range and says when no calendar is connected", () => {
    expect(run("get_calendar", { from: "2026-11-20", to: "2026-11-19" })).toMatchObject({ isError: true });
    expect(run("get_calendar", { from: "2026-11-01", to: "2027-03-01" })).toMatchObject({ isError: true, content: "The range can be at most 60 days." });
    expect(run("get_calendar", {}, { ...snap, calendarConnected: false }).data.note).toContain("No calendar is connected");
  });
});

it("reports unknown tools as errors", () => {
  expect(run("delete_everything")).toMatchObject({ isError: true, content: "Unknown tool: delete_everything" });
});
