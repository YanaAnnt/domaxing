"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  ArrowRight, CalendarCheck2, CalendarDays, Check, ChevronDown, Flag, Gift, GraduationCap, Inbox, Loader2, Plane,
  RefreshCw, Sparkles, Trash2, Users, Wand2, X, CalendarClock, Link2, Apple, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUI } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import { useSync } from "@/lib/sync";
import { cloudEnabled } from "@/lib/supabase";
import { PRIORITIES, priorityColor } from "@/lib/constants";
import { diffFromToday, relativeLabel, todayKey, toKey } from "@/lib/dates";
import {
  approveSuggestion, connectIcs, dismissSuggestion, loadBriefing, startOAuth, suggestTarget, useAssistant,
  type CalConnection, type CalEvent, type DraftTask, type Suggestion,
} from "@/lib/assistant";
import { useAllTasks } from "@/lib/selectors";
import { Button, Dialog, DialogContent, Input, Popover, PopoverContent, PopoverTrigger } from "./ui/primitives";
import { DatePickerPanel } from "./date-picker";
import { CategoryIcon, ListPicker } from "./list-picker";
import { Chip } from "./quick-add";

// ---------------- visual helpers ----------------
export const CATEGORY_META: Record<string, { icon: LucideIcon; tint: string; label: string }> = {
  exam: { icon: GraduationCap, tint: "#8b6cf0", label: "Exam" },
  travel: { icon: Plane, tint: "#3f9bea", label: "Trip" },
  meeting: { icon: Users, tint: "#e08a3c", label: "Meeting" },
  birthday: { icon: Gift, tint: "#e05a9a", label: "Birthday" },
  deadline: { icon: Flag, tint: "#e5484d", label: "Deadline" },
  other: { icon: Sparkles, tint: "#4f6bed", label: "Plan" },
  reschedule: { icon: CalendarClock, tint: "#3f9bea", label: "Moved" },
  cleanup: { icon: Trash2, tint: "#8b95a5", label: "Cancelled" },
};

export function Orb({ kind, size = 36 }: { kind: string; size?: number }) {
  const m = CATEGORY_META[kind] ?? CATEGORY_META.other;
  const Icon = m.icon;
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        color: m.tint,
        background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${m.tint} 26%, white) 0%, color-mix(in oklab, ${m.tint} 14%, transparent) 70%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.6), 0 4px 14px -6px color-mix(in oklab, ${m.tint} 60%, transparent)`,
      }}
    >
      <Icon style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={2} />
    </span>
  );
}

function eventWhen(iso: string | null) {
  if (!iso) return "";
  const k = toKey(new Date(iso));
  const d = diffFromToday(k);
  const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
  return `${format(new Date(iso), "EEE, MMM d")} · ${when}`;
}

// ---------------- Briefing ----------------
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Local briefing for demo mode / before the server has one. */
function useLocalBriefing() {
  const tasks = useAllTasks();
  const events = useAssistant((s) => s.events);
  const suggestions = useAssistant((s) => s.suggestions.length);
  const today = todayKey();
  const due = tasks.filter((t) => !t.completed && t.dueDate === today);
  const overdue = tasks.filter((t) => !t.completed && t.dueDate && t.dueDate < today);
  const todaysEvents = events.filter((e) => toKey(new Date(e.starts_at)) === today);
  const parts: string[] = [];
  if (todaysEvents.length) {
    const first = todaysEvents.find((e) => !e.all_day) ?? todaysEvents[0];
    parts.push(`${todaysEvents.length} ${todaysEvents.length === 1 ? "event" : "events"} today${first.all_day ? "" : `, first up ${first.title} at ${format(new Date(first.starts_at), "H:mm")}`}.`);
  }
  if (due.length || overdue.length) {
    const top = [...overdue, ...due].sort((a, b) => b.priority - a.priority)[0];
    parts.push(`${due.length} ${due.length === 1 ? "task" : "tasks"} due${overdue.length ? `, ${overdue.length} overdue` : ""}. Start with “${top.title}”.`);
  } else parts.push("Nothing due. A calm day to get ahead.");
  if (suggestions) parts.push(`${suggestions} ${suggestions === 1 ? "suggestion is" : "suggestions are"} waiting.`);
  return { headline: greeting(), body: parts.join(" "), stats: { events: todaysEvents.length, due: due.length, overdue: overdue.length, suggestions } };
}

export function BriefingCard({ compact }: { compact?: boolean }) {
  const server = useAssistant((s) => s.briefing);
  const loading = useAssistant((s) => s.briefingLoading);
  const signedIn = useSync((s) => !!s.user);
  const local = useLocalBriefing();
  const b = server && signedIn ? { ...server, stats: { ...server.stats, suggestions: local.stats.suggestions } } : local;
  const ui = useUI.getState();
  return (
    <section className={cn("glass relative overflow-hidden rounded-[24px] p-5 animate-rise-in", compact ? "mb-6" : "mb-8")}>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--c-accent) 26%, transparent), transparent 70%)" }}
      />
      <div className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-semibold tracking-tight">{b.headline}</h2>
            {server?.source === "ai" && signedIn && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-semibold text-accent">
                <Sparkles className="size-3" /> AI
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-fg/80">{b.body}</p>
        </div>
        {signedIn && (
          <Button variant="ghost" size="icon-sm" aria-label="Refresh briefing" onClick={() => loadBriefing(true)} className="-mr-1.5 -mt-1">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin-slow")} />
          </Button>
        )}
      </div>
      <div className="relative mt-4 flex flex-wrap gap-1.5">
        {b.stats.events > 0 && <Stat label={b.stats.events === 1 ? "event" : "events"} value={b.stats.events} />}
        <Stat label="due" value={b.stats.due} />
        {b.stats.overdue > 0 && <Stat label="overdue" value={b.stats.overdue} tone="danger" />}
        {b.stats.suggestions > 0 && (
          <button onClick={() => ui.navigate({ type: "assistant" })} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-accent px-3 text-[12.5px] font-semibold text-on-accent shadow-sm">
            <Sparkles className="size-3.5" /> {b.stats.suggestions} {b.stats.suggestions === 1 ? "suggestion" : "suggestions"}
            <ArrowRight className="size-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-1 rounded-full bg-sunken px-3 text-[12.5px] text-muted", tone === "danger" && "text-danger")}>
      <span className="font-semibold tabular-nums text-fg">{value}</span> {label}
    </span>
  );
}

// ---------------- Today's schedule ----------------
export function useEventsOn(dateKey: string): CalEvent[] {
  const events = useAssistant((s) => s.events);
  return React.useMemo(() => events.filter((e) => toKey(new Date(e.starts_at)) === dateKey), [events, dateKey]);
}

export function EventStrip({ dateKey, title }: { dateKey: string; title?: string }) {
  const events = useEventsOn(dateKey);
  if (!events.length) return null;
  const now = Date.now();
  return (
    <section className="mb-6 animate-rise-in">
      {title && <h2 className="mb-1.5 px-3 text-[13px] font-semibold">{title}</h2>}
      <div className="flex flex-col gap-px">
        {events.map((e) => {
          const past = e.ends_at ? new Date(e.ends_at).getTime() < now : false;
          return (
            <div key={e.id} className={cn("flex items-center gap-3 rounded-xl px-3 py-1.5 text-[14px]", past && "opacity-50")}>
              <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-muted">
                {e.all_day ? "All day" : format(new Date(e.starts_at), "H:mm")}
              </span>
              <span className="h-5 w-[3px] shrink-0 rounded-full bg-accent/60" />
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              {e.location && <span className="hidden max-w-[30%] truncate text-xs text-faint sm:inline">{e.location}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------- Suggestion card ----------------
export function SuggestionCard({ s, defaultOpen }: { s: Suggestion; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const [busy, setBusy] = React.useState(false);
  const [tasks, setTasks] = React.useState<(DraftTask & { on: boolean })[]>(() => (s.payload.tasks ?? []).map((t) => ({ ...t, on: true })));
  const [target, setTarget] = React.useState(() => suggestTarget(s));
  const cat = useData((st) => (target.categoryId ? st.categories[target.categoryId] : undefined));
  const list = useData((st) => (target.listId ? st.lists[target.listId] : undefined));
  const kind = s.kind === "prep" ? s.category ?? "other" : s.kind;
  const chosen = tasks.filter((t) => t.on);
  const linkedCount = useData((st) =>
    s.kind === "prep" ? 0 : Object.values(st.tasks).filter((t) => !t.deleted && !t.completed && t.eventKey === s.event_key).length,
  );

  const approve = async () => {
    setBusy(true);
    try {
      await approveSuggestion(s, s.kind === "prep" ? { tasks: chosen.map(({ on: _on, ...t }) => t), target } : undefined);
    } finally {
      setBusy(false);
    }
  };
  const patch = (i: number, p: Partial<DraftTask & { on: boolean }>) => setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));

  return (
    <article className="glass overflow-hidden rounded-[22px] animate-rise-in">
      <div className="flex items-start gap-3.5 p-4 pb-3">
        <Orb kind={kind} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15.5px] font-semibold tracking-tight">{s.title}</h3>
            <span className="shrink-0 rounded-full bg-sunken px-1.5 py-px text-[10.5px] font-medium text-muted">
              {s.source === "ai" ? "AI" : "Smart"}
            </span>
          </div>
          {s.event_title && (
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted">
              <CalendarDays className="size-3 shrink-0" />
              <span className="truncate">{s.event_title}</span>
              <span className="shrink-0 text-faint">· {eventWhen(s.event_start)}</span>
            </div>
          )}
          {s.reason && <p className="mt-2 text-[13.5px] leading-relaxed text-fg/75">{s.reason}</p>}
        </div>
      </div>

      {s.kind === "prep" && (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-left text-[13px] font-medium text-muted hover:text-fg"
            aria-expanded={open}
          >
            <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} />
            {open ? "Review tasks" : `${tasks.length} proposed ${tasks.length === 1 ? "task" : "tasks"}`}
            {!open && (
              <span className="ml-auto hidden truncate text-xs font-normal text-faint sm:block">
                {tasks.slice(0, 2).map((t) => t.title).join(" · ")}
                {tasks.length > 2 ? " …" : ""}
              </span>
            )}
          </button>
          {open && (
            <ul className="px-2 pb-2">
              {tasks.map((t, i) => (
                <DraftRow key={i} t={t} onChange={(p) => patch(i, p)} onRemove={() => setTasks((ts) => ts.filter((_, j) => j !== i))} />
              ))}
            </ul>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        {s.kind === "prep" ? (
          <ListPicker
            value={target}
            onChange={setTarget}
            trigger={
              <Chip active={!!cat} icon={cat ? <CategoryIcon icon={cat.icon} color={cat.color} className="size-3.5" /> : <Inbox className="size-3.5" />}>
                {list?.name ?? cat?.name ?? "Inbox"}
              </Chip>
            }
          />
        ) : (
          <span className="text-[12.5px] text-muted">
            {linkedCount} open {linkedCount === 1 ? "task" : "tasks"} affected
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => dismissSuggestion(s)} disabled={busy}>
            Dismiss
          </Button>
          <Button variant="primary" size="sm" onClick={approve} disabled={busy || (s.kind === "prep" && !chosen.length)}>
            {busy ? <Loader2 className="size-3.5 animate-spin-slow" /> : <Check className="size-3.5" strokeWidth={2.6} />}
            {s.kind === "prep" ? `Add ${chosen.length} ${chosen.length === 1 ? "task" : "tasks"}` : s.kind === "reschedule" ? "Shift tasks" : "Remove tasks"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function DraftRow({ t, onChange, onRemove }: { t: DraftTask & { on: boolean }; onChange: (p: Partial<DraftTask & { on: boolean }>) => void; onRemove: () => void }) {
  const [dateOpen, setDateOpen] = React.useState(false);
  return (
    <li className={cn("group/draft flex items-start gap-3 rounded-xl px-2 py-1.5 hover:bg-hover", !t.on && "opacity-50")}>
      <button
        role="checkbox"
        aria-checked={t.on}
        aria-label={t.on ? `Exclude ${t.title}` : `Include ${t.title}`}
        onClick={() => onChange({ on: !t.on })}
        className={cn(
          "mt-[5px] grid size-[18px] shrink-0 place-items-center rounded-[6px] border-[1.5px] transition-colors",
          t.on ? "border-accent bg-accent text-on-accent" : "border-line-strong",
        )}
      >
        {t.on && <Check className="size-3" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          value={t.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="h-7 w-full bg-transparent text-[14px] outline-none"
          aria-label="Task title"
        />
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-muted">
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1 rounded-md hover:text-fg">
                <CalendarDays className="size-3" />
                {relativeLabel(t.dueDate)}
                {t.dueTime && ` · ${t.dueTime}`}
              </button>
            </PopoverTrigger>
            <PopoverContent>
              <DatePickerPanel value={t.dueDate} onChange={(k) => k && onChange({ dueDate: k })} onDone={() => setDateOpen(false)} />
            </PopoverContent>
          </Popover>
          {t.priority >= 2 && (
            <span className="inline-flex items-center gap-1" style={{ color: priorityColor(t.priority) }}>
              <Flag className="size-3" /> {PRIORITIES[t.priority].label}
            </span>
          )}
          {t.subtasks.length > 0 && <span>{t.subtasks.length} steps</span>}
          {t.reminder && <span>Reminder</span>}
          {t.notes && <span className="truncate text-faint">{t.notes}</span>}
        </div>
      </div>
      <button aria-label="Remove from plan" onClick={onRemove} className="mt-1 grid size-6 shrink-0 place-items-center rounded-md text-faint opacity-0 hover:text-danger group-hover/draft:opacity-100 max-md:opacity-60">
        <X className="size-3.5" />
      </button>
    </li>
  );
}

// ---------------- Calendar connect ----------------
const PROVIDERS: { id: CalConnection["provider"]; label: string; icon: React.ReactNode; steps: string[] }[] = [
  {
    id: "google",
    label: "Google",
    icon: <span className="text-[13px] font-bold text-[#4285f4]">G</span>,
    steps: [
      "Open calendar.google.com on a computer → Settings (gear).",
      "Under “Settings for my calendars”, pick your calendar → “Integrate calendar”.",
      "Copy “Secret address in iCal format” and paste it below.",
    ],
  },
  {
    id: "outlook",
    label: "Outlook",
    icon: <span className="text-[13px] font-bold text-[#0a64d6]">O</span>,
    steps: [
      "Open outlook.com (or Outlook on the web) → Settings → Calendar → Shared calendars.",
      "Under “Publish a calendar”, choose your calendar and “Can view all details” → Publish.",
      "Copy the ICS link and paste it below.",
    ],
  },
  {
    id: "apple",
    label: "iCloud",
    icon: <Apple className="size-4" />,
    steps: [
      "On iPhone: Calendar → Calendars → tap ⓘ next to a calendar → turn on “Public Calendar”.",
      "Tap “Share Link…” → Copy, then paste it below. (On Mac: right-click the calendar → Share → Public Calendar.)",
      "Anyone with a public link can view it, so keep it private.",
    ],
  },
  {
    id: "ics",
    label: "Other",
    icon: <Link2 className="size-4" />,
    steps: ["Paste any iCal / .ics / webcal:// subscription link: school timetables, sports schedules, birthdays and more."],
  },
];

export function CalendarConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const config = useAssistant((s) => s.config);
  const [provider, setProvider] = React.useState<CalConnection["provider"]>("google");
  const [url, setUrl] = React.useState("");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const p = PROVIDERS.find((x) => x.id === provider)!;
  const oauth = (provider === "google" && config?.google) || (provider === "outlook" && config?.microsoft);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await connectIcs(url, provider, name);
      onOpenChange(false);
      setUrl("");
      setName("");
      useUI.getState().toast({
        message: `Connected · ${r.events} events${r.suggestions ? ` · ${r.suggestions} new ${r.suggestions === 1 ? "suggestion" : "suggestions"}` : ""}`,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Connect a calendar" description="Domaxing reads your events (never changes them) to suggest preparation before you need it." className="sm:max-w-lg">
        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4">
          <div className="grid grid-cols-4 gap-1.5">
            {PROVIDERS.map((x) => (
              <button
                key={x.id}
                onClick={() => { setProvider(x.id); setError(null); }}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[12.5px] font-medium transition-all",
                  provider === x.id ? "bg-accent-soft text-accent ring-1 ring-accent/30" : "bg-sunken text-muted hover:text-fg",
                )}
              >
                <span className="grid size-6 place-items-center">{x.icon}</span>
                {x.label}
              </button>
            ))}
          </div>

          {oauth && (
            <>
              <Button variant="primary" size="lg" className="w-full" onClick={() => startOAuth(provider as "google" | "outlook").catch((e) => setError(e.message))}>
                Sign in with {provider === "google" ? "Google" : "Microsoft"}
              </Button>
              <div className="flex items-center gap-3 text-xs text-faint">
                <span className="h-px flex-1 bg-line" /> or use a calendar link <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <ol className="flex flex-col gap-1.5 rounded-2xl bg-sunken p-3.5 text-[13px] leading-relaxed text-fg/80">
            {p.steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-px grid size-[18px] shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>

          <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); connect(); }}>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or webcal://…" aria-label="Calendar link" required autoComplete="off" />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Name (optional), e.g. “${provider === "apple" ? "Family" : "Work"}”`} aria-label="Calendar name" />
            {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
            <Button type="submit" variant={oauth ? "outline" : "primary"} size="lg" disabled={busy || !url.trim()} className="w-full">
              {busy ? <Loader2 className="size-4 animate-spin-slow" /> : <CalendarCheck2 className="size-4" />}
              {busy ? "Reading your calendar…" : "Connect calendar"}
            </Button>
          </form>
          <p className="text-xs leading-relaxed text-faint">
            The link is stored on the server only and is never shown in the app again. Calendars refresh every 30 minutes.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Signed-out prompt ----------------
export function AssistantSignIn() {
  return (
    <div className="glass flex flex-col items-center rounded-[24px] px-6 py-10 text-center animate-rise-in">
      <Orb kind="other" size={56} />
      <h3 className="mt-4 text-[17px] font-semibold tracking-tight">Your proactive planner</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
        Connect Google, Outlook or iCloud and Domaxing spots exams, trips, meetings and birthdays ahead of time, then proposes a plan you can approve in one tap.
      </p>
      <div className="mt-5">
        {cloudEnabled ? (
          <Button variant="primary" onClick={() => useUI.getState().setAuthOpen(true)}>
            Sign in to get started <Wand2 className="size-4" />
          </Button>
        ) : (
          <p className="text-xs text-faint">Enable cloud sync first (see Settings → Sync).</p>
        )}
      </div>
    </div>
  );
}

