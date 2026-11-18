"use client";

// Chat with the assistant using the user's own Anthropic key. Replies stream in as they are written.
// The history is saved on this device only, separately from the task data, so it is never synced or exported.
import Anthropic from "@anthropic-ai/sdk";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createClient, describeError } from "./client";
import { buildSystemPrompt, toApiMessages, type ChatMessage } from "./conversation";
import { useAISettings } from "./settings";

/** Messages kept on the device. Older ones are dropped when the history grows past this. */
const STORED_MESSAGES = 200;
const MAX_TOKENS = 16000;

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
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
        const history = toApiMessages([...get().messages, question]);
        set((s) => ({ messages: [...s.messages, question, reply], streaming: true }));
        const patch = (fn: (m: ChatMessage) => Partial<ChatMessage>) =>
          set((s) => ({ messages: s.messages.map((m) => (m.id === reply.id ? { ...m, ...fn(m) } : m)) }));

        try {
          const stream = createClient(apiKey).messages.stream({
            model,
            max_tokens: MAX_TOKENS,
            system: buildSystemPrompt(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone),
            messages: history,
          });
          current = stream;
          stream.on("text", (delta) => patch((m) => ({ text: m.text + delta })));
          const final = await stream.finalMessage();
          if (final.stop_reason === "max_tokens") patch(() => ({ error: "The reply was cut short because it got too long." }));
          if (final.stop_reason === "refusal") patch(() => ({ error: "The assistant can't help with that request." }));
        } catch (e) {
          if (e instanceof Anthropic.APIUserAbortError) {
            // Stopped by the user: keep what was written so far, or drop the empty bubble.
            set((s) => ({ messages: s.messages.filter((m) => m.id !== reply.id || m.text.trim()) }));
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
    }),
    {
      name: "domaxing-chat-v1",
      version: 1,
      // Only the history is saved. An empty reply left by a reload mid-stream is dropped.
      partialize: (s) => ({
        messages: s.messages.filter((m) => m.role === "user" || m.text.trim() || m.error).slice(-STORED_MESSAGES),
      }),
    },
  ),
);
