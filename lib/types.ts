/** 0 = none, 1 = low, 2 = medium, 3 = high, 4 = urgent */
export type Priority = 0 | 1 | 2 | 3 | 4;

export type RecurrenceFreq = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export interface Recurrence {
  freq: RecurrenceFreq;
  /** every N units (1 = every day/week/month/year) */
  interval: number;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** Shared sync metadata on every persisted record. */
export interface SyncMeta {
  id: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO, last-write-wins key
  deleted?: boolean; // tombstone so deletions sync across devices
}

export interface Category extends SyncMeta {
  name: string;
  color: string; // key of CATEGORY_COLORS
  icon: string; // key of CATEGORY_ICONS
  order: number;
  collapsed: boolean;
}

/** A project / list that lives inside a category. */
export interface Section {
  id: string;
  name: string;
}

export interface List extends SyncMeta {
  categoryId: string;
  name: string;
  order: number;
  /** headings that group tasks inside the list */
  sections?: Section[];
}

export interface Task extends SyncMeta {
  title: string;
  notes: string;
  categoryId: string | null;
  listId: string | null;
  dueDate: string | null; // YYYY-MM-DD (local)
  dueTime: string | null; // HH:mm
  priority: Priority;
  subtasks: Subtask[];
  recurrence: Recurrence | null;
  reminderAt: string | null; // ISO
  tags: string[];
  completed: boolean;
  completedAt: string | null;
  order: number;
  sectionId?: string | null;
  /** calendar event this task prepares for (set by the assistant) */
  eventKey?: string | null;
  /** "ai" | "rules" when created from an approved suggestion */
  source?: string | null;
}

export type ViewId =
  | { type: "today" }
  | { type: "upcoming" }
  | { type: "inbox" }
  | { type: "all" }
  | { type: "completed" }
  | { type: "week" }
  | { type: "progress" }
  | { type: "browse" }
  | { type: "assistant" }
  | { type: "category"; id: string }
  | { type: "list"; id: string };

export type SortMode = "manual" | "priority" | "due" | "title" | "created";

export interface Settings {
  theme: "system" | "light" | "dark";
  accent: string; // key of ACCENTS
  weekStartsOn: 0 | 1;
  showCompletedInLists: boolean;
}

export type SyncTable = "categories" | "lists" | "tasks";
