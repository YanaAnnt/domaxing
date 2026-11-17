// Timezone-aware date helpers (no dependencies). Date keys are "YYYY-MM-DD" in the user's timezone.

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function safeTz(tz: string | null | undefined): string {
  try {
    if (tz) {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    }
  } catch {
    /* fall through */
  }
  return "UTC";
}

export function localParts(d: Date, tz: string) {
  const parts = Object.fromEntries(fmt(tz).formatToParts(d).map((p) => [p.type, p.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hh: Number(parts.hour),
    mm: Number(parts.minute),
    time: `${parts.hour}:${parts.minute}`,
  };
}

export const dateKeyIn = (d: Date, tz: string) => localParts(d, tz).dateKey;

const keyToUtc = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function addDays(k: string, n: number): string {
  return new Date(keyToUtc(k) + n * 86400000).toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((keyToUtc(a) - keyToUtc(b)) / 86400000);
}

export function weekdayOf(k: string): number {
  return new Date(keyToUtc(k)).getUTCDay();
}

/** Offset (ms) of `tz` from UTC at instant `t`. */
function tzOffset(t: number, tz: string): number {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** Convert a wall-clock date+time in `tz` to a UTC Date. */
export function zonedToUtc(dateKey: string, time: string, tz: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffset(guess, tz);
  const t = guess - off1;
  const off2 = tzOffset(t, tz);
  return new Date(off1 === off2 ? t : guess - off2);
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** true when local time `now` is inside the [start, end) quiet window (which may wrap midnight). */
export function inQuietHours(nowTime: string, start: string, end: string): boolean {
  const n = minutesOf(nowTime), s = minutesOf(start), e = minutesOf(end);
  if (s === e) return false;
  return s < e ? n >= s && n < e : n >= s || n < e;
}
