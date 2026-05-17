import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  fetchCalendarOptions: vi.fn(),
  getEvents: vi.fn(),
}));

import { getTeamProjectReport } from "./team-reports";
import { fetchCalendarOptions, getEvents } from "../utils/api";

const mockedFetchCalendarOptions = vi.mocked(fetchCalendarOptions);
const mockedGetEvents = vi.mocked(getEvents);

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const range: MonthRange = {
  isoStart: "2026-05-01T00:00:00+02:00",
  isoEnd: "2026-05-31T23:59:59+02:00",
  rangeLabel: "May 2026",
};

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

// Alice: 2 events on "Website" project (Acme client), 120 min each
// Bob: 1 event on "Website" project (Acme client), 60 min
// Charlie: 1 event on "Infra" project (Acme client), 90 min
const eventsFixture = {
  data: {
    events: [
      {
        uuid: "e1",
        started_at: "2026-05-04T08:00:00+02:00",
        ended_at: "2026-05-04T10:00:00+02:00", // 120 min
        user: { uuid: "u1", full_name: "Alice Dev" },
        client: { name: "Acme" },
        client_project: { project_name: "Website" },
      },
      {
        uuid: "e2",
        started_at: "2026-05-05T08:00:00+02:00",
        ended_at: "2026-05-05T10:00:00+02:00", // 120 min
        user: { uuid: "u1", full_name: "Alice Dev" },
        client: { name: "Acme" },
        client_project: { project_name: "Website" },
      },
      {
        uuid: "e3",
        started_at: "2026-05-06T09:00:00+02:00",
        ended_at: "2026-05-06T10:00:00+02:00", // 60 min
        user: { uuid: "u2", full_name: "Bob Dev" },
        client: { name: "Acme" },
        client_project: { project_name: "Website" },
      },
      {
        uuid: "e4",
        started_at: "2026-05-07T08:00:00+02:00",
        ended_at: "2026-05-07T09:30:00+02:00", // 90 min
        user: { uuid: "u3", full_name: "Charlie Ops" },
        client: { name: "Acme" },
        client_project: { project_name: "Infra" },
      },
    ],
  },
};

function setupStandardMocks() {
  mockedFetchCalendarOptions.mockResolvedValue(calendarOptionsFixture as any);
  mockedGetEvents.mockResolvedValue(eventsFixture as any);
}

// ─── getTeamProjectReport ─────────────────────────────────────────────────────

describe("getTeamProjectReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aggregates total minutes correctly across multiple users for a single project", async () => {
    setupStandardMocks();

    // Filter to "Website" project only; clientUuid filtering: use client name "Acme" substring in uuid-less path
    // The service uses selectedClient.name for client matching — pass it as clientNameFilter
    const totals = await getTeamProjectReport("tok", range, "acme", ["website"]);

    const websiteEntry = totals.find((t) => t.projectName === "Website");
    expect(websiteEntry).toBeDefined();
    // Alice: 120+120=240 min, Bob: 60 min → total 300 min
    expect(websiteEntry!.totalMinutes).toBe(300);
  });

  it("returns one entry per matched project", async () => {
    setupStandardMocks();

    // Match both "Website" and "Infra" under "Acme" client
    const totals = await getTeamProjectReport("tok", range, "acme", ["website", "infra"]);

    expect(totals).toHaveLength(2);
    const names = totals.map((t) => t.projectName).sort();
    expect(names).toEqual(["Infra", "Website"].sort());
  });

  it("projectMatchers filters projects by substring, case-insensitive — only matching projects appear", async () => {
    setupStandardMocks();

    // Only match "infra" — "Website" should not appear
    const totals = await getTeamProjectReport("tok", range, "acme", ["infra"]);

    expect(totals).toHaveLength(1);
    expect(totals[0].projectName).toBe("Infra");
    expect(totals.find((t) => t.projectName === "Website")).toBeUndefined();
  });

  it("returns empty result when no projects match", async () => {
    setupStandardMocks();

    const totals = await getTeamProjectReport("tok", range, "acme", ["nonexistent"]);

    expect(totals).toHaveLength(0);
  });

  it("perUser array contains one entry per user who had time on each project", async () => {
    setupStandardMocks();

    const totals = await getTeamProjectReport("tok", range, "acme", ["website"]);

    const websiteEntry = totals.find((t) => t.projectName === "Website");
    expect(websiteEntry).toBeDefined();
    // Alice and Bob both worked on Website
    expect(websiteEntry!.perUser).toHaveLength(2);
    const userNames = websiteEntry!.perUser.map((u) => u.userName).sort();
    expect(userNames).toEqual(["Alice Dev", "Bob Dev"].sort());
  });

  it("perUser minutes sum to totalMinutes for each project", async () => {
    setupStandardMocks();

    const totals = await getTeamProjectReport("tok", range, "acme", ["website", "infra"]);

    for (const entry of totals) {
      const perUserSum = entry.perUser.reduce((acc, u) => acc + u.minutes, 0);
      expect(perUserSum).toBe(entry.totalMinutes);
    }
  });

  it("verifies duration calculation: started_at → ended_at in minutes using Math.round", async () => {
    mockedFetchCalendarOptions.mockResolvedValue({
      data: {
        users: [{ team_name: "T", users: [{ uuid: "u1", full_name: "Alice Dev" }] }],
      },
    } as any);
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          {
            uuid: "e1",
            started_at: "2026-05-04T08:00:00+02:00",
            ended_at: "2026-05-04T09:30:00+02:00", // exactly 90 min
            user: { uuid: "u1", full_name: "Alice Dev" },
            client: { name: "Acme" },
            client_project: { project_name: "Proj" },
          },
        ],
      },
    } as any);

    const totals = await getTeamProjectReport("tok", range, "acme", ["proj"]);

    expect(totals).toHaveLength(1);
    expect(totals[0].totalMinutes).toBe(90);
    expect(totals[0].perUser[0].minutes).toBe(90);
  });

  it("propagates errors thrown by getEvents", async () => {
    mockedFetchCalendarOptions.mockResolvedValue(calendarOptionsFixture as any);
    mockedGetEvents.mockRejectedValue(new Error("network error"));

    await expect(getTeamProjectReport("tok", range, "acme", ["website"])).rejects.toThrow("network error");
  });

  it("client filter is case-insensitive substring match on client name", async () => {
    setupStandardMocks();

    // Use uppercase to verify case-insensitive matching
    const totals = await getTeamProjectReport("tok", range, "ACME", ["website"]);

    const websiteEntry = totals.find((t) => t.projectName === "Website");
    expect(websiteEntry).toBeDefined();
    expect(websiteEntry!.totalMinutes).toBe(300);
  });

  it("events not matching the client name filter are excluded", async () => {
    setupStandardMocks();

    // "otherco" doesn't match "Acme" → no results
    const totals = await getTeamProjectReport("tok", range, "otherco", ["website"]);

    expect(totals).toHaveLength(0);
  });

  it("empty projectMatchers matches all projects for the client", async () => {
    setupStandardMocks();

    // Empty matchers array = match all (per original logic: needles.length === 0 → always matches)
    const totals = await getTeamProjectReport("tok", range, "acme", []);

    // Should return both Website and Infra
    expect(totals.length).toBeGreaterThanOrEqual(2);
    const names = totals.map((t) => t.projectName).sort();
    expect(names).toContain("Website");
    expect(names).toContain("Infra");
  });

  it("returns empty when no users are found in calendar options", async () => {
    mockedFetchCalendarOptions.mockResolvedValue({ data: { users: [] } } as any);
    mockedGetEvents.mockResolvedValue({ data: { events: [] } } as any);

    const totals = await getTeamProjectReport("tok", range, "acme", ["website"]);
    expect(totals).toHaveLength(0);
  });
});
