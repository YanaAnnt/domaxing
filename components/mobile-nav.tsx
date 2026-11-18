"use client";

import { CalendarClock, Inbox, LayoutGrid, Plus, Sparkles, Sun } from "lucide-react";
import { useAssistant } from "@/lib/assistant";
import { useUI } from "@/lib/ui-store";
import type { ViewId } from "@/lib/types";
import { cn, haptic } from "@/lib/utils";
import { todayKey } from "@/lib/dates";
import { useCounts } from "./views/smart";

const TABS: { label: string; icon: typeof Sun; view: ViewId | null }[] = [
  { label: "Today", icon: Sun, view: { type: "today" } },
  { label: "Upcoming", icon: CalendarClock, view: { type: "upcoming" } },
  { label: "Assistant", icon: Sparkles, view: { type: "assistant" } },
  { label: "Inbox", icon: Inbox, view: { type: "inbox" } },
  { label: "Browse", icon: LayoutGrid, view: { type: "browse" } },
];

const BROWSE_TYPES = ["browse", "category", "list", "all", "completed", "week", "progress"];
// Search lives in the Browse header and the ⌘K menu.

export function MobileTabBar() {
  const view = useUI((s) => s.view);
  const counts = useCounts();
  const suggestions = useAssistant((s) => s.suggestions.length);
  const isActive = (t: (typeof TABS)[number]) =>
    t.view ? (t.view.type === "browse" ? BROWSE_TYPES.includes(view.type) : view.type === t.view.type) : false;
  const activeIndex = TABS.findIndex(isActive);
  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),10px)] md:hidden">
      <div className="glass-strong pointer-events-auto relative mx-auto flex h-[62px] max-w-md items-stretch rounded-full px-1.5">
        {/* A glass bubble that glides to the active tab, stretching a little as it moves. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-12px)/5)] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.3,1.25,0.45,1)]"
          style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`, opacity: activeIndex < 0 ? 0 : 1 }}
        >
          <span key={activeIndex} className="tab-glass block h-full w-full rounded-full animate-tab-squish" />
        </span>
        {TABS.map((t) => {
          const active = isActive(t);
          const badge = t.label === "Today" ? counts.today : t.label === "Assistant" ? suggestions : 0;
          return (
            <button
              key={t.label}
              onClick={() => {
                haptic(4);
                if (t.view) useUI.getState().navigate(t.view);
                else useUI.getState().setCommandOpen(true);
              }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative z-10 my-1.5 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-[color,transform] duration-300 active:scale-95",
                active ? "text-accent" : "text-muted",
              )}
            >
              <span className="relative">
                <t.icon className="size-[21px]" strokeWidth={active ? 2.3 : 1.9} />
                {badge > 0 && (
                  <span className={cn("absolute -right-2.5 -top-1 min-w-4 rounded-full px-1 text-[10px] font-semibold leading-4 text-white", t.label === "Assistant" ? "bg-accent" : "bg-danger")}>{badge}</span>
                )}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function FloatingAdd() {
  const view = useUI((s) => s.view);
  const open = () => {
    haptic(8);
    const d =
      view.type === "today" ? { dueDate: todayKey() } :
      view.type === "list" ? { listId: view.id } :
      view.type === "category" ? { categoryId: view.id } : {};
    if (view.type === "list") {
      // category gets derived from the list in the store
      useUI.getState().setQuickAdd({ ...d });
    } else useUI.getState().setQuickAdd(d);
  };
  return (
    <button
      onClick={open}
      aria-label="New task"
      className="fixed bottom-[calc(max(env(safe-area-inset-bottom),10px)+76px)] right-5 z-40 grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-[0_8px_24px_-6px_color-mix(in_oklab,var(--c-accent)_60%,transparent),0_2px_6px_rgba(0,0,0,0.12)] transition-transform active:scale-90 md:hidden"
    >
      <Plus className="size-7" strokeWidth={2.4} />
    </button>
  );
}
