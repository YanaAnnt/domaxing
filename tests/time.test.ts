import { describe, expect, it } from "vitest";
import { inQuietHours, zonedToUtc } from "../supabase/functions/tidy/lib/time.ts";

describe("zonedToUtc", () => {
  it("converts a local wall-clock time to UTC", () => {
    expect(zonedToUtc("2026-11-18", "09:00", "Asia/Singapore").toISOString()).toBe("2026-11-18T01:00:00.000Z");
  });

  it("handles the daylight-saving switch", () => {
    expect(zonedToUtc("2026-03-29", "12:00", "Europe/Berlin").toISOString()).toBe("2026-03-29T10:00:00.000Z");
  });
});

describe("inQuietHours", () => {
  it("wraps quiet hours across midnight", () => {
    expect(inQuietHours("23:00", "22:00", "07:30")).toBe(true);
    expect(inQuietHours("12:00", "22:00", "07:30")).toBe(false);
  });
});
