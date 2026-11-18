// Read-only tools the chat assistant can call to look at the user's tasks, lists, today's plan and calendar.
// Everything runs in the browser against a snapshot of the local data. Nothing is changed.
// Kept free of React and storage so it can be unit-tested.
import type Anthropic from "@anthropic-ai/sdk";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Category, List, Task } from "../types";

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

export type ToolName = "get_today" | "list_tasks" | "list_lists" | "get_calendar";

/** Short labels shown in the chat while and after the assistant looks something up. */
export const TOOL_LABELS: Record<ToolName, string> = {
  get_today: "Today's plan",
  list_tasks: "Your tasks",
  list_lists: "Your lists",
  get_calendar: "Your calendar",
};

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
];

export interface ToolOutput {
  content: string;
  isError?: boolean;
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

/** Runs one tool call against the snapshot. Bad input comes back as an error result the model can correct. */
export function runTool(name: string, input: unknown, snap: Snapshot): ToolOutput {
  try {
    let result: unknown;
    switch (name as ToolName) {
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
