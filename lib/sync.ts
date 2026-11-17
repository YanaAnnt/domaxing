"use client";

import { create } from "zustand";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { cloudEnabled, getSupabase } from "./supabase";
import { appUrl } from "./utils";
import { useData } from "./store";
import type { Category, List, SyncTable, Task } from "./types";

export type SyncStatus = "local" | "signed-out" | "connecting" | "syncing" | "synced" | "offline" | "error";

interface SyncState {
  status: SyncStatus;
  error: string | null;
  user: { id: string; email: string | null } | null;
  lastSyncedAt: string | null;
  ready: boolean; // auth state resolved
  recovery: boolean; // user arrived via password-reset link
}

export const useSync = create<SyncState>(() => ({
  status: cloudEnabled ? "connecting" : "local",
  error: null,
  user: null,
  lastSyncedAt: null,
  ready: !cloudEnabled,
  recovery: false,
}));

const TABLES: SyncTable[] = ["categories", "lists", "tasks"];
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

// ---------- row mapping (camelCase <-> snake_case) ----------
type Row = Record<string, unknown>;

function toRow(table: SyncTable, r: Category | List | Task): Row {
  const base = { id: r.id, created_at: r.createdAt, updated_at: r.updatedAt, deleted: !!r.deleted };
  if (table === "categories") {
    const c = r as Category;
    return { ...base, name: c.name, color: c.color, icon: c.icon, order: c.order, collapsed: c.collapsed };
  }
  if (table === "lists") {
    const l = r as List;
    return { ...base, category_id: l.categoryId, name: l.name, order: l.order, sections: l.sections ?? [] };
  }
  const t = r as Task;
  return {
    ...base,
    title: t.title, notes: t.notes, category_id: t.categoryId, list_id: t.listId,
    due_date: t.dueDate, due_time: t.dueTime, priority: t.priority, subtasks: t.subtasks,
    recurrence: t.recurrence, reminder_at: t.reminderAt, tags: t.tags, completed: t.completed,
    completed_at: t.completedAt, order: t.order,
    section_id: t.sectionId ?? null, event_key: t.eventKey ?? null, source: t.source ?? null,
  };
}

function fromRow(table: SyncTable, row: Row): Category | List | Task {
  const base = {
    id: row.id as string,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    deleted: !!row.deleted,
  };
  if (table === "categories")
    return {
      ...base, name: row.name as string, color: row.color as string, icon: row.icon as string,
      order: Number(row.order), collapsed: !!row.collapsed,
    } satisfies Category;
  if (table === "lists")
    return {
      ...base, categoryId: row.category_id as string, name: row.name as string, order: Number(row.order),
      sections: (row.sections as List["sections"]) ?? [],
    } satisfies List;
  return {
    ...base,
    title: row.title as string,
    notes: (row.notes as string) ?? "",
    categoryId: (row.category_id as string) ?? null,
    listId: (row.list_id as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
    dueTime: (row.due_time as string) ?? null,
    priority: Number(row.priority ?? 0) as Task["priority"],
    subtasks: (row.subtasks as Task["subtasks"]) ?? [],
    recurrence: (row.recurrence as Task["recurrence"]) ?? null,
    reminderAt: iso(row.reminder_at),
    tags: (row.tags as string[]) ?? [],
    completed: !!row.completed,
    completedAt: iso(row.completed_at),
    order: Number(row.order ?? 0),
    sectionId: (row.section_id as string) ?? null,
    eventKey: (row.event_key as string) ?? null,
    source: (row.source as string) ?? null,
  } satisfies Task;
}

// ---------- engine ----------
let started = false;
let channel: RealtimeChannel | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let busy = false;
let again = false;
let currentUserId: string | null = null;

const setStatus = (status: SyncStatus, error: string | null = null) => useSync.setState({ status, error });

async function pullAll(since: string | null) {
  const sb = getSupabase()!;
  let cursor = since;
  const results: Record<SyncTable, Row[]> = { categories: [], lists: [], tasks: [] };
  for (const table of TABLES) {
    let from = 0;
    const page = 1000;
    for (;;) {
      let q = sb.from(table).select("*").order("server_updated_at", { ascending: true }).range(from, from + page - 1);
      if (since) q = q.gt("server_updated_at", since);
      const { data, error } = await q;
      if (error) throw error;
      results[table].push(...(data ?? []));
      for (const r of data ?? []) {
        const s = r.server_updated_at as string;
        if (!cursor || new Date(s) > new Date(cursor)) cursor = new Date(s).toISOString();
      }
      if (!data || data.length < page) break;
      from += page;
    }
  }
  return { results, cursor };
}

async function push() {
  const sb = getSupabase()!;
  const { dirty } = useData.getState();
  const entries = Object.entries(dirty);
  if (!entries.length) return;
  const state = useData.getState();
  const byTable: Record<SyncTable, { rows: Row[]; keys: { key: string; updatedAt: string }[] }> = {
    categories: { rows: [], keys: [] }, lists: { rows: [], keys: [] }, tasks: { rows: [], keys: [] },
  };
  for (const [k, updatedAt] of entries) {
    const [table, id] = k.split(":") as [SyncTable, string];
    const rec = (state[table] as Record<string, Category | List | Task>)[id];
    if (!rec) {
      byTable[table].keys.push({ key: k, updatedAt });
      continue;
    }
    byTable[table].rows.push(toRow(table, rec));
    byTable[table].keys.push({ key: k, updatedAt });
  }
  for (const table of TABLES) {
    const { rows, keys } = byTable[table];
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: "id" });
      if (error) throw error;
    }
    if (keys.length) useData.getState().markClean(keys);
  }
}

/** Push pending local changes, then pull remote changes. Safe to call often. */
export async function syncNow() {
  if (!cloudEnabled || !currentUserId) return;
  if (busy) {
    again = true;
    return;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setStatus("offline");
    return;
  }
  busy = true;
  setStatus("syncing");
  try {
    await push();
    const { results, cursor } = await pullAll(useData.getState().lastPulledAt);
    const d = useData.getState();
    for (const t of TABLES) d.applyRemote(t, results[t].map((r) => fromRow(t, r)));
    if (cursor) d.setLastPulledAt(cursor);
    useSync.setState({ status: "synced", error: null, lastSyncedAt: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Sync failed";
    setStatus(navigator.onLine ? "error" : "offline", msg);
    console.warn("[tidy] sync error", e);
  } finally {
    busy = false;
    if (again) {
      again = false;
      setTimeout(syncNow, 50);
    }
  }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 700);
}

function subscribeRealtime(userId: string) {
  const sb = getSupabase()!;
  if (channel) sb.removeChannel(channel);
  channel = sb.channel(`tidy-${userId}`);
  for (const table of TABLES) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as Row;
        if (row && row.id) useData.getState().applyRemote(table, [fromRow(table, row)]);
      },
    );
  }
  channel.subscribe();
}

async function onSignedIn(user: User) {
  if (currentUserId === user.id) return;
  currentUserId = user.id;
  useSync.setState({ user: { id: user.id, email: user.email ?? null }, ready: true });
  const d = useData.getState();
  setStatus("syncing");
  try {
    if (d.ownerId && d.ownerId !== user.id) {
      // a different account was used on this device before, so start clean
      d.resetLocal(false);
    } else if (!d.ownerId) {
      // first sign-in on this device: merge local data into the account
      const { results } = await pullAll(null);
      const remoteHasData = TABLES.some((t) => results[t].length > 0);
      if (remoteHasData && d.pristine) d.resetLocal(false);
      else d.markAllDirty();
    }
    useData.getState().setOwner(user.id);
  } catch (e) {
    console.warn("[tidy] initial sync error", e);
  }
  subscribeRealtime(user.id);
  await syncNow();
}

function onSignedOut() {
  const sb = getSupabase();
  if (channel && sb) sb.removeChannel(channel);
  channel = null;
  const wasSignedIn = currentUserId !== null;
  currentUserId = null;
  useSync.setState({ user: null, status: "signed-out", ready: true });
  if (wasSignedIn || useData.getState().ownerId) {
    // keep this device's copy private once signed out
    useData.getState().setOwner(null);
    useData.getState().resetLocal(false);
  }
}

export function startSync() {
  if (started || !cloudEnabled) return;
  started = true;
  const sb = getSupabase()!;

  sb.auth.getSession().then(({ data }) => {
    if (data.session?.user) onSignedIn(data.session.user);
    else onSignedOut();
  });
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") useSync.setState({ recovery: true });
    if (session?.user) onSignedIn(session.user);
    else if (event === "SIGNED_OUT") onSignedOut();
  });

  // push soon after any local change
  useData.subscribe((s, prev) => {
    if (s.dirty !== prev.dirty && Object.keys(s.dirty).length && currentUserId) schedulePush();
  });

  window.addEventListener("online", () => syncNow());
  window.addEventListener("offline", () => setStatus("offline"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncNow();
  });
  window.addEventListener("focus", () => syncNow());
  pollTimer = setInterval(() => document.visibilityState === "visible" && syncNow(), 60_000);
}

// ---------- auth helpers ----------
export async function signIn(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Cloud sync is not configured");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Cloud sync is not configured");
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: appUrl() },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function sendReset(email: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Cloud sync is not configured");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Cloud sync is not configured");
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
  useSync.setState({ recovery: false });
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await syncNow();
  await sb.auth.signOut();
}

export function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
}
