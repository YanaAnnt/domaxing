// Web Push (works for installed PWAs on iPhone 16.4+, desktop Chrome/Edge/Firefox/Safari).
import * as webpush from "web-push";
import { admin, secret, SUPABASE_URL } from "./db.ts";

let ready: boolean | null = null;

async function init(): Promise<boolean> {
  if (ready !== null) return ready;
  const [pub, priv] = await Promise.all([secret("vapid_public_key"), secret("vapid_private_key")]);
  if (!pub || !priv) return (ready = false);
  webpush.setVapidDetails(SUPABASE_URL, pub, priv);
  return (ready = true);
}

export async function vapidPublicKey() {
  return await secret("vapid_public_key");
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  taskId?: string;
}

/** Sends to every device the user enabled. Returns the number of successful deliveries. */
export async function pushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!(await init())) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  let ok = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3600, urgency: "normal" },
      );
      ok++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else console.warn("[push] failed", status, (e as Error).message);
    }
  }
  return ok;
}

export async function hasPush(userId: string) {
  const { count } = await admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId);
  return (count ?? 0) > 0;
}
