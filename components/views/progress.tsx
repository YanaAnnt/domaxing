"use client";

import * as React from "react";
import { format } from "date-fns";
import { BarChart3, Flame, Target, TrendingUp } from "lucide-react";
import { useAllTasks, useCategories } from "@/lib/selectors";
import { addDaysKey, fromKey, todayKey, toKey, weekStart } from "@/lib/dates";
import { useData } from "@/lib/store";
import { cn } from "@/lib/utils";
import { colorFor, useIsDark } from "@/lib/theme";
import { ViewBody, ViewHeader } from "./shared";
import { CategoryIcon } from "../list-picker";

export function ProgressRing({ value, total, size = 28 }: { value: number; total: number; size?: number }) {
  const pct = total ? Math.min(1, value / total) : 0;
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const done = pct >= 1;
  return (
    <div className="flex items-center gap-2 pr-1" title={`${value} of ${total} done today`} aria-label={`${value} of ${total} done today`}>
      <span className="hidden text-xs tabular-nums text-muted sm:inline">
        {value}/{total}
      </span>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-border-strong)" strokeWidth={3} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={done ? "var(--c-success)" : "var(--c-accent)"}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.2,0.8,0.2,1), stroke 0.3s" }}
        />
      </svg>
    </div>
  );
}

export function ProgressView() {
  const all = useAllTasks();
  const categories = useCategories();
  const weekStartsOn = useData((s) => s.settings.weekStartsOn);
  const dark = useIsDark();
  const today = todayKey();

  const stats = React.useMemo(() => {
    const doneByDay: Record<string, number> = {};
    for (const t of all) {
      if (t.completed && t.completedAt) {
        const k = toKey(new Date(t.completedAt));
        doneByDay[k] = (doneByDay[k] ?? 0) + 1;
      }
    }
    const ws = toKey(weekStart(new Date(), weekStartsOn));
    const week = Array.from({ length: 7 }, (_, i) => addDaysKey(ws, i));
    const weekDone = week.reduce((n, d) => n + (doneByDay[d] ?? 0), 0);
    const weekDue = all.filter((t) => t.dueDate && t.dueDate >= week[0] && t.dueDate <= week[6]);
    const weekDueDone = weekDue.filter((t) => t.completed).length;
    let streak = 0;
    for (let d = today; ; d = addDaysKey(d, -1)) {
      if (doneByDay[d]) streak++;
      else if (d !== today) break;
      if (streak > 3650) break;
    }
    const todayDone = doneByDay[today] ?? 0;
    const todayOpen = all.filter((t) => !t.completed && t.dueDate && t.dueDate <= today).length;
    const last14 = Array.from({ length: 14 }, (_, i) => addDaysKey(today, i - 13)).map((d) => ({ d, n: doneByDay[d] ?? 0 }));
    const perCat = categories.map((c) => {
      const ts = all.filter((t) => t.categoryId === c.id);
      return { c, open: ts.filter((t) => !t.completed).length, done: ts.filter((t) => t.completed).length };
    });
    return { week, doneByDay, weekDone, weekDue: weekDue.length, weekDueDone, streak, todayDone, todayOpen, last14, perCat };
  }, [all, categories, weekStartsOn, today]);

  const max = Math.max(1, ...stats.last14.map((x) => x.n));

  return (
    <ViewBody>
      <ViewHeader
        title={
          <span className="flex items-center gap-2.5">
            <BarChart3 className="size-[26px] text-violet-500 md:size-6" strokeWidth={2.2} />
            Progress
          </span>
        }
        subtitle="A gentle look at your momentum"
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Target className="size-4" />} label="Today" value={`${stats.todayDone}/${stats.todayDone + stats.todayOpen}`} hint="completed" />
        <Stat icon={<TrendingUp className="size-4" />} label="This week" value={String(stats.weekDone)} hint="tasks done" />
        <Stat
          icon={<BarChart3 className="size-4" />}
          label="Week plan"
          value={stats.weekDue ? `${Math.round((stats.weekDueDone / stats.weekDue) * 100)}%` : "-"}
          hint={`${stats.weekDueDone} of ${stats.weekDue} due`}
        />
        <Stat icon={<Flame className="size-4" />} label="Streak" value={`${stats.streak}`} hint={stats.streak === 1 ? "day" : "days"} />
      </div>

      <section className="mt-8 glass rounded-[22px] p-5">
        <h2 className="mb-4 text-[13px] font-semibold">Last 14 days</h2>
        <div className="flex h-36 items-end gap-1.5">
          {stats.last14.map(({ d, n }) => (
            <div key={d} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[10px] tabular-nums text-faint opacity-0 transition-opacity group-hover:opacity-100">{n}</span>
              <div
                className={cn("w-full max-w-7 rounded-md transition-all duration-500", d === today ? "bg-accent" : "bg-accent/35")}
                style={{ height: `${Math.max(4, (n / max) * 100)}%`, opacity: n ? 1 : 0.35 }}
                title={`${format(fromKey(d), "EEE MMM d")}: ${n} done`}
              />
              <span className={cn("text-[10px] text-faint", d === today && "font-semibold text-accent")}>{format(fromKey(d), "EEEEE")}</span>
            </div>
          ))}
        </div>
      </section>

      {stats.perCat.length > 0 && (
        <section className="mt-4 glass rounded-[22px] p-5">
          <h2 className="mb-4 text-[13px] font-semibold">By category</h2>
          <div className="flex flex-col gap-4">
            {stats.perCat.map(({ c, open, done }) => {
              const total = open + done;
              const pct = total ? done / total : 0;
              return (
                <div key={c.id}>
                  <div className="mb-1.5 flex items-center gap-2 text-sm">
                    <CategoryIcon icon={c.icon} color={c.color} className="size-3.5" />
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-auto text-xs tabular-nums text-muted">
                      {done} done · {open} open
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct * 100}%`, background: colorFor(c.color, dark) }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </ViewBody>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="glass rounded-[20px] p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-[26px] font-semibold tabular-nums leading-none tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-faint">{hint}</div>
    </div>
  );
}
