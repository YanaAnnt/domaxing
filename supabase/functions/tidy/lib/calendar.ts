// Calendar connections: ICS feeds (Google, Outlook, iCloud, any), Google OAuth, Microsoft OAuth.
// Syncs events into calendar_events and raises "smart reschedule" suggestions when events move or disappear.
import { admin, secret, SUPABASE_URL } from "./db.ts";
import { parseIcs, type RawEvent } from "./ics.ts";
import { dateKeyIn, diffDays, zonedToUtc } from "./time.ts";

export interface Connection {
  id: string;
  user_id: string;
  provider: "google" | "outlook" | "apple" | "ics";
  kind: "ics" | "oauth";
  name: string;
  ics_url: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

export const SYNC_PAST_DAYS = 1;
export const SYNC_FUTURE_DAYS = 60;

// ---------------- ICS ----------------
export function normalizeIcsUrl(input: string): URL {
  const raw = input.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a calendar link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Calendar links must start with https:// or webcal://");
  const h = url.hostname.toLowerCase();
  if (
    h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127|10|0)\./.test(h) ||
    /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === "[::1]"
  ) throw new Error("Private network addresses are not allowed.");
  return url;
}

export async function fetchIcs(urlStr: string): Promise<string> {
  const url = normalizeIcsUrl(urlStr);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "text/calendar, */*" }, redirect: "follow" });
    if (!res.ok) throw new Error(`The calendar server answered ${res.status}. Check that the link is the secret/public iCal address.`);
    const text = await res.text();
    if (text.length > 8_000_000) throw new Error("This calendar feed is too large.");
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That link didn't return an iCal calendar.");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- OAuth ----------------
export const OAUTH_REDIRECT = `${SUPABASE_URL}/functions/v1/tidy/oauth/callback`;

export async function oauthConfig() {
  const [gid, gsec, mid, msec] = await Promise.all([
    secret("google_client_id"), secret("google_client_secret"), secret("microsoft_client_id"), secret("microsoft_client_secret"),
  ]);
  return { google: gid && gsec ? { id: gid, secret: gsec } : null, microsoft: mid && msec ? { id: mid, secret: msec } : null };
}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(data: string): Promise<string> {
  const key = (await secret("oauth_state_secret")) ?? (await secret("cron_secret"));
  if (!key) throw new Error("Server secret missing");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}

export async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, t: Date.now() })));
  return `${body}.${await hmac(body)}`;
}

export async function verifyState(state: string): Promise<{ u: string; p: "google" | "outlook"; r: string; t: number }> {
  const [body, sig] = state.split(".");
  if (!body || !sig || (await hmac(body)) !== sig) throw new Error("Invalid sign-in state");
  const json = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
  if (Date.now() - json.t > 15 * 60_000) throw new Error("Sign-in link expired, please try again");
  return json;
}

export async function oauthStartUrl(provider: "google" | "outlook", userId: string, returnTo: string): Promise<string> {
  const cfg = await oauthConfig();
  const state = await signState({ u: userId, p: provider, r: returnTo });
  if (provider === "google") {
    if (!cfg.google) throw new Error("Google sign-in isn't configured on the server yet.");
    const q = new URLSearchParams({
      client_id: cfg.google.id, redirect_uri: OAUTH_REDIRECT, response_type: "code", access_type: "offline", prompt: "consent",
      scope: "openid email https://www.googleapis.com/auth/calendar.readonly", state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  if (!cfg.microsoft) throw new Error("Microsoft sign-in isn't configured on the server yet.");
  const q = new URLSearchParams({
    client_id: cfg.microsoft.id, redirect_uri: OAUTH_REDIRECT, response_type: "code", response_mode: "query",
    scope: "offline_access User.Read Calendars.Read", state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`;
}

async function tokenRequest(provider: "google" | "outlook", body: Record<string, string>) {
  const cfg = await oauthConfig();
  const c = provider === "google" ? cfg.google : cfg.microsoft;
  if (!c) throw new Error("OAuth not configured");
  const url = provider === "google" ? "https://oauth2.googleapis.com/token" : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? `Token request failed (${res.status})`);
  return json as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
}

export async function oauthFinish(code: string, state: string) {
  const s = await verifyState(state);
  const tok = await tokenRequest(s.p, { code, grant_type: "authorization_code", redirect_uri: OAUTH_REDIRECT });
  let email: string | null = null;
  if (s.p === "google" && tok.id_token) {
    try {
      email = JSON.parse(atob(tok.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email ?? null;
    } catch { /* ignore */ }
  }
  if (s.p === "outlook") {
    const me = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
    email = me.mail ?? me.userPrincipalName ?? null;
  }
  const { data, error } = await admin.from("calendar_connections").insert({
    user_id: s.u,
    provider: s.p,
    kind: "oauth",
    name: s.p === "google" ? "Google Calendar" : "Outlook Calendar",
    account_email: email,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? null,
    token_expires_at: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(),
    status: "pending",
  }).select("*").single();
  if (error) throw error;
  return { connection: data as Connection, returnTo: s.r };
}

async function accessToken(c: Connection): Promise<string> {
  if (c.access_token && c.token_expires_at && new Date(c.token_expires_at) > new Date()) return c.access_token;
  if (!c.refresh_token) throw new Error("Calendar access expired, please reconnect.");
  const tok = await tokenRequest(c.provider as "google" | "outlook", { refresh_token: c.refresh_token, grant_type: "refresh_token" });
  const patch = {
    access_token: tok.access_token,
    token_expires_at: new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString(),
    ...(tok.refresh_token ? { refresh_token: tok.refresh_token } : {}),
  };
  await admin.from("calendar_connections").update(patch).eq("id", c.id);
  Object.assign(c, patch);
  return tok.access_token;
}

const zonedMidnight = (k: string, tz: string) => zonedToUtc(k, "00:00", tz);

async function fetchGoogle(c: Connection, from: Date, to: Date, tz: string): Promise<RawEvent[]> {
  const token = await accessToken(c);
  const out: RawEvent[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250", showDeleted: "true" });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? `Google Calendar error ${res.status}`);
    for (const e of json.items ?? []) {
      const allDay = !!e.start?.date;
      const start = allDay ? zonedMidnight(e.start.date, tz) : new Date(e.start?.dateTime);
      if (isNaN(start.getTime())) continue;
      out.push({
        externalId: e.id,
        title: e.summary ?? "(No title)",
        description: e.description ?? null,
        location: e.location ?? null,
        start,
        end: allDay ? null : e.end?.dateTime ? new Date(e.end.dateTime) : null,
        allDay,
        cancelled: e.status === "cancelled",
      });
    }
    pageToken = json.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return out;
}

async function fetchOutlook(c: Connection, from: Date, to: Date, tz: string): Promise<RawEvent[]> {
  const token = await accessToken(c);
  const out: RawEvent[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$top=200&$select=id,subject,bodyPreview,location,start,end,isAllDay,isCancelled`;
  for (let i = 0; url && i < 10; i++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message ?? `Outlook error ${res.status}`);
    for (const e of json.value ?? []) {
      const allDay = !!e.isAllDay;
      const start = allDay ? zonedMidnight(String(e.start.dateTime).slice(0, 10), tz) : new Date(e.start.dateTime + "Z");
      out.push({
        externalId: e.id,
        title: e.subject ?? "(No title)",
        description: e.bodyPreview ?? null,
        location: e.location?.displayName || null,
        start,
        end: allDay ? null : new Date(e.end.dateTime + "Z"),
        allDay,
        cancelled: !!e.isCancelled,
      });
    }
    url = json["@odata.nextLink"] ?? null;
  }
  return out;
}


// ---------------- sync ----------------
export interface SyncResult {
  count: number;
  moved: number;
  cancelled: number;
}

export async function syncConnection(c: Connection, tz: string): Promise<SyncResult> {
  const now = new Date();
  const from = new Date(now.getTime() - SYNC_PAST_DAYS * 86400000);
  const to = new Date(now.getTime() + SYNC_FUTURE_DAYS * 86400000);
  const syncStart = new Date().toISOString();
  try {
    let raw: RawEvent[];
    if (c.kind === "ics") raw = parseIcs(await fetchIcs(c.ics_url!), from, to, tz);
    else if (c.provider === "google") raw = await fetchGoogle(c, from, to, tz);
    else raw = await fetchOutlook(c, from, to, tz);

    const { data: existingRows } = await admin
      .from("calendar_events")
      .select("event_key, starts_at, status, title")
      .eq("connection_id", c.id);
    const existing = new Map((existingRows ?? []).map((r) => [r.event_key as string, r]));

    const moved: { key: string; title: string; from: string; to: string }[] = [];
    const cancelledKeys: { key: string; title: string; start: string }[] = [];
    const rows = raw.map((e) => {
      const key = `${c.id}:${e.externalId}`;
      const prev = existing.get(key);
      const startIso = e.start.toISOString();
      const changed = prev && prev.status !== "cancelled" && new Date(prev.starts_at as string).getTime() !== e.start.getTime();
      if (changed && !e.cancelled) moved.push({ key, title: e.title, from: prev!.starts_at as string, to: startIso });
      if (e.cancelled && prev && prev.status !== "cancelled") cancelledKeys.push({ key, title: e.title, start: startIso });
      return {
        user_id: c.user_id,
        connection_id: c.id,
        event_key: key,
        title: e.title.slice(0, 500),
        description: e.description,
        location: e.location,
        starts_at: startIso,
        ends_at: e.end?.toISOString() ?? null,
        all_day: e.allDay,
        status: e.cancelled ? "cancelled" : "confirmed",
        prev_starts_at: changed ? (prev!.starts_at as string) : null,
        synced_at: syncStart,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("calendar_events").upsert(rows.slice(i, i + 500), { onConflict: "user_id,event_key" });
      if (error) throw error;
    }

    // Future events that vanished from the feed are treated as cancelled.
    const seen = new Set(rows.map((r) => r.event_key));
    for (const [key, r] of existing) {
      if (seen.has(key) || r.status === "cancelled") continue;
      const start = new Date(r.starts_at as string);
      if (start > now && start < to) cancelledKeys.push({ key, title: r.title as string, start: r.starts_at as string });
    }
    if (cancelledKeys.length) {
      await admin.from("calendar_events").update({ status: "cancelled" }).in("event_key", cancelledKeys.map((x) => x.key)).eq("user_id", c.user_id);
    }
    // Drop events that ended long ago to keep the table small.
    await admin.from("calendar_events").delete().eq("connection_id", c.id).lt("starts_at", new Date(now.getTime() - 14 * 86400000).toISOString());

    await reactToChanges(c.user_id, tz, moved, cancelledKeys);
    await admin.from("calendar_connections").update({ status: "ok", error: null, last_synced_at: syncStart }).eq("id", c.id);
    return { count: rows.length, moved: moved.length, cancelled: cancelledKeys.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("calendar_connections").update({ status: "error", error: msg.slice(0, 300), last_synced_at: syncStart }).eq("id", c.id);
    throw e;
  }
}

/** Smart rescheduling: propose shifting or removing prepared tasks when their event changes. */
async function reactToChanges(
  userId: string,
  tz: string,
  moved: { key: string; title: string; from: string; to: string }[],
  cancelled: { key: string; title: string; start: string }[],
) {
  const keys = [...moved.map((m) => m.key), ...cancelled.map((c) => c.key)];
  if (!keys.length) return;
  const { data: preps } = await admin
    .from("ai_suggestions")
    .select("id, event_key, status, title")
    .eq("user_id", userId)
    .eq("kind", "prep")
    .in("event_key", keys);

  for (const m of moved) {
    const shift = diffDays(dateKeyIn(new Date(m.to), tz), dateKeyIn(new Date(m.from), tz));
    for (const p of (preps ?? []).filter((x) => x.event_key === m.key)) {
      if (p.status === "pending") {
        // Not approved yet: retire it so the planner proposes a fresh plan for the new date.
        await admin.from("ai_suggestions").update({ status: "expired", decided_at: new Date().toISOString() }).eq("id", p.id);
        await admin.from("notification_log").delete().eq("user_id", userId).eq("key", `plan:${m.key}`);
      } else if (p.status === "approved" && shift !== 0) {
        await admin.from("ai_suggestions").upsert(
          {
            user_id: userId,
            dedupe_key: `resched:${m.key}:${m.to}`,
            event_key: m.key,
            kind: "reschedule",
            title: `${m.title} moved ${shift > 0 ? "later" : "earlier"}`,
            reason: `It's now on ${fmtDay(m.to, tz)} (was ${fmtDay(m.from, tz)}). Shift your preparation tasks by ${Math.abs(shift)} ${Math.abs(shift) === 1 ? "day" : "days"}?`,
            event_title: m.title,
            event_start: m.to,
            payload: { shiftDays: shift, from: m.from, to: m.to },
            source: "rules",
          },
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
        );
      }
    }
  }
  for (const c of cancelled) {
    for (const p of (preps ?? []).filter((x) => x.event_key === c.key)) {
      if (p.status === "pending") {
        await admin.from("ai_suggestions").update({ status: "expired", decided_at: new Date().toISOString() }).eq("id", p.id);
      } else if (p.status === "approved") {
        await admin.from("ai_suggestions").upsert(
          {
            user_id: userId,
            dedupe_key: `cleanup:${c.key}`,
            event_key: c.key,
            kind: "cleanup",
            title: `${c.title} was cancelled`,
            reason: "It's no longer in your calendar. Remove the open preparation tasks?",
            event_title: c.title,
            event_start: c.start,
            payload: {},
            source: "rules",
          },
          { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
        );
      }
    }
  }
}

function fmtDay(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
}
