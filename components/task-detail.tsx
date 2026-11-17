"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  Bell, CalendarDays, ChevronLeft, Clock, Copy, Crosshair, Flag, GripVertical, Inbox, MoreHorizontal, Plus,
  Loader2, Repeat, Sparkles, Tag, Trash2, X,
} from "lucide-react";
import type { Priority, Recurrence, Task } from "@/lib/types";
import { useData } from "@/lib/store";
import { useUI } from "@/lib/ui-store";
import { cn, uid } from "@/lib/utils";
import { PRIORITIES } from "@/lib/constants";
import { diffFromToday, recurrenceLabel, relativeLabel, safeDate } from "@/lib/dates";
import { deleteWithUndo, toggleComplete } from "@/lib/actions";
import { requestNotificationPermission } from "@/lib/reminders";
import { useSync } from "@/lib/sync";
import { breakDownTask } from "@/lib/assistant";
import { AutoTextarea, Button, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./ui/primitives";
import { TaskCheckbox } from "./task-item";
import { DatePickerPanel } from "./date-picker";
import { CategoryIcon, ListPicker } from "./list-picker";

export function TaskDetail({ taskId, onClose, mobile }: { taskId: string; onClose: () => void; mobile?: boolean }) {
  const task = useData((s) => s.tasks[taskId]);
  if (!task || task.deleted) return null;
  return <DetailBody key={task.id} task={task} onClose={onClose} mobile={mobile} />;
}

function DetailBody({ task, onClose, mobile }: { task: Task; onClose: () => void; mobile?: boolean }) {
  const update = (patch: Partial<Task>) => useData.getState().updateTask(task.id, patch);

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-12 shrink-0 items-center gap-1 px-3", mobile && "pt-safe h-auto min-h-12")}>
        <Button variant="ghost" size={mobile ? "md" : "icon"} onClick={onClose} aria-label="Close details" className={cn(mobile && "-ml-1 px-1.5 text-accent hover:text-accent")}>
          {mobile ? (
            <>
              <ChevronLeft className="size-5" /> Back
            </>
          ) : (
            <X className="size-4" />
          )}
        </Button>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="sm" onClick={() => useUI.getState().setFocus(task.id)} title="Focus mode">
            <Crosshair className="size-4" />
            <span className="hidden sm:inline">Focus</span>
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem
                icon={<Copy />}
                onSelect={() => {
                  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = task;
                  const t = useData.getState().addTask({ ...rest, title: `${task.title} (copy)`, completed: false, completedAt: null });
                  useUI.getState().openDetail(t.id);
                }}
              >
                Duplicate
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<Trash2 />} onSelect={() => deleteWithUndo(task.id)} shortcut="⌫">
                Delete task
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
        <div className="flex items-start gap-3 pt-2">
          <div className="pt-[5px]">
            <TaskCheckbox checked={task.completed} priority={task.priority} onToggle={() => toggleComplete(task.id)} label={task.title} />
          </div>
          <AutoTextarea
            autoFocus={!task.title}
            value={task.title}
            onChange={(e) => update({ title: e.target.value.replace(/\n/g, "") })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            placeholder="Task name"
            aria-label="Task title"
            className={cn("w-full bg-transparent text-[19px] font-semibold leading-7 tracking-[-0.015em] outline-none placeholder:text-faint", task.completed && "text-muted line-through")}
          />
        </div>

        <AutoTextarea
          value={task.notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="Notes"
          aria-label="Notes"
          className="ml-8 mt-1.5 block w-[calc(100%-2rem)] bg-transparent text-[14.5px] leading-6 text-fg/90 outline-none placeholder:text-faint"
        />

        <Subtasks task={task} />

        <div className="mt-6 flex flex-col gap-0.5 border-t border-line pt-4">
          <DateRow task={task} update={update} />
          <PropRow icon={<Clock className="size-4" />} label="Time">
            <div className="flex items-center gap-1">
              <input
                type="time"
                value={task.dueTime ?? ""}
                onChange={(e) => update({ dueTime: e.target.value || null, dueDate: task.dueDate ?? (e.target.value ? new Date().toLocaleDateString("en-CA") : null) })}
                className="h-8 rounded-lg bg-transparent px-2 text-sm text-fg outline-none hover:bg-hover focus:bg-hover"
                aria-label="Due time"
              />
              {task.dueTime && <ClearBtn onClick={() => update({ dueTime: null })} label="Clear time" />}
            </div>
          </PropRow>
          <PropRow icon={<Flag className="size-4" />} label="Priority">
            <div className="flex flex-wrap gap-1">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => update({ priority: p.value as Priority })}
                  aria-pressed={task.priority === p.value}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium transition-colors",
                    task.priority === p.value ? "bg-active text-fg" : "text-muted hover:bg-hover",
                  )}
                >
                  {p.value > 0 && <Flag className="size-3" style={{ color: p.color }} fill={task.priority === p.value ? p.color : "none"} />}
                  {p.short}
                </button>
              ))}
            </div>
          </PropRow>
          <ListRow task={task} update={update} />
          <RepeatRow task={task} update={update} />
          <ReminderRow task={task} update={update} />
          <TagsRow task={task} update={update} />
        </div>

        <div className="mt-8 space-y-0.5 text-xs text-faint">
          <div>Created {format(safeDate(task.createdAt) ?? new Date(), "MMM d, yyyy 'at' h:mm a")}</div>
          {task.completedAt && <div>Completed {format(safeDate(task.completedAt) ?? new Date(), "MMM d, yyyy 'at' h:mm a")}</div>}
        </div>
      </div>
    </div>
  );
}

function PropRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3">
      <div className="flex w-24 shrink-0 items-center gap-2.5 text-[13px] text-muted">
        <span className="text-faint">{icon}</span>
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ClearBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="grid size-6 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg">
      <X className="size-3.5" />
    </button>
  );
}

const ValueBtn = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { muted?: boolean }>(function ValueBtn(
  { muted, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn("inline-flex h-8 max-w-full items-center gap-2 rounded-lg px-2 text-sm hover:bg-hover", muted ? "text-faint" : "text-fg", className)}
      {...props}
    />
  );
});

function DateRow({ task, update }: { task: Task; update: (p: Partial<Task>) => void }) {
  const [open, setOpen] = React.useState(false);
  const overdue = task.dueDate && !task.completed && diffFromToday(task.dueDate) < 0;
  return (
    <PropRow icon={<CalendarDays className="size-4" />} label="Date">
      <div className="flex items-center gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <ValueBtn muted={!task.dueDate} className={cn(overdue && "text-danger")}>
              {task.dueDate ? `${relativeLabel(task.dueDate)}${diffFromToday(task.dueDate) > 6 || diffFromToday(task.dueDate) < -1 ? "" : ` · ${format(new Date(task.dueDate + "T00:00"), "MMM d")}`}` : "Add date"}
            </ValueBtn>
          </PopoverTrigger>
          <PopoverContent>
            <DatePickerPanel value={task.dueDate} onChange={(k) => update({ dueDate: k, ...(k ? {} : { dueTime: null }) })} onDone={() => setOpen(false)} />
          </PopoverContent>
        </Popover>
        {task.dueDate && <ClearBtn onClick={() => update({ dueDate: null, dueTime: null })} label="Clear date" />}
      </div>
    </PropRow>
  );
}

function ListRow({ task, update }: { task: Task; update: (p: Partial<Task>) => void }) {
  const cat = useData((s) => (task.categoryId ? s.categories[task.categoryId] : undefined));
  const list = useData((s) => (task.listId ? s.lists[task.listId] : undefined));
  return (
    <PropRow icon={<Inbox className="size-4" />} label="List">
      <ListPicker
        value={{ listId: task.listId, categoryId: task.categoryId }}
        onChange={(t) => update({ listId: t.listId, categoryId: t.categoryId })}
        trigger={
          <ValueBtn>
            {cat && !cat.deleted ? (
              <>
                <CategoryIcon icon={cat.icon} color={cat.color} className="size-3.5" />
                <span className="truncate">
                  {cat.name}
                  {list && !list.deleted && <span className="text-muted"> / {list.name}</span>}
                </span>
              </>
            ) : (
              <>
                <Inbox className="size-3.5 text-accent" /> Inbox
              </>
            )}
          </ValueBtn>
        }
      />
      {list && !list.deleted && (list.sections?.length ?? 0) > 0 && (
        <select
          value={task.sectionId ?? ""}
          onChange={(e) => update({ sectionId: e.target.value || null })}
          aria-label="Section"
          className="ml-1 h-8 max-w-40 rounded-lg bg-transparent px-1.5 text-sm text-muted outline-none hover:bg-hover"
        >
          <option value="">No section</option>
          {list.sections!.map((sec) => (
            <option key={sec.id} value={sec.id}>{sec.name}</option>
          ))}
        </select>
      )}
    </PropRow>
  );
}

const REPEAT_OPTIONS: (Recurrence | null)[] = [
  null,
  { freq: "daily", interval: 1 },
  { freq: "weekdays", interval: 1 },
  { freq: "weekly", interval: 1 },
  { freq: "weekly", interval: 2 },
  { freq: "monthly", interval: 1 },
  { freq: "yearly", interval: 1 },
];

function RepeatRow({ task, update }: { task: Task; update: (p: Partial<Task>) => void }) {
  const [custom, setCustom] = React.useState(false);
  const [n, setN] = React.useState(task.recurrence?.interval ?? 3);
  const [unit, setUnit] = React.useState<Recurrence["freq"]>(task.recurrence?.freq === "weekdays" ? "daily" : task.recurrence?.freq ?? "daily");
  const set = (r: Recurrence | null) => update({ recurrence: r, ...(r && !task.dueDate ? { dueDate: new Date().toLocaleDateString("en-CA") } : {}) });
  return (
    <PropRow icon={<Repeat className="size-4" />} label="Repeat">
      <div className="flex items-center gap-1">
        <Popover open={custom} onOpenChange={setCustom}>
          <Menu>
            <PopoverAnchor asChild>
            <MenuTrigger asChild>
              <ValueBtn muted={!task.recurrence}>{task.recurrence ? recurrenceLabel(task.recurrence) : "Never"}</ValueBtn>
            </MenuTrigger>
            </PopoverAnchor>
            <MenuContent align="start">
              {REPEAT_OPTIONS.map((r, i) => (
                <MenuItem key={i} onSelect={() => set(r)}>
                  {r ? recurrenceLabel(r) : "Never"}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onSelect={() => setTimeout(() => setCustom(true), 0)}>Custom…</MenuItem>
            </MenuContent>
          </Menu>
          <PopoverContent className="w-64 p-3">
            <div className="mb-2 text-[13px] font-medium">Repeat every</div>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={365}
                value={n}
                onChange={(e) => setN(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                className="h-9 w-16 rounded-lg border border-line-strong bg-transparent px-2 text-sm outline-none focus:border-accent"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Recurrence["freq"])}
                className="h-9 flex-1 rounded-lg border border-line-strong bg-elevated px-2 text-sm outline-none focus:border-accent"
              >
                <option value="daily">day{n > 1 ? "s" : ""}</option>
                <option value="weekly">week{n > 1 ? "s" : ""}</option>
                <option value="monthly">month{n > 1 ? "s" : ""}</option>
                <option value="yearly">year{n > 1 ? "s" : ""}</option>
              </select>
            </div>
            <Button
              variant="primary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => {
                set({ freq: unit, interval: n });
                setCustom(false);
              }}
            >
              Save
            </Button>
          </PopoverContent>
        </Popover>
        {task.recurrence && <ClearBtn onClick={() => set(null)} label="Stop repeating" />}
      </div>
    </PropRow>
  );
}

function toLocalInput(iso: string | null) {
  const d = safeDate(iso);
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ReminderRow({ task, update }: { task: Task; update: (p: Partial<Task>) => void }) {
  const set = async (v: string) => {
    if (!v) return update({ reminderAt: null });
    update({ reminderAt: new Date(v).toISOString() });
    const perm = await requestNotificationPermission();
    if (perm === "denied")
      useUI.getState().toast({ message: "Notifications are blocked, so you’ll see in-app reminders instead." });
  };
  const quick = () => {
    const base = task.dueDate ? new Date(`${task.dueDate}T${task.dueTime ?? "09:00"}`) : new Date(Date.now() + 3600_000);
    if (task.dueTime) base.setMinutes(base.getMinutes() - 15);
    set(toLocalInput(base.toISOString()));
  };
  return (
    <PropRow icon={<Bell className="size-4" />} label="Reminder">
      <div className="flex items-center gap-1">
        {task.reminderAt ? (
          <>
            <input
              type="datetime-local"
              value={toLocalInput(task.reminderAt)}
              onChange={(e) => set(e.target.value)}
              className="h-8 rounded-lg bg-transparent px-2 text-sm outline-none hover:bg-hover focus:bg-hover"
              aria-label="Reminder time"
            />
            <ClearBtn onClick={() => update({ reminderAt: null })} label="Remove reminder" />
          </>
        ) : (
          <ValueBtn muted onClick={quick}>
            Add reminder
          </ValueBtn>
        )}
      </div>
    </PropRow>
  );
}

function TagsRow({ task, update }: { task: Task; update: (p: Partial<Task>) => void }) {
  const [v, setV] = React.useState("");
  const add = () => {
    const tag = v.trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (tag && !task.tags.includes(tag)) update({ tags: [...task.tags, tag] });
    setV("");
  };
  return (
    <PropRow icon={<Tag className="size-4" />} label="Tags">
      <div className="flex flex-wrap items-center gap-1 py-1">
        {task.tags.map((t) => (
          <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md bg-hover pl-2 pr-1 text-[12.5px] font-medium">
            #{t}
            <button aria-label={`Remove tag ${t}`} onClick={() => update({ tags: task.tags.filter((x) => x !== t) })} className="grid size-4 place-items-center rounded text-faint hover:text-fg">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
            if (e.key === "Backspace" && !v && task.tags.length) update({ tags: task.tags.slice(0, -1) });
          }}
          onBlur={add}
          placeholder={task.tags.length ? "" : "Add tag"}
          className="h-7 min-w-16 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-faint"
          aria-label="Add tag"
        />
      </div>
    </PropRow>
  );
}

function Breakdown({ task, onAdd }: { task: Task; onAdd: (titles: string[]) => void }) {
  const signedIn = useSync((s) => !!s.user);
  const [state, setState] = React.useState<{ loading: boolean; items: { title: string; on: boolean }[] | null; tip: string; error: string | null }>({
    loading: false, items: null, tip: "", error: null,
  });
  if (!signedIn || !task.title.trim()) return null;
  const run = async () => {
    setState({ loading: true, items: null, tip: "", error: null });
    try {
      const r = await breakDownTask({ title: task.title, notes: task.notes, existing: task.subtasks.map((s) => s.title), dueDate: task.dueDate });
      setState({ loading: false, items: r.subtasks.map((t) => ({ title: t, on: true })), tip: r.tip, error: null });
    } catch (e) {
      setState({ loading: false, items: null, tip: "", error: (e as Error).message });
    }
  };
  if (state.items) {
    const chosen = state.items.filter((i) => i.on);
    return (
      <div className="glass mt-2 rounded-2xl p-3 animate-rise-in">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-accent">
          <Sparkles className="size-3.5" /> Suggested steps
        </div>
        <ul className="flex flex-col">
          {state.items.map((it, i) => (
            <li key={i}>
              <label className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-[14px] hover:bg-hover">
                <input
                  type="checkbox"
                  checked={it.on}
                  onChange={() => setState((s) => ({ ...s, items: s.items!.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) }))}
                  className="size-4 accent-[var(--c-accent)]"
                />
                <span className={cn(!it.on && "text-faint line-through")}>{it.title}</span>
              </label>
            </li>
          ))}
        </ul>
        {state.tip && <p className="mt-1.5 px-1 text-xs leading-relaxed text-muted">💡 {state.tip}</p>}
        <div className="mt-2 flex justify-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setState({ loading: false, items: null, tip: "", error: null })}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!chosen.length}
            onClick={() => {
              onAdd(chosen.map((c) => c.title));
              setState({ loading: false, items: null, tip: "", error: null });
            }}
          >
            Add {chosen.length} {chosen.length === 1 ? "step" : "steps"}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-1 pl-1">
      <button onClick={run} disabled={state.loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-accent hover:bg-accent-soft disabled:opacity-60">
        {state.loading ? <Loader2 className="size-3.5 animate-spin-slow" /> : <Sparkles className="size-3.5" />}
        {state.loading ? "Thinking…" : "Break it down with AI"}
      </button>
      {state.error && <p className="px-2 text-xs text-danger">{state.error}</p>}
    </div>
  );
}

function Subtasks({ task }: { task: Task }) {
  const [draft, setDraft] = React.useState("");
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const set = (subtasks: Task["subtasks"]) => useData.getState().updateTask(task.id, { subtasks });
  const done = task.subtasks.filter((s) => s.done).length;

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    set([...task.subtasks, { id: uid(), title: t, done: false }]);
    setDraft("");
  };

  return (
    <div className="mt-5">
      {task.subtasks.length > 0 && (
        <div className="mb-1 flex items-center gap-2 pl-1 text-xs font-medium text-muted">
          Subtasks
          <span className="tabular-nums text-faint">
            {done}/{task.subtasks.length}
          </span>
          <div className="ml-1 h-1 flex-1 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(done / task.subtasks.length) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="flex flex-col">
        {task.subtasks.map((s, i) => (
          <div
            key={s.id}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIdx === null || dragIdx === i) return;
              const next = [...task.subtasks];
              const [m] = next.splice(dragIdx, 1);
              next.splice(i, 0, m);
              setDragIdx(i);
              set(next);
            }}
            onDragEnd={() => setDragIdx(null)}
            className={cn("group/sub flex min-h-9 items-center gap-2.5 rounded-lg pl-1 pr-1 hover:bg-hover", dragIdx === i && "opacity-50")}
          >
            <GripVertical className="size-3.5 shrink-0 cursor-grab text-faint opacity-0 group-hover/sub:opacity-100 max-md:hidden" />
            <TaskCheckbox size="sm" checked={s.done} priority={0} label={s.title} onToggle={() => set(task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))} />
            <input
              value={s.title}
              onChange={(e) => set(task.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  inputRef.current?.focus();
                }
                if (e.key === "Backspace" && !s.title) {
                  e.preventDefault();
                  set(task.subtasks.filter((x) => x.id !== s.id));
                  inputRef.current?.focus();
                }
              }}
              className={cn("h-8 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none", s.done && "text-faint line-through")}
              aria-label="Subtask"
            />
            <button
              aria-label="Delete subtask"
              onClick={() => set(task.subtasks.filter((x) => x.id !== s.id))}
              className="grid size-6 place-items-center rounded-md text-faint opacity-0 hover:text-danger group-hover/sub:opacity-100 max-md:opacity-60"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <div className="flex min-h-9 items-center gap-2.5 pl-1">
          <span className="w-3.5 max-md:hidden" />
          <Plus className="size-4 shrink-0 text-accent" />
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            placeholder="Add subtask"
            className="h-8 min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-faint"
            aria-label="Add subtask"
            enterKeyHint="next"
          />
        </div>
      </div>
      <Breakdown task={task} onAdd={(titles) => set([...task.subtasks, ...titles.map((title) => ({ id: uid(), title, done: false }))])} />
    </div>
  );
}
