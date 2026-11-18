"use client";

import * as React from "react";
import Markdown, { type Components } from "react-markdown";
import { AlertCircle, ArrowUp, KeyRound, RotateCcw, Search, Square, Sun } from "lucide-react";
import { useChat } from "@/lib/ai/chat";
import { BRIEF_PROMPT, type ChatMessage } from "@/lib/ai/conversation";
import { modelById } from "@/lib/ai/models";
import { useAISettings } from "@/lib/ai/settings";
import { TOOL_LABELS } from "@/lib/ai/tools";
import { useUI } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { AutoTextarea, Button } from "./ui/primitives";
import { Orb } from "./assistant-ui";

/** The assistant's name in the chat. */
const ASSISTANT_NAME = "Max";

/** Chat with the assistant through the user's own Anthropic key. */
export function AssistantChat() {
  const apiKey = useAISettings((s) => s.apiKey);
  const model = useAISettings((s) => s.model);
  const messages = useChat((s) => s.messages);
  const streaming = useChat((s) => s.streaming);
  const [draft, setDraft] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!apiKey) return <ConnectKey />;

  const send = (text: string) => {
    if (!text.trim() || streaming) return;
    setDraft("");
    void useChat.getState().send(text);
  };

  return (
    <section aria-label="Chat with the assistant" className="glass mb-10 flex flex-col overflow-hidden rounded-[22px]">
      {messages.length > 0 && (
        <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
          <span className="px-1 text-[13px] font-semibold">{ASSISTANT_NAME}</span>
          <span className="text-xs text-faint" title="Model in use">· {modelById(model).name}</span>
          <Button variant="ghost" size="sm" className="ml-auto" disabled={streaming} onClick={() => send(BRIEF_PROMPT)}>
            <Sun className="size-3.5" /> Brief
          </Button>
          <Button variant="ghost" size="sm" onClick={() => useChat.getState().clear()}>
            <RotateCcw className="size-3.5" /> New chat
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="max-h-[min(60vh,560px)] overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center px-2 pb-2 pt-4 text-center">
            <Orb kind="other" size={52} />
            <h2 className="mt-3 text-[19px] font-semibold tracking-tight">Hey, I&apos;m {ASSISTANT_NAME}, your Domaxing buddy.</h2>
            <p className="mt-1 text-sm text-muted">Big goals, busy weeks, tiny to-dos. Let&apos;s max them all.</p>
            <p className="mt-3 text-[15px] font-medium">So, what are we maxing today?</p>
            <Button variant="primary" className="mt-4 h-10 rounded-full px-5" onClick={() => send(BRIEF_PROMPT)}>
              <Sun className="size-4" /> Brief me
            </Button>
            <p className="mt-2 text-xs text-faint">A quick look at today, the busy days ahead and what to prepare for.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <Bubble key={m.id} m={m} typing={streaming && m === messages[messages.length - 1] && m.role === "assistant"} />
            ))}
          </div>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-line p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
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
          placeholder={`What's on your mind? Tell ${ASSISTANT_NAME} your plans…`}
          aria-label="Message the assistant"
          className="max-h-40 min-h-10 flex-1 overflow-y-auto rounded-xl bg-sunken px-3 py-2.5 text-[15px] outline-none placeholder:text-faint focus:ring-3 focus:ring-accent/15"
        />
        {streaming ? (
          <Button type="button" variant="subtle" size="icon" className="size-10 rounded-xl" aria-label="Stop" onClick={() => useChat.getState().stop()}>
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button type="submit" variant="primary" size="icon" className="size-10 rounded-xl" aria-label="Send" disabled={!draft.trim()}>
            <ArrowUp className="size-4" strokeWidth={2.4} />
          </Button>
        )}
      </form>
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
      {m.text && typing && <span className="ms-1 inline-block animate-pulse text-muted">●</span>}
      {m.error && (
        <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs text-danger">
          <AlertCircle className="size-3.5 shrink-0" /> {m.error}
        </p>
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

function ConnectKey() {
  return (
    <section className="glass mb-10 flex items-center gap-4 rounded-[22px] p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
        <KeyRound className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">Chat with the assistant</div>
        <p className="text-[13px] text-muted">Connect your own Anthropic API key in Settings to plan your days in conversation. No account needed.</p>
      </div>
      <Button variant="primary" size="sm" onClick={() => useUI.getState().setSettingsOpen(true)}>
        Connect
      </Button>
    </section>
  );
}
