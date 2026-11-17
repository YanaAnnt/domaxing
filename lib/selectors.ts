"use client";

import { useMemo } from "react";
import { useData } from "./store";
import type { Category, List, SortMode, Task } from "./types";
import { diffFromToday } from "./dates";

export function useCategories(): Category[] {
  const categories = useData((s) => s.categories);
  return useMemo(
    () => Object.values(categories).filter((c) => !c.deleted).sort((a, b) => a.order - b.order),
    [categories],
  );
}

export function useLists(): List[] {
  const lists = useData((s) => s.lists);
  const categories = useData((s) => s.categories);
  return useMemo(
    () =>
      Object.values(lists)
        .filter((l) => !l.deleted && categories[l.categoryId] && !categories[l.categoryId].deleted)
        .sort((a, b) => a.order - b.order),
    [lists, categories],
  );
}

export function useListsByCategory(): Record<string, List[]> {
  const lists = useLists();
  return useMemo(() => {
    const m: Record<string, List[]> = {};
    for (const l of lists) (m[l.categoryId] ??= []).push(l);
    return m;
  }, [lists]);
}

export function useAllTasks(): Task[] {
  const tasks = useData((s) => s.tasks);
  return useMemo(() => Object.values(tasks).filter((t) => !t.deleted), [tasks]);
}

/** Tasks counted as "active": not completed, or completed but still animating out. */
export function isVisibleActive(t: Task, completing: Record<string, true>) {
  return !t.completed || !!completing[t.id];
}

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const arr = [...tasks];
  switch (mode) {
    case "priority":
      return arr.sort((a, b) => b.priority - a.priority || a.order - b.order);
    case "due":
      return arr.sort((a, b) => {
        const ka = (a.dueDate ?? "9999") + (a.dueTime ?? "99");
        const kb = (b.dueDate ?? "9999") + (b.dueTime ?? "99");
        return ka < kb ? -1 : ka > kb ? 1 : a.order - b.order;
      });
    case "title":
      return arr.sort((a, b) => a.title.localeCompare(b.title));
    case "created":
      return arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    default:
      return arr.sort((a, b) => a.order - b.order);
  }
}

export const isDueToday = (t: Task) => !!t.dueDate && diffFromToday(t.dueDate) === 0;
export const isOverdueTask = (t: Task) => !!t.dueDate && !t.completed && diffFromToday(t.dueDate) < 0;

export function matchesQuery(t: Task, q: string) {
  const s = q.toLowerCase();
  return (
    t.title.toLowerCase().includes(s) ||
    t.notes.toLowerCase().includes(s) ||
    t.tags.some((x) => x.toLowerCase().includes(s)) ||
    t.subtasks.some((x) => x.title.toLowerCase().includes(s))
  );
}
