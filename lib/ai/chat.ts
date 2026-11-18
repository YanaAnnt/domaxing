"use client";

// Chat with the assistant using the user's own Anthropic key. Replies stream in as they are written.
// The assistant can call read-only tools to look at the user's tasks and calendar, and suggest tasks that the
// user adds or skips one by one (see ./tools). Nothing is added without the user tapping Add.
// The history is saved on this device only, separately from the task data, so it is never synced or exported.
import Anthropic from "@anthropic-ai/sdk";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createClient, describeError } from "./client";
import { buildSystemPrompt, toApiMessages, type ChatMessage, type Proposal } from "./conversation";
import { useAISettings } from "./settings";
import { addProposedTask, readSnapshot, removeTask } from "./snapshot";
import { TOOLS, runTool, type ToolName } from "./tools";

/** Messages kept on the device. Older ones are dropped when the history grows past this. */
const STORED_MESSAGES = 200;
const MAX_TOKENS = 16000;
/** Model calls allowed for one reply, so a confused tool loop can't run up a bill. */
const MAX_STEPS = 8;
/** Consecutive retries after a dropped connection or a tool input that couldn't be parsed. */
const MAX_RETRIES = 2;

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
  /** Add or skip a suggested task, or undo that choice. */
  decide: (messageId: string, proposalId: string, action: "add" | "skip" | "undo") => void;
  /** Add every suggestion in a reply that is still waiting for a decision. */
  addAll: (messageId: string) => void;
}

let current: { abort: () => void } | null = null;

const newMessage = (role: ChatMessage["role"], text: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  text,
  createdAt: new Date().toISOString(),
});

export const useChat = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      streaming: false,

      send: async (text) => {
        const t = text.trim();
        const { apiKey, model } = useAISettings.getState();
        if (!t || !apiKey || get().streaming) return;

        const question = newMessage("user", t);
        const reply = newMessage("assistant", "");
        // The turn's messages, including tool calls and results. Only the reply's text is saved afterwards.
        const turn: Anthropic.MessageParam[] = toApiMessages([...get().messages, question]);
        set((s) => ({ messages: [...s.messages, question, reply], streaming: true }));
        const patch = (fn: (m: ChatMessage) => Partial<ChatMessage>) =>
          set((s) => ({ messages: s.messages.map((m) => (m.id === reply.id ? { ...m, ...fn(m) } : m)) }));
        const textNow = () => get().messages.find((m) => m.id === reply.id)?.text ?? "";

        const client = createClient(apiKey);
        const system = buildSystemPrompt(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
        let retries = 0;

        try {
          for (let step = 0; step < MAX_STEPS; step++) {
            const before = textNow();
            let firstDelta = true;
            const stream = client.messages.stream({ model, max_tokens: MAX_TOKENS, system, tools: TOOLS, messages: turn });
            current = stream;
            stream.on("text", (delta) => {
              // Text from a later step starts a new paragraph after what was said before the tool call.
              const sep = firstDelta && before.trim() ? "\n\n" : "";
              firstDelta = false;
              patch((m) => ({ text: m.text + sep + delta }));
            });

            let message: Anthropic.Message;
            try {
              message = await stream.finalMessage();
              retries = 0;
            } catch (e) {
              // API errors (including a stop by the user) are final. A dropped connection or an unparseable
              // tool input is retried: the partial text from this step is removed and the step runs again.
              if (e instanceof Anthropic.APIError || retries++ >= MAX_RETRIES) throw e;
              patch(() => ({ text: before }));
              step--;
              continue;
            }

            if (message.stop_reason === "refusal") {
              patch(() => ({ error: "The assistant can't help with that request." }));
              return;
            }
            const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
            if (message.stop_reason === "max_tokens") {
              patch(() => ({ error: "The reply was cut short because it got too long." }));
              return;
            }
            if (message.stop_reason === "pause_turn") {
              turn.push({ role: "assistant", content: message.content });
              continue;
            }
            if (calls.length === 0) return; // end_turn: the answer is complete

            turn.push({ role: "assistant", content: message.content });
            const snapshot = readSnapshot();
            const proposals: Proposal[] = [];
            const results: Anthropic.ToolResultBlockParam[] = calls.map((call) => {
              const out = runTool(call.name, call.input, snapshot);
              for (const task of out.proposals ?? []) proposals.push({ id: crypto.randomUUID(), task, status: "pending" });
              return { type: "tool_result", tool_use_id: call.id, content: out.content, ...(out.isError ? { is_error: true } : {}) };
            });
            // Lookups show as small labels; suggestions show as cards instead.
            const looked = calls.map((c) => c.name as ToolName).filter((n) => n !== "propose_tasks");
            patch((m) => ({
              tools: [...new Set([...(m.tools ?? []), ...looked])],
              ...(proposals.length ? { proposals: [...(m.proposals ?? []), ...proposals] } : {}),
            }));
            turn.push({ role: "user", content: results });
          }
          patch(() => ({ error: "The assistant needed too many steps for this reply. Try asking in a simpler way." }));
        } catch (e) {
          if (e instanceof Anthropic.APIUserAbortError) {
            // Stopped by the user: keep what was written and suggested so far, or drop the empty bubble.
            set((s) => ({ messages: s.messages.filter((m) => m.id !== reply.id || m.text.trim() || m.proposals?.length) }));
          } else {
            patch(() => ({ error: describeError(e) }));
          }
        } finally {
          current = null;
          set({ streaming: false });
        }
      },

      stop: () => current?.abort(),

      clear: () => {
        current?.abort();
        set({ messages: [] });
      },

      decide: (messageId, proposalId, action) => {
        const p = get().messages.find((m) => m.id === messageId)?.proposals?.find((x) => x.id === proposalId);
        if (!p) return;
        let next: Partial<Proposal>;
        if (action === "add" && p.status === "pending") next = { status: "added", taskId: addProposedTask(p.task) };
        else if (action === "skip" && p.status === "pending") next = { status: "skipped" };
        else if (action === "undo" && p.status !== "pending") {
          if (p.taskId) removeTask(p.taskId);
          next = { status: "pending", taskId: undefined };
        } else return;
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === messageId ? { ...m, proposals: m.proposals?.map((x) => (x.id === proposalId ? { ...x, ...next } : x)) } : m,
          ),
        }));
      },

      addAll: (messageId) => {
        const pending = get().messages.find((m) => m.id === messageId)?.proposals?.filter((p) => p.status === "pending") ?? [];
        for (const p of pending) get().decide(messageId, p.id, "add");
      },
    }),
    {
      name: "domaxing-chat-v1",
      version: 1,
      // Only the history is saved. An empty reply left by a reload mid-stream is dropped.
      partialize: (s) => ({
        messages: s.messages.filter((m) => m.role === "user" || m.text.trim() || m.error || m.proposals?.length).slice(-STORED_MESSAGES),
      }),
    },
  ),
);
