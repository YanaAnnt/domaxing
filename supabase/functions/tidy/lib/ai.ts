// Claude-powered planning, task breakdown and daily briefings.
// All calls return structured JSON (output_config.format) and never create tasks:
// results become suggestions the user approves in the app.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

type Effort = "low" | "medium" | "high";

interface JsonCall {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort: Effort;
  maxTokens?: number;
}

export class AiRefusal extends Error {}

export async function jsonCall<T>(client: Anthropic, c: JsonCall): Promise<T> {
  const params = {
    model: MODEL,
    max_tokens: c.maxTokens ?? 16000,
    system: c.system,
    messages: [{ role: "user" as const, content: c.user }],
    output_config: { effort: c.effort, format: { type: "json_schema" as const, schema: c.schema } },
  };
  let res: { stop_reason: string | null; content: Array<{ type: string; text?: string }> };
  try {
    // Server-side fallback: if the model declines, the API retries on Anthropic's recommended fallback model.
    res = await client.beta.messages.create({
      ...params,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (e) {
    if (e instanceof Anthropic.BadRequestError) {
      console.warn("[ai] beta request rejected, retrying without fallbacks:", e.message);
      res = await client.messages.create(params);
    } else throw e;
  }
  if (res.stop_reason === "refusal") throw new AiRefusal("The model declined this request");
  if (res.stop_reason === "max_tokens") throw new Error("AI response was cut off");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  return JSON.parse(text) as T;
}

// ---------------- planning ----------------
export interface AiPlanInput {
  today: string;
  timezone: string;
  weekday: string;
  preferences: {
    leadDays: Record<string, number>;
    enabledCategories: string[];
    studyMinutes: number;
    preferredWorkTime: string;
  };
  events: { event_key: string; title: string; start_local: string; all_day: boolean; location: string | null; description: string | null; rule_category: string | null }[];
  busyDays: Record<string, number>;
  existingTasks: { title: string; due: string | null }[];
}

export interface AiPlan {
  event_key: string;
  needs_prep: boolean;
  category: "exam" | "travel" | "meeting" | "birthday" | "deadline" | "other";
  title: string;
  reason: string;
  tasks: { title: string; notes: string; due_date: string; due_time: string; priority: number; subtasks: string[]; reminder: boolean }[];
}

const PLAN_SYSTEM = `You are the planning engine inside Domaxing, a calm personal to-do app. You read the user's upcoming calendar events and propose preparation to-dos *before* the user thinks of them. Every plan you produce is shown as a suggestion the user approves, edits or dismisses, so be genuinely useful and never noisy.

Decide for each event whether it truly benefits from preparation. Routine events (standups, lunches, commutes, gym classes, recurring 1:1s without stakes, reminders that are already tasks) need none: return needs_prep=false with an empty task list. Events that typically do: exams and tests (a personalised study schedule), flights and trips (documents, purchases, reservations, packing, check-in), important meetings, interviews, presentations and reviews (agenda, talking points, materials), birthdays and anniversaries (choosing and buying a gift, a card, wishing them on the day), deadlines and submissions, and anything else with clear stakes (weddings, moving, medical procedures, races).

When planning:
- Start preparation according to the user's lead-day preferences for that category, but never before today and never after the event.
- Spread work across days instead of stacking it; prefer days with a low busyDays score and avoid days that already hold several tasks. Leave the day of a big event mostly free.
- Use the user's preferred work time (morning 09:00, afternoon 14:00, evening 19:00) for focused-work tasks such as study sessions; leave due_time empty ("") for tasks that can happen any time.
- For exams, build a real study schedule: gather materials, a study plan, several focused revision sessions of the user's preferred length that move from broad review to weak spots, a practice exam, and a light final review the day before.
- Keep titles short, specific and actionable, starting with a verb and naming the subject (e.g. "Book airport transfer for Lisbon"). Put helpful detail in notes or subtasks, not in titles.
- 2 to 10 tasks per event; quality over quantity. Don't repeat anything already present in existingTasks.
- priority: 0 none, 1 low, 2 medium, 3 high, 4 urgent. Use 3-4 only for things that would really hurt if missed.
- reminder=true only for the few tasks where a nudge at the due time matters.
- due_date must be YYYY-MM-DD between today and the event date (inclusive). due_time is HH:MM (24h) or "".
- title: a short name for the whole plan (e.g. "Study plan for Microeconomics"). reason: one friendly sentence on why and when, written to the user.
Return exactly one entry per event, using the event_key you were given.`;

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["plans"],
  properties: {
    plans: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["event_key", "needs_prep", "category", "title", "reason", "tasks"],
        properties: {
          event_key: { type: "string" },
          needs_prep: { type: "boolean" },
          category: { type: "string", enum: ["exam", "travel", "meeting", "birthday", "deadline", "other"] },
          title: { type: "string" },
          reason: { type: "string" },
          tasks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "notes", "due_date", "due_time", "priority", "subtasks", "reminder"],
              properties: {
                title: { type: "string" },
                notes: { type: "string" },
                due_date: { type: "string" },
                due_time: { type: "string" },
                priority: { type: "integer" },
                subtasks: { type: "array", items: { type: "string" } },
                reminder: { type: "boolean" },
              },
            },
          },
        },
      },
    },
  },
};

export async function aiPlan(client: Anthropic, input: AiPlanInput): Promise<AiPlan[]> {
  const out = await jsonCall<{ plans: AiPlan[] }>(client, {
    system: PLAN_SYSTEM,
    user: `Plan preparation for these upcoming events.\n\n${JSON.stringify(input, null, 1)}`,
    schema: PLAN_SCHEMA,
    effort: "medium",
  });
  return out.plans ?? [];
}

// ---------------- task breakdown ----------------
const BREAKDOWN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subtasks", "tip"],
  properties: {
    subtasks: { type: "array", items: { type: "string" } },
    tip: { type: "string" },
  },
};

export async function aiBreakdown(
  client: Anthropic,
  t: { title: string; notes: string; existing: string[]; dueDate: string | null; today: string },
): Promise<{ subtasks: string[]; tip: string }> {
  return jsonCall(client, {
    system:
      "You help people start tasks by breaking them into concrete next actions. Return 3 to 8 short subtasks (each a single physical or mental action starting with a verb, under 70 characters), ordered as they would be done. Skip anything already listed as existing. tip: one short, practical sentence that makes the task easier, or an empty string.",
    user: JSON.stringify(t),
    schema: BREAKDOWN_SCHEMA,
    effort: "low",
    maxTokens: 4000,
  });
}

// ---------------- daily briefing ----------------
const BRIEFING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "body"],
  properties: { headline: { type: "string" }, body: { type: "string" } },
};

export async function aiBriefing(client: Anthropic, ctx: unknown): Promise<{ headline: string; body: string }> {
  return jsonCall(client, {
    system:
      "You write a short morning briefing for a personal productivity app. headline: a warm greeting of at most 6 words that fits the day (no emoji spam, at most one). body: 2-3 calm, specific sentences: what the day holds (key events with times), the 1-3 tasks that matter most and why, and anything coming up this week that needs a head start. Mention waiting suggestions only if there are any. Plain text, no lists, no markdown, second person.",
    user: JSON.stringify(ctx),
    schema: BRIEFING_SCHEMA,
    effort: "low",
    maxTokens: 4000,
  });
}
