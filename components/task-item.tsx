"use client";

import * as React from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Bell, CalendarDays, Check, Flag, ListChecks, Repeat, Trash2 } from "lucide-react";
import type { Task } from "@/lib/types";
import { cn, haptic } from "@/lib/utils";
import { useData } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { priorityColor } from "@/lib/constants";
import { diffFromToday, formatTime, relativeLabel } from "@/lib/dates";
import { toggleComplete, deleteWithUndo } from "@/lib/actions";
import { useCategoryColor } from "@/lib/theme";
import type { DragData } from "./dnd";

// ---------------- Checkbox ----------------
export function TaskCheckbox({
  checked,
  priority,
  onToggle,
  size = "md",
  label,
}: {
  checked: boolean;
  priority: number;
  onToggle: () => void;
  size?: "sm" | "md";
  label: string;
}) {
  const [pop, setPop] = React.useState(false);
  const color = priority > 0 ? priorityColor(priority as Task["priority"]) : "var(--c-faint)";
  const fill = priority >= 2 ? color : "var(--c-accent)";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Mark “${label}” as not done` : `Complete “${label}”`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!checked) setPop(true);
        onToggle();
      }}
      onAnimationEnd={() => setPop(false)}
      className={cn(
        "group/check relative grid shrink-0 place-items-center rounded-full transition-[background,border-color] duration-200",
        size === "md" ? "size-[20px] border-[1.6px]" : "size-[16px] border-[1.4px]",
        pop && "animate-check-pop",
        // generous invisible touch target
        "before:absolute before:-inset-2.5 before:content-['']",
      )}
      style={{
        borderColor: checked ? fill : color,
        background: checked ? fill : priority >= 2 ? `color-mix(in oklab, ${color} 9%, transparent)` : "transparent",
      }}
    >
      {checked ? (
        <svg viewBox="0 0 16 16" className={cn(size === "md" ? "size-3" : "size-2.5", "text-white")} fill="none">
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="animate-check-draw" />
        </svg>
      ) : (
        <Check
          className={cn(size === "md" ? "size-3" : "size-2.5", "opacity-0 transition-opacity group-hover/check:opacity-60")}
          style={{ color }}
          strokeWidth={3}
        />
      )}
    </button>
  );
}

// ---------------- Meta line ----------------
function ListPill({ task }: { task: Task }) {
  const cat = useData((s) => (task.categoryId ? s.categories[task.categoryId] : undefined));
  const list = useData((s) => (task.listId ? s.lists[task.listId] : undefined));
  const color = useCategoryColor(cat?.color);
  if (!cat || cat.deleted) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="size-[7px] shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{list && !list.deleted ? list.name : cat.name}</span>
    </span>
  );
}

export function TaskMeta({ task, showList = true, showDate = true }: { task: Task; showList?: boolean; showDate?: boolean }) {
  const doneSubs = task.subtasks.filter((s) => s.done).length;
  const diff = task.dueDate ? diffFromToday(task.dueDate) : 0;
  const overdue = !!task.dueDate && !task.completed && diff < 0;
  const items: React.ReactNode[] = [];

  if (showDate && task.dueDate)
    items.push(
      <span key="d" className={cn("inline-flex items-center gap-1", overdue && "text-danger", diff === 0 && !task.completed && "text-accent")}>
        <CalendarDays className="size-3" />
        {relativeLabel(task.dueDate)}
        {task.dueTime && <span>· {formatTime(task.dueTime)}</span>}
      </span>,
    );
  else if (task.dueTime) items.push(<span key="t">{formatTime(task.dueTime)}</span>);
  if (task.recurrence) items.push(<Repeat key="r" className="size-3" aria-label="Repeats" />);
  if (task.reminderAt && !task.completed) items.push(<Bell key="b" className="size-3" aria-label="Reminder set" />);
  if (task.subtasks.length)
    items.push(
      <span key="s" className="inline-flex items-center gap-1">
        <ListChecks className="size-3" />
        {doneSubs}/{task.subtasks.length}
      </span>,
    );
  if (task.notes.trim()) items.push(<AlignLeft key="n" className="size-3" aria-label="Has notes" />);
  if (showList && task.categoryId) items.push(<ListPill key="l" task={task} />);
  task.tags.slice(0, 3).forEach((t) =>
    items.push(
      <span key={"tag" + t} className="rounded-[5px] bg-hover px-1.5 py-px text-[11px] font-medium">
        #{t}
      </span>,
    ),
  );
  if (!items.length) return null;
  return <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] leading-4 text-muted">{items}</div>;
}

// ---------------- Static row (drag overlay, focus mode) ----------------
export function TaskRowStatic({ task }: { task: Task }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <div className="pt-[1px]">
        <TaskCheckbox checked={task.completed} priority={task.priority} onToggle={() => {}} label={task.title} />
      </div>
      <div className="min-w-0 flex-1">
        <div data-task-title className="truncate text-[15px] leading-5">{task.title}</div>
        <TaskMeta task={task} />
      </div>
    </div>
  );
}

// ---------------- Interactive row ----------------
interface TaskItemProps {
  task: Task;
  ids: string[];
  containerId: string;
  sortable: boolean;
  showList?: boolean;
  showDate?: boolean;
}

const SWIPE_TRIGGER = 84;

export const TaskItem = React.memo(function TaskItem({ task, ids, containerId, sortable, showList, showDate }: TaskItemProps) {
  const selected = useUI((s) => s.selectedTaskId === task.id);
  const open = useUI((s) => s.detailTaskId === task.id);
  const leaving = useUI((s) => !!s.completing[task.id]) && task.completed;
  const data: DragData = { type: "task", taskId: task.id, ids, containerId };
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id,
    data,
    disabled: !sortable,
  });

  // ---- swipe (touch) ----
  const [dx, setDx] = React.useState(0);
  const swipe = React.useRef<{ x: number; y: number; active: boolean; locked: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipe.current = { x: t.clientX, y: t.clientY, active: false, locked: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = swipe.current;
    if (!s || isDragging) return;
    const t = e.touches[0];
    const mx = t.clientX - s.x;
    const my = t.clientY - s.y;
    if (!s.active && !s.locked) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) s.locked = true; // vertical scroll wins
      else if (Math.abs(mx) > 12) s.active = true;
    }
    if (s.active) {
      const damp = (v: number) => (Math.abs(v) > SWIPE_TRIGGER ? Math.sign(v) * (SWIPE_TRIGGER + (Math.abs(v) - SWIPE_TRIGGER) * 0.35) : v);
      const next = damp(mx);
      if ((Math.abs(dx) < SWIPE_TRIGGER) !== (Math.abs(next) < SWIPE_TRIGGER)) haptic(5);
      setDx(next);
    }
  };
  const onTouchEnd = () => {
    const s = swipe.current;
    swipe.current = null;
    if (!s?.active) return;
    if (dx >= SWIPE_TRIGGER) toggleComplete(task.id);
    else if (dx <= -SWIPE_TRIGGER) deleteWithUndo(task.id);
    setDx(0);
  };

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const openDetail = () => {
    if (Math.abs(dx) > 2) return;
    useUI.getState().openDetail(task.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative", isDragging && "z-10 opacity-40", leaving && "animate-task-out")}
      data-task-id={task.id}
    >
      {/* swipe backgrounds */}
      {dx !== 0 && (
        <div className="absolute inset-0 overflow-hidden rounded-xl">
          <div
            className={cn(
              "absolute inset-0 flex items-center px-5 text-white transition-colors",
              dx > 0 ? "justify-start" : "justify-end",
              dx > 0 ? (dx >= SWIPE_TRIGGER ? "bg-success" : "bg-success/50") : dx <= -SWIPE_TRIGGER ? "bg-danger" : "bg-danger/50",
            )}
          >
            {dx > 0 ? <Check className="size-5" strokeWidth={2.6} /> : <Trash2 className="size-5" />}
          </div>
        </div>
      )}
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={-1}
        aria-roledescription={sortable ? "sortable task" : undefined}
        aria-label={task.title}
        onClick={openDetail}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => setDx(0)}
        className={cn(
          "group relative flex cursor-default touch-pan-y select-none items-start gap-3 rounded-xl px-3 py-[9px] outline-none",
          "transition-[background-color,box-shadow] duration-150 hover:bg-hover",
          dx !== 0 && "bg-solid shadow-card",
          (selected || open) && "bg-accent-soft hover:bg-accent-soft",
          dx === 0 && "transition-transform",
        )}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      >
        <div className="pt-[1px]">
          <TaskCheckbox checked={task.completed} priority={task.priority} onToggle={() => toggleComplete(task.id)} label={task.title} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              data-task-title
              className={cn(
                "min-w-0 flex-1 truncate text-[15px] leading-5 transition-colors duration-300",
                task.completed && "text-faint line-through decoration-faint/60",
              )}
            >
              {task.title || <span className="text-faint">Untitled</span>}
            </span>
            {task.priority >= 3 && !task.completed && (
              <Flag className="size-3.5 shrink-0" style={{ color: priorityColor(task.priority) }} fill="currentColor" aria-label={task.priority === 4 ? "Urgent" : "High priority"} />
            )}
          </div>
          <TaskMeta task={task} showList={showList} showDate={showDate} />
        </div>
      </div>
    </div>
  );
});

// ---------------- List ----------------
export function TaskList({
  tasks,
  containerId,
  sortable = true,
  showList = true,
  showDate = true,
}: {
  tasks: Task[];
  containerId: string;
  sortable?: boolean;
  showList?: boolean;
  showDate?: boolean;
}) {
  const ids = React.useMemo(() => tasks.map((t) => t.id), [tasks]);
  return (
    <SortableContext id={containerId} items={ids} strategy={verticalListSortingStrategy}>
      <div className="flex flex-col gap-px" role="list">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} ids={ids} containerId={containerId} sortable={sortable} showList={showList} showDate={showDate} />
        ))}
      </div>
    </SortableContext>
  );
}
