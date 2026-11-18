"use client";

// Reads the current local data for the assistant's tools. Deleted records and lists of deleted categories are left out.
import { useAssistant } from "../assistant";
import { todayKey } from "../dates";
import { useData } from "../store";
import type { Snapshot } from "./tools";

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
