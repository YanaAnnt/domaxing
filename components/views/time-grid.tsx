"use client";

import * as React from "react";
import { format } from "date-fns";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { Task } from "@/lib/types";
import { useUI } from "@/lib/ui-store";
import { toggleComplete } from "@/lib/actions";
import { priorityColor } from "@/lib/constants";
import { diffFromToday, formatTime, fromKey, todayKey } from "@/lib/dates";
import { blockBox, firstHour, layoutDay, slotTime, toMinutes, type Placed } from "@/lib/time-grid";
import { cn } from "@/lib/utils";
import { TaskCheckbox } from "../task-item";
import type { DragData } from "../dnd";

const HOUR_PX = 52;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const pad = (n: number) => String(n).padStart(2, "0");
const hourLabel = (h: number) => formatTime(`${pad(h)}:00`);
const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** Minutes since midnight, refreshed every minute for the "now" line. */
function useNowMinutes() {
  const [now, setNow] = React.useState(minutesNow);
  React.useEffect(() => {
    const id = setInterval(() => setNow(minutesNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const isTimed = (t: Task) => toMinutes(t.dueTime) !== null;

/**
 * The week (or one day, on a phone) as an hour grid: each task sits at its time, tasks without a time sit in
 * the "All day" row, clicking an empty slot adds a task at that day and time, and tasks can be dragged to a new slot.
 */
export function TimeGrid({ days, byDay, showHeader }: { days: string[]; byDay: Record<string, Task[]>; showHeader: boolean }) {
  const now = useNowMinutes();
  const today = todayKey();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const cols: React.CSSProperties = { gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` };

  // Open at a useful hour whenever the shown days change.
  const shownKey = `${days[0]}:${days.length}`;
  React.useEffect(() => {
    const starts = days.flatMap((d) => (byDay[d] ?? []).map((t) => toMinutes(t.dueTime)).filter((m): m is number => m !== null));
    const h = firstHour(starts, days.includes(today) ? minutesNow() : null);
    scrollRef.current?.scrollTo({ top: h * HOUR_PX });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  return (
    <div className="glass overflow-hidden rounded-[22px]" data-time-grid>
      {showHeader && (
        <div className="grid overflow-hidden border-b border-line [scrollbar-gutter:stable]" style={cols}>
          <div />
          {days.map((d) => (
            <DayHead key={d} date={d} />
          ))}
        </div>
      )}
      <div className="grid overflow-hidden border-b border-line [scrollbar-gutter:stable]" style={cols}>
        <div className="px-1.5 pt-2.5 text-right text-[10px] font-semibold uppercase leading-tight tracking-wide text-faint">All day</div>
        {days.map((d) => (
          <AllDayCell key={d} date={d} tasks={(byDay[d] ?? []).filter((t) => !isTimed(t))} />
        ))}
      </div>
      <div
        ref={scrollRef}
        data-scroll-clip
        className="relative overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
        style={{ maxHeight: "max(360px, calc(100dvh - 330px))" }}
      >
        <div className="grid" style={cols}>
          <div className="relative" style={{ height: 24 * HOUR_PX }} aria-hidden>
            {HOURS.slice(1).map((h) => (
              <span
                key={h}
                className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[10.5px] tabular-nums text-faint"
                style={{ top: h * HOUR_PX }}
              >
                {hourLabel(h)}
              </span>
            ))}
          </div>
          {days.map((d) => (
            <DayColumn key={d} date={d} tasks={(byDay[d] ?? []).filter(isTimed)} now={d === today ? now : null} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayHead({ date }: { date: string }) {
  const diff = diffFromToday(date);
  const d = fromKey(date);
  return (
    <button
      type="button"
      onClick={() => useUI.getState().setQuickAdd({ dueDate: date })}
      aria-label={`Add a task on ${format(d, "EEEE, MMMM d")}`}
      title="Add a task on this day"
      className="group/head flex min-w-0 items-center justify-center gap-1.5 border-l border-line py-2 transition-colors hover:bg-hover"
    >
      <span className={cn("text-[11px] font-semibold uppercase tracking-wide text-muted", diff === 0 && "text-accent", diff < 0 && "text-faint")}>
        {format(d, "EEE")}
      </span>
      <span
        className={cn(
          "grid h-6 min-w-6 place-items-center rounded-full px-1 text-[15px] font-semibold tabular-nums",
          diff < 0 && "text-faint",
          diff === 0 && "bg-accent text-on-accent",
        )}
      >
        {format(d, "d")}
      </span>
      <Plus className="size-3.5 text-accent opacity-0 transition-opacity group-hover/head:opacity-100" strokeWidth={2.4} aria-hidden />
    </button>
  );
}

function AllDayCell({ date, tasks }: { date: string; tasks: Task[] }) {
  const data: DragData = { type: "target", target: { kind: "allday", date }, accepts: ["task"] };
  const { setNodeRef, isOver } = useDroppable({ id: `drop-allday-${date}`, data });
  return (
    <div
      ref={setNodeRef}
      data-allday={date}
      onClick={(e) => {
        if (e.target === e.currentTarget) useUI.getState().setQuickAdd({ dueDate: date });
      }}
      className={cn(
        "no-scrollbar flex max-h-[132px] min-h-10 min-w-0 flex-col gap-1 overflow-y-auto border-l border-line p-1 transition-colors hover:bg-hover",
        diffFromToday(date) === 0 && "bg-accent-soft/40",
        isOver && "bg-accent-soft ring-2 ring-inset ring-accent/50",
      )}
    >
      {tasks.map((t) => (
        <GridTask key={t.id} task={t} />
      ))}
    </div>
  );
}

function DayColumn({ date, tasks, now }: { date: string; tasks: Task[]; now: number | null }) {
  const placed = React.useMemo(() => layoutDay(tasks, (t) => t.dueTime), [tasks]);
  return (
    <div className={cn("relative min-w-0 border-l border-line", diffFromToday(date) === 0 && "bg-accent-soft/40")} style={{ height: 24 * HOUR_PX }}>
      {HOURS.map((h) => (
        <HourCell key={h} date={date} hour={h} />
      ))}
      {placed.map((p) => (
        <GridTask key={p.item.id} task={p.item} placed={p} />
      ))}
      {now !== null && (
        <div className="pointer-events-none absolute inset-x-0 z-[2] border-t-2 border-danger" style={{ top: (now / 60) * HOUR_PX }} aria-hidden>
          <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-danger" />
        </div>
      )}
    </div>
  );
}

function HourCell({ date, hour }: { date: string; hour: number }) {
  const time = `${pad(hour)}:00`;
  const data: DragData = { type: "target", target: { kind: "slot", date, time }, accepts: ["task"] };
  const { setNodeRef, isOver } = useDroppable({ id: `drop-slot-${date}-${hour}`, data });
  return (
    <div
      ref={setNodeRef}
      data-slot={`${date} ${time}`}
      onClick={(e) => useUI.getState().setQuickAdd({ dueDate: date, dueTime: slotTime(hour, e.nativeEvent.offsetY, HOUR_PX) })}
      className={cn(
        "group/slot absolute inset-x-0 transition-colors hover:bg-hover",
        hour > 0 && "border-t border-line",
        isOver && "bg-accent-soft",
      )}
      style={{ top: hour * HOUR_PX, height: HOUR_PX }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line opacity-50" aria-hidden />
      <span className="pointer-events-none absolute left-1.5 top-1 hidden items-center gap-0.5 text-[10.5px] font-medium text-accent group-hover/slot:flex">
        <Plus className="size-3" strokeWidth={2.6} /> {hourLabel(hour)}
      </span>
    </div>
  );
}

/** A task on the grid: a block at its time, or a chip in the all-day row. Click opens it, drag moves it. */
function GridTask({ task, placed }: { task: Task; placed?: Placed<Task> }) {
  const data: DragData = { type: "task", taskId: task.id, ids: [task.id], containerId: `grid-${task.dueDate}` };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `grid-${task.id}`, data });
  const open = useUI((s) => s.detailTaskId === task.id);
  const color = task.priority >= 2 ? priorityColor(task.priority) : "var(--c-accent)";

  const box = placed && blockBox(placed.start, placed.end);
  const style: React.CSSProperties = box
    ? {
        top: (box.top / 60) * HOUR_PX + 1,
        height: ((box.bottom - box.top) / 60) * HOUR_PX - 2,
        left: `calc(${(placed!.lane / placed!.lanes) * 100}% + 2px)`,
        width: `calc(${100 / placed!.lanes}% - 4px)`,
        borderLeftColor: color,
      }
    : { borderLeftColor: color };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-grid-task={task.id}
      aria-label={task.dueTime ? `${task.title}, ${formatTime(task.dueTime)}` : task.title}
      onClick={(e) => {
        e.stopPropagation();
        useUI.getState().openDetail(task.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") useUI.getState().openDetail(task.id);
      }}
      className={cn(
        "flex min-w-0 cursor-default touch-pan-y select-none items-start gap-1.5 overflow-hidden rounded-lg border-l-[3px] bg-elevated px-1.5 py-1 text-left shadow-card outline-none",
        "transition-[box-shadow,opacity] hover:shadow-pop focus-visible:ring-2 focus-visible:ring-accent/50",
        placed ? "absolute z-[1]" : "relative shrink-0",
        task.completed && "opacity-55",
        open && "ring-2 ring-accent/60",
        isDragging && "opacity-40",
      )}
      style={style}
    >
      <div className="pt-px">
        <TaskCheckbox size="sm" checked={task.completed} priority={task.priority} label={task.title} onToggle={() => toggleComplete(task.id)} />
      </div>
      <div className={cn("min-w-0 flex-1 text-[12.5px] font-medium leading-4", placed ? "line-clamp-2" : "truncate", task.completed && "text-muted line-through")}>
        {placed && task.dueTime && <span className="mr-1 text-[10.5px] font-normal tabular-nums text-muted">{formatTime(task.dueTime)}</span>}
        {task.title}
      </div>
    </div>
  );
}
