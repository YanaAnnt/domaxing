// Domaxing backend: one Edge Function, routed by `action`.
//   POST {action, ...}   with the user's Supabase JWT   → app features
//   POST {action:"cron"} with x-cron-secret header      → scheduled jobs (pg_cron)
//   GET  /tidy/oauth/callback                           → Google / Microsoft sign-in return
import { admin, ai, secret, userFromRequest, getPrefs } from "./lib/db.ts";
import { fetchIcs, normalizeIcsUrl, oauthConfig, oauthFinish, oauthStartUrl, syncConnection, verifyState, type Connection } from "./lib/calendar.ts";
import { parseIcs } from "./lib/ics.ts";
import { planUser } from "./lib/plan.ts";
import { buildBriefing } from "./lib/briefing.ts";
import { aiBreakdown, AiRefusal } from "./lib/ai.ts";
import { pushToUser, vapidPublicKey } from "./lib/push.ts";
import { runCron } from "./lib/cron.ts";
import { dateKeyIn } from "./lib/time.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (message: string, status = 400) => json({ error: message }, status);

const PROVIDERS = ["google", "outlook", "apple", "ics"] as const;
const PROVIDER_NAMES: Record<string, string> = { google: "Google Calendar", outlook: "Outlook", apple: "iCloud Calendar", ics: "Calendar" };

async function handleOAuthCallback(url: URL) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  let returnTo = "";
  if (state) {
    try {
      returnTo = (await verifyState(state)).r;
    } catch {
      /* invalid state: handled below */
    }
  }
  try {
    if (err) throw new Error(url.searchParams.get("error_description") ?? "Sign-in was cancelled");
    if (!code || !state) throw new Error("Missing code");
    const { connection } = await oauthFinish(code, state);
    const prefs = await getPrefs(connection.user_id);
    await syncConnection(connection, prefs.timezone).catch(() => {});
    await planUser(connection.user_id).catch(() => {});
    return Response.redirect(`${returnTo.split("#")[0]}#/assistant?calendar=connected`, 302);
  } catch (e) {
    const message = (e as Error).message;
    if (!/^https?:\/\//.test(returnTo)) {
      return new Response(`Calendar sign-in failed: ${message.replace(/[<>&]/g, "")}. You can close this window and try again in Domaxing.`, {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return Response.redirect(`${returnTo.split("#")[0]}#/assistant?calendar_error=${encodeURIComponent(message)}`, 302);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/oauth/callback")) return handleOAuthCallback(url);
  if (req.method !== "POST") return fail("Not found", 404);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON");
  }
  const action = String(body.action ?? "");

  try {
    // ---------- scheduler ----------
    if (action === "cron") {
      const expected = await secret("cron_secret");
      if (!expected || req.headers.get("x-cron-secret") !== expected) return fail("Forbidden", 403);
      return json(await runCron());
    }

    // ---------- user actions ----------
    const user = await userFromRequest(req);
    if (!user) return fail("Please sign in", 401);
    const uid = user.id;

    switch (action) {
      case "config": {
        const [client, oauth, vapid] = await Promise.all([ai(), oauthConfig(), vapidPublicKey()]);
        return json({ ai: !!client, google: !!oauth.google, microsoft: !!oauth.microsoft, vapidPublicKey: vapid });
      }

      case "connect_ics": {
        const provider = PROVIDERS.includes(body.provider as never) ? (body.provider as string) : "ics";
        const rawUrl = String(body.url ?? "");
        normalizeIcsUrl(rawUrl);
        const prefs = await getPrefs(uid);
        // Validate before saving so the user gets an immediate, clear error.
        const text = await fetchIcs(rawUrl);
        parseIcs(text, new Date(), new Date(Date.now() + 86400000), prefs.timezone);
        const { data, error } = await admin.from("calendar_connections").insert({
          user_id: uid,
          provider,
          kind: "ics",
          name: String(body.name ?? "").trim().slice(0, 60) || PROVIDER_NAMES[provider],
          color: String(body.color ?? "blue"),
          ics_url: rawUrl.trim(),
          status: "pending",
        }).select("*").single();
        if (error) throw error;
        const sync = await syncConnection(data as Connection, prefs.timezone);
        const plan = await planUser(uid);
        return json({ id: data.id, events: sync.count, suggestions: plan.created });
      }

      case "disconnect": {
        const id = String(body.id);
        const { error } = await admin.from("calendar_connections").delete().eq("id", id).eq("user_id", uid);
        if (error) throw error;
        // Suggestions for that calendar's events are no longer relevant.
        await admin.from("ai_suggestions").update({ status: "expired", decided_at: new Date().toISOString() })
          .eq("user_id", uid).eq("status", "pending").like("event_key", `${id}:%`);
        return json({ ok: true });
      }

      case "sync": {
        const prefs = await getPrefs(uid);
        const { data } = await admin.from("calendar_connections").select("*").eq("user_id", uid);
        const results = [];
        for (const c of (data ?? []) as Connection[]) {
          try {
            results.push({ id: c.id, ...(await syncConnection(c, prefs.timezone)) });
          } catch (e) {
            results.push({ id: c.id, error: (e as Error).message });
          }
        }
        const plan = await planUser(uid, { force: !!body.replan });
        return json({ calendars: results, suggestions: plan.created, source: plan.source, aiError: plan.aiError });
      }

      case "oauth_start": {
        const provider = body.provider === "outlook" ? "outlook" : "google";
        const returnTo = String(body.returnTo ?? "");
        if (!/^https?:\/\//.test(returnTo)) return fail("Invalid return address");
        return json({ url: await oauthStartUrl(provider, uid, returnTo) });
      }

      case "plan": {
        return json(await planUser(uid, { force: !!body.force }));
      }

      case "breakdown": {
        const client = await ai();
        if (!client) return fail("AI isn't set up yet. Add an Anthropic API key to the server (see README).", 501);
        const prefs = await getPrefs(uid);
        try {
          const r = await aiBreakdown(client, {
            title: String(body.title ?? "").slice(0, 300),
            notes: String(body.notes ?? "").slice(0, 3000),
            existing: Array.isArray(body.existing) ? (body.existing as unknown[]).map(String).slice(0, 30) : [],
            dueDate: body.dueDate ? String(body.dueDate) : null,
            today: dateKeyIn(new Date(), prefs.timezone),
          });
          return json({ subtasks: r.subtasks.map((s) => s.trim()).filter(Boolean).slice(0, 10), tip: r.tip });
        } catch (e) {
          if (e instanceof AiRefusal) return fail("The assistant couldn't help with this task.", 422);
          throw e;
        }
      }

      case "briefing": {
        if (!body.force) {
          const prefs = await getPrefs(uid);
          const { data } = await admin.from("briefings").select("content").eq("user_id", uid).eq("day", dateKeyIn(new Date(), prefs.timezone)).maybeSingle();
          if (data) return json(JSON.parse(data.content));
        }
        return json(await buildBriefing(uid));
      }

      case "test_push": {
        const n = await pushToUser(uid, { title: "Domaxing", body: "Notifications are on. You'll get reminders even when the app is closed.", tag: "test" });
        return json({ delivered: n });
      }

      default:
        return fail(`Unknown action "${action}"`, 404);
    }
  } catch (e) {
    const message = (e as Error).message ?? "Something went wrong";
    // Problems with what the user entered (bad links, unconfigured providers) are 400s, not server faults.
    const userError = /link|calendar|allowed|configured|iCal|answered|expired|state/i.test(message);
    if (!userError) console.error(`[tidy] ${action} failed`, e);
    return fail(message, userError ? 400 : 500);
  }
});
