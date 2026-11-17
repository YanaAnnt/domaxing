"use client";

import { Cloud, CloudOff, HardDrive, Loader2, AlertTriangle, LogIn } from "lucide-react";
import { useSync } from "@/lib/sync";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export function SyncBadge({ compact }: { compact?: boolean }) {
  const { status, error, user } = useSync();
  const ui = useUI.getState();
  const map = {
    local: { icon: HardDrive, label: "Local demo", tone: "text-muted", title: "Local Demo Mode: data is stored only in this browser. See Settings to enable sync." },
    "signed-out": { icon: LogIn, label: "Sign in to sync", tone: "text-accent", title: "Sign in to sync across devices" },
    connecting: { icon: Loader2, label: "Connecting", tone: "text-muted", title: "Connecting…" },
    syncing: { icon: Loader2, label: "Syncing", tone: "text-muted", title: "Syncing…" },
    synced: { icon: Cloud, label: "Synced", tone: "text-muted", title: `Synced${user?.email ? ` as ${user.email}` : ""}` },
    offline: { icon: CloudOff, label: "Offline", tone: "text-amber-600 dark:text-amber-400", title: "Offline. Changes are saved locally and will sync when you reconnect." },
    error: { icon: AlertTriangle, label: "Sync issue", tone: "text-danger", title: `Sync error: ${error ?? "unknown"}. Your changes are safe locally and will retry.` },
  } as const;
  const m = map[status];
  const Icon = m.icon;
  const spinning = status === "syncing" || status === "connecting";
  return (
    <button
      onClick={() => (status === "signed-out" ? ui.setAuthOpen(true) : ui.setSettingsOpen(true))}
      title={m.title}
      aria-label={m.title}
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors hover:bg-hover", m.tone)}
    >
      <Icon className={cn("size-3.5", spinning && "animate-spin-slow")} />
      {!compact && <span>{m.label}</span>}
    </button>
  );
}
