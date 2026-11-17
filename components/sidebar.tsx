"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BarChart3, CalendarClock, CalendarRange, CheckCircle2, ChevronRight, FolderPlus, Hash, Inbox, Layers,
  ListPlus, MoreHorizontal, PanelLeftClose, Pencil, Plus, Search, Settings, Sparkles, Sun, Trash2,
} from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import { useAllTasks, useCategories, useListsByCategory } from "@/lib/selectors";
import type { Category, List, ViewId } from "@/lib/types";
import { cn, modKey } from "@/lib/utils";
import { deleteCategoryWithUndo, deleteListWithUndo } from "@/lib/actions";
import { Button, Kbd, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "./ui/primitives";
import { CategoryIcon } from "./list-picker";
import { useCounts } from "./views/smart";
import { SyncBadge } from "./sync-badge";
import type { DragData, DropTarget } from "./dnd";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { useAssistant } from "@/lib/assistant";

const same = (a: ViewId, b: ViewId) => a.type === b.type && ("id" in a ? a.id : "") === ("id" in b ? b.id : "");

function NavItem({
  view, icon, label, count, countTone, drop, indent, dragHandle, menu, onToggle, expanded,
}: {
  view: ViewId; icon: React.ReactNode; label: string; count?: number; countTone?: "danger" | "accent";
  drop?: DropTarget; indent?: boolean; dragHandle?: Record<string, unknown>; menu?: React.ReactNode;
  onToggle?: () => void; expanded?: boolean;
}) {
  const active = useUI((s) => same(s.view, view));
  const dropData: DragData | undefined = drop ? { type: "target", target: drop, accepts: ["task"] } : undefined;
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-nav-${view.type}-${"id" in view ? view.id : ""}`,
    data: dropData,
    disabled: !drop,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/nav relative flex h-[30px] items-center rounded-lg text-[13.5px] transition-colors",
        active ? "bg-white/70 font-medium text-fg shadow-card dark:bg-white/[0.08]" : "text-fg/85 hover:bg-hover",
        isOver && "bg-accent-soft ring-2 ring-accent/40",
      )}
    >
      {onToggle && (
        <button
          onClick={onToggle}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={expanded}
          className="absolute -left-0.5 z-10 grid size-5 place-items-center rounded text-faint opacity-0 transition-opacity hover:text-fg group-hover/nav:opacity-100 focus-visible:opacity-100"
        >
          <ChevronRight className={cn("size-3 transition-transform", expanded && "rotate-90")} />
        </button>
      )}
      <button
        {...dragHandle}
        onClick={() => {
          useUI.getState().navigate(view);
        }}
        className={cn("flex h-full min-w-0 flex-1 items-center gap-2.5 pl-2.5 pr-1 text-left outline-none", indent && "pl-[34px]")}
      >
        <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
        <span className="truncate">{label}</span>
      </button>
      {!!count && (
        <span className={cn("min-w-6 pr-2 text-right text-xs tabular-nums text-faint", countTone === "danger" && "text-danger", countTone === "accent" && "font-semibold text-accent", menu && "group-hover/nav:invisible")}>
          {count}
        </span>
      )}
      {menu && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/nav:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
          {menu}
        </div>
      )}
    </div>
  );
}

function ListNav({ list, ids, count }: { list: List; ids: string[]; count: number }) {
  const data: DragData = { type: "list", id: list.id, ids, categoryId: list.categoryId };
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: `list-${list.id}`, data });
  const ui = useUI.getState();
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && "z-10 opacity-60")}>
      <NavItem
        view={{ type: "list", id: list.id }}
        icon={<Hash className="size-3.5 text-faint" />}
        label={list.name}
        count={count}
        indent
        drop={{ kind: "list", id: list.id }}
        dragHandle={{ ...attributes, ...listeners, tabIndex: 0 }}
        menu={
          <Menu>
            <MenuTrigger asChild>
              <button aria-label={`${list.name} options`} className="mr-1 grid size-6 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg">
                <MoreHorizontal className="size-3.5" />
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Pencil />} onSelect={() => ui.setListDialog({ mode: "edit", id: list.id })}>Rename or move</MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<Trash2 />} onSelect={() => deleteListWithUndo(list.id)}>Delete list</MenuItem>
            </MenuContent>
          </Menu>
        }
      />
    </div>
  );
}

function CategoryNav({ category, ids, lists, counts }: { category: Category; ids: string[]; lists: List[]; counts: Record<string, number> }) {
  const data: DragData = { type: "category", id: category.id, ids };
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: `cat-${category.id}`, data });
  const ui = useUI.getState();
  const listIds = lists.map((l) => l.id);
  const toggle = () => useData.getState().updateCategory(category.id, { collapsed: !category.collapsed });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("mt-0.5", isDragging && "relative z-10 opacity-60")}>
      <NavItem
        view={{ type: "category", id: category.id }}
        icon={<CategoryIcon icon={category.icon} color={category.color} />}
        label={category.name}
        count={category.collapsed ? counts[category.id] : counts[`loose:${category.id}`]}
        drop={{ kind: "category", id: category.id }}
        dragHandle={{ ...attributes, ...listeners, tabIndex: 0 }}
        onToggle={toggle}
        expanded={!category.collapsed}
        menu={
          <Menu>
            <MenuTrigger asChild>
              <button aria-label={`${category.name} options`} className="mr-1 grid size-6 place-items-center rounded-md text-faint hover:bg-hover hover:text-fg">
                <MoreHorizontal className="size-3.5" />
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<ListPlus />} onSelect={() => ui.setListDialog({ mode: "create", categoryId: category.id })}>New list</MenuItem>
              <MenuItem icon={<Pencil />} onSelect={() => ui.setCategoryDialog({ mode: "edit", id: category.id })}>Edit category</MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<Trash2 />} onSelect={() => deleteCategoryWithUndo(category.id)}>Delete category</MenuItem>
            </MenuContent>
          </Menu>
        }
      />
      {!category.collapsed && lists.length > 0 && (
        <SortableContext id={`lists-${category.id}`} items={listIds.map((i) => `list-${i}`)} strategy={verticalListSortingStrategy}>
          <div className="animate-fade-in">
            {lists.map((l) => (
              <ListNav key={l.id} list={l} ids={listIds} count={counts[l.id] ?? 0} />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

export function Sidebar() {
  const categories = useCategories();
  const byCat = useListsByCategory();
  const counts = useCounts();
  const all = useAllTasks();
  const ui = useUI.getState();
  const pendingSuggestions = useAssistant((s) => s.suggestions.length);

  const listCounts = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of all) {
      if (t.completed) continue;
      if (t.listId) m[t.listId] = (m[t.listId] ?? 0) + 1;
      if (t.categoryId) {
        m[t.categoryId] = (m[t.categoryId] ?? 0) + 1;
        if (!t.listId) m[`loose:${t.categoryId}`] = (m[`loose:${t.categoryId}`] ?? 0) + 1;
      }
    }
    return m;
  }, [all]);

  const catIds = categories.map((c) => c.id);

  return (
    <nav aria-label="Main" className="flex h-full w-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-4 pt-1">
        <Logo />
        <div className="ml-auto flex items-center">
          <ThemeToggle />
          <Button variant="ghost" size="icon-sm" aria-label={`Search (${modKey()}K)`} title={`Search  ${modKey()}K`} onClick={() => ui.setCommandOpen(true)}>
            <Search className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Hide sidebar" title="Hide sidebar" onClick={() => ui.setSidebarOpen(false)}>
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          onClick={() => ui.setQuickAdd({})}
          className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[13.5px] font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          <Plus className="size-4" strokeWidth={2.4} />
          New task
          <span className="ml-auto flex gap-0.5">
            <Kbd>N</Kbd>
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="flex flex-col gap-px">
          <NavItem view={{ type: "today" }} icon={<Sun className="size-4 text-amber-500" />} label="Today" count={counts.today} countTone={counts.overdue ? "danger" : undefined} drop={{ kind: "today" }} />
          <NavItem view={{ type: "assistant" }} icon={<Sparkles className="size-4 text-accent" />} label="Assistant" count={pendingSuggestions} countTone="accent" />
          <NavItem view={{ type: "upcoming" }} icon={<CalendarClock className="size-4 text-rose-500" />} label="Upcoming" count={counts.upcoming} />
          <NavItem view={{ type: "inbox" }} icon={<Inbox className="size-4 text-accent" />} label="Inbox" count={counts.inbox} drop={{ kind: "inbox" }} />
          <NavItem view={{ type: "week" }} icon={<CalendarRange className="size-4 text-sky-500" />} label="Week" />
          <NavItem view={{ type: "all" }} icon={<Layers className="size-4 text-teal-500" />} label="All Tasks" />
          <NavItem view={{ type: "completed" }} icon={<CheckCircle2 className="size-4 text-success" />} label="Completed" />
          <NavItem view={{ type: "progress" }} icon={<BarChart3 className="size-4 text-violet-500" />} label="Progress" />
        </div>

        <div className="group/cats mb-1 mt-6 flex h-6 items-center px-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Categories</span>
          <button
            aria-label="New category"
            title="New category"
            onClick={() => ui.setCategoryDialog({ mode: "create" })}
            className="ml-auto grid size-5 place-items-center rounded text-faint opacity-0 transition-opacity hover:bg-hover hover:text-fg group-hover/cats:opacity-100 focus-visible:opacity-100"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <SortableContext id="categories" items={catIds.map((i) => `cat-${i}`)} strategy={verticalListSortingStrategy}>
          {categories.map((c) => (
            <CategoryNav key={c.id} category={c} ids={catIds} lists={byCat[c.id] ?? []} counts={listCounts} />
          ))}
        </SortableContext>
        {categories.length === 0 && (
          <button onClick={() => ui.setCategoryDialog({ mode: "create" })} className="mt-1 flex h-[30px] w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-muted hover:bg-hover">
            <FolderPlus className="size-4" /> Create your first category
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 px-3 py-2.5">
        <Button variant="ghost" size="sm" className="text-[13px]" onClick={() => ui.setSettingsOpen(true)}>
          <Settings className="size-4" /> Settings
        </Button>
        <div className="ml-auto">
          <SyncBadge />
        </div>
      </div>
    </nav>
  );
}
