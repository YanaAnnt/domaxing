/** Pure helpers for the Week time grid: where a task sits, which slot a click lands on, where to scroll. */

export const DAY_MINUTES = 24 * 60;
/** Tasks have no duration yet, so each one fills an hour on the grid. */
export const BLOCK_MINUTES = 60;

const pad = (n: number) => String(n).padStart(2, "0");

/** "09:30" → 570. Anything that is not a valid HH:mm gives null. */
export function toMinutes(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 570 → "09:30", kept inside the day. */
export function fromMinutes(min: number): string {
  const c = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(min)));
  return `${pad(Math.floor(c / 60))}:${pad(c % 60)}`;
}

/** The time a click in an hour cell lands on: the hour itself, or half past in the lower half of the cell. */
export function slotTime(hour: number, offsetY: number, hourPx: number): string {
  return fromMinutes(hour * 60 + (offsetY >= hourPx / 2 ? 30 : 0));
}

export interface Placed<T> {
  item: T;
  start: number;
  end: number;
  /** Which side-by-side lane the block takes when blocks overlap, and how many lanes its group has. */
  lane: number;
  lanes: number;
}

/**
 * Lays out the timed items of one day. Items that overlap share the width of the column in lanes,
 * like a calendar app. Items without a valid time are left out (they belong in the all-day row).
 */
export function layoutDay<T>(items: T[], timeOf: (item: T) => string | null | undefined, length = BLOCK_MINUTES): Placed<T>[] {
  const timed = items
    .map((item) => ({ item, start: toMinutes(timeOf(item)) }))
    .filter((x): x is { item: T; start: number } => x.start !== null)
    .map((x) => ({ ...x, end: Math.min(DAY_MINUTES, x.start + length) }))
    .sort((a, b) => a.start - b.start);

  const out: Placed<T>[] = [];
  let group: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const closeGroup = () => {
    for (const p of group) p.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };

  for (const x of timed) {
    if (x.start >= groupEnd) {
      closeGroup();
      groupEnd = -1;
    }
    let lane = laneEnds.findIndex((end) => end <= x.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(x.end);
    } else laneEnds[lane] = x.end;
    const p: Placed<T> = { ...x, lane, lanes: 1 };
    group.push(p);
    out.push(p);
    groupEnd = Math.max(groupEnd, x.end);
  }
  closeGroup();
  return out;
}

/**
 * Where a block is drawn, in minutes: at least `min` tall and never past midnight,
 * so a task at 23:59 still shows as a readable block at the bottom of the day.
 */
export function blockBox(start: number, end: number, min = 30): { top: number; bottom: number } {
  const top = Math.max(0, Math.min(start, DAY_MINUTES - min));
  return { top, bottom: Math.max(end, top + min) };
}

/**
 * The hour the grid opens scrolled to: the earliest task or 8 AM, whichever is first.
 * When today is shown and it is already late, it opens a couple of hours before now instead,
 * or at a task from the last few hours so it is not cut off at the top.
 */
export function firstHour(startMinutes: number[], nowMinutes: number | null, fallback = 8): number {
  const hours = startMinutes.map((m) => Math.floor(m / 60));
  let h = Math.min(fallback, ...hours);
  if (nowMinutes !== null) {
    const nowHour = Math.floor(nowMinutes / 60);
    if (nowHour > h + 7) h = Math.min(nowHour - 2, ...hours.filter((x) => x >= nowHour - 6));
  }
  return Math.max(0, Math.min(23, h));
}
