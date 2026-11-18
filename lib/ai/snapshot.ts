"use client";

// The assistant's bridge to the app's data: a read-only snapshot for its tools, and adding (or undoing)
// a suggested task once the user approves it. Deleted records and lists of deleted categories are left out.
import { useAssistant } from "../assistant";
import { todayKey } from "../dates";
import { useData } from "../store";
import type { ProposedTask, Snapshot } from "./tools";

export function readSnapshot(): Snapshot {
  const { tasks, categories, lists } = useData.getState();
  const cats = Object.values(categories).filter((c) => !c.deleted);
  const catIds = new Set(cats.map((c) => c.id));
  const { events, connections } = useAssistant.getState();
  return {
    tasks: Object.values(tasks).filter((t) => !t.deleted),
    categories: cats,
    lists: Object.values(lists).filter((l) => !l.deleted && catIds.has(l.categoryId)),
    events: events.filter((e) => e.status !== "cancelled"),
    calendarConnected: connections.length > 0,
    today: todayKey(),
  };
}

/** Adds an approved suggestion as a real task and returns its id. A list deleted since the suggestion falls back to the Inbox. */
export function addProposedTask(p: ProposedTask): string {
  const { lists, categories, addTask } = useData.getState();
  const list = p.listId ? lists[p.listId] : undefined;
  const cat = p.categoryId ? categories[p.categoryId] : undefined;
  const placeOk = (!p.listId || (list && !list.deleted)) && (!p.categoryId || (cat && !cat.deleted));
  return addTask({
    title: p.title,
    notes: p.notes,
    dueDate: p.dueDate,
    dueTime: p.dueTime,
    listId: placeOk ? p.listId : null,
    categoryId: placeOk ? p.categoryId : null,
    priority: p.priority,
    recurrence: p.recurrence,
    source: "ai",
  }).id;
}

/** Undoes an Add: the task is deleted (and syncs as deleted, like any other delete). */
export function removeTask(id: string) {
  useData.getState().deleteTask(id);
}
