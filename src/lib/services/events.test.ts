import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  getEvents: vi.fn(),
  getAbsences: vi.fn(),
  getEventDetail: vi.fn(),
  fetchAbsenceReportCalendarOptions: vi.fn(),
  fetchScheduledEventDetail: vi.fn(),
  fetchAbsenceDetail: vi.fn(),
}));

import { getMonthEvents, getOtherUsersAbsencesToday, getUserMonthlyDetail } from "./events";
import {
  getEvents,
  getAbsences,
  getEventDetail,
  fetchAbsenceReportCalendarOptions,
  fetchScheduledEventDetail,
  fetchAbsenceDetail,
} from "../utils/api";

const mockedGetEvents = vi.mocked(getEvents);
const mockedGetAbsences = vi.mocked(getAbsences);
const mockedGetEventDetail = vi.mocked(getEventDetail);
const mockedFetchAbsCal = vi.mocked(fetchAbsenceReportCalendarOptions);
const mockedFetchSchedDetail = vi.mocked(fetchScheduledEventDetail);
const mockedFetchAbsDetail = vi.mocked(fetchAbsenceDetail);

const profile: ProfileConfig = {
  credentials: { email: "x", password: "y" },
  user: { uuid: "u1", name: "Me" },
  client: { uuid: "c1", name: "Acme" },
  project: { uuid: "p1", name: "Web" },
  planningEvent: { uuid: "pe1", detail_uuid: "ped1", name: "PE" },
  workHours: { start: "08:00", end: "16:00" },
  timestamp: "2026-01-01",
};

const range: MonthRange = {
  isoStart: "2026-05-01T00:00:00+02:00",
  isoEnd: "2026-05-31T23:59:59+02:00",
  rangeLabel: "May 2026",
};

describe("getMonthEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns scheduled + expanded absence events sorted by start time", async () => {
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          {
            uuid: "e1",
            started_at: "2026-05-15T08:00:00+02:00",
            ended_at: "2026-05-15T16:00:00+02:00",
            client: { name: "Acme" },
            client_project: { project_name: "Web" },
          },
        ],
      },
    } as any);

    mockedGetAbsences.mockResolvedValue({
      data: {
        events: [
          {
            type: "vacation",
            event_type: "full_day",
            started_at: "2026-05-18T00:00:00+02:00",
            ended_at: "2026-05-18T23:59:59+02:00",
            user_absence_event: { absence_event_name: "Vacation" },
          },
        ],
      },
    } as any);

    const result = await getMonthEvents(profile, "tok", range);

    expect(result.scheduledEvents).toHaveLength(1);
    expect(result.expandedAbsenceEvents).toHaveLength(1);
    expect(result.allEvents).toHaveLength(2);
    expect(result.allEvents[0].started_at < result.allEvents[1].started_at).toBe(true);
    expect(result.eventNotes).toEqual({});
    expect(mockedGetEventDetail).not.toHaveBeenCalled();
  });

  it("expands a multi-day absence into one row per workday (Mon–Fri)", async () => {
    mockedGetEvents.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetAbsences.mockResolvedValue({
      data: {
        events: [
          {
            type: "vacation",
            event_type: "full_day",
            started_at: "2026-05-15T00:00:00+02:00",
            ended_at: "2026-05-19T23:59:59+02:00",
            user_absence_event: { absence_event_name: "Vacation" },
          },
        ],
      },
    } as any);

    const result = await getMonthEvents(profile, "tok", range);
    expect(result.expandedAbsenceEvents).toHaveLength(3);
  });

  it("filters scheduled events by client (case-insensitive substring) and hides absences", async () => {
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          { uuid: "e1", started_at: "2026-05-15T08:00:00+02:00", ended_at: "2026-05-15T16:00:00+02:00", client: { name: "Acme Corp" }, client_project: { project_name: "X" } },
          { uuid: "e2", started_at: "2026-05-16T08:00:00+02:00", ended_at: "2026-05-16T16:00:00+02:00", client: { name: "Other" }, client_project: { project_name: "Y" } },
        ],
      },
    } as any);
    mockedGetAbsences.mockResolvedValue({
      data: { events: [{ type: "vacation", event_type: "full_day", started_at: "2026-05-18T00:00:00+02:00", ended_at: "2026-05-18T23:59:59+02:00", user_absence_event: { absence_event_name: "V" } }] },
    } as any);

    const result = await getMonthEvents(profile, "tok", range, { clientFilter: "acme" });

    expect(result.allEvents).toHaveLength(1);
    expect((result.allEvents[0] as any).client?.name).toBe("Acme Corp");
  });

  it("fetches notes per event when includeNotes is set, and reports progress for both successes and failures", async () => {
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          { uuid: "e1", started_at: "2026-05-15T08:00:00+02:00", ended_at: "2026-05-15T09:00:00+02:00", client: { name: "Acme" }, client_project: { project_name: "X" } },
          { uuid: "e2", started_at: "2026-05-15T09:00:00+02:00", ended_at: "2026-05-15T10:00:00+02:00", client: { name: "Acme" }, client_project: { project_name: "X" } },
        ],
      },
    } as any);
    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetEventDetail
      .mockResolvedValueOnce({ data: { scheduled_event_data: { note: "one" } } } as any)
      .mockResolvedValueOnce({ data: { scheduled_event_data: { note: "two" } } } as any);

    const progress: Array<[number, number]> = [];
    const result = await getMonthEvents(profile, "tok", range, {
      includeNotes: true,
      onProgress: (d, t) => progress.push([d, t]),
    });

    expect(result.eventNotes).toEqual({ e1: "one", e2: "two" });
    expect(progress).toEqual([[1, 2], [2, 2]]);
  });

  it("swallows a single failed detail fetch and continues, still emitting progress for it", async () => {
    mockedGetEvents.mockResolvedValue({
      data: { events: [
        { uuid: "e1", started_at: "2026-05-15T08:00:00+02:00", ended_at: "2026-05-15T09:00:00+02:00", client: { name: "A" }, client_project: { project_name: "X" } },
        { uuid: "e2", started_at: "2026-05-15T09:00:00+02:00", ended_at: "2026-05-15T10:00:00+02:00", client: { name: "A" }, client_project: { project_name: "X" } },
      ] },
    } as any);
    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetEventDetail
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ data: { scheduled_event_data: { note: "ok" } } } as any);

    const progress: Array<[number, number]> = [];
    const result = await getMonthEvents(profile, "tok", range, {
      includeNotes: true,
      onProgress: (d, t) => progress.push([d, t]),
    });

    expect(result.eventNotes).toEqual({ e2: "ok" });
    expect(progress).toEqual([[1, 2], [2, 2]]);
  });
});

describe("getOtherUsersAbsencesToday", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns absences filtered by team prefix (substring, case-insensitive)", async () => {
    mockedFetchAbsCal.mockResolvedValue({
      data: { users_select: [{ users: [{ uuid: "u1" }, { uuid: "u2" }] }] },
    } as any);
    mockedGetAbsences.mockResolvedValue({
      data: { events: [
        { user: { full_name: "A", team: { name: "Dev Team" } }, user_absence_event: { absence_event_name: "V" }, started_at: "x", ended_at: "y" },
        { user: { full_name: "B", team: { name: "Ops" } },      user_absence_event: { absence_event_name: "V" }, started_at: "x", ended_at: "y" },
      ] },
    } as any);

    const result = await getOtherUsersAbsencesToday("tok", ["dev"]);

    expect(result).toHaveLength(1);
    expect(result[0].user.full_name).toBe("A");
  });

  it("keeps users without a team when filters are present", async () => {
    mockedFetchAbsCal.mockResolvedValue({ data: { users_select: [{ users: [{ uuid: "u1" }] }] } } as any);
    mockedGetAbsences.mockResolvedValue({
      data: { events: [{ user: { full_name: "X" }, user_absence_event: { absence_event_name: "V" }, started_at: "x", ended_at: "y" }] },
    } as any);

    const result = await getOtherUsersAbsencesToday("tok", ["dev"]);
    expect(result).toHaveLength(1);
  });

  it("returns all absences when no filter is provided, sorted by user name", async () => {
    mockedFetchAbsCal.mockResolvedValue({ data: { users_select: [{ users: [{ uuid: "u1" }, { uuid: "u2" }] }] } } as any);
    mockedGetAbsences.mockResolvedValue({
      data: { events: [
        { user: { full_name: "Zoe" }, user_absence_event: { absence_event_name: "V" }, started_at: "x", ended_at: "y" },
        { user: { full_name: "Alice" }, user_absence_event: { absence_event_name: "V" }, started_at: "x", ended_at: "y" },
      ] },
    } as any);

    const result = await getOtherUsersAbsencesToday("tok");
    expect(result.map(r => r.user.full_name)).toEqual(["Alice", "Zoe"]);
  });
});

describe("getUserMonthlyDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns scheduled events + absences with notes fetched per item, sorted by start time", async () => {
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          { uuid: "e1", started_at: "2026-05-10T08:00:00+02:00", ended_at: "2026-05-10T16:00:00+02:00", client_project: { project_name: "Web" } },
        ],
      },
    } as any);
    mockedGetAbsences.mockResolvedValue({
      data: {
        events: [
          { uuid: "a1", type: "vacation", event_type: "full_day", started_at: "2026-05-11T00:00:00+02:00", ended_at: "2026-05-11T23:59:59+02:00", user_absence_event: { absence_event_name: "Vacation" } },
        ],
      },
    } as any);
    mockedFetchSchedDetail.mockResolvedValue({ data: { scheduled_event_data: { note: "did work" } } } as any);
    mockedFetchAbsDetail.mockResolvedValue({ data: { absence_data: { note: "was away" } } } as any);

    const result = await getUserMonthlyDetail("tok", "user-uuid", range);

    expect(result.scheduledEvents).toHaveLength(1);
    expect(result.absences).toHaveLength(1);
    expect(result.scheduledEvents[0].note).toBe("did work");
    expect(result.absences[0].note).toBe("was away");
    expect(result.rangeLabel).toBe("May 2026");
  });

  it("swallows a failed detail fetch and returns the item with an empty note", async () => {
    mockedGetEvents.mockResolvedValue({
      data: { events: [{ uuid: "e1", started_at: "2026-05-10T08:00:00+02:00", ended_at: "2026-05-10T16:00:00+02:00", client_project: { project_name: "X" } }] },
    } as any);
    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    mockedFetchSchedDetail.mockRejectedValue(new Error("boom"));

    const result = await getUserMonthlyDetail("tok", "user-uuid", range);
    expect(result.scheduledEvents).toHaveLength(1);
    expect(result.scheduledEvents[0].note).toBe("");
  });

  it("calls onProgress once per item (scheduled + absence) as details resolve", async () => {
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          { uuid: "e1", started_at: "2026-05-10T08:00:00+02:00", ended_at: "2026-05-10T16:00:00+02:00", client_project: { project_name: "Web" } },
          { uuid: "e2", started_at: "2026-05-11T08:00:00+02:00", ended_at: "2026-05-11T16:00:00+02:00", client_project: { project_name: "Web" } },
        ],
      },
    } as any);
    mockedGetAbsences.mockResolvedValue({
      data: {
        events: [
          { uuid: "a1", type: "vacation", event_type: "full_day", started_at: "2026-05-12T00:00:00+02:00", ended_at: "2026-05-12T23:59:59+02:00", user_absence_event: { absence_event_name: "Vacation" } },
        ],
      },
    } as any);
    mockedFetchSchedDetail
      .mockResolvedValueOnce({ data: { scheduled_event_data: { note: "first" } } } as any)
      .mockResolvedValueOnce({ data: { scheduled_event_data: { note: "second" } } } as any);
    mockedFetchAbsDetail.mockResolvedValue({ data: { absence_data: { note: "away" } } } as any);

    const progress: Array<[number, number]> = [];
    await getUserMonthlyDetail("tok", "user-uuid", range, (d, t) => progress.push([d, t]));

    // total = 2 sched + 1 abs = 3; each item emits one progress tick
    expect(progress).toHaveLength(3);
    expect(progress[progress.length - 1]).toEqual([3, 3]);
  });
});
