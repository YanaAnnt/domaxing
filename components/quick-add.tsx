"use client";

import * as React from "react";
import { ArrowUp, CalendarDays, Clock, Flag, Hash, Inbox, Repeat, Tag } from "lucide-react";
import type { ParsedTask } from "@/lib/parse";
import { parseQuickAdd } from "@/lib/parse";
import { cn } from "@/lib/utils";
import { useUI } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import { useCategories, useLists } from "@/lib/selectors";
import { PRIORITIES, priorityColor } from "@/lib/constants";
import { relativeLabel } from "@/lib/dates";
import type { Priority } from "@/lib/types";
import { Dialog, DialogContent, Popover, PopoverContent, PopoverTrigger, Menu, MenuContent, MenuItem, MenuTrigger } from "./ui/primitives";
import { DatePickerPanel } from "./date-picker";
import { ListPicker } from "./list-picker";

const TOKEN_ICONS = { date: CalendarDays, time: Clock, priority: Flag, tag: Hash, list: Inbox, repeat: Repeat } as const;

export function ParsedChips({ tokens }: { tokens: ParsedTask["tokens"] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tokens.map((t, i) => {
        const Icon = TOKEN_ICONS[t.kind];
        return (
          <span key={i} className="inline-flex h-6 animate-scale-in items-center gap-1 rounded-md bg-accent-soft px-2 text-[12px] font-medium text-accent">
            <Icon className="size-3" />
            {t.label}
          </span>
        );
      })}
    </div>
  );
}

/** Modal quick add: bottom sheet on iPhone, centered dialog on desktop. */
export function QuickAddDialog() {
  const defaults = useUI((s) => s.quickAdd);
  const open = defaults !== null;
  const lists = useLists();
  const categories = useCategories();
  const [title, setTitle] = React.useState("");
  const [dueDate, setDueDate] = React.useState<string | null>(null);
  const [priority, setPriority] = React.useState<Priority>(0);
  const [target, setTarget] = React.useState<{ listId: string | null; categoryId: string | null }>({ listId: null, categoryId: null });
  const [dateOpen, setDateOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setTitle("");
      setDueDate(defaults?.dueDate ?? null);
      setPriority(0);
      setTarget({ listId: defaults?.listId ?? null, categoryId: defaults?.categoryId ?? null });
    }
  }, [open, defaults]);

  const parsed = React.useMemo(() => parseQuickAdd(title, lists, categories), [title, lists, categories]);
  const effDate = parsed.dueDate !== undefined ? parsed.dueDate : dueDate;
  const effPriority = parsed.priority ?? priority;
  const effList = parsed.listId !== undefined ? parsed.listId : target.listId;
  const effCat = parsed.categoryId !== undefined ? parsed.categoryId : target.categoryId;

  const close = () => useUI.getState().setQuickAdd(null);
  const submit = (keepOpen: boolean) => {
    if (!parsed.title) return;
    const t = useData.getState().addTask({
      title: parsed.title,
      dueDate: effDate ?? null,
      dueTime: parsed.dueTime ?? null,
      priority: effPriority,
      tags: parsed.tags,
      listId: effList ?? null,
      categoryId: effCat ?? null,
      recurrence: parsed.recurrence ?? null,
    });
    setTitle("");
    if (!keepOpen) close();
    useUI.getState().toast({
      message: `Added to ${effDate ? relativeLabel(effDate) : effList ? lists.find((l) => l.id === effList)?.name : effCat ? categories.find((c) => c.id === effCat)?.name : "Inbox"}`,
      actionLabel: "Open",
      onAction: () => useUI.getState().openDetail(t.id),
    });
    if (keepOpen) inputRef.current?.focus();
  };

  const targetLabel = effList
    ? lists.find((l) => l.id === effList)?.name
    : effCat
      ? categories.find((c) => c.id === effCat)?.name
      : "Inbox";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent title="New task" hideTitle className="sm:top-[18vh] sm:max-w-xl" onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}>
        <div className="px-4 pb-3 pt-3 sm:pt-4">
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit(e.shiftKey);
              }
            }}
            placeholder="What do you need to do?"
            aria-label="Task title"
            enterKeyHint="done"
            className="h-10 w-full bg-transparent text-[18px] font-medium outline-none placeholder:font-normal placeholder:text-faint"
          />
          {parsed.tokens.some((t) => ["time", "tag", "repeat"].includes(t.kind)) && (
            <div className="mb-2">
              <ParsedChips tokens={parsed.tokens.filter((t) => ["time", "tag", "repeat"].includes(t.kind))} />
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Chip active={!!effDate} icon={<CalendarDays className="size-3.5" />}>
                  {effDate ? relativeLabel(effDate) : "Date"}
                </Chip>
              </PopoverTrigger>
              <PopoverContent>
                <DatePickerPanel value={effDate ?? null} onChange={setDueDate} onDone={() => setDateOpen(false)} />
              </PopoverContent>
            </Popover>
            <Menu>
              <MenuTrigger asChild>
                <Chip active={effPriority > 0} icon={<Flag className="size-3.5" style={{ color: effPriority ? priorityColor(effPriority) : undefined }} />}>
                  {effPriority ? PRIORITIES[effPriority].label : "Priority"}
                </Chip>
              </MenuTrigger>
              <MenuContent align="start">
                {[...PRIORITIES].reverse().map((p) => (
                  <MenuItem key={p.value} onSelect={() => setPriority(p.value)} icon={<Flag style={{ color: p.color }} />}>
                    {p.label}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
            <ListPicker
              value={{ listId: effList ?? null, categoryId: effCat ?? null }}
              onChange={setTarget}
              trigger={
                <Chip active={!!effCat} icon={<Inbox className="size-3.5" />}>
                  {targetLabel}
                </Chip>
              }
            />
            <span className="ml-auto hidden items-center gap-1 pl-2 text-[11px] text-faint sm:flex">
              <Tag className="size-3" /> #tag · @list · !high
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-line bg-sunken/50 px-4 py-2.5">
          <span className="text-xs text-faint">
            <span className="hidden sm:inline">Enter to add · Shift+Enter to add another</span>
          </span>
          <button
            onClick={() => submit(false)}
            disabled={!parsed.title}
            aria-label="Add task"
            className="grid size-9 place-items-center rounded-full bg-accent text-on-accent shadow-sm transition-all active:scale-95 disabled:opacity-35"
          >
            <ArrowUp className="size-[18px]" strokeWidth={2.4} />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const Chip = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: React.ReactNode }>(
  function Chip({ active, icon, children, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition-colors",
          active ? "border-transparent bg-accent-soft text-accent" : "border-line-strong text-muted hover:bg-hover hover:text-fg",
          className,
        )}
        {...props}
      >
        {icon}
        <span className="max-w-36 truncate">{children}</span>
      </button>
    );
  },
);
