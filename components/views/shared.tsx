"use client";

import * as React from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight, Menu as MenuIcon, Plus } from "lucide-react";
import type { SortMode, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useUI, type QuickAddDefaults } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import { parseQuickAdd } from "@/lib/parse";
import { useCategories, useLists } from "@/lib/selectors";
import { Button, Menu, MenuContent, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/primitives";
import { TaskList } from "../task-item";
import { ParsedChips } from "../quick-add";

// ---------------- Header ----------------
export function ViewHeader({
  title,
  subtitle,
  icon,
  right,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  const sidebarOpen = useUI((s) => s.sidebarOpen);
  const viewType = useUI((s) => s.view.type);
  const showBack = ["category", "list", "all", "completed", "week", "progress"].includes(viewType);
  return (
    <>
    {showBack && (
      <button
        onClick={() => (history.length > 1 ? history.back() : useUI.getState().navigate({ type: "browse" }))}
        className="-ml-1.5 mb-1 flex h-9 items-center gap-0.5 text-[16px] text-accent md:hidden"
      >
        <ChevronLeft className="size-6" /> Back
      </button>
    )}
    <header className={cn("mb-5 flex items-end justify-between gap-3 md:mb-7", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 hidden md:inline-flex"
            aria-label="Show sidebar"
            onClick={() => useUI.getState().setSidebarOpen(true)}
          >
            <MenuIcon className="size-4" />
          </Button>
        )}
        {icon}
        <div className="min-w-0">
          <h1 className="truncate text-[30px] font-bold leading-tight tracking-[-0.025em] md:text-[26px] md:font-semibold">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </header>
    </>
  );
}

// ---------------- Sort ----------------
const SORT_LABELS: Record<SortMode, string> = {
  manual: "Manual",
  priority: "Priority",
  due: "Due date",
  title: "Title",
  created: "Recently added",
};

export function useSortMode(key: string, fallback: SortMode = "manual") {
  return useUI((s) => s.sortModes[key] ?? fallback);
}

export function SortMenu({ viewKey, fallback = "manual" }: { viewKey: string; fallback?: SortMode }) {
  const mode = useSortMode(viewKey, fallback);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Sort tasks" className={cn(mode !== "manual" && "text-accent")}>
          <ArrowUpDown className="size-3.5" />
          <span className="hidden sm:inline">{mode === "manual" ? "Sort" : SORT_LABELS[mode]}</span>
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Sort by</MenuLabel>
        <MenuRadioGroup value={mode} onValueChange={(v) => useUI.getState().setSort(viewKey, v as SortMode)}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
            <MenuRadioItem key={m} value={m}>
              {SORT_LABELS[m]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

// ---------------- Inline add ----------------
export function InlineAdd({
  defaults,
  placeholder = "New task",
  compact,
  autoFocusSignal,
}: {
  defaults: QuickAddDefaults;
  placeholder?: string;
  compact?: boolean;
  autoFocusSignal?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const lists = useLists();
  const categories = useCategories();
  const parsed = React.useMemo(() => parseQuickAdd(value, lists, categories), [value, lists, categories]);

  React.useEffect(() => {
    if (autoFocusSignal) {
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [autoFocusSignal]);

  const submit = () => {
    if (!parsed.title) return;
    const listId = parsed.listId !== undefined ? parsed.listId : defaults.listId ?? null;
    const categoryId = parsed.categoryId !== undefined ? parsed.categoryId : defaults.categoryId ?? null;
    useData.getState().addTask({
      title: parsed.title,
      dueDate: parsed.dueDate !== undefined ? parsed.dueDate : defaults.dueDate ?? null,
      dueTime: parsed.dueTime ?? null,
      priority: parsed.priority ?? 0,
      tags: parsed.tags,
      listId,
      categoryId,
      recurrence: parsed.recurrence ?? null,
      sectionId: parsed.listId !== undefined ? null : defaults.sectionId ?? null,
    });
    setValue("");
  };

  if (!open)
    return (
      <button
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-faint transition-colors hover:text-accent",
          compact ? "h-9" : "h-10",
        )}
      >
        <span className="grid size-[20px] place-items-center rounded-full text-accent">
          <Plus className="size-4" strokeWidth={2.2} />
        </span>
        <span>{placeholder}</span>
      </button>
    );

  return (
    <div className="glass animate-rise-in rounded-2xl px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="size-[20px] shrink-0 rounded-full border-[1.6px] border-dashed border-line-strong" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setValue("");
              setOpen(false);
            }
          }}
          onBlur={() => {
            if (!value.trim()) setOpen(false);
          }}
          placeholder="Task name, e.g. “Call Anna tomorrow 3pm !high #calls”"
          className="h-7 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          aria-label="New task title"
          enterKeyHint="done"
        />
        <Button variant="primary" size="sm" disabled={!parsed.title} onMouseDown={(e) => e.preventDefault()} onClick={submit}>
          Add
        </Button>
      </div>
      {parsed.tokens.length > 0 && (
        <div className="mt-1.5 pl-8">
          <ParsedChips tokens={parsed.tokens} />
        </div>
      )}
    </div>
  );
}

// ---------------- Group ----------------
export function TaskGroup({
  title,
  count,
  tasks,
  containerId,
  sortable,
  showList,
  showDate,
  tone,
  action,
  collapsible,
  defaultCollapsed,
  footer,
}: {
  title?: React.ReactNode;
  count?: number;
  tasks: Task[];
  containerId: string;
  sortable?: boolean;
  showList?: boolean;
  showDate?: boolean;
  tone?: "danger" | "accent";
  action?: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  footer?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(!!defaultCollapsed);
  return (
    <section className="mb-6 animate-rise-in">
      {title && (
        <div className="group/h mb-1 flex h-8 items-center gap-2 border-b border-line px-3 pb-1">
          {collapsible && (
            <button
              className="-ml-1 grid size-5 place-items-center rounded"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand section" : "Collapse section"}
            >
              <ChevronRight className={cn("size-3.5 text-faint transition-transform", !collapsed && "rotate-90")} />
            </button>
          )}
          <GroupTitle tone={tone}>{title}</GroupTitle>
          {count !== undefined && count > 0 && <span className="text-xs text-faint">{count}</span>}
          <div className="ml-auto">{action}</div>
        </div>
      )}
      {!collapsed && (
        <>
          <TaskList tasks={tasks} containerId={containerId} sortable={sortable} showList={showList} showDate={showDate} />
          {footer}
        </>
      )}
    </section>
  );
}

function GroupTitle({ children, tone }: { children: React.ReactNode; tone?: "danger" | "accent" }) {
  return (
    <h2 className={cn("text-[13px] font-semibold tracking-tight text-fg", tone === "danger" && "text-danger", tone === "accent" && "text-accent")}>
      {children}
    </h2>
  );
}

// ---------------- Empty state ----------------
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex animate-rise-in flex-col items-center px-6 py-16 text-center md:py-24">
      <div className="relative mb-5 grid size-16 place-items-center rounded-[20px] bg-accent-soft text-accent">
        <div className="absolute inset-0 rounded-[20px] bg-gradient-to-b from-white/40 to-transparent dark:from-white/5" />
        {icon}
      </div>
      <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
      {body && <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Mobile + desktop container for a view's scrollable content. */
export function ViewBody({ children, wide, className }: { children: React.ReactNode; wide?: boolean; className?: string }) {
  return <div className={cn("mx-auto w-full px-4 pb-40 pt-4 md:px-10 md:pb-24 md:pt-12", wide ? "max-w-6xl" : "max-w-[760px]", className)}>{children}</div>;
}
