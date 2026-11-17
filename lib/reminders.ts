"use client";

import { useData } from "./store";
import { useUI } from "./ui-store";
import { useAssistant } from "./assistant";
import { withBase } from "./utils";

const FIRED_KEY = "tidy-reminders-fired";

function loadFired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveFired(s: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-500)));
  } catch {
    /* ignore */
  }
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  return Notification.requestPermission();
}

async function show(title: string, body: string, taskId: string) {
  // With server push on, the system notification comes from the server; avoid duplicates.
  if (useAssistant.getState().pushEnabled) return;
  if (notificationsSupported() && Notification.permission === "granted") {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.showNotification(title, { body, tag: taskId, icon: withBase("/icons/icon-192.png"), badge: withBase("/icons/icon-192.png"), data: { taskId } });
        return;
      }
      new Notification(title, { body, tag: taskId, icon: withBase("/icons/icon-192.png") });
      return;
    } catch {
      /* fall through to toast */
    }
  }
}

/** Checks reminders while the app is open (web push for closed apps needs a server; see README). */
export function startReminderLoop() {
  const fired = loadFired();
  const tick = () => {
    const now = Date.now();
    const { tasks } = useData.getState();
    for (const t of Object.values(tasks)) {
      if (!t.reminderAt || t.completed || t.deleted) continue;
      const at = new Date(t.reminderAt).getTime();
      const k = `${t.id}:${t.reminderAt}`;
      if (at <= now && now - at < 6 * 3600_000 && !fired.has(k)) {
        fired.add(k);
        saveFired(fired);
        show("Reminder", t.title, t.id);
        useUI.getState().toast({
          message: `⏰ ${t.title}`,
          actionLabel: "Open",
          onAction: () => useUI.getState().openDetail(t.id),
        });
      }
    }
  };
  tick();
  const id = setInterval(tick, 15_000);
  return () => clearInterval(id);
}
