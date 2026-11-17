"use client";

import * as React from "react";
import { format } from "date-fns";
import { Bell, Check, Cloud, Download, HardDrive, Loader2, LogOut, Monitor, Moon, RefreshCw, RotateCcw, Sun, Upload } from "lucide-react";
import { useUI } from "@/lib/ui-store";
import { useData } from "@/lib/store";
import { useSync, signIn, signUp, signOut, sendReset, syncNow, updatePassword } from "@/lib/sync";
import { cloudEnabled } from "@/lib/supabase";
import { ACCENTS } from "@/lib/constants";
import { useIsDark } from "@/lib/theme";
import { notificationsSupported, requestNotificationPermission } from "@/lib/reminders";
import { Button, Dialog, DialogContent, Input, Segmented } from "./ui/primitives";
import { LogoMark } from "./logo";
import { AssistantSection, CalendarsSection, NotificationsSection } from "./assistant-settings";

export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen);
  const settings = useData((s) => s.settings);
  const update = useData((s) => s.updateSettings);
  const dark = useIsDark();
  const sync = useSync();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [perm, setPerm] = React.useState<string>(() => (notificationsSupported() ? Notification.permission : "unsupported"));
  const [confirmReset, setConfirmReset] = React.useState<null | "sample" | "empty">(null);

  const exportData = () => {
    const s = useData.getState();
    const blob = new Blob(
      [JSON.stringify({ app: "domaxing", version: 1, exportedAt: new Date().toISOString(), categories: Object.values(s.categories), lists: Object.values(s.lists), tasks: Object.values(s.tasks) }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `domaxing-backup-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      if (!Array.isArray(json.tasks) || !Array.isArray(json.categories)) throw new Error("Not a Domaxing backup file");
      useData.getState().importData({ categories: json.categories, lists: json.lists ?? [], tasks: json.tasks });
      useUI.getState().toast({ message: `Imported ${json.tasks.length} tasks` });
    } catch (e) {
      useUI.getState().toast({ message: `Import failed: ${(e as Error).message}`, tone: "error" });
    }
  };

  const doReset = (mode: "sample" | "empty") => {
    const d = useData.getState();
    if (sync.user) {
      // delete everything for the account (as tombstones, so other devices follow)
      Object.values(d.tasks).forEach((t) => d.deleteTask(t.id));
      Object.values(d.categories).forEach((c) => d.deleteCategory(c.id));
    } else d.resetLocal(mode === "sample");
    setConfirmReset(null);
    useUI.getState().navigate({ type: "today" });
    useUI.getState().toast({ message: mode === "sample" && !sync.user ? "Sample data restored" : "All data cleared" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => useUI.getState().setSettingsOpen(o)}>
      <DialogContent title="Settings" className="sm:max-w-xl">
        <div className="flex flex-col gap-7 overflow-y-auto px-5 pb-6 pt-4">
          {/* Account / sync */}
          <Section title="Sync">
            {!cloudEnabled ? (
              <div className="rounded-xl bg-sunken p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <HardDrive className="size-4 text-muted" /> Local Demo Mode
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  Your tasks are saved in this browser only. To sync between your computer and iPhone, create a free Supabase project, run
                  <code className="mx-1 rounded bg-hover px-1 py-px text-[12px]">supabase/schema.sql</code>, and set
                  <code className="mx-1 rounded bg-hover px-1 py-px text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> and
                  <code className="mx-1 rounded bg-hover px-1 py-px text-[12px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. See README → “Enable sync”.
                </p>
              </div>
            ) : sync.user ? (
              <div className="flex items-center gap-3 rounded-xl bg-sunken p-4">
                <div className="grid size-9 place-items-center rounded-full bg-accent-soft text-sm font-semibold uppercase text-accent">{sync.user.email?.[0] ?? "?"}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{sync.user.email}</div>
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <Cloud className="size-3" />
                    {sync.status === "error" ? `Sync issue: ${sync.error}` : sync.status === "offline" ? "Offline. Will sync when back online" : sync.lastSyncedAt ? `Synced ${format(new Date(sync.lastSyncedAt), "h:mm a")}` : "Syncing…"}
                  </div>
                </div>
                <Button variant="ghost" size="icon" aria-label="Sync now" onClick={() => syncNow()}>
                  <RefreshCw className={sync.status === "syncing" ? "size-4 animate-spin-slow" : "size-4"} />
                </Button>
                <Button variant="outline" size="sm" onClick={() => signOut()}>
                  <LogOut className="size-3.5" /> Sign out
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-sunken p-4">
                <p className="text-[13px] text-muted">Sign in to keep your tasks in sync on every device.</p>
                <Button variant="primary" size="sm" onClick={() => useUI.getState().setAuthOpen(true)}>Sign in</Button>
              </div>
            )}
          </Section>

          {sync.user && (
            <>
              <CalendarsSection />
              <AssistantSection />
              <NotificationsSection />
            </>
          )}

          <Section title="Appearance">
            <Segmented
              className="w-full"
              value={settings.theme}
              onChange={(v) => update({ theme: v })}
              options={[
                { value: "system", label: <><Monitor className="size-3.5" />System</> },
                { value: "light", label: <><Sun className="size-3.5" />Light</> },
                { value: "dark", label: <><Moon className="size-3.5" />Dark</> },
              ]}
            />
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm">Accent color</span>
              <div className="flex gap-1.5">
                {Object.entries(ACCENTS).map(([k, v]) => (
                  <button
                    key={k}
                    aria-label={v.label}
                    aria-pressed={settings.accent === k}
                    onClick={() => update({ accent: k })}
                    className="grid size-6 place-items-center rounded-full transition-transform hover:scale-110"
                    style={{ background: dark ? v.dark : v.light }}
                  >
                    {settings.accent === k && <Check className="size-3.5 text-white mix-blend-difference" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Preferences">
            <Row label="Week starts on">
              <Segmented value={settings.weekStartsOn} onChange={(v) => update({ weekStartsOn: v })} options={[{ value: 1, label: "Monday" }, { value: 0, label: "Sunday" }]} />
            </Row>
            <Row label="Show completed in lists">
              <Toggle checked={settings.showCompletedInLists} onChange={(v) => update({ showCompletedInLists: v })} />
            </Row>
            {!sync.user && <Row label="Notifications" hint={perm === "unsupported" ? "Not supported here. On iPhone, add Domaxing to your Home Screen first." : perm === "denied" ? "Blocked in browser settings" : undefined}>
              {perm === "granted" ? (
                <span className="flex items-center gap-1 text-sm text-success"><Check className="size-4" /> On</span>
              ) : (
                <Button variant="outline" size="sm" disabled={perm === "unsupported" || perm === "denied"} onClick={async () => setPerm(await requestNotificationPermission())}>
                  <Bell className="size-3.5" /> Enable
                </Button>
              )}
            </Row>}
          </Section>

          <Section title="Data">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportData}><Download className="size-3.5" /> Export backup</Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="size-3.5" /> Import</Button>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
              {!sync.user && (
                <Button variant="outline" size="sm" onClick={() => setConfirmReset("sample")}><RotateCcw className="size-3.5" /> Restore sample data</Button>
              )}
              <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setConfirmReset("empty")}>Delete all data…</Button>
            </div>
            {confirmReset && (
              <div className="mt-3 animate-rise-in rounded-xl border border-danger/30 bg-danger/5 p-3">
                <p className="text-[13px]">
                  {confirmReset === "sample" ? "Replace everything with the sample categories and tasks?" : sync.user ? "Delete every category and task on all your devices?" : "Delete every category and task on this device?"} This can’t be undone, so consider exporting a backup first.
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmReset(null)}>Cancel</Button>
                  <Button size="sm" variant="danger" onClick={() => doReset(confirmReset)}>{confirmReset === "sample" ? "Replace" : "Delete everything"}</Button>
                </div>
              </div>
            )}
          </Section>

          <div className="flex items-center gap-2 text-xs text-faint">
            <LogoMark size={16} /> Domaxing 1.0 · {cloudEnabled ? "Cloud sync available" : "Local Demo Mode"}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-line py-1.5 last:border-0">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-faint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[44px] rounded-full transition-colors ${checked ? "bg-success" : "bg-line-strong"}`}
    >
      <span className={`absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : ""}`} />
    </button>
  );
}

// ---------------- Auth ----------------
export function AuthDialog() {
  const open = useUI((s) => s.authOpen);
  const recovery = useSync((s) => s.recovery);
  const [mode, setMode] = React.useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const close = () => {
    useUI.getState().setAuthOpen(false);
    setError(null);
    setInfo(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (recovery) {
        await updatePassword(password);
        setInfo("Password updated. You’re signed in.");
      } else if (mode === "signin") {
        await signIn(email, password);
        close();
        useUI.getState().toast({ message: "Signed in. Syncing your tasks" });
      } else if (mode === "signup") {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) setInfo("Check your email to confirm your account, then sign in here.");
        else {
          close();
          useUI.getState().toast({ message: "Account created. Your tasks are now synced" });
        }
      } else {
        await sendReset(email);
        setInfo("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const title = recovery ? "Set a new password" : mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset password";

  return (
    <Dialog open={open || recovery} onOpenChange={(o) => !o && (recovery ? useSync.setState({ recovery: false }) : close())}>
      <DialogContent title={title} description={recovery ? undefined : "Sync your tasks between your computer and iPhone."}>
        <form onSubmit={submit} className="flex flex-col gap-3 px-5 pb-5 pt-4">
          {!recovery && (
            <Input type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" />
          )}
          {mode !== "reset" && (
            <Input
              type="password"
              autoComplete={mode === "signup" || recovery ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={recovery ? "New password" : "Password"}
              aria-label="Password"
            />
          )}
          {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
          {info && <p className="text-[13px] text-success" role="status">{info}</p>}
          <Button type="submit" variant="primary" size="lg" disabled={busy} className="mt-1 w-full">
            {busy && <Loader2 className="size-4 animate-spin-slow" />}
            {recovery ? "Update password" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </Button>
          {!recovery && (
            <div className="flex items-center justify-between pt-1 text-[13px]">
              {mode === "signin" ? (
                <>
                  <button type="button" className="text-muted hover:text-fg" onClick={() => setMode("reset")}>Forgot password?</button>
                  <button type="button" className="font-medium text-accent" onClick={() => setMode("signup")}>Create account</button>
                </>
              ) : (
                <button type="button" className="font-medium text-accent" onClick={() => setMode("signin")}>← Back to sign in</button>
              )}
            </div>
          )}
          {!recovery && mode === "signup" && (
            <p className="text-xs leading-relaxed text-faint">Tasks you’ve already added on this device will be copied into your new account.</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
