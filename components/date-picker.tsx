"use client";

import * as React from "react";
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, nextMonday,
  startOfMonth, startOfWeek,
} from "date-fns";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Moon, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromKey, toKey, todayKey } from "@/lib/dates";
import { useData } from "@/lib/store";

export function Calendar({ value, onChange }: { value: string | null; onChange: (k: string) => void }) {
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const [month, setMonth] = React.useState(() => startOfMonth(value ? fromKey(value) : new Date()));
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn }),
  });
  const today = todayKey();
  const labels = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(new Date(), { weekStartsOn }), i), "EEEEE"));
  return (
    <div className="w-[252px] select-none p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-sm font-semibold">{format(month, "MMMM yyyy")}</span>
        <div className="flex">
          <button aria-label="Previous month" className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="size-4" />
          </button>
          <button aria-label="Next month" className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-faint">
        {labels.map((l, i) => (
          <div key={i} className="py-1">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d) => {
          const k = toKey(d);
          const sel = k === value;
          const isToday = k === today;
          return (
            <button
              key={k}
              onClick={() => onChange(k)}
              aria-label={format(d, "EEEE, MMMM d")}
              aria-pressed={sel}
              className={cn(
                "mx-auto grid size-8 place-items-center rounded-full text-[13px] tabular-nums transition-colors",
                !isSameMonth(d, month) && "text-faint",
                isToday && !sel && "font-semibold text-accent",
                sel ? "bg-accent font-semibold text-on-accent" : "hover:bg-hover",
              )}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Quick picks + calendar, used inside a popover. */
export function DatePickerPanel({
  value,
  onChange,
  onDone,
}: {
  value: string | null;
  onChange: (k: string | null) => void;
  onDone?: () => void;
}) {
  const pick = (k: string | null) => {
    onChange(k);
    onDone?.();
  };
  const now = new Date();
  const quick = [
    { label: "Today", icon: <Sun className="size-4 text-amber-500" />, k: toKey(now), hint: format(now, "EEE") },
    { label: "Tomorrow", icon: <Moon className="size-4 text-indigo-400" />, k: toKey(addDays(now, 1)), hint: format(addDays(now, 1), "EEE") },
    { label: "Next week", icon: <ArrowRight className="size-4 text-violet-500" />, k: toKey(nextMonday(now)), hint: format(nextMonday(now), "EEE MMM d") },
  ];
  return (
    <div>
      <div className="p-1">
        {quick.map((q) => (
          <button key={q.label} onClick={() => pick(q.k)} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm hover:bg-hover">
            {q.icon}
            <span className="flex-1 text-left">{q.label}</span>
            <span className="text-xs text-faint">{q.hint}</span>
          </button>
        ))}
        {value && (
          <button onClick={() => pick(null)} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted hover:bg-hover">
            <X className="size-4" />
            <span className="flex-1 text-left">No date</span>
          </button>
        )}
      </div>
      <div className="mx-2 h-px bg-line" />
      <Calendar value={value} onChange={(k) => pick(k)} />
    </div>
  );
}

export function DateIcon() {
  return <CalendarDays className="size-4" />;
}
