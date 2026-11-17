import type { Category, List, Task, Priority, Recurrence } from "./types";
import { uid, nowIso } from "./utils";
import { addDaysKey, todayKey } from "./dates";

/** Example data for first-run. Everything here can be edited or deleted. */
export function buildSeed(): { categories: Category[]; lists: List[]; tasks: Task[] } {
  const ts = nowIso();
  const today = todayKey();
  const categories: Category[] = [];
  const lists: List[] = [];
  const tasks: Task[] = [];
  let order = 0;

  const cat = (name: string, icon: string, color: string, listNames: string[]) => {
    const c: Category = {
      id: uid(), name, icon, color, order: (categories.length + 1) * 1000, collapsed: false,
      createdAt: ts, updatedAt: ts,
    };
    categories.push(c);
    const ls = listNames.map((n, i) => {
      const l: List = { id: uid(), categoryId: c.id, name: n, order: (i + 1) * 1000, createdAt: ts, updatedAt: ts };
      lists.push(l);
      return l;
    });
    return { c, ls };
  };

  const task = (
    title: string,
    opts: {
      list?: List; cat?: Category; due?: number | null; time?: string; priority?: Priority;
      notes?: string; subtasks?: [string, boolean][]; tags?: string[]; recurrence?: Recurrence;
      completedDaysAgo?: number;
    } = {},
  ) => {
    order += 1000;
    const completed = opts.completedDaysAgo !== undefined;
    const completedAt = completed
      ? new Date(Date.now() - opts.completedDaysAgo! * 86400000 - 3600000).toISOString()
      : null;
    tasks.push({
      id: uid(),
      title,
      notes: opts.notes ?? "",
      categoryId: opts.list?.categoryId ?? opts.cat?.id ?? null,
      listId: opts.list?.id ?? null,
      dueDate: opts.due === undefined || opts.due === null ? null : addDaysKey(today, opts.due),
      dueTime: opts.time ?? null,
      priority: opts.priority ?? 0,
      subtasks: (opts.subtasks ?? []).map(([t, d]) => ({ id: uid(), title: t, done: d })),
      recurrence: opts.recurrence ?? null,
      reminderAt: null,
      tags: opts.tags ?? [],
      completed,
      completedAt,
      order,
      createdAt: ts,
      updatedAt: ts,
    });
  };

  const work = cat("Work", "briefcase", "blue", [
    "Daily Tasks", "Projects", "Meetings & Follow-ups", "Important Deadlines", "Ideas & Improvements",
  ]);
  const uni = cat("University", "graduation", "violet", [
    "Assignments", "Exams", "Study Sessions", "Courses",
  ]);
  const personal = cat("Personal", "home", "orange", ["Daily Errands", "Shopping", "Appointments", "Personal Goals"]);
  const fit = cat("Fitness & Health", "dumbbell", "green", ["Weekly Workouts", "Habits", "Health Appointments"]);

  // Inbox: uncategorised capture
  task("Look into that podcast Sam recommended");
  task("Gift idea for Mom's birthday", { notes: "Something for the garden?" });

  // Work
  task("Review pull requests", { list: work.ls[0], due: 0, priority: 2, recurrence: { freq: "weekdays", interval: 1 } });
  task("Prepare Q4 roadmap presentation", {
    list: work.ls[1], due: 0, time: "14:00", priority: 4, tags: ["roadmap"],
    notes: "Focus on the three big bets. Keep it to 10 slides.",
    subtasks: [["Collect metrics from analytics", true], ["Draft storyline", false], ["Design slides", false], ["Rehearse once", false]],
  });
  task("Follow up with design team about onboarding", { list: work.ls[2], due: 1, priority: 2 });
  task("Weekly 1:1 with manager", { list: work.ls[2], due: 2, time: "10:30", recurrence: { freq: "weekly", interval: 1 } });
  task("Submit expense report", { list: work.ls[3], due: -1, priority: 3 });
  task("Contract renewal deadline", { list: work.ls[3], due: 6, priority: 4, tags: ["legal"] });
  task("Automate the weekly report", { list: work.ls[4], tags: ["idea"] });

  // University
  task("Statistics problem set 4", {
    list: uni.ls[0], due: 1, time: "23:59", priority: 3, tags: ["stats"],
    subtasks: [["Questions 1-5", true], ["Questions 6-10", false]],
  });
  task("Essay outline: Modern Architecture", { list: uni.ls[0], due: 4, priority: 2 });
  task("Midterm: Microeconomics", { list: uni.ls[1], due: 5, time: "09:00", priority: 4 });
  task("Review lecture notes, chapters 6-8", { list: uni.ls[2], due: 0, priority: 1 });

  // Personal
  task("Pick up dry cleaning", { list: personal.ls[0], due: 0 });
  task("Groceries", {
    list: personal.ls[1], due: 0, tags: ["errand"],
    subtasks: [["Oat milk", false], ["Avocados", false], ["Coffee beans", false], ["Pasta", true]],
  });
  task("Dentist appointment", { list: personal.ls[2], due: 3, time: "16:00", priority: 2 });
  task("Read 12 books this year", { list: personal.ls[3], notes: "Currently: The Creative Act" });

  // Fitness
  task("Morning run, 5k", { list: fit.ls[0], due: 0, time: "07:00", recurrence: { freq: "daily", interval: 2 } });
  task("Upper body strength", { list: fit.ls[0], due: 2, priority: 1 });
  task("Drink 2L of water", { list: fit.ls[1], due: 0, recurrence: { freq: "daily", interval: 1 } });
  task("Annual check-up", { list: fit.ls[2], due: 9 });

  // A little history so Completed and Progress have something to show
  task("Book flights for the conference", { list: work.ls[1], completedDaysAgo: 0, priority: 2 });
  task("Reply to Professor Lee", { list: uni.ls[3], completedDaysAgo: 1 });
  task("Yoga class", { list: fit.ls[0], completedDaysAgo: 2 });
  task("Renew library card", { list: personal.ls[0], completedDaysAgo: 3 });

  return { categories, lists, tasks };
}
