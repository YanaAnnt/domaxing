"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Category, List, Settings, SyncTable, Task } from "./types";
import { nowIso, uid } from "./utils";
import { nextOccurrence } from "./dates";
import { buildSeed } from "./seed";

type Rec = Category | List | Task;
type Table<T> = Record<string, T>;

export interface DataState {
  categories: Table<Category>;
  lists: Table<List>;
  tasks: Table<Task>;
  /** `${table}:${id}` -> updatedAt of the local change waiting to be pushed */
  dirty: Record<string, string>;
  settings: Settings;
  seeded: boolean;
  /** true while data is still only the untouched sample data */
  pristine: boolean;
  /** Supabase user id the local data belongs to (null = local / demo) */
  ownerId: string | null;
  lastPulledAt: string | null;

  // tasks
  addTask: (partial: Partial<Task> & { title: string }) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleTask: (id: string) => { completed: boolean; spawnedId: string | null };
  deleteTask: (id: string) => void;
  restoreTask: (id: string) => void;
  setTaskOrder: (id: string, order: number) => void;

  // categories & lists
  addCategory: (partial: Partial<Category> & { name: string }) => Category;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => string[];
  addList: (partial: Partial<List> & { name: string; categoryId: string }) => List;
  updateList: (id: string, patch: Partial<List>) => void;
  deleteList: (id: string) => string[];
  undelete: (keys: string[]) => void;

  updateSettings: (patch: Partial<Settings>) => void;

  // sync plumbing
  applyRemote: (table: SyncTable, rows: Rec[]) => void;
  markClean: (entries: { key: string; updatedAt: string }[]) => void;
  markAllDirty: () => void;
  setOwner: (ownerId: string | null) => void;
  setLastPulledAt: (iso: string | null) => void;
  resetLocal: (withSeed: boolean) => void;
  importData: (data: { categories: Category[]; lists: List[]; tasks: Task[] }) => void;
}

const defaultSettings: Settings = {
  theme: "system",
  accent: "blue",
  weekStartsOn: 1,
  showCompletedInLists: false,
};

const key = (table: SyncTable, id: string) => `${table}:${id}`;

function minOrder(tasks: Table<Task>) {
  let min = Infinity;
  for (const t of Object.values(tasks)) if (t.order < min) min = t.order;
  return min === Infinity ? 1000 : min;
}
function maxOrder(recs: { order: number }[]) {
  let max = 0;
  for (const r of recs) if (r.order > max) max = r.order;
  return max;
}

export const useData = create<DataState>()(
  persist(
    (set, get) => {
      /** Write records into a table, stamp updatedAt and queue them for sync. */
      const write = <T extends Rec>(table: SyncTable, recs: T[]) => {
        const ts = nowIso();
        set((s) => {
          const tbl = { ...(s[table] as Table<T>) };
          const dirty = { ...s.dirty };
          for (const r of recs) {
            const next = { ...r, updatedAt: ts } as T;
            tbl[r.id] = next;
            dirty[key(table, r.id)] = ts;
          }
          return { [table]: tbl, dirty, pristine: false } as Partial<DataState>;
        });
      };

      return {
        categories: {},
        lists: {},
        tasks: {},
        dirty: {},
        settings: defaultSettings,
        seeded: false,
        pristine: true,
        ownerId: null,
        lastPulledAt: null,

        addTask: (partial) => {
          const ts = nowIso();
          const task: Task = {
            id: uid(),
            notes: "",
            categoryId: null,
            listId: null,
            dueDate: null,
            dueTime: null,
            priority: 0,
            subtasks: [],
            recurrence: null,
            reminderAt: null,
            tags: [],
            completed: false,
            completedAt: null,
            order: minOrder(get().tasks) - 1000,
            createdAt: ts,
            updatedAt: ts,
            ...partial,
            title: partial.title.trim(),
          };
          // keep category consistent with list
          if (task.listId) {
            const l = get().lists[task.listId];
            if (l) task.categoryId = l.categoryId;
          }
          write("tasks", [task]);
          return task;
        },

        updateTask: (id, patch) => {
          const t = get().tasks[id];
          if (!t) return;
          const next = { ...t, ...patch };
          if (patch.listId !== undefined && patch.listId) {
            const l = get().lists[patch.listId];
            if (l) next.categoryId = l.categoryId;
          }
          if (patch.listId !== undefined && patch.listId !== t.listId && patch.sectionId === undefined) next.sectionId = null;
          if (patch.categoryId !== undefined && next.listId) {
            const l = get().lists[next.listId];
            if (!l || l.categoryId !== next.categoryId) next.listId = null;
          }
          write("tasks", [next]);
        },

        toggleTask: (id) => {
          const t = get().tasks[id];
          if (!t) return { completed: false, spawnedId: null };
          if (t.completed) {
            write("tasks", [{ ...t, completed: false, completedAt: null }]);
            return { completed: false, spawnedId: null };
          }
          const done: Task = { ...t, completed: true, completedAt: nowIso() };
          let spawned: Task | null = null;
          if (t.recurrence) {
            const base = t.dueDate ?? new Date().toISOString().slice(0, 10);
            const ts = nowIso();
            spawned = {
              ...t,
              id: uid(),
              dueDate: nextOccurrence(base, t.recurrence),
              subtasks: t.subtasks.map((s) => ({ ...s, done: false })),
              reminderAt: null,
              completed: false,
              completedAt: null,
              createdAt: ts,
              updatedAt: ts,
            };
            // the completed instance no longer repeats; the new one carries the rule
            done.recurrence = null;
          }
          write("tasks", spawned ? [done, spawned] : [done]);
          return { completed: true, spawnedId: spawned?.id ?? null };
        },

        deleteTask: (id) => {
          const t = get().tasks[id];
          if (t) write("tasks", [{ ...t, deleted: true }]);
        },
        restoreTask: (id) => {
          const t = get().tasks[id];
          if (t) write("tasks", [{ ...t, deleted: false }]);
        },
        setTaskOrder: (id, order) => {
          const t = get().tasks[id];
          if (t) write("tasks", [{ ...t, order }]);
        },

        addCategory: (partial) => {
          const ts = nowIso();
          const cats = Object.values(get().categories).filter((c) => !c.deleted);
          const c: Category = {
            id: uid(),
            color: "blue",
            icon: "folder",
            order: maxOrder(cats) + 1000,
            collapsed: false,
            createdAt: ts,
            updatedAt: ts,
            ...partial,
            name: partial.name.trim(),
          };
          write("categories", [c]);
          return c;
        },
        updateCategory: (id, patch) => {
          const c = get().categories[id];
          if (c) write("categories", [{ ...c, ...patch }]);
        },
        deleteCategory: (id) => {
          const s = get();
          const c = s.categories[id];
          if (!c) return [];
          const lists = Object.values(s.lists).filter((l) => l.categoryId === id && !l.deleted);
          const tasks = Object.values(s.tasks).filter((t) => t.categoryId === id && !t.deleted);
          write("categories", [{ ...c, deleted: true }]);
          write("lists", lists.map((l) => ({ ...l, deleted: true })));
          write("tasks", tasks.map((t) => ({ ...t, deleted: true })));
          return [
            key("categories", id),
            ...lists.map((l) => key("lists", l.id)),
            ...tasks.map((t) => key("tasks", t.id)),
          ];
        },

        addList: (partial) => {
          const ts = nowIso();
          const siblings = Object.values(get().lists).filter(
            (l) => l.categoryId === partial.categoryId && !l.deleted,
          );
          const l: List = {
            id: uid(),
            order: maxOrder(siblings) + 1000,
            createdAt: ts,
            updatedAt: ts,
            ...partial,
            name: partial.name.trim(),
          };
          write("lists", [l]);
          return l;
        },
        updateList: (id, patch) => {
          const l = get().lists[id];
          if (!l) return;
          write("lists", [{ ...l, ...patch }]);
          if (patch.categoryId && patch.categoryId !== l.categoryId) {
            const tasks = Object.values(get().tasks).filter((t) => t.listId === id);
            write("tasks", tasks.map((t) => ({ ...t, categoryId: patch.categoryId! })));
          }
        },
        deleteList: (id) => {
          const s = get();
          const l = s.lists[id];
          if (!l) return [];
          const tasks = Object.values(s.tasks).filter((t) => t.listId === id && !t.deleted);
          write("lists", [{ ...l, deleted: true }]);
          write("tasks", tasks.map((t) => ({ ...t, deleted: true })));
          return [key("lists", id), ...tasks.map((t) => key("tasks", t.id))];
        },
        undelete: (keys) => {
          const s = get();
          const by: Record<SyncTable, Rec[]> = { categories: [], lists: [], tasks: [] };
          for (const k of keys) {
            const [table, id] = k.split(":") as [SyncTable, string];
            const rec = (s[table] as Table<Rec>)[id];
            if (rec) by[table].push({ ...rec, deleted: false });
          }
          (Object.keys(by) as SyncTable[]).forEach((t) => by[t].length && write(t, by[t]));
        },

        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

        applyRemote: (table, rows) => {
          if (!rows.length) return;
          set((s) => {
            const tbl = { ...(s[table] as Table<Rec>) };
            const dirty = s.dirty;
            let changed = false;
            for (const r of rows) {
              const local = tbl[r.id];
              const pending = dirty[key(table, r.id)];
              // last-write-wins; never clobber a newer pending local edit
              if (local && local.updatedAt > r.updatedAt) continue;
              if (pending && pending > r.updatedAt) continue;
              if (local && local.updatedAt === r.updatedAt) continue;
              tbl[r.id] = r;
              changed = true;
            }
            return changed ? ({ [table]: tbl } as Partial<DataState>) : {};
          });
        },
        markClean: (entries) =>
          set((s) => {
            const dirty = { ...s.dirty };
            for (const e of entries) if (dirty[e.key] === e.updatedAt) delete dirty[e.key];
            return { dirty };
          }),
        markAllDirty: () =>
          set((s) => {
            const dirty: Record<string, string> = {};
            (["categories", "lists", "tasks"] as SyncTable[]).forEach((t) =>
              Object.values(s[t] as Table<Rec>).forEach((r) => (dirty[key(t, r.id)] = r.updatedAt)),
            );
            return { dirty };
          }),
        setOwner: (ownerId) => set({ ownerId }),
        setLastPulledAt: (iso) => set({ lastPulledAt: iso }),
        resetLocal: (withSeed) => {
          const seed = withSeed ? buildSeed() : { categories: [], lists: [], tasks: [] };
          set({
            categories: Object.fromEntries(seed.categories.map((c) => [c.id, c])),
            lists: Object.fromEntries(seed.lists.map((l) => [l.id, l])),
            tasks: Object.fromEntries(seed.tasks.map((t) => [t.id, t])),
            dirty: {},
            seeded: true,
            pristine: withSeed,
            lastPulledAt: null,
          });
        },
        importData: (data) => {
          write("categories", data.categories ?? []);
          write("lists", data.lists ?? []);
          write("tasks", data.tasks ?? []);
        },
      };
    },
    {
      name: "tidy-data-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        categories: s.categories,
        lists: s.lists,
        tasks: s.tasks,
        dirty: s.dirty,
        settings: s.settings,
        seeded: s.seeded,
        pristine: s.pristine,
        ownerId: s.ownerId,
        lastPulledAt: s.lastPulledAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && !state.seeded) state.resetLocal(true);
      },
    },
  ),
);

export const dirtyKey = key;
