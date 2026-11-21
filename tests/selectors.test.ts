import { describe, expect, it } from "vitest";
import { completedNewestFirst } from "../lib/selectors.ts";
import type { Task } from "../lib/types.ts";

const task = (id: string, completedAt: string | null): Task => ({
  id,
  title: id,
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
  completed: completedAt !== null,
  completedAt,
  order: 0,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
});

describe("completedNewestFirst", () => {
  it("keeps only completed tasks, most recently completed first", () => {
    const tasks = [
      task("open", null),
      task("monday", "2026-11-16T09:00:00.000Z"),
      task("wednesday", "2026-11-18T09:00:00.000Z"),
      task("tuesday", "2026-11-17T09:00:00.000Z"),
    ];
    expect(completedNewestFirst(tasks).map((t) => t.id)).toEqual(["wednesday", "tuesday", "monday"]);
  });

  it("leaves out tasks that are still animating out of the open list", () => {
    const tasks = [task("just-done", "2026-11-18T10:00:00.000Z"), task("earlier", "2026-11-17T10:00:00.000Z")];
    expect(completedNewestFirst(tasks, { "just-done": true }).map((t) => t.id)).toEqual(["earlier"]);
  });
});
