import { describe, expect, it } from "vitest";
import { blockBox, firstHour, fromMinutes, layoutDay, slotTime, toMinutes } from "../lib/time-grid.ts";

describe("toMinutes / fromMinutes", () => {
  it("converts between HH:mm and minutes", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("0:05")).toBe(5);
    expect(fromMinutes(570)).toBe("09:30");
    expect(fromMinutes(0)).toBe("00:00");
  });

  it("rejects times that are not real", () => {
    expect(toMinutes("24:00")).toBeNull();
    expect(toMinutes("9:75")).toBeNull();
    expect(toMinutes(null)).toBeNull();
    expect(toMinutes("soon")).toBeNull();
  });

  it("keeps a time inside the day", () => {
    expect(fromMinutes(-20)).toBe("00:00");
    expect(fromMinutes(2000)).toBe("23:59");
  });
});

describe("slotTime", () => {
  it("gives the hour in the top half of a cell and half past in the bottom half", () => {
    expect(slotTime(14, 10, 52)).toBe("14:00");
    expect(slotTime(14, 30, 52)).toBe("14:30");
    expect(slotTime(0, 0, 52)).toBe("00:00");
  });
});

describe("layoutDay", () => {
  const task = (id: string, time: string | null) => ({ id, time });

  it("places timed tasks and leaves out the untimed ones", () => {
    const placed = layoutDay([task("b", "13:00"), task("none", null), task("a", "09:00")], (t) => t.time);
    expect(placed.map((p) => [p.item.id, p.start, p.end, p.lane, p.lanes])).toEqual([
      ["a", 540, 600, 0, 1],
      ["b", 780, 840, 0, 1],
    ]);
  });

  it("puts overlapping tasks side by side", () => {
    const placed = layoutDay([task("a", "09:00"), task("b", "09:30"), task("c", "10:15")], (t) => t.time);
    const byId = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect([byId.a.lane, byId.b.lane, byId.c.lane]).toEqual([0, 1, 0]);
    expect([byId.a.lanes, byId.b.lanes, byId.c.lanes]).toEqual([2, 2, 2]);
  });

  it("starts a new group once the earlier blocks have ended", () => {
    const placed = layoutDay([task("a", "09:00"), task("b", "09:30"), task("c", "11:00")], (t) => t.time);
    const c = placed.find((p) => p.item.id === "c")!;
    expect([c.lane, c.lanes]).toEqual([0, 1]);
  });

  it("clips a late task at midnight", () => {
    expect(layoutDay([task("late", "23:30")], (t) => t.time)[0].end).toBe(24 * 60);
  });
});

describe("blockBox", () => {
  it("keeps a normal block where it is", () => {
    expect(blockBox(540, 600)).toEqual({ top: 540, bottom: 600 });
  });

  it("keeps a block that starts just before midnight readable and inside the day", () => {
    expect(blockBox(1439, 1440)).toEqual({ top: 1410, bottom: 1440 });
  });
});

describe("firstHour", () => {
  it("opens at 8 AM, or earlier when a task starts earlier", () => {
    expect(firstHour([], null)).toBe(8);
    expect(firstHour([13 * 60], null)).toBe(8);
    expect(firstHour([6 * 60 + 30], null)).toBe(6);
  });

  it("opens near now when it is already late in the day", () => {
    expect(firstHour([], 20 * 60)).toBe(18);
    expect(firstHour([], 11 * 60)).toBe(8);
  });

  it("late in the day, still shows a task from the last few hours", () => {
    expect(firstHour([14 * 60], 18 * 60)).toBe(14);
    expect(firstHour([7 * 60], 20 * 60)).toBe(18);
  });
});
