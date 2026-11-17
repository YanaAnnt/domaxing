import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_PREP, type PrepCategory, type PrepPrefs } from "./planner.ts";
import { safeTz } from "./time.ts";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const secretCache = new Map<string, string | null>();

/** Reads a secret from Edge Function env (UPPER_CASE) first, then from Supabase Vault (lower_case). */
export async function secret(name: string): Promise<string | null> {
  const env = Deno.env.get(name.toUpperCase());
  if (env) return env;
  if (secretCache.has(name)) return secretCache.get(name)!;
  const { data, error } = await admin.rpc("tidy_secret", { secret_name: name });
  if (error) console.warn("[secret]", name, error.message);
  const v = (data as string | null) ?? null;
  secretCache.set(name, v);
  return v;
}

let anthropic: Anthropic | null | undefined;
export async function ai(): Promise<Anthropic | null> {
  if (anthropic !== undefined) return anthropic;
  const key = await secret("anthropic_api_key");
  anthropic = key ? new Anthropic({ apiKey: key, maxRetries: 2, timeout: 120_000 }) : null;
  return anthropic;
}

export async function userFromRequest(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export interface UserPrefs extends PrepPrefs {
  briefingEnabled: boolean;
  briefingTime: string;
  quietStart: string;
  quietEnd: string;
  maxDailyPush: number;
  defaultReminderMinutes: number;
  aiEnabled: boolean;
}

export async function getPrefs(userId: string): Promise<UserPrefs> {
  const { data } = await admin.from("user_prefs").select("*").eq("user_id", userId).maybeSingle();
  const prep = { ...DEFAULT_PREP } as PrepPrefs["prep"];
  const raw = (data?.prep ?? {}) as Record<string, { enabled?: boolean; leadDays?: number }>;
  for (const k of Object.keys(prep) as PrepCategory[]) {
    if (raw[k]) {
      prep[k] = {
        enabled: raw[k].enabled ?? prep[k].enabled,
        leadDays: Math.max(1, Math.min(60, Number(raw[k].leadDays ?? prep[k].leadDays))),
      };
    }
  }
  return {
    timezone: safeTz(data?.timezone),
    prep,
    studyMinutes: data?.study_minutes ?? 60,
    workTime: data?.work_time ?? "evening",
    briefingEnabled: data?.briefing_enabled ?? true,
    briefingTime: data?.briefing_time ?? "08:00",
    quietStart: data?.quiet_start ?? "22:00",
    quietEnd: data?.quiet_end ?? "07:30",
    maxDailyPush: data?.max_daily_push ?? 4,
    defaultReminderMinutes: data?.default_reminder_minutes ?? 30,
    aiEnabled: data?.ai_enabled ?? true,
  };
}

/** Idempotency marker; returns true only the first time a key is logged for a user. */
export async function markOnce(userId: string, key: string): Promise<boolean> {
  const { data, error } = await admin
    .from("notification_log")
    .upsert({ user_id: userId, key }, { onConflict: "user_id,key", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.warn("[markOnce]", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function hasMark(userId: string, key: string): Promise<boolean> {
  const { data } = await admin.from("notification_log").select("id").eq("user_id", userId).eq("key", key).maybeSingle();
  return !!data;
}

export async function clearMark(userId: string, key: string) {
  await admin.from("notification_log").delete().eq("user_id", userId).eq("key", key);
}
