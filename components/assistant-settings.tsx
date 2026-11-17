"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, BellRing, CalendarPlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUI } from "@/lib/ui-store";
import {
  disablePush, disconnectCalendar, enablePush, pushSupported, savePrefs, testPush, useAssistant,
  type AssistantPrefs,
} from "@/lib/assistant";
import { Button, Segmented } from "./ui/primitives";
import { CalendarConnectDialog, CATEGORY_META, Orb } from "./assistant-ui";

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-faint">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[44px] rounded-full transition-colors ${checked ? "bg-success" : "bg-line-strong"}`}
    >
      <span className={`absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : ""}`} />
    </button>
  );
}

const TimeInput = ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => (
  <input
    type="time"
    value={value}
    aria-label={label}
    onChange={(e) => e.target.value && onChange(e.target.value)}
    className="h-8 rounded-lg bg-sunken px-2 text-sm outline-none focus:ring-2 focus:ring-accent/25"
  />
);

const NumberInput = ({ value, onChange, min, max, label, suffix }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string; suffix?: string }) => (
  <span className="inline-flex items-center gap-1.5 text-sm text-muted">
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
      className="h-8 w-16 rounded-lg bg-sunken px-2 text-right text-sm text-fg outline-none focus:ring-2 focus:ring-accent/25"
    />
    {suffix}
  </span>
);

export function CalendarsSection() {
  const connections = useAssistant((s) => s.connections);
  const [open, setOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Calendars</h3>
      <div className="flex flex-col gap-1.5">
        {connections.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-sunken px-3 py-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-[12px] font-bold uppercase text-accent">
              {c.provider === "google" ? "G" : c.provider === "outlook" ? "O" : c.provider === "apple" ? "" : "•"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.name}</div>
              <div className={cn("truncate text-xs", c.status === "error" ? "text-danger" : "text-muted")}>
                {c.status === "error" ? (
                  <span className="inline-flex items-center gap-1"><AlertTriangle className="size-3" /> {c.error}</span>
                ) : c.last_synced_at ? (
                  `${c.account_email ? c.account_email + " · " : ""}synced ${formatDistanceToNow(new Date(c.last_synced_at), { addSuffix: true })}`
                ) : (
                  "Syncing…"
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Disconnect ${c.name}`}
              disabled={removing === c.id}
              onClick={async () => {
                setRemoving(c.id);
                try {
                  await disconnectCalendar(c.id);
                  useUI.getState().toast({ message: `Disconnected ${c.name}` });
                } catch (e) {
                  useUI.getState().toast({ message: (e as Error).message, tone: "error" });
                } finally {
                  setRemoving(null);
                }
              }}
            >
              {removing === c.id ? <Loader2 className="size-3.5 animate-spin-slow" /> : <Trash2 className="size-3.5" />}
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
          <CalendarPlus className="size-3.5" /> Connect Google, Outlook or iCloud
        </Button>
      </div>
      <CalendarConnectDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}

const CATS: (keyof AssistantPrefs["prep"])[] = ["exam", "travel", "meeting", "birthday", "deadline"];

export function AssistantSection() {
  const prefs = useAssistant((s) => s.prefs);
  const config = useAssistant((s) => s.config);
  if (!prefs) return null;
  const setPrep = (k: keyof AssistantPrefs["prep"], patch: Partial<{ enabled: boolean; leadDays: number }>) =>
    savePrefs({ prep: { ...prefs.prep, [k]: { ...prefs.prep[k], ...patch } } });

  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Assistant</h3>
      <Row
        label="AI planning"
        hint={config?.ai ? "Claude writes personalised plans, briefings and breakdowns" : "No AI key on the server yet, so smart rules are used instead"}
      >
        <Toggle label="AI planning" checked={prefs.ai_enabled} onChange={(v) => savePrefs({ ai_enabled: v })} />
      </Row>
      <div className="mb-1 mt-3 text-xs font-medium text-muted">Prepare ahead for</div>
      <div className="flex flex-col">
        {CATS.map((k) => (
          <div key={k} className="flex min-h-11 items-center gap-3 border-b border-line py-1 last:border-0">
            <Orb kind={k} size={26} />
            <span className="flex-1 text-sm">{CATEGORY_META[k].label}s</span>
            {prefs.prep[k].enabled && (
              <NumberInput label={`${k} lead days`} value={prefs.prep[k].leadDays} min={1} max={60} onChange={(v) => setPrep(k, { leadDays: v })} suffix="days before" />
            )}
            <Toggle label={`Prepare for ${k}`} checked={prefs.prep[k].enabled} onChange={(v) => setPrep(k, { enabled: v })} />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Row label="Focus sessions" hint="Length of study / deep-work blocks">
          <NumberInput label="Session minutes" value={prefs.study_minutes} min={15} max={240} onChange={(v) => savePrefs({ study_minutes: v })} suffix="min" />
        </Row>
        <Row label="Best time for focused work">
          <Segmented
            value={prefs.work_time}
            onChange={(v) => savePrefs({ work_time: v })}
            options={[{ value: "morning", label: "Morning" }, { value: "afternoon", label: "Afternoon" }, { value: "evening", label: "Evening" }]}
          />
        </Row>
      </div>
    </section>
  );
}

export function NotificationsSection() {
  const prefs = useAssistant((s) => s.prefs);
  const pushEnabled = useAssistant((s) => s.pushEnabled);
  const [busy, setBusy] = React.useState(false);
  const supported = pushSupported();
  if (!prefs) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (pushEnabled) await disablePush();
      else {
        const err = await enablePush();
        if (err) useUI.getState().toast({ message: err, tone: "error" });
        else useUI.getState().toast({ message: "Notifications on for this device" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Notifications</h3>
      <Row
        label="Push on this device"
        hint={supported ? "Reminders arrive even when Domaxing is closed" : "On iPhone, add Domaxing to your Home Screen first (Share → Add to Home Screen)"}
      >
        <div className="flex items-center gap-2">
          {pushEnabled && (
            <Button variant="ghost" size="sm" onClick={() => testPush().then((r) => useUI.getState().toast({ message: r.delivered ? "Test sent" : "No device received it" }))}>
              <BellRing className="size-3.5" /> Test
            </Button>
          )}
          {busy ? <Loader2 className="size-4 animate-spin-slow text-muted" /> : <Toggle label="Push notifications" checked={pushEnabled} onChange={() => supported && toggle()} />}
        </div>
      </Row>
      <Row label="Daily briefing" hint="A calm summary of your day">
        <div className="flex items-center gap-2">
          {prefs.briefing_enabled && <TimeInput label="Briefing time" value={prefs.briefing_time} onChange={(v) => savePrefs({ briefing_time: v })} />}
          <Toggle label="Daily briefing" checked={prefs.briefing_enabled} onChange={(v) => savePrefs({ briefing_enabled: v })} />
        </div>
      </Row>
      <Row label="Nudge before timed tasks">
        <Segmented
          value={prefs.default_reminder_minutes}
          onChange={(v) => savePrefs({ default_reminder_minutes: v })}
          options={[{ value: 0, label: "Off" }, { value: 10, label: "10m" }, { value: 30, label: "30m" }, { value: 60, label: "1h" }]}
        />
      </Row>
      <Row label="Quiet hours" hint="No proactive nudges (task reminders still arrive)">
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <TimeInput label="Quiet from" value={prefs.quiet_start} onChange={(v) => savePrefs({ quiet_start: v })} />-
          <TimeInput label="Quiet until" value={prefs.quiet_end} onChange={(v) => savePrefs({ quiet_end: v })} />
        </span>
      </Row>
      <Row label="Proactive nudges per day" hint="Briefing and new-suggestion alerts">
        <NumberInput label="Max per day" value={prefs.max_daily_push} min={0} max={20} onChange={(v) => savePrefs({ max_daily_push: v })} />
      </Row>
    </section>
  );
}
