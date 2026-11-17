"use client";

import * as React from "react";
import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BarChart3, CalendarClock, CalendarRange, CheckCircle2, FolderPlus, Hash, Inbox, Keyboard, Layers, Moon,
  Plus, Search, Settings, Sun, SunMoon,
} from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import { useAllTasks, useCategories, useLists, matchesQuery } from "@/lib/selectors";
import type { ViewId } from "@/lib/types";
import { relativeLabel } from "@/lib/dates";
import { CategoryIcon } from "./list-picker";
import { TaskCheckbox } from "./task-item";
import { toggleComplete } from "@/lib/actions";

export function CommandMenu() {
  const open = useUI((s) => s.commandOpen);
  const [q, setQ] = React.useState("");
  const tasks = useAllTasks();
  const categories = useCategories();
  const lists = useLists();
  const ui = useUI.getState();

  React.useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const close = () => ui.setCommandOpen(false);
  const go = (v: ViewId) => {
    ui.navigate(v);
    close();
  };
  const run = (fn: () => void) => {
    close();
    setTimeout(fn, 0);
  };

  const taskResults = q.trim()
    ? tasks
        .filter((t) => matchesQuery(t, q.trim()))
        .sort((a, b) => Number(a.completed) - Number(b.completed))
        .slice(0, 30)
    : tasks.filter((t) => !t.completed).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 5);

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name;
  const theme = useData((s) => s.settings.theme);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => ui.setCommandOpen(o)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] animate-fade-in dark:bg-black/50" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[max(env(safe-area-inset-top),12px)] z-50 w-[calc(100%-1.5rem)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-2xl bg-elevated shadow-pop outline-none animate-scale-in sm:top-[14vh]"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
          <Command shouldFilter={false} loop className="flex max-h-[min(520px,70dvh)] flex-col">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-[18px] shrink-0 text-faint" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                autoFocus
                placeholder="Search tasks, lists, notes… or type a command"
                className="h-14 w-full bg-transparent text-[16px] outline-none placeholder:text-faint"
              />
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint">
              <Command.Empty className="py-10 text-center text-sm text-muted">No results for “{q}”</Command.Empty>

              {taskResults.length > 0 && (
                <Command.Group heading={q ? "Tasks" : "Recent tasks"}>
                  {taskResults.map((t) => (
                    <Item key={t.id} value={`task-${t.id}`} onSelect={() => run(() => ui.openDetail(t.id))}>
                      <span onClick={(e) => e.stopPropagation()}>
                        <TaskCheckbox size="sm" checked={t.completed} priority={t.priority} label={t.title} onToggle={() => toggleComplete(t.id)} />
                      </span>
                      <span className={t.completed ? "truncate text-faint line-through" : "truncate"}>{t.title}</span>
                      <span className="ml-auto shrink-0 pl-3 text-xs text-faint">
                        {[t.dueDate && relativeLabel(t.dueDate), catName(t.categoryId) ?? "Inbox"].filter(Boolean).join(" · ")}
                      </span>
                    </Item>
                  ))}
                </Command.Group>
              )}

              <Group heading="Go to" q={q}>
                <Item value="Today" onSelect={() => go({ type: "today" })} icon={<Sun className="text-amber-500" />}>Today</Item>
                <Item value="Upcoming" onSelect={() => go({ type: "upcoming" })} icon={<CalendarClock className="text-rose-500" />}>Upcoming</Item>
                <Item value="Inbox" onSelect={() => go({ type: "inbox" })} icon={<Inbox className="text-accent" />}>Inbox</Item>
                <Item value="Week planning" onSelect={() => go({ type: "week" })} icon={<CalendarRange className="text-sky-500" />}>Week</Item>
                <Item value="All tasks" onSelect={() => go({ type: "all" })} icon={<Layers className="text-teal-500" />}>All Tasks</Item>
                <Item value="Completed logbook" onSelect={() => go({ type: "completed" })} icon={<CheckCircle2 className="text-success" />}>Completed</Item>
                <Item value="Progress stats" onSelect={() => go({ type: "progress" })} icon={<BarChart3 className="text-violet-500" />}>Progress</Item>
                {categories.map((c) => (
                  <Item key={c.id} value={c.name} onSelect={() => go({ type: "category", id: c.id })} icon={<CategoryIcon icon={c.icon} color={c.color} />}>
                    {c.name}
                  </Item>
                ))}
                {lists.map((l) => (
                  <Item key={l.id} value={`${l.name} ${catName(l.categoryId)}`} onSelect={() => go({ type: "list", id: l.id })} icon={<Hash className="text-faint" />}>
                    {l.name}
                    <span className="text-faint">· {catName(l.categoryId)}</span>
                  </Item>
                ))}
              </Group>

              <Group heading="Actions" q={q}>
                <Item value="New task add create" onSelect={() => run(() => ui.setQuickAdd({}))} icon={<Plus />} hint="N">New task</Item>
                <Item value="New category create area" onSelect={() => run(() => ui.setCategoryDialog({ mode: "create" }))} icon={<FolderPlus />}>New category</Item>
                <Item
                  value="Toggle theme dark light mode appearance"
                  onSelect={() => {
                    const dark = document.documentElement.classList.contains("dark");
                    useData.getState().updateSettings({ theme: dark ? "light" : "dark" });
                    close();
                  }}
                  icon={theme === "dark" ? <Sun /> : theme === "light" ? <Moon /> : <SunMoon />}
                >
                  Toggle dark mode
                </Item>
                <Item value="Settings preferences account sync" onSelect={() => run(() => ui.setSettingsOpen(true))} icon={<Settings />}>Settings</Item>
                <Item value="Keyboard shortcuts help" onSelect={() => run(() => ui.setShortcutsOpen(true))} icon={<Keyboard />} hint="?">Keyboard shortcuts</Item>
              </Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Group that filters its children by the query (cmdk filtering is disabled so tasks can use custom matching). */
function Group({ heading, q, children }: { heading: string; q: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter((c) => {
    if (!q.trim()) return true;
    const v = (React.isValidElement(c) ? (c.props as { value?: string }).value : "") ?? "";
    const hay = v.toLowerCase();
    return q.trim().toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  });
  if (!items.length) return null;
  return <Command.Group heading={heading}>{q.trim() ? items : items.slice(0, heading === "Go to" ? 7 : 10)}</Command.Group>;
}

function Item({
  children, icon, onSelect, value, hint,
}: { children: React.ReactNode; icon?: React.ReactNode; onSelect: () => void; value: string; hint?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 cursor-default select-none items-center gap-3 rounded-lg px-2.5 text-[14px] data-[selected=true]:bg-hover [&>svg]:size-4 [&_svg]:shrink-0"
    >
      {icon && <span className="grid size-4 place-items-center text-muted [&_svg]:size-4">{icon}</span>}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">{children}</span>
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </Command.Item>
  );
}
