"use client";

import * as React from "react";
import {
  BarChart3, CalendarClock, CalendarRange, CheckCircle2, ChevronRight, FolderPlus, Hash,
  Inbox, Layers, ListPlus, MoreHorizontal, Pencil, Plus, Rows3, Search, Settings, Sparkles, Sun, Trash2,
} from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import { useAllTasks, useCategories, useListsByCategory, sortTasks, isVisibleActive } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import { deleteCategoryWithUndo, deleteListWithUndo } from "@/lib/actions";
import { Button, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/primitives";
import { EmptyState, InlineAdd, SortMenu, TaskGroup, ViewBody, ViewHeader, useSortMode } from "./shared";
import { CategoryIcon } from "../list-picker";
import { useCounts } from "./smart";
import { SyncBadge } from "../sync-badge";
import { ThemeToggle } from "../theme-toggle";

// ---------------- Category ----------------
export function CategoryView({ id }: { id: string }) {
  const category = useData((s) => s.categories[id]);
  const lists = useListsByCategory()[id] ?? [];
  const all = useAllTasks();
  const completing = useUI((s) => s.completing);
  const showCompleted = useData((s) => s.settings.showCompletedInLists);
  const sort = useSortMode(`category:${id}`);
  if (!category || category.deleted) return <MissingView />;

  const visible = (t: (typeof all)[number]) => showCompleted || isVisibleActive(t, completing);
  const loose = sortTasks(all.filter((t) => t.categoryId === id && !t.listId && visible(t)), sort);
  const total = all.filter((t) => t.categoryId === id && !t.completed).length;

  return (
    <ViewBody>
      <ViewHeader
        icon={<CategoryIcon icon={category.icon} color={category.color} boxed className="size-10 md:size-9" />}
        title={category.name}
        subtitle={`${total} open ${total === 1 ? "task" : "tasks"} · ${lists.length} ${lists.length === 1 ? "list" : "lists"}`}
        right={
          <>
            <SortMenu viewKey={`category:${id}`} />
            <CategoryMenu id={id} />
          </>
        }
      />
      <TaskGroup tasks={loose} containerId={`cat-${id}`} sortable={sort === "manual"} showList={false} footer={<InlineAdd defaults={{ categoryId: id }} />} />
      {lists.map((l) => {
        const ts = sortTasks(all.filter((t) => t.listId === l.id && visible(t)), sort);
        return (
          <TaskGroup
            key={l.id}
            title={
              <button className="hover:underline" onClick={() => useUI.getState().navigate({ type: "list", id: l.id })}>
                {l.name}
              </button>
            }
            count={ts.filter((t) => !t.completed).length}
            tasks={ts}
            containerId={`list-${l.id}`}
            sortable={sort === "manual"}
            showList={false}
            collapsible
            footer={<InlineAdd compact defaults={{ listId: l.id, categoryId: id }} placeholder="Add task" />}
          />
        );
      })}
      <button
        onClick={() => useUI.getState().setListDialog({ mode: "create", categoryId: id })}
        className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted hover:bg-hover hover:text-fg"
      >
        <ListPlus className="size-4" /> New list
      </button>
      {lists.length === 0 && loose.length === 0 && (
        <EmptyState icon={<CategoryIcon icon={category.icon} color={category.color} className="size-7" />} title={`Nothing in ${category.name} yet`} body="Add tasks directly, or create lists to group them, like “Projects” or “Errands”." />
      )}
    </ViewBody>
  );
}

function CategoryMenu({ id }: { id: string }) {
  const ui = useUI.getState();
  const showCompleted = useData((s) => s.settings.showCompletedInLists);
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Category options">
          <MoreHorizontal className="size-4" />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<Pencil />} onSelect={() => ui.setCategoryDialog({ mode: "edit", id })}>Edit category</MenuItem>
        <MenuItem icon={<ListPlus />} onSelect={() => ui.setListDialog({ mode: "create", categoryId: id })}>New list</MenuItem>
        <MenuItem icon={<CheckCircle2 />} onSelect={() => useData.getState().updateSettings({ showCompletedInLists: !showCompleted })}>
          {showCompleted ? "Hide completed" : "Show completed"}
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 />} onSelect={() => deleteCategoryWithUndo(id)}>Delete category</MenuItem>
      </MenuContent>
    </Menu>
  );
}

// ---------------- List ----------------
export function ListView({ id }: { id: string }) {
  const list = useData((s) => s.lists[id]);
  const category = useData((s) => (list ? s.categories[list.categoryId] : undefined));
  const all = useAllTasks();
  const completing = useUI((s) => s.completing);
  const showCompleted = useData((s) => s.settings.showCompletedInLists);
  const sort = useSortMode(`list:${id}`);
  const [addingSection, setAddingSection] = React.useState(false);
  if (!list || list.deleted || !category) return <MissingView />;
  const tasks = sortTasks(all.filter((t) => t.listId === id && (showCompleted || isVisibleActive(t, completing))), sort);
  const sections = list.sections ?? [];
  const sectionIds = new Set(sections.map((s) => s.id));
  const loose = tasks.filter((t) => !t.sectionId || !sectionIds.has(t.sectionId));
  const ui = useUI.getState();

  return (
    <ViewBody>
      <button
        onClick={() => ui.navigate({ type: "category", id: category.id })}
        className="mb-1 flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"
      >
        <CategoryIcon icon={category.icon} color={category.color} className="size-3.5" />
        {category.name}
      </button>
      <ViewHeader
        title={list.name}
        subtitle={`${tasks.filter((t) => !t.completed).length} open`}
        right={
          <>
            <SortMenu viewKey={`list:${id}`} />
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="List options">
                  <MoreHorizontal className="size-4" />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Pencil />} onSelect={() => ui.setListDialog({ mode: "edit", id })}>Rename or move</MenuItem>
                <MenuItem icon={<Rows3 />} onSelect={() => setAddingSection(true)}>Add section</MenuItem>
                <MenuItem icon={<CheckCircle2 />} onSelect={() => useData.getState().updateSettings({ showCompletedInLists: !showCompleted })}>
                  {showCompleted ? "Hide completed" : "Show completed"}
                </MenuItem>
                <MenuSeparator />
                <MenuItem danger icon={<Trash2 />} onSelect={() => deleteListWithUndo(id)}>Delete list</MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />
      <TaskGroup tasks={loose} containerId={`list-${id}`} sortable={sort === "manual"} showList={false} footer={<InlineAdd defaults={{ listId: id, categoryId: category.id }} />} />
      {sections.map((sec) => (
        <TaskGroup
          key={sec.id}
          title={<SectionTitle listId={id} section={sec} />}
          count={tasks.filter((t) => t.sectionId === sec.id && !t.completed).length}
          tasks={tasks.filter((t) => t.sectionId === sec.id)}
          containerId={`sec-${sec.id}`}
          sortable={sort === "manual"}
          showList={false}
          collapsible
          footer={<InlineAdd compact defaults={{ listId: id, categoryId: category.id, sectionId: sec.id }} placeholder="Add task" />}
        />
      ))}
      {addingSection ? (
        <SectionNameInput
          onDone={(name) => {
            setAddingSection(false);
            if (name) addSection(id, name);
          }}
        />
      ) : (
        <button onClick={() => setAddingSection(true)} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted hover:bg-hover hover:text-fg">
          <Rows3 className="size-4" /> New section
        </button>
      )}
      {tasks.length === 0 && !sections.length && <EmptyState icon={<Hash className="size-7" />} title="This list is empty" body="Add your first task above. Press Enter to save, and keep typing." />}
    </ViewBody>
  );
}

function MissingView() {
  return (
    <ViewBody>
      <EmptyState
        icon={<Layers className="size-7" />}
        title="This doesn’t exist anymore"
        body="It may have been deleted on another device."
        action={<Button variant="primary" onClick={() => useUI.getState().navigate({ type: "today" })}>Go to Today</Button>}
      />
    </ViewBody>
  );
}

// ---------------- Sections ----------------
function addSection(listId: string, name: string) {
  const l = useData.getState().lists[listId];
  if (!l) return;
  useData.getState().updateList(listId, { sections: [...(l.sections ?? []), { id: crypto.randomUUID(), name: name.trim() }] });
}

function SectionNameInput({ initial = "", onDone }: { initial?: string; onDone: (name: string | null) => void }) {
  const [v, setV] = React.useState(initial);
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(v.trim() || null);
        if (e.key === "Escape") {
          e.stopPropagation();
          onDone(null);
        }
      }}
      placeholder="Section name"
      className="mb-4 h-9 w-full rounded-xl bg-sunken px-3 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-accent/25"
    />
  );
}

function SectionTitle({ listId, section }: { listId: string; section: { id: string; name: string } }) {
  const [editing, setEditing] = React.useState(false);
  const rename = (name: string | null) => {
    setEditing(false);
    if (!name || name === section.name) return;
    const l = useData.getState().lists[listId];
    useData.getState().updateList(listId, { sections: (l.sections ?? []).map((s) => (s.id === section.id ? { ...s, name } : s)) });
  };
  const remove = () => {
    const d = useData.getState();
    const l = d.lists[listId];
    const moved = Object.values(d.tasks).filter((t) => t.sectionId === section.id);
    d.updateList(listId, { sections: (l.sections ?? []).filter((s) => s.id !== section.id) });
    moved.forEach((t) => d.updateTask(t.id, { sectionId: null }));
    useUI.getState().toast({
      message: `Removed section “${section.name}”`,
      actionLabel: "Undo",
      onAction: () => {
        const cur = useData.getState().lists[listId];
        useData.getState().updateList(listId, { sections: [...(cur.sections ?? []), section] });
        moved.forEach((t) => useData.getState().updateTask(t.id, { sectionId: section.id }));
      },
    });
  };
  if (editing)
    return (
      <span className="block w-48" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          defaultValue={section.name}
          onBlur={(e) => rename(e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") rename((e.target as HTMLInputElement).value.trim());
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-6 w-full rounded bg-sunken px-1 text-[13px] font-semibold outline-none"
        />
      </span>
    );
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="rounded hover:underline">{section.name}</button>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem icon={<Pencil />} onSelect={() => setTimeout(() => setEditing(true), 0)}>Rename section</MenuItem>
        <MenuItem danger icon={<Trash2 />} onSelect={remove}>Remove section</MenuItem>
      </MenuContent>
    </Menu>
  );
}

// ---------------- Browse (iPhone) ----------------
export function BrowseView() {
  const categories = useCategories();
  const byCat = useListsByCategory();
  const counts = useCounts();
  const all = useAllTasks();
  const ui = useUI.getState();
  const openCount = (fn: (t: (typeof all)[number]) => boolean) => all.filter((t) => !t.completed && fn(t)).length;

  const smart = [
    { label: "Today", icon: <Sun className="size-[18px] text-amber-500" />, view: { type: "today" as const }, count: counts.today },
    { label: "Upcoming", icon: <CalendarClock className="size-[18px] text-rose-500" />, view: { type: "upcoming" as const }, count: counts.upcoming },
    { label: "Inbox", icon: <Inbox className="size-[18px] text-accent" />, view: { type: "inbox" as const }, count: counts.inbox },
    { label: "Assistant", icon: <Sparkles className="size-[18px] text-accent" />, view: { type: "assistant" as const } },
    { label: "Week", icon: <CalendarRange className="size-[18px] text-sky-500" />, view: { type: "week" as const } },
    { label: "All Tasks", icon: <Layers className="size-[18px] text-teal-500" />, view: { type: "all" as const } },
    { label: "Completed", icon: <CheckCircle2 className="size-[18px] text-success" />, view: { type: "completed" as const } },
    { label: "Progress", icon: <BarChart3 className="size-[18px] text-violet-500" />, view: { type: "progress" as const } },
  ];

  return (
    <ViewBody>
      <ViewHeader title="Browse" right={<><SyncBadge compact /><ThemeToggle size="icon" /><Button variant="ghost" size="icon" aria-label="Search" onClick={() => ui.setCommandOpen(true)}><Search className="size-5" /></Button><Button variant="ghost" size="icon" aria-label="Settings" onClick={() => ui.setSettingsOpen(true)}><Settings className="size-5" /></Button></>} />
      <div className="glass overflow-hidden rounded-[22px]">
        {smart.map((s, i) => (
          <button
            key={s.label}
            onClick={() => ui.navigate(s.view)}
            className={cn("flex h-12 w-full items-center gap-3 px-4 text-left text-[16px] active:bg-hover", i > 0 && "border-t border-line")}
          >
            {s.icon}
            <span className="flex-1">{s.label}</span>
            {!!s.count && <span className="text-[15px] tabular-nums text-faint">{s.count}</span>}
            <ChevronRight className="size-4 text-faint" />
          </button>
        ))}
      </div>

      <div className="mb-2 mt-8 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Categories</h2>
        <Button variant="ghost" size="sm" onClick={() => ui.setCategoryDialog({ mode: "create" })}>
          <FolderPlus className="size-4" /> New
        </Button>
      </div>
      {categories.length === 0 && (
        <EmptyState icon={<FolderPlus className="size-7" />} title="No categories yet" body="Create areas like Work, University or Personal to organize your life." action={<Button variant="primary" onClick={() => ui.setCategoryDialog({ mode: "create" })}><Plus className="size-4" />New category</Button>} />
      )}
      <div className="flex flex-col gap-3">
        {categories.map((c) => (
          <div key={c.id} className="glass overflow-hidden rounded-[22px]">
            <button onClick={() => ui.navigate({ type: "category", id: c.id })} className="flex h-14 w-full items-center gap-3 px-4 text-left active:bg-hover">
              <CategoryIcon icon={c.icon} color={c.color} boxed className="size-8" />
              <span className="flex-1 text-[16px] font-semibold">{c.name}</span>
              <span className="text-[15px] tabular-nums text-faint">{openCount((t) => t.categoryId === c.id) || ""}</span>
              <ChevronRight className="size-4 text-faint" />
            </button>
            {(byCat[c.id] ?? []).map((l) => (
              <button key={l.id} onClick={() => ui.navigate({ type: "list", id: l.id })} className="flex h-11 w-full items-center gap-3 border-t border-line pl-[60px] pr-4 text-left text-[15px] active:bg-hover">
                <span className="flex-1 truncate">{l.name}</span>
                <span className="text-[14px] tabular-nums text-faint">{openCount((t) => t.listId === l.id) || ""}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </ViewBody>
  );
}

