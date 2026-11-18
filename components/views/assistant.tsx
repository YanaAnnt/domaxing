"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarPlus, CheckCircle2, Loader2, RefreshCw, Settings2, Sparkles } from "lucide-react";
import { useSync } from "@/lib/sync";
import { useUI } from "@/lib/ui-store";
import { syncCalendars, useAssistant } from "@/lib/assistant";
import { addDaysKey, diffFromToday, fromKey, relativeLabel, todayKey, toKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button, Segmented } from "../ui/primitives";
import { ViewBody, ViewHeader } from "./shared";
import { AssistantSignIn, BriefingCard, CalendarConnectDialog, SuggestionCard } from "../assistant-ui";
import { AssistantChat } from "../assistant-chat";

type AssistantTab = "chat" | "planner";

/** The Assistant: a full-screen chat with Max, and the calendar Planner one switch away. */
export function AssistantView() {
  const [tab, setTab] = React.useState<AssistantTab>("chat");
  const waiting = useAssistant((s) => s.suggestions.length);
  const toggle = (
    <Segmented<AssistantTab>
      value={tab}
      onChange={setTab}
      options={[
        { value: "chat", label: "Chat", title: "Chat with Max" },
        { value: "planner", label: waiting ? `Planner · ${waiting}` : "Planner", title: "Plans from your connected calendars" },
      ]}
    />
  );
  return tab === "chat" ? <AssistantChat toolbar={toggle} /> : <PlannerView toggle={toggle} />;
}

/** Calendar-based planning (cloud): the daily briefing, suggestions to approve, and the next two weeks. */
function PlannerView({ toggle }: { toggle: React.ReactNode }) {
  const signedIn = useSync((s) => !!s.user);
  const ready = useAssistant((s) => s.ready);
  const suggestions = useAssistant((s) => s.suggestions);
  const connections = useAssistant((s) => s.connections);
  const events = useAssistant((s) => s.events);
  const syncing = useAssistant((s) => s.syncing);
  const config = useAssistant((s) => s.config);
  const [connectOpen, setConnectOpen] = React.useState(false);

  const refresh = async () => {
    try {
      const r = await syncCalendars();
      const errors = r.calendars.filter((c) => c.error);
      useUI.getState().toast({
        message: errors.length
          ? `Couldn't refresh ${errors.length} ${errors.length === 1 ? "calendar" : "calendars"}: ${errors[0].error}`
          : r.suggestions
            ? `${r.suggestions} new ${r.suggestions === 1 ? "suggestion" : "suggestions"}`
            : "Up to date, nothing new to prepare",
        tone: errors.length ? "error" : "default",
      });
    } catch (e) {
      useUI.getState().toast({ message: (e as Error).message, tone: "error" });
    }
  };

  const today = todayKey();
  const upcoming = events.filter((e) => {
    const k = toKey(new Date(e.starts_at));
    return k >= today && k <= addDaysKey(today, 13);
  });
  const byDay = new Map<string, typeof upcoming>();
  for (const e of upcoming) {
    const k = toKey(new Date(e.starts_at));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(e);
  }

  return (
    <ViewBody>
      <ViewHeader
        title={
          <span className="flex items-center gap-2.5">
            <Sparkles className="size-[26px] text-accent md:size-6" strokeWidth={2.2} />
            Planner
          </span>
        }
        subtitle={config && !config.ai && signedIn ? "Smart planning on · add an AI key for deeper plans" : "Plans from your calendar, ready when you are"}
        right={
          <>
            {toggle}
            {signedIn && connections.length > 0 && (
                <Button variant="ghost" size="sm" onClick={refresh} disabled={syncing} aria-label="Refresh calendars">
                  {syncing ? <Loader2 className="size-3.5 animate-spin-slow" /> : <RefreshCw className="size-3.5" />}
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
            )}
            {signedIn && (
              <Button variant="ghost" size="icon" aria-label="Assistant settings" onClick={() => useUI.getState().setSettingsOpen(true)}>
                <Settings2 className="size-4" />
              </Button>
            )}
          </>
        }
      />

      {!signedIn ? (
        <AssistantSignIn />
      ) : !ready ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-36 rounded-[22px]" />
          ))}
        </div>
      ) : (
        <>
          <BriefingCard />

          <section className="mb-10">
            <div className="mb-3 flex items-baseline gap-2 px-1">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">Suggestions</h2>
              {suggestions.length > 0 && <span className="text-xs text-faint">{suggestions.length} waiting for you</span>}
            </div>
            {suggestions.length > 0 ? (
              <div className="flex flex-col gap-3">
                {suggestions.map((s, i) => (
                  <SuggestionCard key={s.id} s={s} defaultOpen={i === 0} />
                ))}
              </div>
            ) : (
              <div className="glass flex items-center gap-4 rounded-[22px] p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success/12 text-success">
                  <CheckCircle2 className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium">You&apos;re all caught up</div>
                  <p className="text-[13px] text-muted">
                    {connections.length
                      ? "New plans appear here as exams, trips, meetings and birthdays get closer."
                      : "Connect a calendar and Domaxing will start preparing for what's coming."}
                  </p>
                </div>
                {!connections.length && (
                  <Button variant="primary" size="sm" onClick={() => setConnectOpen(true)}>
                    <CalendarPlus className="size-3.5" /> Connect
                  </Button>
                )}
              </div>
            )}
          </section>

          <section className="mb-10">
            <div className="mb-3 flex items-center gap-2 px-1">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">Next two weeks</h2>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setConnectOpen(true)}>
                <CalendarPlus className="size-3.5" /> {connections.length ? "Add calendar" : "Connect calendar"}
              </Button>
            </div>
            {connections.length === 0 ? (
              <p className="px-1 text-sm text-muted">No calendars connected yet.</p>
            ) : byDay.size === 0 ? (
              <p className="px-1 text-sm text-muted">Nothing on your calendar for the next two weeks.</p>
            ) : (
              <div className="glass overflow-hidden rounded-[22px]">
                {[...byDay.entries()].map(([k, evs], i) => (
                  <div key={k} className={cn("flex gap-4 px-4 py-3", i > 0 && "border-t border-line")}>
                    <div className="w-14 shrink-0 pt-px">
                      <div className={cn("text-[11px] font-semibold uppercase tracking-wide text-muted", diffFromToday(k) === 0 && "text-accent")}>
                        {diffFromToday(k) <= 1 ? relativeLabel(k) : format(fromKey(k), "EEE")}
                      </div>
                      <div className="text-[19px] font-semibold tabular-nums leading-tight">{format(fromKey(k), "d")}</div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {evs.map((e) => (
                        <div key={e.id} className="flex items-baseline gap-2.5 text-[14px]">
                          <span className="w-11 shrink-0 text-[12px] tabular-nums text-muted">{e.all_day ? "All day" : format(new Date(e.starts_at), "H:mm")}</span>
                          <span className="min-w-0 truncate">{e.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      <CalendarConnectDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </ViewBody>
  );
}
