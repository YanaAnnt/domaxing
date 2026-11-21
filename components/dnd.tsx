"use client";

import * as React from "react";
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, closestCenter, pointerWithin,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useData } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { between, haptic } from "@/lib/utils";
import { formatTime, relativeLabel, todayKey } from "@/lib/dates";
import { TaskRowStatic } from "./task-item";

export type DropTarget =
  | { kind: "list"; id: string }
  | { kind: "category"; id: string }
  | { kind: "inbox" }
  | { kind: "today" }
  | { kind: "date"; date: string }
  /** An hour on the Week time grid: sets the day and the time. */
  | { kind: "slot"; date: string; time: string }
  /** The "All day" row on the Week time grid: sets the day and clears the time. */
  | { kind: "allday"; date: string };

export type DragData =
  | { type: "task"; taskId: string; ids: string[]; containerId: string }
  | { type: "category"; id: string; ids: string[] }
  | { type: "list"; id: string; ids: string[]; categoryId: string }
  | { type: "target"; target: DropTarget; accepts: string[] };

/** Only consider droppables that accept what is being dragged; prefer pointer hits for sidebar targets. */
const collision: CollisionDetection = (args) => {
  const activeType = (args.active.data.current as DragData | undefined)?.type;
  const containers = args.droppableContainers.filter((c) => {
    const d = c.data.current as DragData | undefined;
    if (!d) return false;
    if (d.type === "target") {
      const own = (d as { containerId?: string }).containerId;
      const activeContainer = (args.active.data.current as { containerId?: string } | undefined)?.containerId;
      return d.accepts.includes(activeType ?? "") && (!own || own !== activeContainer);
    }
    if (d.type === "task") return activeType === "task" && (args.active.data.current as DragData & { containerId: string }).containerId === d.containerId;
    if (d.type === "list") return activeType === "list" && (args.active.data.current as { categoryId: string }).categoryId === d.categoryId;
    return d.type === activeType;
  });
  const targets = containers.filter((c) => (c.data.current as DragData).type === "target");
  // Week time-grid slots scroll inside their own box: skip the ones scrolled out of sight under the pointer.
  const p = args.pointerCoordinates;
  const hit = pointerWithin({ ...args, droppableContainers: targets }).filter((h) => {
    const clip = args.droppableContainers.find((c) => c.id === h.id)?.node.current?.closest("[data-scroll-clip]");
    if (!clip || !p) return true;
    const r = clip.getBoundingClientRect();
    return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  });
  if (hit.length) return hit;
  return closestCenter({ ...args, droppableContainers: containers.filter((c) => (c.data.current as DragData).type !== "target") });
};

export function AppDnd({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
  );
  const [activeTask, setActiveTask] = React.useState<string | null>(null);
  const task = useData((s) => (activeTask ? s.tasks[activeTask] : null));

  const onStart = (e: DragStartEvent) => {
    const d = e.active.data.current as DragData;
    haptic(6);
    if (d?.type === "task") setActiveTask(d.taskId);
  };

  const onEnd = (e: DragEndEvent) => {
    setActiveTask(null);
    const a = e.active.data.current as DragData | undefined;
    const o = e.over?.data.current as DragData | undefined;
    if (!a || !o || !e.over) return;
    const data = useData.getState();
    const ui = useUI.getState();

    if (a.type === "task" && o.type === "target") {
      const t = o.target;
      const task = data.tasks[a.taskId];
      if (!task) return;
      if (t.kind === "list") {
        data.updateTask(a.taskId, { listId: t.id, categoryId: data.lists[t.id]?.categoryId ?? null });
        ui.toast({ message: `Moved to ${data.lists[t.id]?.name}` });
      } else if (t.kind === "category") {
        data.updateTask(a.taskId, { categoryId: t.id, listId: null });
        ui.toast({ message: `Moved to ${data.categories[t.id]?.name}` });
      } else if (t.kind === "inbox") {
        data.updateTask(a.taskId, { categoryId: null, listId: null });
        ui.toast({ message: "Moved to Inbox" });
      } else if (t.kind === "today") {
        data.updateTask(a.taskId, { dueDate: todayKey() });
        ui.toast({ message: "Scheduled for today" });
      } else if (t.kind === "date") {
        if (task.dueDate !== t.date) {
          data.updateTask(a.taskId, { dueDate: t.date });
          ui.toast({ message: `Moved to ${relativeLabel(t.date)}` });
        }
      } else if (t.kind === "slot") {
        if (task.dueDate !== t.date || task.dueTime !== t.time) {
          data.updateTask(a.taskId, { dueDate: t.date, dueTime: t.time });
          ui.toast({ message: `Moved to ${relativeLabel(t.date)}, ${formatTime(t.time)}` });
        }
      } else if (t.kind === "allday") {
        if (task.dueDate !== t.date || task.dueTime) {
          data.updateTask(a.taskId, { dueDate: t.date, dueTime: null });
          ui.toast({ message: `Moved to ${relativeLabel(t.date)}, all day` });
        }
      }
      return;
    }

    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (activeId === overId) return;

    if (a.type === "task" && o.type === "task") {
      const ids = a.ids;
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(overId);
      if (from < 0 || to < 0) return;
      const next = arrayMove(ids, from, to);
      const orderOf = (id?: string) => (id ? data.tasks[id]?.order : undefined);
      data.setTaskOrder(activeId, between(orderOf(next[to - 1]), orderOf(next[to + 1])));
      return;
    }
    if (a.type === "category" && o.type === "category") {
      const strip = (s: string) => s.replace(/^cat-/, "");
      const ids = a.ids;
      const from = ids.indexOf(strip(activeId));
      const to = ids.indexOf(strip(overId));
      if (from < 0 || to < 0) return;
      const next = arrayMove(ids, from, to);
      const orderOf = (id?: string) => (id ? data.categories[id]?.order : undefined);
      data.updateCategory(next[to], { order: between(orderOf(next[to - 1]), orderOf(next[to + 1])) });
      return;
    }
    if (a.type === "list" && o.type === "list") {
      const strip = (s: string) => s.replace(/^list-/, "");
      const ids = a.ids;
      const from = ids.indexOf(strip(activeId));
      const to = ids.indexOf(strip(overId));
      if (from < 0 || to < 0) return;
      const next = arrayMove(ids, from, to);
      const orderOf = (id?: string) => (id ? data.lists[id]?.order : undefined);
      data.updateList(next[to], { order: between(orderOf(next[to - 1]), orderOf(next[to + 1])) });
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setActiveTask(null)}>
      {children}
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
        {task ? (
          <div className="w-[min(560px,80vw)] rotate-[0.6deg] rounded-xl bg-elevated shadow-pop">
            <TaskRowStatic task={task} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

