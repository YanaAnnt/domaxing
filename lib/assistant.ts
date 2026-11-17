"use client";

// Client side of the assistant: calendar connections & events, AI suggestions (approve / edit / dismiss),
// daily briefing, task breakdown, preferences and push notifications. Talks to the `tidy` edge function.
import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { appUrl, withBase } from "./utils";
import { useSync } from "./sync";
import { useData } from "./store";
import { useUI } from "./ui-store";
import { addDaysKey } from "./dates";
import type { Priority } from "./types";

export type PrepCategory = "exam" | "travel" | "meeting" | "birthday" | "deadline" | "other";

export interface DraftTask {
  title: string;
  notes: string;
  dueDate: string;
  dueTime: string | null;
  priority: Priority;
  subtasks: string[];
  reminder: boolean;
}

export interface Suggestion {
  id: string;
  kind: "prep" | "reschedule" | "cleanup";
  category: PrepCategory | null;
  title: string;
  reason: string | null;
  event_key: string | null;
  event_title: string | null;
  event_start: string | null;
  payload: { tasks?: DraftTask[]; shiftDays?: number };
  status: "pending" | "approved" | "dismissed" | "expired";
  source: "ai" | "rules";
  created_at: string;
}

export interface CalEvent {
  id: string;
  event_key: string;
  connection_id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  status: string;
}

export interface CalConnection {
  id: string;
  provider: "google" | "outlook" | "apple" | "ics";
  kind: "ics" | "oauth";
  name: string;
  color: string;
  account_email: string | null;
  status: string;
  error: string | null;
  last_synced_at: string | null;
}

export interface AssistantPrefs {
  timezone: string;
  briefing_enabled: boolean;
  briefing_time: string;
  quiet_start: string;
  quiet_end: string;
  max_daily_push: number;
  default_reminder_minutes: number;
  study_minutes: number;
  work_time: "morning" | "afternoon" | "evening";
  prep: Record<Exclude<PrepCategory, "other">, { enabled: boolean; leadDays: number }>;
  ai_enabled: boolean;
}

export interface Briefing {
  headline: string;
  body: string;
  source: "ai" | "rules";
  stats: { events: number; due: number; overdue: number; suggestions: number };
}

interface ServerConfig {
  ai: boolean;
  google: boolean;
  microsoft: boolean;
  vapidPublicKey: string | null;
}

interface AssistantState {
  ready: boolean;
  config: ServerConfig | null;
  suggestions: Suggestion[];
  events: CalEvent[];
  connections: CalConnection[];
  prefs: AssistantPrefs | null;
  briefing: Briefing | null;
  briefingLoading: boolean;
  syncing: boolean;
  pushEnabled: boolean;
}

export const useAssistant = create<AssistantState>(() => ({
  ready: false,
  config: null,
  suggestions: [],
  events: [],
  connections: [],
  prefs: null,
  briefing: null,
  briefingLoading: false,
  syncing: false,
  pushEnabled: false,
}));

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// ---------------- server calls ----------------
export async function callTidy<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const sb = getSupabase();
  if (!sb) throw new Error("Cloud sync isn't configured.");
  const { data, error } = await sb.functions.invoke("tidy", { body: { action, ...body } });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        if (j?.error) message = j.error;
      } catch {
        /* keep default */
      }
    }
    throw new Error(message);
  }
  return data as T;
}

// ---------------- loading & realtime ----------------
let channel: RealtimeChannel | null = null;
let started = false;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

async function loadSuggestions() {
  const sb = getSupabase()!;
  const { data } = await sb
    .from("ai_suggestions")
    .select("id, kind, category, title, reason, event_key, event_title, event_start, payload, status, source, created_at")
    .eq("status", "pending")
    .order("event_start", { ascending: true })
    .limit(100);
  useAssistant.setState({ suggestions: (data ?? []) as Suggestion[] });
}

async function loadEvents() {
  const sb = getSupabase()!;
  const from = new Date(Date.now() - 86400000).toISOString();
  const to = new Date(Date.now() + 60 * 86400000).toISOString();
  const { data } = await sb
    .from("calendar_events")
    .select("id, event_key, connection_id, title, location, starts_at, ends_at, all_day, status")
    .eq("status", "confirmed")
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at")
    .limit(1500);
  useAssistant.setState({ events: (data ?? []) as CalEvent[] });
}

async function loadConnections() {
  const sb = getSupabase()!;
  const { data } = await sb
    .from("calendar_connections")
    .select("id, provider, kind, name, color, account_email, status, error, last_synced_at")
    .order("created_at");
  useAssistant.setState({ connections: (data ?? []) as CalConnection[] });
}

async function loadPrefs() {
  const sb = getSupabase()!;
  const { data } = await sb.from("user_prefs").select("*").maybeSingle();
  if (!data) {
    const { data: created } = await sb.from("user_prefs").insert({ timezone: deviceTz() }).select("*").single();
    useAssistant.setState({ prefs: created as AssistantPrefs });
    return;
  }
  // Keep the server's timezone in step with the device (e.g. after travelling).
  if (data.timezone !== deviceTz()) {
    await sb.from("user_prefs").update({ timezone: deviceTz(), updated_at: new Date().toISOString() }).eq("user_id", data.user_id);
    data.timezone = deviceTz();
  }
  useAssistant.setState({ prefs: data as AssistantPrefs });
}

export async function loadBriefing(force = false) {
  useAssistant.setState({ briefingLoading: true });
  try {
    const b = await callTidy<Briefing>("briefing", { force });
    useAssistant.setState({ briefing: b });
  } catch (e) {
    console.warn("[assistant] briefing", e);
  } finally {
    useAssistant.setState({ briefingLoading: false });
  }
}

async function loadPushState() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    useAssistant.setState({ pushEnabled: !!sub });
  } catch {
    useAssistant.setState({ pushEnabled: false });
  }
}

export async function reloadAssistant() {
  if (!useSync.getState().user) return;
  await Promise.allSettled([loadSuggestions(), loadEvents(), loadConnections(), loadPrefs(), loadPushState()]);
  useAssistant.setState({ ready: true });
}

function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    loadSuggestions();
    loadEvents();
    loadConnections();
  }, 400);
}

function subscribe(userId: string) {
  const sb = getSupabase()!;
  if (channel) sb.removeChannel(channel);
  channel = sb
    .channel(`tidy-assistant-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "ai_suggestions", filter: `user_id=eq.${userId}` }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events", filter: `user_id=eq.${userId}` }, scheduleReload)
    .subscribe();
}

/** Starts/stops assistant data loading as the user signs in and out. */
export function startAssistant() {
  if (started) return;
  started = true;
  let current: string | null = null;
  const onUser = async (userId: string | null) => {
    if (userId === current) return;
    current = userId;
    if (!userId) {
      const sb = getSupabase();
      if (channel && sb) sb.removeChannel(channel);
      channel = null;
      useAssistant.setState({ ready: false, suggestions: [], events: [], connections: [], prefs: null, briefing: null, config: null });
      return;
    }
    subscribe(userId);
    await reloadAssistant();
    callTidy<ServerConfig>("config").then((config) => useAssistant.setState({ config })).catch(() => {});
    loadBriefing(false);
  };
  onUser(useSync.getState().user?.id ?? null);
  useSync.subscribe((s, prev) => {
    if (s.user?.id !== prev.user?.id) onUser(s.user?.id ?? null);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && current) scheduleReload();
  });

  // Return from Google / Microsoft sign-in
  const h = window.location.hash;
  if (h.includes("calendar=connected")) useUI.getState().toast({ message: "Calendar connected. Looking for things to prepare…" });
  const err = h.match(/calendar_error=([^&]+)/);
  if (err) useUI.getState().toast({ message: `Calendar: ${decodeURIComponent(err[1])}`, tone: "error" });
}

// ---------------- suggestions ----------------
const CATEGORY_HINTS: Record<string, RegExp> = {
  exam: /uni|school|study|college|course|class|academ/i,
  travel: /travel|trip|personal|life/i,
  meeting: /work|job|office|career|business/i,
  birthday: /personal|family|friend|life|social/i,
  deadline: /work|uni|school|study/i,
  other: /personal|life/i,
};

/** Best guess for where a suggestion's tasks should live (the user can change it before approving). */
export function suggestTarget(s: Suggestion): { listId: string | null; categoryId: string | null } {
  const cats = Object.values(useData.getState().categories).filter((c) => !c.deleted).sort((a, b) => a.order - b.order);
  const rx = CATEGORY_HINTS[s.category ?? "other"];
  const c = cats.find((x) => rx?.test(x.name));
  return { listId: null, categoryId: c?.id ?? null };
}

function reminderIso(t: DraftTask): string | null {
  if (!t.reminder) return null;
  const [h, m] = (t.dueTime ?? "09:00").split(":").map(Number);
  const [y, mo, d] = t.dueDate.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m).toISOString();
}

async function decide(s: Suggestion, status: Suggestion["status"], payload?: Suggestion["payload"]) {
  const sb = getSupabase()!;
  useAssistant.setState((st) => ({ suggestions: st.suggestions.filter((x) => x.id !== s.id) }));
  const { error } = await sb
    .from("ai_suggestions")
    .update({ status, decided_at: new Date().toISOString(), ...(payload ? { payload } : {}) })
    .eq("id", s.id);
  if (error) {
    useUI.getState().toast({ message: `Couldn't save that decision: ${error.message}`, tone: "error" });
    loadSuggestions();
  }
}

/** Creates the approved tasks locally (they sync like any other task) and marks the suggestion approved. */
export async function approveSuggestion(
  s: Suggestion,
  edited?: { tasks: DraftTask[]; target: { listId: string | null; categoryId: string | null } },
) {
  const data = useData.getState();
  const ui = useUI.getState();

  if (s.kind === "prep") {
    const tasks = edited?.tasks ?? s.payload.tasks ?? [];
    const target = edited?.target ?? suggestTarget(s);
    const ids: string[] = [];
    for (const t of tasks) {
      const created = data.addTask({
        title: t.title,
        notes: t.notes,
        dueDate: t.dueDate,
        dueTime: t.dueTime,
        priority: t.priority,
        subtasks: t.subtasks.map((title) => ({ id: crypto.randomUUID(), title, done: false })),
        reminderAt: reminderIso(t),
        listId: target.listId,
        categoryId: target.categoryId,
        eventKey: s.event_key,
        source: s.source,
      });
      ids.push(created.id);
    }
    await decide(s, "approved", { ...s.payload, tasks });
    ui.toast({
      message: `Added ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`,
      actionLabel: "Undo",
      onAction: () => ids.forEach((id) => useData.getState().deleteTask(id)),
    });
    return;
  }

  const linked = Object.values(data.tasks).filter((t) => !t.deleted && !t.completed && t.eventKey && t.eventKey === s.event_key);
  if (s.kind === "reschedule") {
    const shift = s.payload.shiftDays ?? 0;
    const before = linked.map((t) => ({ id: t.id, dueDate: t.dueDate }));
    for (const t of linked) if (t.dueDate) data.updateTask(t.id, { dueDate: addDaysKey(t.dueDate, shift) });
    await decide(s, "approved");
    ui.toast({
      message: `Moved ${linked.length} ${linked.length === 1 ? "task" : "tasks"}`,
      actionLabel: "Undo",
      onAction: () => before.forEach((b) => useData.getState().updateTask(b.id, { dueDate: b.dueDate })),
    });
  } else if (s.kind === "cleanup") {
    for (const t of linked) data.deleteTask(t.id);
    await decide(s, "approved");
    ui.toast({
      message: `Removed ${linked.length} ${linked.length === 1 ? "task" : "tasks"}`,
      actionLabel: "Undo",
      onAction: () => linked.forEach((t) => useData.getState().restoreTask(t.id)),
    });
  }
}

export async function dismissSuggestion(s: Suggestion) {
  await decide(s, "dismissed");
  useUI.getState().toast({
    message: "Suggestion dismissed",
    actionLabel: "Undo",
    onAction: async () => {
      await getSupabase()!.from("ai_suggestions").update({ status: "pending", decided_at: null }).eq("id", s.id);
      loadSuggestions();
    },
  });
}

// ---------------- calendars ----------------
export async function connectIcs(url: string, provider: CalConnection["provider"], name: string) {
  const r = await callTidy<{ events: number; suggestions: number }>("connect_ics", { url, provider, name });
  await reloadAssistant();
  return r;
}

export async function disconnectCalendar(id: string) {
  await callTidy("disconnect", { id });
  await reloadAssistant();
}

export async function syncCalendars(replan = false) {
  useAssistant.setState({ syncing: true });
  try {
    const r = await callTidy<{ suggestions: number; aiError?: string; calendars: { error?: string }[] }>("sync", { replan });
    await reloadAssistant();
    return r;
  } finally {
    useAssistant.setState({ syncing: false });
  }
}

export async function startOAuth(provider: "google" | "outlook") {
  const returnTo = appUrl();
  const { url } = await callTidy<{ url: string }>("oauth_start", { provider, returnTo });
  window.location.href = url;
}

// ---------------- prefs ----------------
export async function savePrefs(patch: Partial<AssistantPrefs>) {
  const prev = useAssistant.getState().prefs;
  if (!prev) return;
  useAssistant.setState({ prefs: { ...prev, ...patch } });
  const sb = getSupabase()!;
  const { error } = await sb.from("user_prefs").update({ ...patch, updated_at: new Date().toISOString() }).eq("user_id", useSync.getState().user!.id);
  if (error) {
    useAssistant.setState({ prefs: prev });
    useUI.getState().toast({ message: `Couldn't save: ${error.message}`, tone: "error" });
  }
}

// ---------------- AI helpers ----------------
export async function breakDownTask(t: { title: string; notes: string; existing: string[]; dueDate: string | null }) {
  return callTidy<{ subtasks: string[]; tip: string }>("breakdown", t);
}

// ---------------- push notifications ----------------
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function enablePush(): Promise<string | null> {
  if (!pushSupported()) return "This browser can't receive push notifications. On iPhone, add Domaxing to your Home Screen first.";
  const key = useAssistant.getState().config?.vapidPublicKey ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return "Push isn't configured on the server.";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Notifications were not allowed.";
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) reg = await navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/") });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  const j = sub.toJSON();
  const { error } = await getSupabase()!.from("push_subscriptions").upsert(
    { endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: "endpoint" },
  );
  if (error) return error.message;
  useAssistant.setState({ pushEnabled: true });
  return null;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await getSupabase()!.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
  useAssistant.setState({ pushEnabled: false });
}

export async function testPush() {
  return callTidy<{ delivered: number }>("test_push");
}
