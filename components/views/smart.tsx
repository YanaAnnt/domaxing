"use client";

import * as React from "react";
import { format } from "date-fns";
import { useDroppable } from "@dnd-kit/core";
import { CalendarClock, CheckCircle2, Inbox as InboxIcon, Layers, PartyPopper, Search, Sun, X } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useAllTasks, useCategories, sortTasks, isVisibleActive, matchesQuery, completedNewestFirst } from "@/lib/selectors";
import { addDaysKey, diffFromToday, fromKey, relativeLabel, todayKey, toKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PRIORITIES } from "@/lib/constants";
import type { Task } from "@/lib/types";
import { Button, Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/primitives";
import { CompletedSection, EmptyState, InlineAdd, SortMenu, TaskGroup, ViewBody, ViewHeader, useSortMode } from "./shared";
import { CategoryIcon } from "../list-picker";
import type { DragData } from "../dnd";
import { ProgressRing } from "./progress";
import { BriefingCard, EventStrip, useEventsOn } from "../assistant-ui";

function useActive() {
  const tasks = useAllTasks();
  const completing = useUI((s) => s.completing);
  return React.useMemo(() => tasks.filter((t) => isVisibleActive(t, completing)), [tasks, completing]);
}

// ---------------- Today ----------------
export function TodayView() {
  const all = useAllTasks();
  const active = useActive();
  const sort = useSortMode("today");
  const today = todayKey();
  const overdue = sortTasks(active.filter((t) => t.dueDate && t.dueDate < today), sort);
  const todays = sortTasks(active.filter((t) => t.dueDate === today), sort);
  const completing = useUI((s) => s.completing);
  const doneToday = all
    .filter((t) => t.completed && !completing[t.id] && t.completedAt && toKey(new Date(t.completedAt)) === today)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1));
  const totalToday = todays.filter((t) => !t.completed).length + doneToday.length + todays.filter((t) => t.completed).length;
  const doneCount = doneToday.length + todays.filter((t) => t.completed).length;
  const pending = todays.length + overdue.length;
  const hasEvents = useEventsOn(today).length > 0;

  return (
    <ViewBody>
      <ViewHeader
        title={
          <span className="flex items-center gap-2.5">
            <Sun className="size-[26px] text-amber-500 md:size-6" strokeWidth={2.2} />
            Today
          </span>
        }
        subtitle={format(new Date(), "EEEE, MMMM d")}
        right={
          <>
            {totalToday > 0 && <ProgressRing value={doneCount} total={totalToday} />}
            <SortMenu viewKey="today" />
          </>
        }
      />
      <BriefingCard compact />
      <EventStrip dateKey={today} title="Schedule" />
      {overdue.length > 0 && (
        <TaskGroup title="Overdue" tone="danger" count={overdue.length} tasks={overdue} containerId="today-overdue" sortable={sort === "manual"} />
      )}
      <TaskGroup
        title={overdue.length || hasEvents ? "Tasks" : undefined}
        tasks={todays}
        containerId="today"
        sortable={sort === "manual"}
        showDate={false}
        footer={<InlineAdd defaults={{ dueDate: today }} />}
      />
      {pending === 0 &&
        (doneToday.length > 0 ? (
          <EmptyState icon={<PartyPopper className="size-7" />} title="All done for today" body="Enjoy the rest of your day, or get a head start on tomorrow." />
        ) : (
          <EmptyState icon={<Sun className="size-7" />} title="A fresh, clear day" body="Nothing scheduled. Add a task above, or pull something in from Upcoming." />
        ))}
      {doneToday.length > 0 && (
        <TaskGroup title="Completed today" count={doneToday.length} tasks={doneToday} containerId="today-done" sortable={false} collapsible defaultCollapsed={pending > 0} />
      )}
    </ViewBody>
  );
}

// ---------------- Upcoming ----------------
function DayDrop({ date, containerId, children }: { date: string; containerId: string; children: React.ReactNode }) {
  const data: DragData & { containerId: string } = { type: "target", target: { kind: "date", date }, accepts: ["task"], containerId };
  const { setNodeRef, isOver } = useDroppable({ id: `drop-date-${containerId}`, data });
  return (
    <div ref={setNodeRef} className={cn("rounded-xl transition-colors", isOver && "bg-accent-soft ring-2 ring-accent/30")}>
      {children}
    </div>
  );
}

function DayEvents({ dateKey }: { dateKey: string }) {
  const events = useEventsOn(dateKey);
  if (!events.length) return null;
  return (
    <div className="mb-1 flex flex-col gap-0.5 px-3 pt-1">
      {events.map((e) => (
        <div key={e.id} className="flex items-center gap-2.5 text-[13px] text-muted">
          <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-accent/50" />
          <span className="w-11 shrink-0 tabular-nums">{e.all_day ? "All day" : format(new Date(e.starts_at), "H:mm")}</span>
          <span className="truncate">{e.title}</span>
        </div>
      ))}
    </div>
  );
}

export function UpcomingView() {
  const active = useActive();
  const sort = useSortMode("upcoming");
  const today = todayKey();
  const overdue = sortTasks(active.filter((t) => t.dueDate && t.dueDate < today), sort);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(today, i));
  const end = days[6];
  const later = sortTasks(active.filter((t) => t.dueDate && t.dueDate > end), "due");

  return (
    <ViewBody>
      <ViewHeader
        title={
          <span className="flex items-center gap-2.5">
            <CalendarClock className="size-[26px] text-rose-500 md:size-6" strokeWidth={2.2} />
            Upcoming
          </span>
        }
        subtitle="The next seven days"
        right={<SortMenu viewKey="upcoming" />}
      />
      {overdue.length > 0 && (
        <TaskGroup title="Overdue" tone="danger" count={overdue.length} tasks={overdue} containerId="up-overdue" sortable={sort === "manual"} />
      )}
      {days.map((d) => {
        const tasks = sortTasks(active.filter((t) => t.dueDate === d), sort);
        const diff = diffFromToday(d);
        const cid = `up-${d}`;
        return (
          <DayDrop key={d} date={d} containerId={cid}>
            <section className="mb-5">
              <div className="mb-1 flex items-baseline gap-2 border-b border-line px-3 pb-1.5 pt-1">
                <span className={cn("text-[22px] font-semibold tabular-nums leading-none tracking-tight", diff === 0 && "text-accent")}>
                  {format(fromKey(d), "d")}
                </span>
                <span className="text-[13px] font-semibold">{diff <= 1 ? relativeLabel(d) : format(fromKey(d), "EEEE")}</span>
                <span className="text-xs text-faint">{diff <= 1 ? format(fromKey(d), "EEEE") : format(fromKey(d), "MMMM")}</span>
              </div>
              <DayEvents dateKey={d} />
              <TaskGroup tasks={tasks} containerId={cid} sortable={sort === "manual"} showDate={false} footer={<InlineAdd compact defaults={{ dueDate: d }} placeholder="Add task" />} />
            </section>
          </DayDrop>
        );
      })}
      {later.length > 0 && <TaskGroup title="Later" count={later.length} tasks={later} containerId="up-later" sortable={false} collapsible defaultCollapsed />}
    </ViewBody>
  );
}

// ---------------- Inbox ----------------
export function InboxView() {
  const active = useActive();
  const sort = useSortMode("inbox");
  const tasks = sortTasks(active.filter((t) => !t.categoryId), sort);
  const all = useAllTasks();
  const completing = useUI((s) => s.completing);
  const done = completedNewestFirst(all.filter((t) => !t.categoryId), completing);
  return (
    <ViewBody>
      <ViewHeader
        title={
          <span className="flex items-center gap-2.5">
            <InboxIcon className="size-[26px] text-accent md:size-6" strokeWidth={2.2} />
            Inbox
          </span>
        }
        subtitle="Capture now, organize later"
        right={<SortMenu viewKey="inbox" />}
      />
      <TaskGroup tasks={tasks} containerId="inbox" sortable={sort === "manual"} showList={false} footer={<InlineAdd defaults={{}} placeholder="Capture a thought" />} />
      <CompletedSection tasks={done} containerId="done-inbox" />
      {tasks.length === 0 && (
        <EmptyState
          icon={<InboxIcon className="size-7" />}
          title="Inbox zero"
          body="Anything you capture without a category lands here. Drag tasks onto a list in the sidebar to file them."
        />
      )}
    </ViewBody>
  );
}

// ---------------- All tasks ----------------
type DateFilter = "any" | "overdue" | "today" | "week" | "none";
type StatusFilter = "active" | "completed" | "all";

export function AllTasksView() {
  const all = useAllTasks();
  const completing = useUI((s) => s.completing);
  const categories = useCategories();
  const sort = useSortMode("all");
  const [cat, setCat] = React.useState<string>("any");
  const [date, setDate] = React.useState<DateFilter>("any");
  const [prio, setPrio] = React.useState<string>("any");
  const [status, setStatus] = React.useState<StatusFilter>("active");
  const [q, setQ] = React.useState("");
  const today = todayKey();
  const weekEnd = addDaysKey(today, 7);

  const filtered = all.filter((t) => {
    if (status === "active" && !isVisibleActive(t, completing)) return false;
    if (status === "completed" && !t.completed) return false;
    if (cat === "inbox" && t.categoryId) return false;
    if (cat !== "any" && cat !== "inbox" && t.categoryId !== cat) return false;
    if (date === "overdue" && !(t.dueDate && t.dueDate < today)) return false;
    if (date === "today" && t.dueDate !== today) return false;
    if (date === "week" && !(t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd)) return false;
    if (date === "none" && t.dueDate) return false;
    if (prio !== "any" && t.priority !== Number(prio)) return false;
    if (q && !matchesQuery(t, q)) return false;
    return true;
  });

  const groups: { id: string; title: React.ReactNode; tasks: Task[] }[] = [];
  const inbox = filtered.filter((t) => !t.categoryId);
  if (inbox.length) groups.push({ id: "inbox", title: "Inbox", tasks: sortTasks(inbox, sort) });
  for (const c of categories) {
    const ts = filtered.filter((t) => t.categoryId === c.id);
    if (ts.length)
      groups.push({
        id: c.id,
        title: (
          <span className="flex items-center gap-1.5">
            <CategoryIcon icon={c.icon} color={c.color} className="size-3.5" />
            {c.name}
          </span>
        ),
        tasks: sortTasks(ts, sort),
      });
  }
  const filtersActive = cat !== "any" || date !== "any" || prio !== "any" || status !== "active" || q;

  return (
    <ViewBody>
      <ViewHeader
        title={
          <span className="flex items-center gap-2.5">
            <Layers className="size-[26px] text-teal-500 md:size-6" strokeWidth={2.2} />
            All Tasks
          </span>
        }
        subtitle={`${filtered.length} ${filtered.length === 1 ? "task" : "tasks"}`}
        right={<SortMenu viewKey="all" />}
      />
      <div className="-mx-1 mb-6 flex flex-wrap items-center gap-1.5 px-1">
        <div className="relative mr-1 w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            className="h-8 w-full rounded-lg bg-sunken pl-8 pr-3 text-[13px] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/25 sm:w-44"
          />
        </div>
        <FilterMenu
          label="Category"
          value={cat}
          onChange={setCat}
          options={[{ value: "any", label: "Any category" }, { value: "inbox", label: "Inbox" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <FilterMenu
          label="Date"
          value={date}
          onChange={(v) => setDate(v as DateFilter)}
          options={[
            { value: "any", label: "Any date" }, { value: "overdue", label: "Overdue" }, { value: "today", label: "Today" },
            { value: "week", label: "Next 7 days" }, { value: "none", label: "No date" },
          ]}
        />
        <FilterMenu
          label="Priority"
          value={prio}
          onChange={setPrio}
          options={[{ value: "any", label: "Any priority" }, ...[...PRIORITIES].reverse().map((p) => ({ value: String(p.value), label: p.label }))]}
        />
        <FilterMenu
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[{ value: "active", label: "Active" }, { value: "completed", label: "Completed" }, { value: "all", label: "All" }]}
        />
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={() => { setCat("any"); setDate("any"); setPrio("any"); setStatus("active"); setQ(""); }}>
            <X className="size-3.5" /> Reset
          </Button>
        )}
      </div>
      {groups.map((g) => (
        <TaskGroup key={g.id} title={g.title} count={g.tasks.length} tasks={g.tasks} containerId={`all-${g.id}`} sortable={sort === "manual"} showList={g.id === "inbox" ? false : true} />
      ))}
      {groups.length === 0 && <EmptyState icon={<Search className="size-7" />} title="No matching tasks" body="Try loosening the filters." />}
    </ViewBody>
  );
}

function FilterMenu({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const current = options.find((o) => o.value === value);
  const isDefault = value === options[0].value;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
            isDefault ? "border-line-strong text-muted hover:bg-hover" : "border-transparent bg-accent-soft text-accent",
          )}
        >
          {isDefault ? label : current?.label}
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <MenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

// ---------------- Completed ----------------
export function CompletedView() {
  const all = useAllTasks();
  const completing = useUI((s) => s.completing);
  const done = all.filter((t) => t.completed && !completing[t.id]).sort((a, b) => ((a.completedAt ?? "") < (b.completedAt ?? "") ? 1 : -1));
  const groups = new Map<string, Task[]>();
  for (const t of done) {
    const k = t.completedAt ? toKey(new Date(t.completedAt)) : "unknown";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  return (
    <ViewBody>
      <ViewHeader
        title={
          <span className="flex items-center gap-2.5">
            <CheckCircle2 className="size-[26px] text-success md:size-6" strokeWidth={2.2} />
            Completed
          </span>
        }
        subtitle={done.length ? `${done.length} done · uncheck a task to restore it` : undefined}
      />
      {[...groups.entries()].map(([k, ts]) => (
        <TaskGroup key={k} title={k === "unknown" ? "Earlier" : relativeLabel(k)} count={ts.length} tasks={ts} containerId={`done-${k}`} sortable={false} />
      ))}
      {done.length === 0 && (
        <EmptyState icon={<CheckCircle2 className="size-7" />} title="Nothing completed yet" body="Tasks you check off show up here, so you can look back on what you’ve done, or restore them." />
      )}
    </ViewBody>
  );
}

export function useTodayStats() {
  const all = useAllTasks();
  const today = todayKey();
  const done = all.filter((t) => t.completed && t.completedAt && toKey(new Date(t.completedAt)) === today).length;
  const open = all.filter((t) => !t.completed && t.dueDate && t.dueDate <= today).length;
  return { done, total: done + open };
}

export function useCounts() {
  const all = useAllTasks();
  const today = todayKey();
  return React.useMemo(() => {
    let today_ = 0, overdue = 0, inbox = 0, upcoming = 0;
    const end = addDaysKey(today, 7);
    for (const t of all) {
      if (t.completed) continue;
      if (t.dueDate === today) today_++;
      if (t.dueDate && t.dueDate < today) overdue++;
      if (!t.categoryId) inbox++;
      if (t.dueDate && t.dueDate > today && t.dueDate <= end) upcoming++;
    }
    return { today: today_ + overdue, overdue, inbox, upcoming };
  }, [all, today]);
}

