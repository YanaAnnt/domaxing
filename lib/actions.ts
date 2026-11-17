"use client";

import { useData } from "./store";
import { useUI } from "./ui-store";
import { haptic } from "./utils";
import { relativeLabel } from "./dates";

const truncate = (s: string, n = 32) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Toggle completion with animation + undo toast. */
export function toggleComplete(id: string) {
  const data = useData.getState();
  const ui = useUI.getState();
  const task = data.tasks[id];
  if (!task) return;
  const res = data.toggleTask(id);
  if (res.completed) {
    haptic(10);
    ui.setCompleting(id, true);
    setTimeout(() => useUI.getState().setCompleting(id, false), 700);
    const spawned = res.spawnedId ? useData.getState().tasks[res.spawnedId] : null;
    ui.toast({
      message: spawned?.dueDate
        ? `Completed · next ${relativeLabel(spawned.dueDate).toLowerCase()}`
        : `Completed “${truncate(task.title)}”`,
      actionLabel: "Undo",
      onAction: () => {
        const d = useData.getState();
        if (res.spawnedId) d.deleteTask(res.spawnedId);
        const t = d.tasks[id];
        if (t?.completed) d.updateTask(id, { completed: false, completedAt: null, recurrence: task.recurrence });
      },
    });
  }
}

export function deleteWithUndo(id: string) {
  const data = useData.getState();
  const ui = useUI.getState();
  const task = data.tasks[id];
  if (!task) return;
  data.deleteTask(id);
  if (ui.detailTaskId === id) ui.openDetail(null);
  if (ui.focusTaskId === id) ui.setFocus(null);
  ui.toast({
    message: `Deleted “${truncate(task.title)}”`,
    actionLabel: "Undo",
    onAction: () => useData.getState().restoreTask(id),
  });
}

export function deleteCategoryWithUndo(id: string) {
  const data = useData.getState();
  const ui = useUI.getState();
  const name = data.categories[id]?.name ?? "Category";
  const keys = data.deleteCategory(id);
  const v = ui.view;
  if (v.type === "category" && v.id === id) ui.navigate({ type: "today" });
  if (v.type === "list" && data.lists[v.id]?.categoryId === id) ui.navigate({ type: "today" });
  ui.toast({ message: `Deleted “${name}”`, actionLabel: "Undo", onAction: () => useData.getState().undelete(keys) });
}

export function deleteListWithUndo(id: string) {
  const data = useData.getState();
  const ui = useUI.getState();
  const list = data.lists[id];
  const keys = data.deleteList(id);
  const v = ui.view;
  if (v.type === "list" && v.id === id) ui.navigate(list ? { type: "category", id: list.categoryId } : { type: "today" });
  ui.toast({
    message: `Deleted “${list?.name ?? "List"}”`,
    actionLabel: "Undo",
    onAction: () => useData.getState().undelete(keys),
  });
}
