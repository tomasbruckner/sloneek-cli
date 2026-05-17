import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  createEvent: vi.fn(),
  fetchCancelWorklog: vi.fn(),
}));

import { createLog, cancelLog } from "./logs";
import type { CreateLogInput } from "./logs";
import { createEvent, fetchCancelWorklog } from "../utils/api";

const mockedCreateEvent = vi.mocked(createEvent);
const mockedCancelWorklog = vi.mocked(fetchCancelWorklog);

const baseInput: CreateLogInput = {
  clientUuid: "c1",
  projectUuid: "p1",
  planningEventUuid: "pe1",
  userUuid: "u1",
  categories: [],
  startIso: "2026-05-15T08:00:00+02:00",
  endIso: "2026-05-15T16:00:00+02:00",
  durationMinutes: 480,
  durationTime: "2026-05-14T08:00:00+02:00",
  startTime: "08:00:00+0200",
  endTime: "16:00:00+0200",
  note: "did stuff",
};

describe("createLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls createEvent with the right payload shape", async () => {
    mockedCreateEvent.mockResolvedValue(undefined as any);
    await expect(createLog("tok", baseInput)).resolves.toBeUndefined();

    expect(mockedCreateEvent).toHaveBeenCalledTimes(1);
    const [payload, token] = mockedCreateEvent.mock.calls[0];
    expect(token).toBe("tok");
    expect(payload).toMatchObject({
      isRepeat: false,
      user_planning_event_uuid: "pe1",
      planning_categories: [],
      started_at: "2026-05-15T08:00:00+02:00",
      ended_at: "2026-05-15T16:00:00+02:00",
      duration: 480,
      note: "did stuff",
      message: "did stuff",
      client: "c1",
      client_project: "p1",
      user_uuid: "u1",
      is_automatically_approve: false,
      mentions: [],
    });
  });

  it("propagates errors from createEvent", async () => {
    mockedCreateEvent.mockRejectedValue(new Error("API failed"));
    await expect(createLog("tok", baseInput)).rejects.toThrow("API failed");
  });
});

describe("cancelLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls fetchCancelWorklog with the right UUID and token", async () => {
    mockedCancelWorklog.mockResolvedValue(undefined as any);
    await cancelLog("tok", "worklog-uuid");
    expect(mockedCancelWorklog).toHaveBeenCalledWith("tok", "worklog-uuid");
  });

  it("propagates errors from fetchCancelWorklog", async () => {
    mockedCancelWorklog.mockRejectedValue(new Error("cancel failed"));
    await expect(cancelLog("tok", "x")).rejects.toThrow("cancel failed");
  });
});
