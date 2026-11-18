"use client";

import * as React from "react";
import Markdown, { type Components } from "react-markdown";
import { AlertCircle, ArrowUp, Check, KeyRound, Menu as MenuIcon, Plus, Search, Square, SquarePen, Sun } from "lucide-react";
import { useChat } from "@/lib/ai/chat";
import { BRIEF_PROMPT, type ChatMessage, type Proposal } from "@/lib/ai/conversation";
import { formatTime, recurrenceLabel, relativeLabel } from "@/lib/dates";
import { PRIORITIES } from "@/lib/constants";
import { modelById } from "@/lib/ai/models";
import { useAISettings } from "@/lib/ai/settings";
import { TOOL_LABELS } from "@/lib/ai/tools";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { AutoTextarea, Button } from "./ui/primitives";
import { Orb } from "./assistant-ui";

/** The assistant's name in the chat. */
const ASSISTANT_NAME = "Max";

/** A slow, staggered entrance in the style of the opening phrase: each line rises and sharpens in turn. */
const rise = (delay: number) => ({ animation: `splash-rise 1.4s cubic-bezier(0.3, 0.55, 0.25, 1) ${delay}s both` }) as React.CSSProperties;

/**
 * Chat with the assistant through the user's own Anthropic key. Fills the whole main area: a slim top bar,
 * the conversation in a centred column, and the message box pinned to the bottom. `toolbar` is placed on the
 * right of the top bar (the Chat / Planner switch).
 */
export function AssistantChat({ toolbar }: { toolbar?: React.ReactNode }) {
  const apiKey = useAISettings((s) => s.apiKey);
  const model = useAISettings((s) => s.model);
  const messages = useChat((s) => s.messages);
  const streaming = useChat((s) => s.streaming);
  const sidebarOpen = useUI((s) => s.sidebarOpen);
  const [draft, setDraft] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const empty = messages.length === 0;

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim() || streaming || !apiKey) return;
    setDraft("");
    void useChat.getState().send(text);
  };
  const openSettings = () => useUI.getState().setSettingsOpen(true);

  return (
    <section aria-label="Chat with Max" className="absolute inset-0 flex flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 px-3 md:px-5">
        {!sidebarOpen && (
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" aria-label="Show sidebar" onClick={() => useUI.getState().setSidebarOpen(true)}>
            <MenuIcon className="size-4" />
          </Button>
        )}
        {!empty && (
          <>
            <Orb kind="other" size={26} />
            <span className="ms-1.5 text-[14px] font-semibold">{ASSISTANT_NAME}</span>
            <button type="button" onClick={openSettings} className="ms-1 hidden truncate text-xs text-faint hover:text-muted sm:inline" title="Change the model in Settings">
              {modelById(model).name}
            </button>
          </>
        )}
        <div className="ms-auto flex items-center gap-1">
          {!empty && (
            <>
              <Button variant="ghost" size="sm" disabled={streaming} onClick={() => send(BRIEF_PROMPT)}>
                <Sun className="size-3.5" /> <span className="hidden sm:inline">Brief</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => useChat.getState().clear()} aria-label="New chat">
                <SquarePen className="size-3.5" /> <span className="hidden sm:inline">New chat</span>
              </Button>
            </>
          )}
          {toolbar}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-live="polite">
        {empty ? (
          <div className="flex min-h-full flex-col items-center justify-center px-6 pb-10 text-center">
            <div style={rise(0.15)} className="mb-8">
              <Orb kind="other" size={56} />
            </div>
            <h2 className="text-[38px] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-[52px]">
              <span style={rise(0.45)} className="block text-fg/45">
                Hey, I&apos;m {ASSISTANT_NAME}.
              </span>
              <span
                style={rise(1.0)}
                className="block bg-gradient-to-r from-[var(--c-accent)] via-[color-mix(in_oklab,var(--c-accent)_70%,#e05a9a)] to-[color-mix(in_oklab,var(--c-accent)_55%,#e08a3c)] bg-clip-text text-transparent"
              >
                Let&apos;s max your day.
              </span>
            </h2>
            <p style={rise(1.6)} className="mt-6 text-[12px] font-semibold uppercase tracking-[0.3em] text-muted">
              What&apos;s on your mind?
            </p>
            <div style={rise(1.95)} className="mt-8 flex flex-col items-center gap-2">
              {apiKey ? (
                <>
                  <Button variant="primary" className="h-11 rounded-full px-6 text-[15px]" onClick={() => send(BRIEF_PROMPT)}>
                    <Sun className="size-4" /> Brief me
                  </Button>
                  <p className="text-xs text-faint">Today, the busy days ahead, and what to get ready for.</p>
                </>
              ) : (
                <>
                  <Button variant="primary" className="h-11 rounded-full px-6 text-[15px]" onClick={openSettings}>
                    <KeyRound className="size-4" /> Connect your AI key
                  </Button>
                  <p className="max-w-xs text-xs text-faint">Max runs on your own Anthropic key. It stays on this device, and there&apos;s no account to create.</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-4 pb-6 pt-2 md:px-6">
            {messages.map((m) => (
              <Bubble key={m.id} m={m} typing={streaming && m === messages[messages.length - 1] && m.role === "assistant"} />
            ))}
          </div>
        )}
      </div>

      {apiKey && (
        <form
          className="mx-auto w-full max-w-[760px] shrink-0 px-3 pb-[calc(max(env(safe-area-inset-bottom),10px)+80px)] pt-2 md:px-6 md:pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <div
            className="flex items-end gap-2 rounded-[22px] border border-line bg-elevated/80 p-1.5 shadow-card transition-shadow focus-within:border-accent/50 focus-within:ring-3 focus-within:ring-accent/12"
            onClick={(e) => e.currentTarget.querySelector("textarea")?.focus()}
          >
            <AutoTextarea
              dir="auto"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              placeholder={`Tell ${ASSISTANT_NAME} your plans…`}
              aria-label="Message Max"
              className="max-h-40 min-h-10 flex-1 overflow-y-auto bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-faint"
            />
            {streaming ? (
              <Button type="button" variant="subtle" size="icon" className="size-10 rounded-full" aria-label="Stop" onClick={() => useChat.getState().stop()}>
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button type="submit" variant="primary" size="icon" className="size-10 rounded-full" aria-label="Send" disabled={!draft.trim()}>
                <ArrowUp className="size-4" strokeWidth={2.4} />
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function Bubble({ m, typing }: { m: ChatMessage; typing: boolean }) {
  if (m.role === "user")
    return (
      <div dir="auto" className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-[15px] text-on-accent">
        {m.text}
      </div>
    );
  return (
    // Full width, so a right-to-left reply (Hebrew, Arabic) lines up on the right like the user's own messages.
    <div className="self-stretch pe-6">
      {m.tools && m.tools.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1" aria-label="Looked at">
          {m.tools.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-[11px] text-muted">
              <Search className="size-3" /> {TOOL_LABELS[t] ?? t}
            </span>
          ))}
        </div>
      )}
      {m.text ? (
        <div dir="auto" className="text-[15px] leading-relaxed">
          <Markdown components={markdown}>{m.text}</Markdown>
        </div>
      ) : (
        typing && <span className="inline-block animate-pulse text-sm text-muted">Thinking…</span>
      )}
      {m.proposals && m.proposals.length > 0 && <Proposals m={m} busy={typing} />}
      {m.text && typing && <span className="ms-1 inline-block animate-pulse text-muted">●</span>}
      {m.error && (
        <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs text-danger">
          <AlertCircle className="size-3.5 shrink-0" /> {m.error}
        </p>
      )}
    </div>
  );
}

/** The tasks Max suggested in a reply, each with Add and Skip. Nothing is added until the user taps Add. */
function Proposals({ m, busy }: { m: ChatMessage; busy: boolean }) {
  const proposals = m.proposals ?? [];
  const pending = proposals.filter((p) => p.status === "pending").length;
  return (
    <div className="mt-2.5 flex flex-col gap-1.5" aria-label="Suggested tasks">
      {proposals.map((p) => (
        <ProposalCard key={p.id} p={p} onDecide={(action) => useChat.getState().decide(m.id, p.id, action)} />
      ))}
      {pending > 1 && !busy && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => useChat.getState().addAll(m.id)}>
          <Plus className="size-3.5" /> Add all {pending}
        </Button>
      )}
    </div>
  );
}

function ProposalCard({ p, onDecide }: { p: Proposal; onDecide: (action: "add" | "skip" | "undo") => void }) {
  const t = p.task;
  const meta = [
    t.dueDate && relativeLabel(t.dueDate),
    t.dueTime && formatTime(t.dueTime),
    t.place,
    t.recurrence && recurrenceLabel(t.recurrence),
    t.priority >= 3 && `${PRIORITIES[t.priority].label} priority`,
  ].filter(Boolean);
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-line bg-elevated/60 px-3 py-2 transition-opacity",
        p.status === "skipped" && "opacity-55",
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border",
          p.status === "added" ? "border-success bg-success text-white" : "border-line-strong",
        )}
        style={p.status === "pending" && t.priority ? { borderColor: PRIORITIES[t.priority].color } : undefined}
      >
        {p.status === "added" && <Check className="size-3" strokeWidth={3} />}
      </span>
      <div dir="auto" className="min-w-0 flex-1">
        <div className={cn("text-[14px] font-medium leading-snug", p.status === "skipped" && "line-through")}>{t.title}</div>
        {meta.length > 0 && <div className="truncate text-xs text-muted">{meta.join(" · ")}</div>}
      </div>
      {p.status === "pending" ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => onDecide("skip")}>
            Skip
          </Button>
          <Button variant="primary" size="sm" onClick={() => onDecide("add")}>
            <Plus className="size-3.5" /> Add
          </Button>
        </>
      ) : (
        <>
          {p.status === "added" && p.taskId ? (
            <Button variant="ghost" size="sm" className="text-success" onClick={() => useUI.getState().openDetail(p.taskId!)}>
              Added · Edit
            </Button>
          ) : (
            <span className="text-xs text-muted">Skipped</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => onDecide("undo")}>
            Undo
          </Button>
        </>
      )}
    </div>
  );
}

// Compact styles for the model's Markdown. Raw HTML in replies is not rendered.
// Each renderer drops react-markdown's `node` prop so it doesn't reach the DOM.
const heading = "mb-1 mt-3 text-[15px] font-semibold first:mt-0";
const markdown: Components = {
  p: ({ node: _, ...p }) => <p className="my-1.5 first:mt-0 last:mb-0" {...p} />,
  ul: ({ node: _, ...p }) => <ul className="my-1.5 list-disc ps-5" {...p} />,
  ol: ({ node: _, ...p }) => <ol className="my-1.5 list-decimal ps-5" {...p} />,
  li: ({ node: _, ...p }) => <li className="my-0.5" {...p} />,
  h1: ({ node: _, ...p }) => <h3 className={heading} {...p} />,
  h2: ({ node: _, ...p }) => <h3 className={heading} {...p} />,
  h3: ({ node: _, ...p }) => <h3 className={heading} {...p} />,
  strong: ({ node: _, ...p }) => <strong className="font-semibold" {...p} />,
  a: ({ node: _, ...p }) => <a className="text-accent underline" target="_blank" rel="noreferrer" {...p} />,
  code: ({ node: _, ...p }) => <code className="rounded bg-sunken px-1 py-0.5 text-[13px]" {...p} />,
  pre: ({ node: _, ...p }) => <pre className="my-2 overflow-x-auto rounded-lg bg-sunken p-2.5 text-[13px] [&_code]:bg-transparent [&_code]:p-0" {...p} />,
};
