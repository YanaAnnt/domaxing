"use client";

import * as React from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import { cn, uid } from "@/lib/utils";
import { formatTime, relativeLabel } from "@/lib/dates";
import { toggleComplete } from "@/lib/actions";
import { TaskCheckbox } from "./task-item";
import { Button } from "./ui/primitives";

// ---------------- Toasts ----------------
export function Toaster() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex min-h-11 max-w-[min(440px,100%)] animate-toast-in items-center gap-3 rounded-xl py-2 pl-4 pr-2 text-[14px] shadow-pop",
            "bg-[#1f2023] text-white dark:bg-[#2b2c31]",
            t.tone === "error" && "bg-danger dark:bg-danger",
          )}
          role="status"
        >
          <span className="min-w-0 flex-1 truncate">{t.message}</span>
          {t.actionLabel && (
            <button
              className="h-8 shrink-0 rounded-lg px-3 text-[13px] font-semibold text-[#8fb6ff] hover:bg-white/10"
              onClick={() => {
                t.onAction?.();
                useUI.getState().dismissToast(t.id);
              }}
            >
              {t.actionLabel}
            </button>
          )}
          <button aria-label="Dismiss" className="grid size-7 shrink-0 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" onClick={() => useUI.getState().dismissToast(t.id)}>
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------- Focus mode ----------------
export function FocusMode() {
  const id = useUI((s) => s.focusTaskId);
  const task = useData((s) => (id ? s.tasks[id] : undefined));
  const [draft, setDraft] = React.useState("");
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!id) return;
    setElapsed(0);
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useUI.getState().setFocus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [id]);

  if (!id || !task || task.deleted) return null;
  const close = () => useUI.getState().setFocus(null);
  const setSubs = (subtasks: typeof task.subtasks) => useData.getState().updateTask(task.id, { subtasks });
  const done = task.subtasks.filter((s) => s.done).length;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-bg animate-fade-in pt-safe pb-safe" role="dialog" aria-modal="true" aria-label="Focus mode">
      <div className="flex h-14 items-center justify-between px-4">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-faint">Focus</span>
        <span className="font-mono text-sm tabular-nums text-muted">{mm}:{ss}</span>
        <Button variant="ghost" size="icon" aria-label="Exit focus mode" onClick={close}>
          <X className="size-5" />
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 pb-16 pt-[8vh]">
        <div className="w-full max-w-xl animate-rise-in">
          <div className="flex items-start gap-4">
            <div className="pt-2">
              <TaskCheckbox checked={task.completed} priority={task.priority} label={task.title} onToggle={() => toggleComplete(task.id)} />
            </div>
            <h1 className={cn("text-[32px] font-semibold leading-tight tracking-[-0.03em] md:text-[40px]", task.completed && "text-faint line-through")}>
              {task.title}
            </h1>
          </div>
          {(task.dueDate || task.dueTime) && (
            <div className="ml-9 mt-3 flex items-center gap-1.5 text-sm text-muted">
              <CalendarDays className="size-4" />
              {task.dueDate && relativeLabel(task.dueDate)}
              {task.dueTime && ` · ${formatTime(task.dueTime)}`}
            </div>
          )}
          {task.notes && <p className="ml-9 mt-5 whitespace-pre-wrap text-[16px] leading-relaxed text-fg/80">{task.notes}</p>}

          <div className="ml-9 mt-10">
            {task.subtasks.length > 0 && (
              <div className="mb-4 h-1 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(done / task.subtasks.length) * 100}%` }} />
              </div>
            )}
            <div className="flex flex-col gap-1">
              {task.subtasks.map((s) => (
                <label key={s.id} className="flex min-h-12 items-center gap-3.5 rounded-xl px-2 hover:bg-hover">
                  <TaskCheckbox checked={s.done} priority={0} label={s.title} onToggle={() => setSubs(task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))} />
                  <span className={cn("text-[17px]", s.done && "text-faint line-through")}>{s.title}</span>
                </label>
              ))}
              <div className="flex min-h-12 items-center gap-3.5 px-2">
                <Plus className="size-5 text-accent" />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draft.trim()) {
                      setSubs([...task.subtasks, { id: uid(), title: draft.trim(), done: false }]);
                      setDraft("");
                    }
                  }}
                  placeholder="Break it into a next step…"
                  className="h-10 flex-1 bg-transparent text-[17px] outline-none placeholder:text-faint"
                />
              </div>
            </div>
          </div>
          {task.completed && (
            <div className="mt-12 flex animate-rise-in flex-col items-center gap-3 text-center">
              <p className="text-lg font-medium">Nicely done. ✨</p>
              <Button variant="primary" onClick={close}>Back to my list</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
