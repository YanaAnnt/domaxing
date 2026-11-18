// Pure helpers for the chat assistant: turning the saved history into API messages, and the system prompt.
// Kept free of React and storage so they can be unit-tested.
import { format } from "date-fns";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string; // ISO
  /** set when the reply failed or was cut short; failed replies are not sent back to the model */
  error?: string;
}

export interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

/** How many recent messages are sent with each request. Older ones stay on screen but are not re-sent, which caps cost. */
export const CONTEXT_MESSAGES = 40;

/**
 * Builds the `messages` array for the API from the saved chat:
 * skips failed and empty replies, keeps the most recent `limit` messages,
 * makes sure the list starts with the user, and merges back-to-back messages from the same side
 * (which happens when a reply failed and the user wrote again).
 */
export function toApiMessages(history: ChatMessage[], limit = CONTEXT_MESSAGES): ApiMessage[] {
  const usable = history.filter((m) => m.text.trim());
  const recent = usable.slice(-limit);
  while (recent.length && recent[0].role !== "user") recent.shift();

  const out: ApiMessage[] = [];
  for (const m of recent) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.text}`;
    else out.push({ role: m.role, content: m.text });
  }
  return out;
}

/** The assistant's instructions, with the user's current date and time so it can reason about "tomorrow" or "next week". */
export function buildSystemPrompt(now: Date, timeZone: string): string {
  return [
    "You are the assistant inside Domaxing, a to-do and planning app. You help the user turn plans, goals and busy weeks into concrete, well-timed tasks.",
    `It is now ${format(now, "EEEE, d MMMM yyyy, HH:mm")} in the user's time zone (${timeZone}).`,
    "Reply in the language the user writes in. Be warm and brief: short paragraphs and short lists, with headings only for long plans.",
    "When you suggest tasks, give each one a clear title and, where it helps, a day and time.",
    "You can't see or change the user's tasks or calendar yet. If they ask you to, say so in one sentence and give them a list they can add themselves.",
  ].join("\n");
}
