"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { useAISettings } from "@/lib/ai/settings";
import { MODELS, formatPrice, modelById } from "@/lib/ai/models";
import { describeError, looksLikeAnthropicKey, maskKey, testConnection } from "@/lib/ai/client";
import { cn } from "@/lib/utils";
import { Button, Input } from "./ui/primitives";

const KEYS_URL = "https://console.anthropic.com/settings/keys";

/** Settings section where users connect the assistant to their own Anthropic API key. */
export function AISection() {
  const apiKey = useAISettings((s) => s.apiKey);
  const model = useAISettings((s) => s.model);
  const status = useAISettings((s) => s.status);
  const [draft, setDraft] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const showInput = !apiKey || editing;
  const draftValid = looksLikeAnthropicKey(draft);

  const runTest = async (key = useAISettings.getState().apiKey) => {
    const { setStatus, model: m } = useAISettings.getState();
    setTesting(true);
    try {
      await testConnection(key, m);
      setStatus({ state: "ok", checkedAt: new Date().toISOString() });
    } catch (e) {
      setStatus({ state: "error", message: describeError(e) });
    } finally {
      setTesting(false);
    }
  };

  const saveKey = async () => {
    if (!draftValid) return;
    useAISettings.getState().setApiKey(draft);
    setDraft("");
    setEditing(false);
    await runTest(draft.trim());
  };

  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">AI assistant</h3>
      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        Use your own Anthropic API key and the assistant works on this device for free, apart from what Anthropic charges you for usage.
        The key is stored only on this device and is sent only to Anthropic.{" "}
        <a href={KEYS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
          Get a key <ExternalLink className="size-3" />
        </a>
      </p>

      {showInput ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveKey();
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="sk-ant-..."
            aria-label="Anthropic API key"
            aria-invalid={draft.length > 0 && !draftValid}
          />
          <Button type="submit" variant="primary" className="h-10" disabled={!draftValid || testing}>
            Save
          </Button>
          {editing && (
            <Button type="button" variant="ghost" className="h-10" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </form>
      ) : (
        <div className="flex items-center gap-3 rounded-xl bg-sunken px-3.5 py-2.5">
          <KeyRound className="size-4 shrink-0 text-muted" />
          <code className="min-w-0 flex-1 truncate text-[13px]">{maskKey(apiKey)}</code>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Replace</Button>
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => useAISettings.getState().forgetKey()}>
            Remove
          </Button>
        </div>
      )}
      {showInput && draft.length > 0 && !draftValid && (
        <p className="mt-1.5 text-xs text-danger">Anthropic keys start with &quot;sk-ant-&quot;.</p>
      )}

      <div className="mb-1.5 mt-4 text-xs font-medium text-muted">Model</div>
      <div role="radiogroup" aria-label="Model" className="flex flex-col gap-1.5">
        {MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={model === m.id}
            onClick={() => useAISettings.getState().setModel(m.id)}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
              model === m.id ? "border-accent bg-accent/8" : "border-line hover:bg-hover",
            )}
          >
            <span className={cn("mt-1 grid size-3.5 shrink-0 place-items-center rounded-full border", model === m.id ? "border-accent" : "border-line-strong")}>
              {model === m.id && <span className="size-1.5 rounded-full bg-accent" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{m.name}</span>
              <span className="block text-xs text-muted">{m.description}</span>
            </span>
            <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-faint">{formatPrice(m)}</span>
          </button>
        ))}
      </div>

      {apiKey && (
        <div className="mt-3 flex min-h-8 items-center gap-3">
          <Button variant="outline" size="sm" disabled={testing} onClick={() => void runTest()}>
            {testing && <Loader2 className="size-3.5 animate-spin-slow" />} Test connection
          </Button>
          <StatusLine status={status} testing={testing} model={modelById(model).name} />
        </div>
      )}
    </section>
  );
}

function StatusLine({ status, testing, model }: { status: ReturnType<typeof useAISettings.getState>["status"]; testing: boolean; model: string }) {
  if (testing) return <span className="text-xs text-muted">Checking…</span>;
  if (status.state === "ok")
    return (
      <span role="status" className="flex items-center gap-1.5 text-xs text-success">
        <CheckCircle2 className="size-3.5" /> Connected to {model}
      </span>
    );
  if (status.state === "error")
    return (
      <span role="alert" className="flex items-center gap-1.5 text-xs text-danger">
        <AlertCircle className="size-3.5 shrink-0" /> {status.message}
      </span>
    );
  return <span className="text-xs text-faint">Not checked yet</span>;
}
