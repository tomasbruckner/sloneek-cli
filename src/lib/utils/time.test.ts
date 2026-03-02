import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DateTime } from "luxon";
import {
  formatHours,
  resolveCalendarUserId,
  resolveCalendarUserName,
  isSameDay,
  isWorkDay,
  getStartDay,
  calculateDurationMinutes,
  convertDayToISO,
  convertDayAndTimeToIso,
  createDateTimeForSpecificDay,
  createDateTimeForToday,
  getCurrentMonth,
  getCurrentDay,
  getTodayToEndOfYear,
  getTodayFormatted,
  getMonthRangePrague,
} from "./time";

describe("formatHours", () => {
  it("returns integer string when minutes divide evenly into hours", () => {
    expect(formatHours(60)).toBe("1");
    expect(formatHours(120)).toBe("2");
    expect(formatHours(0)).toBe("0");
  });

  it("returns one-decimal string when minutes do not divide evenly", () => {
    expect(formatHours(90)).toBe("1.5");
    expect(formatHours(45)).toBe("0.8");
    expect(formatHours(150)).toBe("2.5");
  });
});

describe("resolveCalendarUserId", () => {
  it("returns uuid when present", () => {
    expect(resolveCalendarUserId({ uuid: "abc-123", value: "val" })).toBe("abc-123");
  });

  it("falls back to value when uuid is missing", () => {
    expect(resolveCalendarUserId({ value: "val-456" })).toBe("val-456");
  });

  it("returns empty string when both are missing", () => {
    expect(resolveCalendarUserId({})).toBe("");
  });
});

describe("resolveCalendarUserName", () => {
  it("returns full_name when present", () => {
    expect(resolveCalendarUserName({ full_name: "John Doe", name: "John" })).toBe("John Doe");
  });

  it("falls back to name when full_name is missing", () => {
    expect(resolveCalendarUserName({ name: "Jane" })).toBe("Jane");
  });

  it("returns empty string when both are missing", () => {
    expect(resolveCalendarUserName({})).toBe("");
  });
});

describe("isSameDay", () => {
  it("returns true for two timestamps on the same day", () => {
    expect(isSameDay("2025-06-15T08:00:00+02:00", "2025-06-15T17:00:00+02:00")).toBe(true);
  });

  it("returns false for timestamps on different days", () => {
    expect(isSameDay("2025-06-15T23:00:00+02:00", "2025-06-16T01:00:00+02:00")).toBe(false);
  });
});

describe("isWorkDay", () => {
  it("returns true for Monday through Friday", () => {
    // 2025-06-16 is Monday
    expect(isWorkDay("2025-06-16T10:00:00+02:00")).toBe(true);
    // 2025-06-20 is Friday
    expect(isWorkDay("2025-06-20T10:00:00+02:00")).toBe(true);
  });

  it("returns false for Saturday and Sunday", () => {
    // 2025-06-21 is Saturday
    expect(isWorkDay("2025-06-21T10:00:00+02:00")).toBe(false);
    // 2025-06-22 is Sunday
    expect(isWorkDay("2025-06-22T10:00:00+02:00")).toBe(false);
  });
});

describe("getStartDay", () => {
  it("returns the start of the day in Prague timezone", () => {
    const result = getStartDay("2025-06-15T14:30:00+02:00");
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
    expect(result.second).toBe(0);
    expect(result.day).toBe(15);
  });
});

describe("calculateDurationMinutes", () => {
  it("calculates correct duration between two DateTimes", () => {
    const start = DateTime.fromISO("2025-06-15T08:00:00+02:00");
    const end = DateTime.fromISO("2025-06-15T09:30:00+02:00");
    expect(calculateDurationMinutes(start, end)).toBe(90);
  });

  it("returns 0 for same start and end", () => {
    const dt = DateTime.fromISO("2025-06-15T08:00:00+02:00");
    expect(calculateDurationMinutes(dt, dt)).toBe(0);
  });
});

describe("convertDayToISO", () => {
  it("converts DD.MM.YYYY string to ISO", () => {
    const result = convertDayToISO("15.6.2025");
    expect(result).toContain("2025-06-15");
  });

  it("applies addDays offset", () => {
    const result = convertDayToISO("15.6.2025", 1);
    expect(result).toContain("2025-06-16");
  });
});

describe("convertDayAndTimeToIso", () => {
  it("converts date and time strings to ISO", () => {
    const result = convertDayAndTimeToIso("15.6.2025", "14:30");
    expect(result).toContain("2025-06-15");
    expect(result).toContain("14:30");
  });
});

describe("createDateTimeForSpecificDay", () => {
  it("creates DateTime for a specific day and time", () => {
    const result = createDateTimeForSpecificDay("09:30", "15.6");
    expect(result.hour).toBe(9);
    expect(result.minute).toBe(30);
    expect(result.day).toBe(15);
    expect(result.month).toBe(6);
  });

  it("accepts trailing dot in day string", () => {
    const result = createDateTimeForSpecificDay("10:00", "15.6.");
    expect(result.day).toBe(15);
    expect(result.month).toBe(6);
  });

  it("throws on invalid time format", () => {
    expect(() => createDateTimeForSpecificDay("25:00", "15.6")).toThrow("Invalid time format");
  });

  it("throws on invalid day format", () => {
    expect(() => createDateTimeForSpecificDay("09:00", "abc")).toThrow("Invalid day format");
  });
});

describe("createDateTimeForToday", () => {
  it("creates DateTime for today with the given time", () => {
    const result = createDateTimeForToday("14:00");
    expect(result.hour).toBe(14);
    expect(result.minute).toBe(0);
  });
});

describe("getCurrentMonth", () => {
  it("returns object with isoStart, isoEnd, and now", () => {
    const result = getCurrentMonth();
    expect(result).toHaveProperty("isoStart");
    expect(result).toHaveProperty("isoEnd");
    expect(result).toHaveProperty("now");
    expect(result.isoStart).toBeTruthy();
    expect(result.isoEnd).toBeTruthy();
  });
});

describe("getCurrentDay", () => {
  it("returns object with isoStart, isoEnd, and now", () => {
    const result = getCurrentDay();
    expect(result).toHaveProperty("isoStart");
    expect(result).toHaveProperty("isoEnd");
    expect(result).toHaveProperty("now");
    expect(result.isoStart).toBeTruthy();
    expect(result.isoEnd).toBeTruthy();
  });
});

describe("getTodayToEndOfYear", () => {
  it("returns object with isoStart, isoEnd, and now", () => {
    const result = getTodayToEndOfYear();
    expect(result).toHaveProperty("isoStart");
    expect(result).toHaveProperty("isoEnd");
    expect(result).toHaveProperty("now");
    // isoEnd should be in December
    expect(result.isoEnd).toContain("-12-31");
  });
});

describe("getTodayFormatted", () => {
  it("returns date in d.M.yyyy format", () => {
    const result = getTodayFormatted();
    // Should match pattern like 15.6.2025 or 1.12.2025
    expect(result).toMatch(/^\d{1,2}\.\d{1,2}\.\d{4}$/);
  });
});

describe("getMonthRangePrague", () => {
  it("returns current month when no args", () => {
    const result = getMonthRangePrague();
    const now = DateTime.now().setZone("Europe/Prague");
    expect(result.label).toContain(String(now.year));
    expect(result).toHaveProperty("isoStart");
    expect(result).toHaveProperty("isoEnd");
    expect(result).toHaveProperty("monthStart");
  });

  it("parses YYYY-MM format", () => {
    const result = getMonthRangePrague("2025-08");
    expect(result.label).toBe("August 2025");
    expect(result.isoStart).toContain("2025-08-01");
  });

  it("parses MM.YYYY format", () => {
    const result = getMonthRangePrague("08.2025");
    expect(result.label).toBe("August 2025");
  });

  it("parses M.YYYY format", () => {
    const result = getMonthRangePrague("8.2025");
    expect(result.label).toBe("August 2025");
  });

  it("parses bare month number (uses current year)", () => {
    const result = getMonthRangePrague("3");
    const now = DateTime.now().setZone("Europe/Prague");
    expect(result.label).toBe(`March ${now.year}`);
  });

  it("parses two-digit month number", () => {
    const result = getMonthRangePrague("11");
    const now = DateTime.now().setZone("Europe/Prague");
    expect(result.label).toBe(`November ${now.year}`);
  });

  it("returns previous month when previousMonth flag is set and no monthArg", () => {
    const result = getMonthRangePrague(undefined, true);
    const now = DateTime.now().setZone("Europe/Prague");
    const prev = now.minus({ months: 1 });
    expect(result.label).toContain(String(prev.year));
  });

  it("ignores previousMonth flag when monthArg is provided", () => {
    const result = getMonthRangePrague("2025-06", true);
    expect(result.label).toBe("June 2025");
  });
});
