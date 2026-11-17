"use client";

import * as React from "react";
import { format } from "date-fns";
import { useDroppable } from "@dnd-kit/core";
import { AlertCircle, CalendarRange, Check, ChevronLeft, ChevronRight, Columns3, Inbox, Plus, Rows3 } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import { useAllTasks, sortTasks, isVisibleActive } from "@/lib/selectors";
import { addDaysKey, diffFromToday, fromKey, todayKey, toKey, weekStart } from "@/lib/dates";
import { cn, haptic } from "@/lib/utils";
import type { Task } from "@/lib/types";
import { Button, Segmented } from "../ui/primitives";
import { InlineAdd, TaskGroup, ViewBody, ViewHeader } from "./shared";
import type { DragData } from "../dnd";

type WeekMode = "board" | "day";
const MODE_KEY = "domaxing:week-mode";
/** Width of #main at which seven columns fit comfortably side by side. */
const BOARD_MIN_WIDTH = 1040;
const SWIPE_COMMIT = 56;

/** Tracks the width of the main scroll area (it shrinks when the sidebar or task panel opens). */
function useMainWidth() {
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const el = document.getElementById("main");
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

function dayLabel(k: string) {
  const diff = diffFromToday(k);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return format(fromKey(k), "EEEE");
}

// ---------------- Week planning ----------------
export function WeekView() {
  const all = useAllTasks();
  const completing = useUI((s) => s.completing);
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const today = todayKey();
  const [selected, setSelected] = React.useState(today);
  const [dir, setDir] = React.useState<-1 | 0 | 1>(0);
  const [pref, setPref] = React.useState<WeekMode>("board");

  React.useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === "day") setPref("day");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const changeMode = (m: WeekMode) => {
    setPref(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* storage unavailable */
    }
  };

  const mainWidth = useMainWidth();
  const canBoard = mainWidth >= BOARD_MIN_WIDTH;
  const mode: WeekMode = canBoard ? pref : "day";

  const start = toKey(weekStart(fromKey(selected), weekStartsOn));
  const days = React.useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysKey(start, i)), [start]);
  const isThisWeek = days.includes(today);

  const select = (k: string) => {
    if (!days.includes(k)) setDir(k > selected ? 1 : -1);
    setSelected(k);
  };
  const shiftWeek = (n: 1 | -1) => {
    setDir(n);
    setSelected((s) => addDaysKey(s, 7 * n));
    haptic(4);
  };

  // When a task's panel opens (which can narrow the layout), focus that task's day.
  const detailId = useUI((s) => s.detailTaskId);
  const detailDue = useData((s) => (detailId ? s.tasks[detailId]?.dueDate ?? null : null));
  React.useEffect(() => {
    if (detailDue && days.includes(detailDue)) setSelected(detailDue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, detailDue]);

  const shown = all.filter((t) => isVisibleActive(t, completing) || (t.completed && t.dueDate && days.includes(t.dueDate)));
  const byDay: Record<string, Task[]> = {};
  for (const d of days) byDay[d] = sortTasks(shown.filter((t) => t.dueDate === d), "manual");
  const overdue = sortTasks(
    all.filter((t) => isVisibleActive(t, completing) && t.dueDate && t.dueDate < today && !days.includes(t.dueDate)),
    "manual",
  );
  const unscheduled = sortTasks(all.filter((t) => isVisibleActive(t, completing) && !t.dueDate), "manual");
  const weekOpen = days.reduce((n, d) => n + byDay[d].filter((t) => !t.completed).length, 0);

  const anim = dir > 0 ? "animate-week-next" : dir < 0 ? "animate-week-prev" : "animate-fade-in";

  return (
    <ViewBody wide={mode === "board"} className={cn(mode === "board" && "max-w-[1500px] md:px-6")}>
      <ViewHeader
        title={
          <span className="flex items-center gap-2.5">
            <CalendarRange className="size-[26px] text-sky-500 md:size-6" strokeWidth={2.2} />
            Week
          </span>
        }
        subtitle={`${format(fromKey(days[0]), "MMM d")} - ${format(fromKey(days[6]), "MMM d, yyyy")} · ${weekOpen} open`}
        right={
          <>
            {canBoard && (
              <Segmented
                value={mode}
                onChange={changeMode}
                className="mr-1"
                options={[
                  { value: "board", label: <><Columns3 className="size-3.5" /> Week</>, title: "Show all seven days" },
                  { value: "day", label: <><Rows3 className="size-3.5" /> Day</>, title: "Focus on one day" },
                ]}
              />
            )}
            <div className="flex items-center rounded-lg bg-sunken p-0.5">
              <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => shiftWeek(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant={isThisWeek ? "ghost" : "subtle"}
                size="sm"
                className={cn(!isThisWeek && "text-accent")}
                onClick={() => select(today)}
              >
                Today
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => shiftWeek(1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </>
        }
      />

      {mode === "board" ? (
        <>
          <p className="-mt-4 mb-4 text-xs text-faint">Drag tasks between days to re-plan · double-click a day to add a task.</p>
          <div key={start} className={cn("grid grid-cols-7 gap-2", anim)}>
            {days.map((d) => (
              <WeekColumn key={d} date={d} tasks={byDay[d]} />
            ))}
          </div>
        </>
      ) : (
        <>
          <WeekStrip days={days} selected={selected} byDay={byDay} onPick={select} onShift={shiftWeek} anim={anim} />
          <DayAgenda key={selected} date={selected} tasks={byDay[selected] ?? []} />
        </>
      )}

      {(overdue.length > 0 || unscheduled.length > 0) && (
        <div className={cn("mt-8", mode === "board" && "grid gap-x-6 lg:grid-cols-2")}>
          {overdue.length > 0 && (
            <TaskGroup
              title={<span className="flex items-center gap-1.5"><AlertCircle className="size-3.5" /> Overdue</span>}
              tone="danger"
              count={overdue.length}
              tasks={overdue}
              containerId="week-overdue"
              sortable
              collapsible
              defaultCollapsed={overdue.length > 5}
            />
          )}
          {unscheduled.length > 0 && (
            <TaskGroup
              title={<span className="flex items-center gap-1.5"><Inbox className="size-3.5" /> Unscheduled</span>}
              count={unscheduled.length}
              tasks={unscheduled}
              containerId="week-unscheduled"
              sortable
              showDate={false}
              collapsible
              defaultCollapsed
            />
          )}
          <p className="-mt-3 px-3 text-xs text-faint">
            <span className="pointer-coarse:hidden">Drag a task onto a day to schedule it.</span>
            <span className="hidden pointer-coarse:inline">Press and hold a task, then drop it on a day to schedule it.</span>
          </p>
        </div>
      )}
    </ViewBody>
  );
}

// ---------------- Day strip (phone, narrow screens, Day mode) ----------------
function WeekStrip({
  days,
  selected,
  byDay,
  onPick,
  onShift,
  anim,
}: {
  days: string[];
  selected: string;
  byDay: Record<string, Task[]>;
  onPick: (k: string) => void;
  onShift: (n: 1 | -1) => void;
  anim: string;
}) {
  const [drag, setDrag] = React.useState(0);
  const g = React.useRef<{ x: number; y: number; active: boolean; locked: boolean; dx: number } | null>(null);
  const swiped = React.useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    g.current = { x: t.clientX, y: t.clientY, active: false, locked: false, dx: 0 };
    swiped.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = g.current;
    if (!s) return;
    const t = e.touches[0];
    const mx = t.clientX - s.x;
    const my = t.clientY - s.y;
    if (!s.active && !s.locked) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) s.locked = true;
      else if (Math.abs(mx) > 10) s.active = true;
    }
    if (s.active) {
      const next = Math.max(-120, Math.min(120, mx * 0.6));
      if ((Math.abs(s.dx) < SWIPE_COMMIT * 0.6) !== (Math.abs(next) < SWIPE_COMMIT * 0.6)) haptic(3);
      s.dx = next;
      setDrag(next);
    }
  };
  const onTouchEnd = () => {
    const s = g.current;
    g.current = null;
    if (!s?.active) return;
    swiped.current = true;
    if (s.dx <= -SWIPE_COMMIT * 0.6) onShift(1);
    else if (s.dx >= SWIPE_COMMIT * 0.6) onShift(-1);
    setDrag(0);
  };

  const move = (from: string, by: number) => {
    const next = addDaysKey(from, by);
    onPick(next);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-week-chip="${next}"]`)?.focus());
  };

  return (
    <div
      className="glass sticky top-[calc(env(safe-area-inset-top)+8px)] z-20 mb-5 overflow-hidden rounded-[22px] p-1.5 touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        g.current = null;
        setDrag(0);
      }}
      onClickCapture={(e) => {
        if (swiped.current) {
          e.stopPropagation();
          swiped.current = false;
        }
      }}
    >
      <div
        key={days[0]}
        role="tablist"
        aria-label="Days of the week"
        className={cn("grid grid-cols-7 gap-1", anim, drag === 0 && "transition-transform duration-200")}
        style={{ transform: drag ? `translateX(${drag}px)` : undefined }}
      >
        {days.map((d) => (
          <DayChip
            key={d}
            date={d}
            tasks={byDay[d] ?? []}
            selected={d === selected}
            onPick={() => onPick(d)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                move(d, 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(d, -1);
              } else if (e.key === "Home") {
                e.preventDefault();
                move(days[0], 0);
              } else if (e.key === "End") {
                e.preventDefault();
                move(days[6], 0);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function DayChip({
  date,
  tasks,
  selected,
  onPick,
  onKeyDown,
}: {
  date: string;
  tasks: Task[];
  selected: boolean;
  onPick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const cid = `week-${date}`;
  const data: DragData & { containerId: string } = { type: "target", target: { kind: "date", date }, accepts: ["task"], containerId: cid };
  const { setNodeRef, isOver } = useDroppable({ id: `drop-chip-${cid}`, data });
  const diff = diffFromToday(date);
  const d = fromKey(date);
  const open = tasks.filter((t) => !t.completed).length;
  const allDone = tasks.length > 0 && open === 0;
  const late = diff < 0 && open > 0;

  return (
    <button
      ref={setNodeRef}
      type="button"
      role="tab"
      data-week-chip={date}
      aria-selected={selected}
      aria-label={`${format(d, "EEEE, MMMM d")}${open ? `, ${open} open` : ""}`}
      tabIndex={selected ? 0 : -1}
      onClick={onPick}
      onKeyDown={onKeyDown}
      className={cn(
        "relative flex min-w-0 flex-col items-center gap-1 rounded-2xl pb-2 pt-1.5 outline-none transition-[background,transform,box-shadow] duration-150",
        "hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/50 active:scale-[0.96]",
        selected && "bg-elevated shadow-card hover:bg-elevated",
        isOver && "scale-105 bg-accent-soft ring-2 ring-accent/50",
      )}
    >
      <span
        className={cn(
          "text-[10.5px] font-semibold uppercase tracking-wide text-muted",
          diff === 0 && "text-accent",
          diff < 0 && !selected && "text-faint",
        )}
      >
        {format(d, "EEE")}
      </span>
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full text-[16px] font-semibold tabular-nums transition-colors",
          diff < 0 && !selected && "text-faint",
          diff === 0 && !selected && "text-accent ring-[1.5px] ring-accent/40",
          selected && "bg-accent text-on-accent",
        )}
      >
        {format(d, "d")}
      </span>
      <span className="flex h-1.5 items-center gap-[3px]" aria-hidden>
        {allDone ? (
          <Check className="size-2.5 text-success" strokeWidth={3.5} />
        ) : (
          Array.from({ length: Math.min(open, 4) }, (_, i) => (
            <span key={i} className={cn("size-[5px] rounded-full", late ? "bg-danger" : "bg-accent", i === 3 && "opacity-50")} />
          ))
        )}
      </span>
    </button>
  );
}

function DayAgenda({ date, tasks }: { date: string; tasks: Task[] }) {
  const diff = diffFromToday(date);
  const open = tasks.filter((t) => !t.completed).length;
  const done = tasks.length - open;
  const label = dayLabel(date);
  return (
    <section className="animate-rise-in">
      <div className="mb-2 flex items-end justify-between gap-3 px-3">
        <div className="min-w-0">
          <div
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted",
              diff === 0 && "text-accent",
              diff < 0 && open > 0 && "text-danger",
            )}
          >
            {label}
          </div>
          <h2 className="truncate text-[20px] font-semibold tracking-tight">{format(fromKey(date), "EEEE, MMMM d")}</h2>
        </div>
        {tasks.length > 0 && (
          <span className="shrink-0 pb-1 text-xs text-faint">
            {open} open{done ? ` · ${done} done` : ""}
          </span>
        )}
      </div>
      {tasks.length === 0 && (
        <div className="mb-1 rounded-2xl border border-dashed border-line-strong px-4 py-7 text-center">
          <p className="text-sm font-medium">Nothing planned</p>
          <p className="mt-0.5 text-xs text-muted">Add a task below or drag one onto this day.</p>
        </div>
      )}
      <TaskGroup
        tasks={tasks}
        containerId={`week-${date}`}
        sortable
        showDate={false}
        footer={<InlineAdd defaults={{ dueDate: date }} placeholder={`Add to ${Math.abs(diff) <= 1 ? label.toLowerCase() : label}`} />}
      />
    </section>
  );
}

// ---------------- Board column (wide screens) ----------------
function WeekColumn({ date, tasks }: { date: string; tasks: Task[] }) {
  const cid = `week-${date}`;
  const data: DragData & { containerId: string } = { type: "target", target: { kind: "date", date }, accepts: ["task"], containerId: cid };
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${cid}`, data });
  const diff = diffFromToday(date);
  const d = fromKey(date);
  const open = tasks.filter((t) => !t.completed).length;
  const add = () => useUI.getState().setQuickAdd({ dueDate: date });

  return (
    <div
      ref={setNodeRef}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest("[role=button],button,input")) add();
      }}
      className={cn(
        "group/col flex min-h-[380px] min-w-0 flex-col rounded-[20px] bg-white/35 p-1 transition-[background,box-shadow] dark:bg-white/[0.03]",
        diff === 0 && "bg-accent-soft dark:bg-accent-soft",
        isOver && "ring-2 ring-accent/50",
      )}
    >
      <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-1.5">
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
        {open > 0 && <span className={cn("ml-auto text-[11px] tabular-nums text-faint", diff < 0 && "text-danger")}>{open}</span>}
        <button
          type="button"
          onClick={add}
          aria-label={`Add a task on ${format(d, "EEEE, MMMM d")}`}
          className={cn(
            "grid size-6 place-items-center rounded-md text-faint opacity-0 transition-opacity hover:bg-hover hover:text-accent focus-visible:opacity-100 group-hover/col:opacity-100",
            open === 0 && "ml-auto",
          )}
        >
          <Plus className="size-3.5" strokeWidth={2.4} />
        </button>
      </div>
      <div
        className={cn(
          "flex-1 [&_section]:mb-1 [&_[role=list]]:gap-1",
          "[&_[role=button]]:gap-2 [&_[role=button]]:bg-white/70 [&_[role=button]]:px-2 [&_[role=button]]:py-2 [&_[role=button]]:shadow-card dark:[&_[role=button]]:bg-white/[0.06]",
          "[&_.text-\\[15px\\]]:text-[13px] [&_.text-\\[15px\\]]:leading-[18px]",
          "[&_.truncate]:line-clamp-3 [&_.truncate]:whitespace-normal [&_.truncate]:break-words",
          diff < 0 && "opacity-75",
        )}
      >
        <TaskGroup tasks={tasks} containerId={cid} sortable showDate={false} showList={false} />
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-auto flex h-8 items-center gap-1.5 rounded-xl px-2 text-[13px] text-faint transition-colors hover:bg-hover hover:text-accent"
      >
        <Plus className="size-3.5" strokeWidth={2.4} /> Add
      </button>
    </div>
  );
}
