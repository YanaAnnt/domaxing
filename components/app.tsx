"use client";

import * as React from "react";
import { useUI, hashToView, viewToHash, type QuickAddDefaults } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import type { ViewId } from "@/lib/types";
import { isTypingTarget, between, withBase } from "@/lib/utils";
import { todayKey } from "@/lib/dates";
import { useThemeController } from "@/lib/theme";
import { startSync, useSync } from "@/lib/sync";
import { startReminderLoop } from "@/lib/reminders";
import { toggleComplete, deleteWithUndo } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { AppDnd } from "./dnd";
import { OpeningSplash } from "./splash";
import { Sidebar } from "./sidebar";
import { TaskDetail } from "./task-detail";
import { CommandMenu } from "./command-menu";
import { QuickAddDialog } from "./quick-add";
import { CategoryDialog, ListDialog, ShortcutsDialog } from "./dialogs";
import { AuthDialog, SettingsDialog } from "./settings";
import { FocusMode, Toaster } from "./overlays";
import { FloatingAdd, MobileTabBar } from "./mobile-nav";
import { AllTasksView, CompletedView, InboxView, TodayView, UpcomingView } from "./views/smart";
import { BrowseView, CategoryView, ListView } from "./views/other";
import { WeekView } from "./views/week";
import { ProgressView } from "./views/progress";
import { AssistantView } from "./views/assistant";
import { startAssistant, useAssistant } from "@/lib/assistant";

export function defaultsForView(v: ViewId): QuickAddDefaults {
  if (v.type === "today") return { dueDate: todayKey() };
  if (v.type === "list") return { listId: v.id };
  if (v.type === "category") return { categoryId: v.id };
  return {};
}

function useIsMobile() {
  const [m, setM] = React.useState(() => window.matchMedia("(max-width: 767px)").matches);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

function CurrentView() {
  const view = useUI((s) => s.view);
  switch (view.type) {
    case "today": return <TodayView />;
    case "upcoming": return <UpcomingView />;
    case "inbox": return <InboxView />;
    case "all": return <AllTasksView />;
    case "completed": return <CompletedView />;
    case "week": return <WeekView />;
    case "progress": return <ProgressView />;
    case "browse": return <BrowseView />;
    case "assistant": return <AssistantView />;
    case "category": return <CategoryView id={view.id} />;
    case "list": return <ListView id={view.id} />;
  }
}

function useHashRouting() {
  React.useEffect(() => {
    const initial = hashToView(window.location.hash);
    if (initial) useUI.getState().navigate(initial, { replace: true });
    else history.replaceState(null, "", viewToHash(useUI.getState().view));
    const onPop = () => {
      const v = hashToView(window.location.hash);
      if (v) useUI.getState().navigate(v, { fromHistory: true });
      useUI.getState().openDetail(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

function visibleTaskIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("#main [data-task-id]")).map((el) => el.dataset.taskId!);
}

function useKeyboard() {
  React.useEffect(() => {
    let gPending = 0;
    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState();
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();

      if (mod && k === "k") {
        e.preventDefault();
        ui.setCommandOpen(!ui.commandOpen);
        return;
      }
      if (mod && k === "n") {
        e.preventDefault();
        ui.setQuickAdd(defaultsForView(ui.view));
        return;
      }
      const modalOpen = ui.commandOpen || ui.quickAdd || ui.settingsOpen || ui.shortcutsOpen || ui.authOpen || ui.categoryDialog || ui.listDialog || ui.focusTaskId;
      if (modalOpen) return;

      if (e.key === "Escape") {
        if (isTypingTarget(e.target)) {
          (e.target as HTMLElement).blur();
          return;
        }
        if (ui.detailTaskId) ui.openDetail(null);
        else ui.setSelected(null);
        return;
      }
      if (isTypingTarget(e.target) || mod) return;
      // ignore keys while a Radix menu/popover is open
      if (document.querySelector("[data-radix-popper-content-wrapper]")) return;

      if (gPending && Date.now() - gPending < 1200) {
        gPending = 0;
        const map: Record<string, ViewId> = {
          t: { type: "today" }, u: { type: "upcoming" }, i: { type: "inbox" }, w: { type: "week" },
          a: { type: "all" }, c: { type: "completed" }, p: { type: "progress" }, s: { type: "assistant" },
        };
        if (map[k]) {
          e.preventDefault();
          ui.navigate(map[k]);
        }
        return;
      }

      const ids = visibleTaskIds();
      const sel = ui.selectedTaskId && ids.includes(ui.selectedTaskId) ? ui.selectedTaskId : null;
      const idx = sel ? ids.indexOf(sel) : -1;

      const select = (id: string | undefined) => {
        if (!id) return;
        if (ui.detailTaskId) ui.openDetail(id);
        else ui.setSelected(id);
        document.querySelector(`#main [data-task-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
      };

      switch (true) {
        case k === "n" || k === "q":
          e.preventDefault();
          ui.setQuickAdd(defaultsForView(ui.view));
          break;
        case k === "/":
          e.preventDefault();
          ui.setCommandOpen(true);
          break;
        case e.key === "?":
          e.preventDefault();
          ui.setShortcutsOpen(true);
          break;
        case k === "g":
          gPending = Date.now();
          break;
        case e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"): {
          if (!sel) break;
          e.preventDefault();
          const tasks = useData.getState().tasks;
          const dir = e.key === "ArrowDown" ? 1 : -1;
          const target = idx + dir;
          if (target < 0 || target >= ids.length) break;
          const a = ids[target];
          const b = ids[target + dir];
          const ord = dir === 1 ? between(tasks[a]?.order, b ? tasks[b]?.order : undefined) : between(b ? tasks[b]?.order : undefined, tasks[a]?.order);
          useData.getState().setTaskOrder(sel, ord);
          break;
        }
        case e.key === "ArrowDown" || k === "j":
          e.preventDefault();
          select(ids[Math.min(ids.length - 1, idx + 1)] ?? ids[0]);
          break;
        case e.key === "ArrowUp" || k === "k":
          e.preventDefault();
          select(ids[Math.max(0, idx - 1)] ?? ids[0]);
          break;
        case e.key === "Enter" && !!sel:
          e.preventDefault();
          ui.openDetail(sel);
          break;
        case k === "x" && !!sel:
          e.preventDefault();
          toggleComplete(sel!);
          break;
        case (e.key === "Backspace" || e.key === "Delete") && !!sel: {
          e.preventDefault();
          const next = ids[idx + 1] ?? ids[idx - 1] ?? null;
          deleteWithUndo(sel!);
          ui.setSelected(next);
          break;
        }
        case k === "f" && !!(sel || ui.detailTaskId):
          e.preventDefault();
          ui.setFocus(sel ?? ui.detailTaskId);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** iOS: keep bottom sheets above the on-screen keyboard. */
function useKeyboardInset() {
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", inset > 60 ? inset + "px" : "0px");
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
}

function useServiceWorker() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/") }).catch((e) => console.warn("[tidy] SW registration failed", e));
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "open-url" && typeof e.data.url === "string") {
        const v = hashToView(e.data.url.split("#")[1] ? "#" + e.data.url.split("#")[1] : "");
        if (v) useUI.getState().navigate(v);
      }
      if (e.data?.taskId) useUI.getState().openDetail(e.data.taskId);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);
}

// Dev-only debugging handle (stripped from production builds by the NODE_ENV check).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __tidy: unknown }).__tidy = { useAssistant, useSync, useData, useUI };
}

export function App() {
  useThemeController();
  useHashRouting();
  useKeyboard();
  useServiceWorker();
  useKeyboardInset();
  React.useEffect(() => {
    startSync();
    startAssistant();
    return startReminderLoop();
  }, []);

  const sidebarOpen = useUI((s) => s.sidebarOpen);
  const detailId = useUI((s) => s.detailTaskId);
  const detailExists = useData((s) => !!(detailId && s.tasks[detailId] && !s.tasks[detailId].deleted));
  const view = useUI((s) => s.view);
  const mainRef = React.useRef<HTMLElement>(null);
  const isMobile = useIsMobile();

  // scroll to top when switching views
  React.useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [view]);

  const closeDetail = () => useUI.getState().openDetail(null);

  return (
    <AppDnd>
      <div className="flex h-dvh w-full overflow-hidden pl-safe pr-safe md:gap-2.5 md:p-2.5">
        <aside
          className={cn(
            "glass hidden h-full w-[260px] shrink-0 overflow-hidden rounded-[22px] transition-[margin,opacity] duration-300 ease-out md:flex",
            !sidebarOpen && "pointer-events-none opacity-0 md:-ml-[270px]",
          )}
          aria-hidden={!sidebarOpen}
        >
          <Sidebar />
        </aside>

        <main
          id="main"
          ref={mainRef}
          className="relative min-w-0 flex-1 overflow-y-auto overscroll-contain pt-safe md:glass md:rounded-[26px] md:pt-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) useUI.getState().setSelected(null);
          }}
        >
          <div key={"id" in view ? `${view.type}-${view.id}` : view.type} className="animate-fade-in">
            <CurrentView />
          </div>
        </main>

        {detailExists && detailId && (
          <>
            <div className="fixed inset-0 z-40 hidden bg-black/10 animate-fade-in md:block xl:hidden dark:bg-black/30" onClick={closeDetail} />
            <aside
              className="glass-strong fixed inset-0 z-50 overflow-hidden animate-panel-in md:inset-y-2.5 md:left-auto md:right-2.5 md:w-[420px] md:rounded-[26px] xl:static xl:z-auto xl:h-full xl:w-[420px] xl:shrink-0 xl:glass 2xl:w-[460px]"
              aria-label="Task details"
            >
              <TaskDetail taskId={detailId} onClose={closeDetail} mobile={isMobile} />
            </aside>
          </>
        )}
      </div>

      <MobileTabBar />
      <FloatingAdd />
      <QuickAddDialog />
      <CommandMenu />
      <CategoryDialog />
      <ListDialog />
      <SettingsDialog />
      <AuthDialog />
      <ShortcutsDialog />
      <FocusMode />
      <Toaster />
      <OpeningSplash />
    </AppDnd>
  );
}
