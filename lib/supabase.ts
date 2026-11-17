"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when cloud credentials are configured; otherwise the app runs in Local Demo Mode. */
export const cloudEnabled = !!(url && key && !url.includes("your-project-ref"));

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!cloudEnabled) return null;
  if (!client) {
    client = createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "tidy-auth" },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return client;
}
