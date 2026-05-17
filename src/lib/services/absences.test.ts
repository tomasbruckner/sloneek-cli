import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  fetchAbsenceOptions: vi.fn(),
  fetchCreateAbsence: vi.fn(),
  fetchCancelAbsence: vi.fn(),
  getAbsences: vi.fn(),
}));

import { listAbsenceTypes, createAbsence, cancelAbsence, listOwnAbsences } from "./absences";
import type { CreateAbsenceInput } from "./absences";
import { fetchAbsenceOptions, fetchCreateAbsence, fetchCancelAbsence, getAbsences } from "../utils/api";

const mockedFetchAbsenceOptions = vi.mocked(fetchAbsenceOptions);
const mockedFetchCreateAbsence = vi.mocked(fetchCreateAbsence);
const mockedFetchCancelAbsence = vi.mocked(fetchCancelAbsence);
const mockedGetAbsences = vi.mocked(getAbsences);

const absenceOptionsFixture: AbsenceOptionsResponse = {
  data: [
    { uuid: "opt-1", absence_event: { display_name: "Vacation", type: "type_vacation", unit_type: "days" } },
    { uuid: "opt-2", absence_event: { display_name: "Sick leave", type: "type_in_work", unit_type: "hours" } },
    { uuid: "opt-3", absence_event: { display_name: "Half-day", type: "type_vacation", unit_type: "days_and_half_days" } },
  ],
};

const absenceEventsFixture: AbsenceEventsResponse = {
  data: {
    events: [
      {
        uuid: "abs-1",
        user: {
          uuid: "user-1",
          email: "user@example.com",
          full_name: "John Doe",
          name: "John",
          surname: "Doe",
          team: { uuid: "team-1", name: "Team A", color: null },
        },
        started_at: "2026-05-01T00:00:00+02:00",
        ended_at: "2026-05-02T23:59:59+02:00",
        user_absence_event: { absence_event_name: "Vacation" },
        duration: 2,
        event_type: "full_day",
        type: "vacation",
        unit_type: "full_day",
      },
      {
        uuid: "abs-2",
        user: {
          uuid: "user-1",
          email: "user@example.com",
          full_name: "John Doe",
          name: "John",
          surname: "Doe",
          team: { uuid: "team-1", name: "Team A", color: null },
        },
        started_at: "2026-05-10T09:00:00+02:00",
        ended_at: "2026-05-10T13:00:00+02:00",
        user_absence_event: { absence_event_name: "Sick leave" },
        duration: 4,
        event_type: "half_day",
        type: "in_work",
        unit_type: "hour",
      },
    ],
  },
};

const profileConfig: ProfileConfig = {
  credentials: { email: "test@example.com", password: "pass" },
  user: { uuid: "user-1", name: "John Doe" },
  client: { uuid: "client-1", name: "ACME" },
  project: { uuid: "project-1", name: "Project X" },
  planningEvent: { uuid: "pe-1", detail_uuid: "pe-detail-1", name: "Work" },
  workHours: { start: "09:00", end: "17:00" },
  timestamp: "2026-05-17T00:00:00.000Z",
};

// ─── listAbsenceTypes ──────────────────────────────────────────────────────────

describe("listAbsenceTypes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns flat [{uuid, name, unitType}] array from fetchAbsenceOptions response", async () => {
    mockedFetchAbsenceOptions.mockResolvedValue(absenceOptionsFixture as any);
    const result = await listAbsenceTypes("tok");
    expect(mockedFetchAbsenceOptions).toHaveBeenCalledWith("tok");
    expect(result).toEqual([
      { uuid: "opt-1", name: "Vacation", unitType: "days" },
      { uuid: "opt-2", name: "Sick leave", unitType: "hours" },
      { uuid: "opt-3", name: "Half-day", unitType: "days_and_half_days" },
    ]);
  });

  it("returns empty array when no options", async () => {
    mockedFetchAbsenceOptions.mockResolvedValue({ data: [] } as any);
    const result = await listAbsenceTypes("tok");
    expect(result).toEqual([]);
  });
});

// ─── createAbsence ─────────────────────────────────────────────────────────────

describe("createAbsence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls fetchCreateAbsence with the right full_day payload", async () => {
    mockedFetchCreateAbsence.mockResolvedValue(undefined as any);

    const input: CreateAbsenceInput = {
      absenceTypeUuid: "opt-1",
      startIso: "2026-05-01T00:00:00+02:00",
      endIso: "2026-05-02T23:59:59+02:00",
      note: "Going on vacation",
      eventType: "full_day",
    };

    await expect(createAbsence("tok", input)).resolves.toBeUndefined();

    expect(mockedFetchCreateAbsence).toHaveBeenCalledTimes(1);
    const [token, payload] = mockedFetchCreateAbsence.mock.calls[0];
    expect(token).toBe("tok");
    expect(payload).toMatchObject({
      user_absence_event_uuid: "opt-1",
      day_type: "full_day",
      automatically_approve: true,
      fullDay: true,
      note: "Going on vacation",
      message: "Going on vacation",
      mentions: [],
      start_date_time: "2026-05-01T00:00:00+02:00",
      end_date_time: "2026-05-02T23:59:59+02:00",
    });
  });

  it("calls fetchCreateAbsence with the right partial_day payload", async () => {
    mockedFetchCreateAbsence.mockResolvedValue(undefined as any);

    const input: CreateAbsenceInput = {
      absenceTypeUuid: "opt-2",
      startIso: "2026-05-10T09:00:00+02:00",
      endIso: "2026-05-10T13:00:00+02:00",
      note: "Doctor visit",
      eventType: "partial_day",
      duration: 4,
    };

    await expect(createAbsence("tok", input)).resolves.toBeUndefined();

    expect(mockedFetchCreateAbsence).toHaveBeenCalledTimes(1);
    const [token, payload] = mockedFetchCreateAbsence.mock.calls[0];
    expect(token).toBe("tok");
    expect(payload).toMatchObject({
      user_absence_event_uuid: "opt-2",
      day_type: "half_day",
      automatically_approve: false,
      note: "Doctor visit",
      message: "Doctor visit",
      mentions: [],
      start_date_time: "2026-05-10T09:00:00+02:00",
      duration: 4,
    });
  });

  it("calls fetchCreateAbsence with the right half_day payload when isHalfDay is true", async () => {
    mockedFetchCreateAbsence.mockResolvedValue(undefined as any);

    const input: CreateAbsenceInput = {
      absenceTypeUuid: "opt-3",
      startIso: "2026-05-10T00:00:00+02:00",
      endIso: null,
      note: "Half day off",
      eventType: "full_day",
      isHalfDay: true,
      isFirstHalfDay: true,
    };

    await expect(createAbsence("tok", input)).resolves.toBeUndefined();

    expect(mockedFetchCreateAbsence).toHaveBeenCalledTimes(1);
    const [token, payload] = mockedFetchCreateAbsence.mock.calls[0];
    expect(token).toBe("tok");
    expect(payload).toMatchObject({
      user_absence_event_uuid: "opt-3",
      day_type: "half_day",
      automatically_approve: true,
      fullDay: false,
      is_first_half_day: true,
      note: "Half day off",
      message: "Half day off",
      mentions: [],
      start_date_time: "2026-05-10T00:00:00+02:00",
      end_date_time: null,
    });
  });

  it("propagates errors from fetchCreateAbsence", async () => {
    mockedFetchCreateAbsence.mockRejectedValue(new Error("API failed"));
    const input: CreateAbsenceInput = {
      absenceTypeUuid: "opt-1",
      startIso: "2026-05-01T00:00:00+02:00",
      endIso: "2026-05-01T23:59:59+02:00",
      note: "",
      eventType: "full_day",
    };
    await expect(createAbsence("tok", input)).rejects.toThrow("API failed");
  });
});

// ─── cancelAbsence ─────────────────────────────────────────────────────────────

describe("cancelAbsence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls fetchCancelAbsence with the right UUID and token", async () => {
    mockedFetchCancelAbsence.mockResolvedValue(undefined as any);
    await cancelAbsence("tok", "abs-uuid-123");
    expect(mockedFetchCancelAbsence).toHaveBeenCalledWith("tok", "abs-uuid-123");
  });

  it("propagates errors from fetchCancelAbsence", async () => {
    mockedFetchCancelAbsence.mockRejectedValue(new Error("cancel failed"));
    await expect(cancelAbsence("tok", "abs-uuid-123")).rejects.toThrow("cancel failed");
  });
});

// ─── listOwnAbsences ──────────────────────────────────────────────────────────

describe("listOwnAbsences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns flat [{uuid, absenceTypeName, startedAt, endedAt}] array", async () => {
    mockedGetAbsences.mockResolvedValue(absenceEventsFixture as any);
    const range: MonthRange = {
      isoStart: "2026-05-01T00:00:00+02:00",
      isoEnd: "2026-05-31T23:59:59+02:00",
      rangeLabel: "May 2026",
    };
    const result = await listOwnAbsences(profileConfig, "tok", range);
    expect(mockedGetAbsences).toHaveBeenCalledTimes(1);
    const [payload, token] = mockedGetAbsences.mock.calls[0];
    expect(token).toBe("tok");
    expect(payload).toMatchObject({
      interval_starting_at: "2026-05-01T00:00:00+02:00",
      interval_ending_at: "2026-05-31T23:59:59+02:00",
      users_uuids: ["user-1"],
      quick_filter: null,
    });
    expect(result).toEqual([
      {
        uuid: "abs-1",
        absenceTypeName: "Vacation",
        startedAt: "2026-05-01T00:00:00+02:00",
        endedAt: "2026-05-02T23:59:59+02:00",
      },
      {
        uuid: "abs-2",
        absenceTypeName: "Sick leave",
        startedAt: "2026-05-10T09:00:00+02:00",
        endedAt: "2026-05-10T13:00:00+02:00",
      },
    ]);
  });

  it("uses today-to-end-of-year range when no range provided", async () => {
    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    await listOwnAbsences(profileConfig, "tok");
    expect(mockedGetAbsences).toHaveBeenCalledTimes(1);
    const [payload] = mockedGetAbsences.mock.calls[0];
    // The isoStart should be today (2026-05-17) and isoEnd end of year (2026-12-31)
    expect(payload.interval_starting_at).toMatch(/^2026-05-17/);
    expect(payload.interval_ending_at).toMatch(/^2026-12-31/);
    expect(payload.users_uuids).toEqual(["user-1"]);
    expect(payload.quick_filter).toBeNull();
  });

  it("returns empty array when no events", async () => {
    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    const range: MonthRange = {
      isoStart: "2026-05-01T00:00:00+02:00",
      isoEnd: "2026-05-31T23:59:59+02:00",
      rangeLabel: "May 2026",
    };
    const result = await listOwnAbsences(profileConfig, "tok", range);
    expect(result).toEqual([]);
  });

  it("propagates errors from getAbsences", async () => {
    mockedGetAbsences.mockRejectedValue(new Error("list failed"));
    await expect(listOwnAbsences(profileConfig, "tok")).rejects.toThrow("list failed");
  });
});
