"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SortMode, ViewId } from "./types";

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "default" | "error";
}

export interface QuickAddDefaults {
  sectionId?: string | null;
  dueDate?: string | null;
  listId?: string | null;
  categoryId?: string | null;
}

interface UIState {
  view: ViewId;
  selectedTaskId: string | null; // keyboard selection
  detailTaskId: string | null; // open in details panel
  focusTaskId: string | null;
  commandOpen: boolean;
  quickAdd: QuickAddDefaults | null; // non-null = mobile sheet / dialog open
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  authOpen: boolean;
  categoryDialog: { mode: "create" } | { mode: "edit"; id: string } | null;
  listDialog: { mode: "create"; categoryId?: string } | { mode: "edit"; id: string } | null;
  sortModes: Record<string, SortMode>;
  sidebarOpen: boolean;
  toasts: Toast[];
  /** ids of tasks animating out after completion */
  completing: Record<string, true>;

  navigate: (v: ViewId, opts?: { replace?: boolean; fromHistory?: boolean }) => void;
  setSelected: (id: string | null) => void;
  openDetail: (id: string | null) => void;
  setFocus: (id: string | null) => void;
  setCommandOpen: (o: boolean) => void;
  setQuickAdd: (d: QuickAddDefaults | null) => void;
  setSettingsOpen: (o: boolean) => void;
  setShortcutsOpen: (o: boolean) => void;
  setAuthOpen: (o: boolean) => void;
  setCategoryDialog: (d: UIState["categoryDialog"]) => void;
  setListDialog: (d: UIState["listDialog"]) => void;
  setSort: (viewKey: string, m: SortMode) => void;
  setSidebarOpen: (o: boolean) => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  setCompleting: (id: string, on: boolean) => void;
}

export const viewKey = (v: ViewId) => ("id" in v ? `${v.type}:${v.id}` : v.type);

export function viewToHash(v: ViewId) {
  return "#/" + ("id" in v ? `${v.type}/${v.id}` : v.type);
}

export function hashToView(hash: string): ViewId | null {
  const parts = hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
  const [type, id] = parts;
  const simple = ["today", "upcoming", "inbox", "all", "completed", "week", "progress", "browse", "assistant"];
  if (simple.includes(type)) return { type } as ViewId;
  if ((type === "category" || type === "list") && id) return { type, id };
  return null;
}

let toastSeq = 1;

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      view: { type: "today" },
      selectedTaskId: null,
      detailTaskId: null,
      focusTaskId: null,
      commandOpen: false,
      quickAdd: null,
      settingsOpen: false,
      shortcutsOpen: false,
      authOpen: false,
      categoryDialog: null,
      listDialog: null,
      sortModes: {},
      sidebarOpen: true,
      toasts: [],
      completing: {},

      navigate: (v, opts) => {
        set({ view: v, selectedTaskId: null });
        if (typeof window !== "undefined" && !opts?.fromHistory) {
          const h = viewToHash(v);
          if (window.location.hash !== h) {
            if (opts?.replace) history.replaceState(null, "", h);
            else history.pushState(null, "", h);
          }
        }
      },
      setSelected: (id) => set({ selectedTaskId: id }),
      openDetail: (id) => set({ detailTaskId: id, selectedTaskId: id ?? null }),
      setFocus: (id) => set({ focusTaskId: id }),
      setCommandOpen: (o) => set({ commandOpen: o }),
      setQuickAdd: (d) => set({ quickAdd: d }),
      setSettingsOpen: (o) => set({ settingsOpen: o }),
      setShortcutsOpen: (o) => set({ shortcutsOpen: o }),
      setAuthOpen: (o) => set({ authOpen: o }),
      setCategoryDialog: (d) => set({ categoryDialog: d }),
      setListDialog: (d) => set({ listDialog: d }),
      setSort: (k, m) => set((s) => ({ sortModes: { ...s.sortModes, [k]: m } })),
      setSidebarOpen: (o) => set({ sidebarOpen: o }),
      toast: (t) => {
        const id = toastSeq++;
        set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 5000);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
      setCompleting: (id, on) =>
        set((s) => {
          const c = { ...s.completing };
          if (on) c[id] = true;
          else delete c[id];
          return { completing: c };
        }),
    }),
    {
      name: "tidy-ui-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sortModes: s.sortModes, sidebarOpen: s.sidebarOpen }),
    },
  ),
);
