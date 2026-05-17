import { describe, it, expect, vi, beforeEach } from "vitest";
import { DateTime } from "luxon";

vi.mock("../utils/api", () => ({
  apiCall: vi.fn(),
}));

vi.mock("../utils/config", () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
}));

import { ensureAuthenticated } from "./auth";
import { apiCall } from "../utils/api";
import { readConfig, writeConfig } from "../utils/config";

const mockedApiCall = vi.mocked(apiCall);
const mockedReadConfig = vi.mocked(readConfig);
const mockedWriteConfig = vi.mocked(writeConfig);

const makeProfile = (token?: ProfileConfig["token"]): ProfileConfig => ({
  credentials: { email: "test@example.com", password: "secret" },
  user: { uuid: "u1", name: "Test" },
  client: { uuid: "c1", name: "Client" },
  project: { uuid: "p1", name: "Project" },
  planningEvent: { uuid: "pe1", detail_uuid: "ped1", name: "PE" },
  workHours: { start: "09:00", end: "17:00" },
  timestamp: "2025-01-01T00:00:00",
  token,
});

const validToken = {
  access_token: "cached-token",
  expires_at: DateTime.now().plus({ hours: 1 }).toISO()!,
};

const loginResponse = {
  data: {
    access_token: "new-token",
    access_token_expires_at: DateTime.now().plus({ hours: 2 }).toSeconds(),
  },
};

describe("ensureAuthenticated", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached token and skips network call when token is valid", async () => {
    const profile = makeProfile(validToken);
    mockedReadConfig.mockResolvedValue({ profiles: { _default: profile } } as Config);

    const session = await ensureAuthenticated();

    expect(session.accessToken).toBe("cached-token");
    expect(session.profileConfig.user.uuid).toBe("u1");
    expect(session.loginReason).toBe("cache");
    expect(mockedApiCall).not.toHaveBeenCalled();
  });

  it("re-authenticates and persists when token is expired", async () => {
    const profile = makeProfile({
      access_token: "old",
      expires_at: DateTime.now().minus({ hours: 1 }).toISO()!,
    });
    mockedReadConfig.mockResolvedValue({ profiles: { _default: profile } } as Config);
    mockedApiCall.mockResolvedValue(loginResponse);

    const session = await ensureAuthenticated();

    expect(session.accessToken).toBe("new-token");
    expect(session.loginReason).toBe("expired");
    expect(mockedWriteConfig).toHaveBeenCalledTimes(1);
  });

  it("re-authenticates when no token is stored", async () => {
    mockedReadConfig.mockResolvedValue({ profiles: { _default: makeProfile() } } as Config);
    mockedApiCall.mockResolvedValue(loginResponse);

    const session = await ensureAuthenticated();
    expect(session.accessToken).toBe("new-token");
    expect(session.loginReason).toBe("first_login");
  });

  it("uses named profile when provided", async () => {
    mockedReadConfig.mockResolvedValue({ profiles: { work: makeProfile(validToken) } } as Config);
    const session = await ensureAuthenticated("work");
    expect(session.accessToken).toBe("cached-token");
    expect(session.loginReason).toBe("cache");
  });

  it("falls back to _default when named profile is missing", async () => {
    mockedReadConfig.mockResolvedValue({ profiles: { _default: makeProfile(validToken) } } as Config);
    const session = await ensureAuthenticated("ghost");
    expect(session.accessToken).toBe("cached-token");
    expect(session.loginReason).toBe("cache");
  });

  it("re-authenticates when token expires within 1 minute", async () => {
    const profile = makeProfile({
      access_token: "stale",
      expires_at: DateTime.now().plus({ seconds: 30 }).toISO()!,
    });
    mockedReadConfig.mockResolvedValue({ profiles: { _default: profile } } as Config);
    mockedApiCall.mockResolvedValue(loginResponse);

    const session = await ensureAuthenticated();
    expect(session.accessToken).toBe("new-token");
    expect(session.loginReason).toBe("expired");
  });
});
