// Tools the chat assistant can call: read-only tools to look at the user's tasks, lists, today's plan and
// calendar, and propose_tasks, which only drafts tasks for the user to add or skip. Nothing here changes data.
// Everything runs in the browser against a snapshot of the local data.
// Kept free of React and storage so it can be unit-tested.
import type Anthropic from "@anthropic-ai/sdk";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Category, List, Priority, Recurrence, RecurrenceFreq, Task } from "../types";

/** Calendar event fields the tools need (a subset of the assistant's CalEvent). */
export interface SnapshotEvent {
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
}

/** The data the tools read from. Deleted records are already filtered out. */
export interface Snapshot {
  tasks: Task[];
  categories: Category[];
  lists: List[];
  events: SnapshotEvent[];
  calendarConnected: boolean;
  /** today's date in the user's time zone, YYYY-MM-DD */
  today: string;
}

export type ToolName = "get_today" | "list_tasks" | "list_lists" | "get_calendar" | "propose_tasks";

/** Short labels shown in the chat for the tools the assistant used to look something up. */
export const TOOL_LABELS: Record<ToolName, string> = {
  get_today: "Today's plan",
  list_tasks: "Your tasks",
  list_lists: "Your lists",
  get_calendar: "Your calendar",
  propose_tasks: "Suggestions",
};

/** A task the assistant suggests, resolved against the user's lists and ready to add if they approve. */
export interface ProposedTask {
  title: string;
  notes: string;
  dueDate: string | null;
  dueTime: string | null;
  listId: string | null;
  categoryId: string | null;
  /** where it will go, as "Category / List", "Category" or "Inbox" */
  place: string;
  priority: Priority;
  recurrence: Recurrence | null;
}

/** Most tasks one propose_tasks call may suggest, so the cards stay reviewable. */
export const MAX_PROPOSALS = 15;

const DATE = { type: "string", description: "A date as YYYY-MM-DD." } as const;

// Tool inputs are small, but replies are streamed, so inputs stream as they are generated
// (eager_input_streaming) and each one is validated here before it is used.
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_today",
    description:
      "Get the user's plan for today: overdue tasks, tasks due today, tasks completed today and today's calendar events. Use it for questions like 'what should I do today' or 'how is my day looking'.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: "list_tasks",
    description:
      "Search the user's tasks. Every filter is optional and filters combine. Returns up to `limit` tasks sorted by due date, with tasks without a date last. Use it to answer questions about specific tasks, lists, dates or what is overdue.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "completed", "all"], description: "Defaults to open." },
        due_from: { ...DATE, description: "Only tasks due on or after this date (YYYY-MM-DD)." },
        due_to: { ...DATE, description: "Only tasks due on or before this date (YYYY-MM-DD)." },
        no_due_date: { type: "boolean", description: "true for only tasks without a due date." },
        list: { type: "string", description: "Only tasks in the list or category with this name, or 'Inbox' for tasks without a list." },
        query: { type: "string", description: "Only tasks whose title, notes or tags contain this text." },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Defaults to 50." },
      },
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "list_lists",
    description: "List the user's categories and the lists inside them, with how many open tasks each has.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    eager_input_streaming: true,
  },
  {
    name: "get_calendar",
    description:
      "Get events from the user's connected calendars between two dates (at most 120 days apart). Defaults to the next 14 days. Says so if no calendar is connected.",
    input_schema: {
      type: "object",
      properties: { from: DATE, to: DATE },
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "propose_tasks",
    description:
      "Suggest new tasks to the user. Each one is shown as a card with Add and Skip buttons, and nothing is added unless the user taps Add. Use it when the user asks for a plan, agrees to one, or when a brief finds something worth preparing for. Spread work over lighter days, use real dates, and keep titles short and specific.",
    input_schema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          minItems: 1,
          maxItems: MAX_PROPOSALS,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short and specific, such as 'Review chapters 1-3 for Calculus 2'." },
              notes: { type: "string", description: "Optional details, such as what to cover." },
              due_date: { ...DATE, description: "The day to do it (YYYY-MM-DD), today or later." },
              due_time: { type: "string", description: "Optional start time as HH:mm (24-hour). Needs due_date." },
              list: { type: "string", description: "Name of an existing list or category from list_lists. Leave out for the Inbox." },
              priority: { type: "string", enum: ["none", "low", "medium", "high", "urgent"] },
              repeat: { type: "string", enum: ["daily", "weekdays", "weekly", "monthly", "yearly"], description: "For habits such as a weekly long run. Needs due_date (the first time)." },
              repeat_every: { type: "integer", minimum: 1, maximum: 12, description: "With repeat: every N days, weeks, months or years. Defaults to 1." },
            },
            required: ["title"],
            additionalProperties: false,
          },
        },
      },
      required: ["tasks"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
];

export interface ToolOutput {
  content: string;
  isError?: boolean;
  /** tasks to show as approval cards (propose_tasks only) */
  proposals?: ProposedTask[];
}

class InputError extends Error {}

const PRIORITY = ["none", "low", "medium", "high", "urgent"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function obj(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw new InputError("The input must be an object.");
  return input as Record<string, unknown>;
}
function optString(i: Record<string, unknown>, k: string): string | undefined {
  const v = i[k];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new InputError(`${k} must be a string.`);
  return v;
}
function optDate(i: Record<string, unknown>, k: string): string | undefined {
  const v = optString(i, k);
  if (v !== undefined && (!DATE_RE.test(v) || Number.isNaN(parseISO(v).getTime()))) throw new InputError(`${k} must be a date like 2026-11-18.`);
  return v;
}
function optBool(i: Record<string, unknown>, k: string): boolean | undefined {
  const v = i[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new InputError(`${k} must be true or false.`);
  return v;
}
function optInt(i: Record<string, unknown>, k: string, min: number, max: number): number | undefined {
  const v = i[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new InputError(`${k} must be a whole number from ${min} to ${max}.`);
  return v;
}

/** Where a task lives, as "Category / List", "Category" or "Inbox". */
function placeOf(t: Task, snap: Snapshot): string {
  const list = t.listId ? snap.lists.find((l) => l.id === t.listId) : undefined;
  const cat = snap.categories.find((c) => c.id === (list?.categoryId ?? t.categoryId));
  if (cat && list) return `${cat.name} / ${list.name}`;
  return cat?.name ?? list?.name ?? "Inbox";
}

/** A compact task for the model: only the fields that help it reason, with empty ones left out. */
function describeTask(t: Task, snap: Snapshot) {
  const done = t.subtasks.filter((s) => s.done).length;
  return {
    title: t.title,
    list: placeOf(t, snap),
    ...(t.dueDate ? { due: t.dueDate } : {}),
    ...(t.dueTime ? { time: t.dueTime } : {}),
    ...(t.priority ? { priority: PRIORITY[t.priority] } : {}),
    ...(!t.completed && t.dueDate && t.dueDate < snap.today ? { overdue: true } : {}),
    ...(t.completed ? { completed: true, ...(t.completedAt ? { completed_at: t.completedAt } : {}) } : {}),
    ...(t.recurrence ? { repeats: t.recurrence.interval > 1 ? `every ${t.recurrence.interval} × ${t.recurrence.freq}` : t.recurrence.freq } : {}),
    ...(t.subtasks.length ? { subtasks: `${done}/${t.subtasks.length} done` } : {}),
    ...(t.tags.length ? { tags: t.tags } : {}),
    ...(t.notes.trim() ? { notes: t.notes.trim().slice(0, 200) } : {}),
  };
}

const byDue = (a: Task, b: Task) =>
  (a.dueDate ?? "9999") === (b.dueDate ?? "9999")
    ? (a.dueTime ?? "99") < (b.dueTime ?? "99") ? -1 : (a.dueTime ?? "99") > (b.dueTime ?? "99") ? 1 : b.priority - a.priority
    : (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : 1;

const localDay = (iso: string) => format(new Date(iso), "yyyy-MM-dd");

function describeEvent(e: SnapshotEvent) {
  return {
    title: e.title,
    date: localDay(e.starts_at),
    ...(e.all_day ? { all_day: true } : { start: format(new Date(e.starts_at), "HH:mm"), ...(e.ends_at ? { end: format(new Date(e.ends_at), "HH:mm") } : {}) }),
    ...(e.location ? { location: e.location } : {}),
  };
}

function eventsBetween(snap: Snapshot, from: string, to: string) {
  return snap.events
    .filter((e) => {
      const d = localDay(e.starts_at);
      return d >= from && d <= to;
    })
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    .map(describeEvent);
}

function getToday(snap: Snapshot) {
  const open = snap.tasks.filter((t) => !t.completed);
  return {
    date: snap.today,
    weekday: format(parseISO(snap.today), "EEEE"),
    overdue: open.filter((t) => t.dueDate && t.dueDate < snap.today).sort(byDue).map((t) => describeTask(t, snap)),
    due_today: open.filter((t) => t.dueDate === snap.today).sort(byDue).map((t) => describeTask(t, snap)),
    completed_today: snap.tasks.filter((t) => t.completed && t.completedAt && localDay(t.completedAt) === snap.today).map((t) => t.title),
    calendar: snap.calendarConnected ? eventsBetween(snap, snap.today, snap.today) : "No calendar is connected.",
  };
}

function listTasks(input: unknown, snap: Snapshot) {
  const i = obj(input);
  const status = optString(i, "status") ?? "open";
  if (!["open", "completed", "all"].includes(status)) throw new InputError("status must be open, completed or all.");
  const from = optDate(i, "due_from");
  const to = optDate(i, "due_to");
  const noDue = optBool(i, "no_due_date");
  const listName = optString(i, "list")?.trim().toLowerCase();
  const query = optString(i, "query")?.trim().toLowerCase();
  const limit = optInt(i, "limit", 1, 200) ?? 50;

  let tasks = snap.tasks.filter((t) => (status === "all" ? true : status === "completed" ? t.completed : !t.completed));
  if (from) tasks = tasks.filter((t) => t.dueDate && t.dueDate >= from);
  if (to) tasks = tasks.filter((t) => t.dueDate && t.dueDate <= to);
  if (noDue) tasks = tasks.filter((t) => !t.dueDate);
  if (listName) {
    tasks = tasks.filter((t) => {
      const place = placeOf(t, snap).toLowerCase();
      return place === listName || place.split(" / ").includes(listName);
    });
  }
  if (query) tasks = tasks.filter((t) => [t.title, t.notes, ...t.tags].some((s) => s.toLowerCase().includes(query)));

  const sorted = tasks.sort(byDue);
  return { total: sorted.length, shown: Math.min(limit, sorted.length), tasks: sorted.slice(0, limit).map((t) => describeTask(t, snap)) };
}

function listLists(snap: Snapshot) {
  const open = snap.tasks.filter((t) => !t.completed);
  const count = (fn: (t: Task) => boolean) => open.filter(fn).length;
  return {
    inbox_open: count((t) => !t.listId && !t.categoryId),
    categories: [...snap.categories]
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        name: c.name,
        open: count((t) => t.categoryId === c.id || snap.lists.some((l) => l.id === t.listId && l.categoryId === c.id)),
        lists: snap.lists
          .filter((l) => l.categoryId === c.id)
          .sort((a, b) => a.order - b.order)
          .map((l) => ({ name: l.name, open: count((t) => t.listId === l.id) })),
      })),
  };
}

function getCalendar(input: unknown, snap: Snapshot) {
  const i = obj(input);
  const from = optDate(i, "from") ?? snap.today;
  const to = optDate(i, "to") ?? format(addDays(parseISO(from), 13), "yyyy-MM-dd");
  if (to < from) throw new InputError("to must be on or after from.");
  if (differenceInCalendarDays(parseISO(to), parseISO(from)) > 120) throw new InputError("The range can be at most 120 days.");
  if (!snap.calendarConnected) return { from, to, events: [], note: "No calendar is connected. The user can connect one in the Assistant view (requires signing in)." };
  return { from, to, events: eventsBetween(snap, from, to) };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const REPEATS: RecurrenceFreq[] = ["daily", "weekdays", "weekly", "monthly", "yearly"];

/** Finds a list or category by name: "List", "Category" or "Category / List", ignoring case. */
function findPlace(name: string, snap: Snapshot): { listId: string | null; categoryId: string | null; place: string } | null {
  const want = name.trim().toLowerCase();
  if (want === "inbox") return { listId: null, categoryId: null, place: "Inbox" };
  const catName = (id: string) => snap.categories.find((c) => c.id === id)?.name ?? "";
  for (const l of snap.lists) {
    const full = `${catName(l.categoryId)} / ${l.name}`;
    if (l.name.toLowerCase() === want || full.toLowerCase() === want) return { listId: l.id, categoryId: l.categoryId, place: full };
  }
  const cat = snap.categories.find((c) => c.name.toLowerCase() === want);
  return cat ? { listId: null, categoryId: cat.id, place: cat.name } : null;
}

/** Validates the suggested tasks and resolves list names, so every card can be added as it is. */
function proposeTasks(input: unknown, snap: Snapshot): ProposedTask[] {
  const i = obj(input);
  if (!Array.isArray(i.tasks) || i.tasks.length === 0) throw new InputError("tasks must be a non-empty array.");
  if (i.tasks.length > MAX_PROPOSALS) throw new InputError(`Suggest at most ${MAX_PROPOSALS} tasks at a time.`);
  return i.tasks.map((raw, n) => {
    const at = `tasks[${n}]`;
    const t = obj(raw);
    const title = optString(t, "title")?.trim();
    if (!title) throw new InputError(`${at}.title is required.`);
    if (title.length > 200) throw new InputError(`${at}.title must be at most 200 characters.`);
    const dueDate = optDate(t, "due_date") ?? null;
    if (dueDate && dueDate < snap.today) throw new InputError(`${at}.due_date is in the past. Today is ${snap.today}.`);
    const dueTime = optString(t, "due_time") ?? null;
    if (dueTime && !TIME_RE.test(dueTime)) throw new InputError(`${at}.due_time must be HH:mm, such as 18:30.`);
    if (dueTime && !dueDate) throw new InputError(`${at}.due_time needs a due_date.`);
    const listName = optString(t, "list");
    const place = listName ? findPlace(listName, snap) : { listId: null, categoryId: null, place: "Inbox" };
    if (!place) throw new InputError(`${at}.list: there is no list or category named "${listName}". Call list_lists for the names, or leave list out for the Inbox.`);
    const priority = optString(t, "priority") ?? "none";
    const p = PRIORITY.indexOf(priority as (typeof PRIORITY)[number]);
    if (p < 0) throw new InputError(`${at}.priority must be one of ${PRIORITY.join(", ")}.`);
    const repeat = optString(t, "repeat");
    if (repeat && !REPEATS.includes(repeat as RecurrenceFreq)) throw new InputError(`${at}.repeat must be one of ${REPEATS.join(", ")}.`);
    if (repeat && !dueDate) throw new InputError(`${at}.repeat needs a due_date for the first time.`);
    const every = optInt(t, "repeat_every", 1, 12) ?? 1;
    return {
      title,
      notes: optString(t, "notes")?.trim() ?? "",
      dueDate,
      dueTime,
      ...place,
      priority: p as Priority,
      recurrence: repeat ? { freq: repeat as RecurrenceFreq, interval: every } : null,
    };
  });
}

/** Runs one tool call against the snapshot. Bad input comes back as an error result the model can correct. */
export function runTool(name: string, input: unknown, snap: Snapshot): ToolOutput {
  try {
    let result: unknown;
    switch (name as ToolName) {
      case "propose_tasks": {
        const proposals = proposeTasks(input, snap);
        return {
          content: `Shown to the user as ${proposals.length} ${proposals.length === 1 ? "card" : "cards"} with Add and Skip buttons. Nothing has been added: the user decides. Don't list the tasks again in your reply; say in a sentence or two why you suggested them.`,
          proposals,
        };
      }
      case "get_today":
        result = getToday(snap);
        break;
      case "list_tasks":
        result = listTasks(input, snap);
        break;
      case "list_lists":
        result = listLists(snap);
        break;
      case "get_calendar":
        result = getCalendar(input, snap);
        break;
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
    return { content: JSON.stringify(result) };
  } catch (e) {
    if (e instanceof InputError) return { content: e.message, isError: true };
    throw e;
  }
}
