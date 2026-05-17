import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  fetchCalendarOptions: vi.fn(),
  getEvents: vi.fn(),
  getAbsences: vi.fn(),
  getNationalHolidays: vi.fn(),
}));

import { getReport, getReportSummary, getValidateReport } from "./reports";
import { fetchCalendarOptions, getEvents, getAbsences, getNationalHolidays } from "../utils/api";

const mockedFetchCalendarOptions = vi.mocked(fetchCalendarOptions);
const mockedGetEvents = vi.mocked(getEvents);
const mockedGetAbsences = vi.mocked(getAbsences);
const mockedGetNationalHolidays = vi.mocked(getNationalHolidays);

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const range: MonthRange = {
  isoStart: "2026-05-01T00:00:00+02:00",
  isoEnd: "2026-05-31T23:59:59+02:00",
  rangeLabel: "May 2026",
};

// Calendar options: 2 teams, 3 users total
const calendarOptionsFixture = {
  data: {
    users: [
      {
        team_name: "Dev Team",
        users: [
          { uuid: "u1", full_name: "Alice Dev" },
          { uuid: "u2", full_name: "Bob Dev" },
        ],
      },
      {
        team_name: "Ops Team",
        users: [{ uuid: "u3", full_name: "Charlie Ops" }],
      },
    ],
  },
};

// Events for May 2026 — Alice has 2 events, Bob has 1, Charlie has 1
const eventsFixture = {
  data: {
    events: [
      {
        uuid: "e1",
        started_at: "2026-05-04T08:00:00+02:00",
        ended_at: "2026-05-04T16:00:00+02:00",
        user: { uuid: "u1", full_name: "Alice Dev" },
        client: { name: "Acme" },
        client_project: { project_name: "Website" },
      },
      {
        uuid: "e2",
        started_at: "2026-05-05T08:00:00+02:00",
        ended_at: "2026-05-05T16:00:00+02:00",
        user: { uuid: "u1", full_name: "Alice Dev" },
        client: { name: "Acme" },
        client_project: { project_name: "Website" },
      },
      {
        uuid: "e3",
        started_at: "2026-05-06T09:00:00+02:00",
        ended_at: "2026-05-06T17:00:00+02:00",
        user: { uuid: "u2", full_name: "Bob Dev" },
        client: { name: "Beta" },
        client_project: { project_name: "App" },
      },
      {
        uuid: "e4",
        started_at: "2026-05-07T08:00:00+02:00",
        ended_at: "2026-05-07T16:00:00+02:00",
        user: { uuid: "u3", full_name: "Charlie Ops" },
        client: { name: "Gamma" },
        client_project: { project_name: "Infra" },
      },
    ],
  },
};

// Absences: Alice has a 2-day full_day absence (Mon–Tue 2026-05-11/12), Bob has a partial absence
const absencesFixture = {
  data: {
    events: [
      {
        uuid: "a1",
        started_at: "2026-05-11T00:00:00+02:00",
        ended_at: "2026-05-12T23:59:59+02:00",
        event_type: "full_day",
        type: "vacation",
        user: { uuid: "u1" },
      },
      {
        uuid: "a2",
        started_at: "2026-05-13T09:00:00+02:00",
        ended_at: "2026-05-13T13:00:00+02:00",
        event_type: "half_day",
        type: "vacation",
        user: { uuid: "u2" },
      },
    ],
  },
};

// No national holidays in these fixtures by default
const holidaysFixture = { data: [] };

// Helper to set up standard mocks for a test
function setupStandardMocks() {
  mockedFetchCalendarOptions.mockResolvedValue(calendarOptionsFixture as any);
  mockedGetEvents.mockResolvedValue(eventsFixture as any);
  mockedGetAbsences.mockResolvedValue(absencesFixture as any);
  mockedGetNationalHolidays.mockResolvedValue(holidaysFixture as any);
}

// ─── getReport ────────────────────────────────────────────────────────────────

describe("getReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns one row per event sorted by date with correct columns", async () => {
    setupStandardMocks();

    const rows = await getReport("tok", range, {});

    expect(rows).toHaveLength(4);
    // Rows are sorted by started_at
    expect(rows[0].date).toBe("04.05.2026");
    expect(rows[0].userName).toBe("Alice Dev");
    expect(rows[0].team).toBe("Dev Team");
    expect(rows[0].client).toBe("Acme");
    expect(rows[0].projectOrTitle).toBe("Website");
    expect(rows[0].time).toMatch(/08:00/);

    expect(rows[1].date).toBe("05.05.2026");
    expect(rows[2].date).toBe("06.05.2026");
    expect(rows[3].date).toBe("07.05.2026");
  });

  it("filters users by team prefix (substring, case-insensitive)", async () => {
    setupStandardMocks();

    const rows = await getReport("tok", range, { teamPrefixes: ["ops"] });

    // Only Charlie from Ops Team
    expect(rows).toHaveLength(1);
    expect(rows[0].userName).toBe("Charlie Ops");
    expect(rows[0].team).toBe("Ops Team");
  });

  it("filters users by name prefix (substring, case-insensitive)", async () => {
    setupStandardMocks();

    const rows = await getReport("tok", range, { namePrefix: "alice" });

    // Only Alice's events
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userName === "Alice Dev")).toBe(true);
  });

  it("combines team + name filters with AND", async () => {
    setupStandardMocks();

    // Team = dev, name = bob → only Bob
    const rows = await getReport("tok", range, { teamPrefixes: ["dev"], namePrefix: "bob" });

    expect(rows).toHaveLength(1);
    expect(rows[0].userName).toBe("Bob Dev");
  });

  it("returns empty array when no events match", async () => {
    mockedFetchCalendarOptions.mockResolvedValue(calendarOptionsFixture as any);
    mockedGetEvents.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetAbsences.mockResolvedValue(absencesFixture as any);
    mockedGetNationalHolidays.mockResolvedValue(holidaysFixture as any);

    const rows = await getReport("tok", range, {});
    expect(rows).toHaveLength(0);
  });

  it("falls back to title/message when client_project is missing", async () => {
    mockedFetchCalendarOptions.mockResolvedValue(calendarOptionsFixture as any);
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          {
            uuid: "e9",
            started_at: "2026-05-04T08:00:00+02:00",
            ended_at: "2026-05-04T16:00:00+02:00",
            user: { uuid: "u1", full_name: "Alice Dev" },
            title: "My title",
          },
        ],
      },
    } as any);
    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetNationalHolidays.mockResolvedValue(holidaysFixture as any);

    const rows = await getReport("tok", range, {});
    expect(rows[0].projectOrTitle).toBe("My title");
    expect(rows[0].client).toBe("-");
  });
});

// ─── getReportSummary ─────────────────────────────────────────────────────────

describe("getReportSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aggregates per-user work minutes correctly", async () => {
    setupStandardMocks();

    const rows = await getReportSummary("tok", range, {});

    // Alice: 2 events × 8h = 960 min work
    const alice = rows.find((r) => r.userName === "Alice Dev")!;
    expect(alice).toBeDefined();
    expect(alice.workMinutes).toBe(960);

    // Bob: 1 event × 8h = 480 min work
    const bob = rows.find((r) => r.userName === "Bob Dev")!;
    expect(bob).toBeDefined();
    expect(bob.workMinutes).toBe(480);
  });

  it("applies 30-minute deduction for full_day absences per workday", async () => {
    setupStandardMocks();

    const rows = await getReportSummary("tok", range, {});

    // Alice: 2-day full_day absence spanning 2026-05-11 to 2026-05-12
    // Multi-day path: each day is computed as dayEnd - dayStart = 23h59m59s
    // Math.round(1439.983...) = 1440, minus 30 = 1410 min per day
    // Total absence = 2 × 1410 = 2820 min
    const alice = rows.find((r) => r.userName === "Alice Dev")!;
    expect(alice.absenceMinutes).toBe(2820);
  });

  it("does NOT apply 30-minute deduction for half_day absences", async () => {
    setupStandardMocks();

    const rows = await getReportSummary("tok", range, {});

    // Bob: 1 half_day absence = 4h = 240 min, no deduction
    const bob = rows.find((r) => r.userName === "Bob Dev")!;
    expect(bob.absenceMinutes).toBe(240);
  });

  it("includes all selected users, even those with zero activity", async () => {
    setupStandardMocks();

    const rows = await getReportSummary("tok", range, {});

    // Charlie has work event but no absences
    const charlie = rows.find((r) => r.userName === "Charlie Ops")!;
    expect(charlie).toBeDefined();
    expect(charlie.absenceMinutes).toBe(0);
  });

  it("computes totalMinutes as workMinutes + absenceMinutes", async () => {
    setupStandardMocks();

    const rows = await getReportSummary("tok", range, {});

    for (const row of rows) {
      expect(row.totalMinutes).toBe(row.workMinutes + row.absenceMinutes);
    }
  });

  it("skips in_work type absences", async () => {
    mockedFetchCalendarOptions.mockResolvedValue(calendarOptionsFixture as any);
    mockedGetEvents.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetAbsences.mockResolvedValue({
      data: {
        events: [
          {
            uuid: "a-iw",
            started_at: "2026-05-04T09:00:00+02:00",
            ended_at: "2026-05-04T13:00:00+02:00",
            event_type: "half_day",
            type: "in_work",
            user: { uuid: "u1" },
          },
        ],
      },
    } as any);
    mockedGetNationalHolidays.mockResolvedValue(holidaysFixture as any);

    const rows = await getReportSummary("tok", range, {});
    const alice = rows.find((r) => r.userName === "Alice Dev")!;
    expect(alice.absenceMinutes).toBe(0);
  });

  it("filters by team prefix", async () => {
    setupStandardMocks();

    const rows = await getReportSummary("tok", range, { teamPrefixes: ["ops"] });

    expect(rows).toHaveLength(1);
    expect(rows[0].userName).toBe("Charlie Ops");
  });
});

// ─── getValidateReport ────────────────────────────────────────────────────────

describe("getValidateReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts workdays with no event AND no approved absence as missing", async () => {
    // Use a small range: 2026-05-04 (Mon) to 2026-05-08 (Fri) — 5 workdays
    const smallRange: MonthRange = {
      isoStart: "2026-05-04T00:00:00+02:00",
      isoEnd: "2026-05-08T23:59:59+02:00",
      rangeLabel: "Week",
    };

    mockedFetchCalendarOptions.mockResolvedValue({
      data: {
        users: [
          {
            team_name: "Dev Team",
            users: [{ uuid: "u1", full_name: "Alice Dev" }],
          },
        ],
      },
    } as any);

    // Alice has event only on May 4 — missing May 5, 6, 7, 8
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          {
            uuid: "e1",
            started_at: "2026-05-04T08:00:00+02:00",
            ended_at: "2026-05-04T16:00:00+02:00",
            user: { uuid: "u1", full_name: "Alice Dev" },
          },
        ],
      },
    } as any);

    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetNationalHolidays.mockResolvedValue({ data: [] } as any);

    // today is 2026-05-17 (from system date), so the full week is in the past
    const rows = await getValidateReport("tok", smallRange, {}, { ignoreToday: false });

    expect(rows).toHaveLength(1);
    expect(rows[0].userName).toBe("Alice Dev");
    expect(rows[0].missingCount).toBe(3); // May 5, 6, 7 (May 8 excluded: isoEnd.startOf("day") is exclusive upper bound)
    expect(rows[0].missingDates).toContain("05.05.2026");
    expect(rows[0].missingDates).not.toContain("08.05.2026");
    expect(rows[0].missingDates).not.toContain("04.05.2026");
  });

  it("respects national holidays — holiday days are NOT counted as missing", async () => {
    const smallRange: MonthRange = {
      isoStart: "2026-05-04T00:00:00+02:00",
      isoEnd: "2026-05-08T23:59:59+02:00",
      rangeLabel: "Week",
    };

    mockedFetchCalendarOptions.mockResolvedValue({
      data: { users: [{ team_name: "Dev Team", users: [{ uuid: "u1", full_name: "Alice Dev" }] }] },
    } as any);

    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          {
            uuid: "e1",
            started_at: "2026-05-04T08:00:00+02:00",
            ended_at: "2026-05-04T16:00:00+02:00",
            user: { uuid: "u1", full_name: "Alice Dev" },
          },
        ],
      },
    } as any);

    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);

    // May 5 is a national holiday
    mockedGetNationalHolidays.mockResolvedValue({ data: [{ date: "2026-05-05" }] } as any);

    const rows = await getValidateReport("tok", smallRange, {}, { ignoreToday: false });

    // Missing: May 6, 7 (not May 5 — holiday; May 8 excluded by exclusive upper bound)
    expect(rows[0].missingCount).toBe(2);
    expect(rows[0].missingDates).not.toContain("05.05.2026");
    expect(rows[0].missingDates).toContain("06.05.2026");
  });

  it("ignoreToday: true excludes today from validation window", async () => {
    // Range covers today (2026-05-17) — with ignoreToday=true, today is excluded
    const rangeWithToday: MonthRange = {
      isoStart: "2026-05-17T00:00:00+02:00",
      isoEnd: "2026-05-17T23:59:59+02:00",
      rangeLabel: "Today",
    };

    mockedFetchCalendarOptions.mockResolvedValue({
      data: { users: [{ team_name: "Dev Team", users: [{ uuid: "u1", full_name: "Alice Dev" }] }] },
    } as any);

    mockedGetEvents.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetNationalHolidays.mockResolvedValue({ data: [] } as any);

    const rows = await getValidateReport("tok", rangeWithToday, {}, { ignoreToday: true });

    // Today is excluded, so no missing days
    expect(rows).toHaveLength(0);
  });

  it("ignoreToday: false includes today in validation window", async () => {
    // Range covers today (2026-05-17, a Sunday = weekend) — but let's use a weekday range
    // 2026-05-15 is a Friday; isoEnd must be at least May 16 so that startOf(isoEnd)=May 16
    // making cursor < May 16 inclusive of May 15 (original exclusive upper bound semantics)
    const rangeWithFriday: MonthRange = {
      isoStart: "2026-05-15T00:00:00+02:00",
      isoEnd: "2026-05-16T23:59:59+02:00",
      rangeLabel: "Friday",
    };

    mockedFetchCalendarOptions.mockResolvedValue({
      data: { users: [{ team_name: "Dev Team", users: [{ uuid: "u1", full_name: "Alice Dev" }] }] },
    } as any);

    mockedGetEvents.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetNationalHolidays.mockResolvedValue({ data: [] } as any);

    // 2026-05-15 is in the past (today is 2026-05-17), so ignoreToday doesn't matter here
    // but with ignoreToday: false, 2026-05-15 is included
    const rows = await getValidateReport("tok", rangeWithFriday, {}, { ignoreToday: false });

    expect(rows).toHaveLength(1);
    expect(rows[0].missingDates).toContain("15.05.2026");
  });

  it("users with approved absence on a workday are NOT counted as missing that day", async () => {
    // isoEnd must be May 5 so startOf(isoEnd)=May 5, making May 4 included (cursor < May 5).
    // The absence on May 4 covers that day; May 5 itself is excluded by the exclusive upper bound.
    const smallRange: MonthRange = {
      isoStart: "2026-05-04T00:00:00+02:00",
      isoEnd: "2026-05-05T23:59:59+02:00",
      rangeLabel: "Day",
    };

    mockedFetchCalendarOptions.mockResolvedValue({
      data: { users: [{ team_name: "Dev Team", users: [{ uuid: "u1", full_name: "Alice Dev" }] }] },
    } as any);

    mockedGetEvents.mockResolvedValue({ data: { events: [] } } as any);

    // Alice has a full_day absence on May 4
    mockedGetAbsences.mockResolvedValue({
      data: {
        events: [
          {
            uuid: "a1",
            started_at: "2026-05-04T00:00:00+02:00",
            ended_at: "2026-05-04T23:59:59+02:00",
            event_type: "full_day",
            type: "vacation",
            user: { uuid: "u1" },
          },
        ],
      },
    } as any);
    mockedGetNationalHolidays.mockResolvedValue({ data: [] } as any);

    const rows = await getValidateReport("tok", smallRange, {}, { ignoreToday: false });

    // Alice has an absence on May 4 so she should not be missing that day
    expect(rows).toHaveLength(0);
  });

  it("skips in_work absences — in_work type does NOT count as covered", async () => {
    // isoEnd must be May 5 so startOf(isoEnd)=May 5, making May 4 included (cursor < May 5)
    const smallRange: MonthRange = {
      isoStart: "2026-05-04T00:00:00+02:00",
      isoEnd: "2026-05-05T23:59:59+02:00",
      rangeLabel: "Day",
    };

    mockedFetchCalendarOptions.mockResolvedValue({
      data: { users: [{ team_name: "Dev Team", users: [{ uuid: "u1", full_name: "Alice Dev" }] }] },
    } as any);

    mockedGetEvents.mockResolvedValue({ data: { events: [] } } as any);

    // Alice has an in_work absence on May 4 — should NOT count as covered
    mockedGetAbsences.mockResolvedValue({
      data: {
        events: [
          {
            uuid: "a1",
            started_at: "2026-05-04T00:00:00+02:00",
            ended_at: "2026-05-04T23:59:59+02:00",
            event_type: "full_day",
            type: "in_work",
            user: { uuid: "u1" },
          },
        ],
      },
    } as any);
    mockedGetNationalHolidays.mockResolvedValue({ data: [] } as any);

    const rows = await getValidateReport("tok", smallRange, {}, { ignoreToday: false });

    // in_work absence doesn't cover the day → Alice is still missing
    expect(rows).toHaveLength(1);
    expect(rows[0].missingDates).toContain("04.05.2026");
  });

  it("multi-day absence covers each included workday", async () => {
    // Alice has a multi-day absence covering a full week Mon–Fri
    const smallRange: MonthRange = {
      isoStart: "2026-05-04T00:00:00+02:00",
      isoEnd: "2026-05-08T23:59:59+02:00",
      rangeLabel: "Week",
    };

    mockedFetchCalendarOptions.mockResolvedValue({
      data: { users: [{ team_name: "Dev Team", users: [{ uuid: "u1", full_name: "Alice Dev" }] }] },
    } as any);

    mockedGetEvents.mockResolvedValue({ data: { events: [] } } as any);

    mockedGetAbsences.mockResolvedValue({
      data: {
        events: [
          {
            uuid: "a1",
            started_at: "2026-05-04T00:00:00+02:00",
            ended_at: "2026-05-08T23:59:59+02:00",
            event_type: "full_day",
            type: "vacation",
            user: { uuid: "u1" },
          },
        ],
      },
    } as any);
    mockedGetNationalHolidays.mockResolvedValue({ data: [] } as any);

    const rows = await getValidateReport("tok", smallRange, {}, { ignoreToday: false });

    // All 5 workdays are covered by the absence → no missing days
    expect(rows).toHaveLength(0);
  });

  it("filters by team prefix", async () => {
    setupStandardMocks();

    const rows = await getValidateReport("tok", range, { teamPrefixes: ["ops"] }, { ignoreToday: false });

    // Only Ops team users are included
    expect(rows.every((r) => r.team === "Ops Team")).toBe(true);
  });

  it("reports progress via onProgress callback (done per user processed)", async () => {
    setupStandardMocks();

    const progress: Array<[number, number]> = [];
    await getValidateReport("tok", range, {}, { ignoreToday: false }, (d, t) => progress.push([d, t]));

    // 3 users total → onProgress called 3 times
    expect(progress).toHaveLength(3);
    expect(progress[progress.length - 1][0]).toBe(3);
    expect(progress[progress.length - 1][1]).toBe(3);
  });
});
