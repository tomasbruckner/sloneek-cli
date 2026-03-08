import { describe, it, expect, vi, beforeEach } from "vitest";
import { DateTime } from "luxon";

vi.mock("terminal-kit", () => ({
  terminal: {
    cyan: vi.fn(),
    green: vi.fn(),
  },
}));

vi.mock("./api", () => ({
  apiCall: vi.fn(),
}));

vi.mock("./config", () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
}));

import { authenticate } from "./login";
import { apiCall } from "./api";
import { readConfig, writeConfig } from "./config";

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

const makeConfig = (profiles: Record<string, ProfileConfig>): Config => ({ profiles });

const loginResponse = {
  data: {
    access_token: "new-token",
    access_token_expires_at: DateTime.now().plus({ hours: 2 }).toSeconds(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authenticate", () => {
  it("returns cached token when not expired", async () => {
    const profile = makeProfile(validToken);
    mockedReadConfig.mockResolvedValue(makeConfig({ _default: profile }));

    const token = await authenticate();

    expect(token).toBe("cached-token");
    expect(mockedApiCall).not.toHaveBeenCalled();
  });

  it("re-authenticates when token is expired", async () => {
    const profile = makeProfile({
      access_token: "cached-token",
      expires_at: DateTime.now().minus({ hours: 1 }).toISO()!,
    });
    mockedReadConfig.mockResolvedValue(makeConfig({ _default: profile }));
    mockedApiCall.mockResolvedValue(loginResponse);

    const token = await authenticate();

    expect(token).toBe("new-token");
    expect(mockedApiCall).toHaveBeenCalledWith("https://api2.sloneek.com/auth/login", {
      method: "POST",
      data: { email: "test@example.com", password: "secret" },
    });
  });

  it("re-authenticates when no token exists", async () => {
    const profile = makeProfile();
    mockedReadConfig.mockResolvedValue(makeConfig({ _default: profile }));
    mockedApiCall.mockResolvedValue(loginResponse);

    const token = await authenticate();

    expect(token).toBe("new-token");
  });

  it("saves new token to config after login", async () => {
    const profile = makeProfile();
    mockedReadConfig.mockResolvedValue(makeConfig({ _default: profile }));
    mockedApiCall.mockResolvedValue(loginResponse);

    await authenticate();

    expect(mockedWriteConfig).toHaveBeenCalledTimes(1);
    const savedConfig = mockedWriteConfig.mock.calls[0][0] as Config;
    expect(savedConfig.profiles._default.token?.access_token).toBe("new-token");
    expect(savedConfig.profiles._default.token?.expires_at).toBeDefined();
  });

  it("uses named profile when provided", async () => {
    const profile = makeProfile(validToken);
    mockedReadConfig.mockResolvedValue(makeConfig({ work: profile }));

    const token = await authenticate("work");

    expect(token).toBe("cached-token");
  });

  it("falls back to _default when named profile does not exist", async () => {
    const defaultProfile = makeProfile(validToken);
    mockedReadConfig.mockResolvedValue(makeConfig({ _default: defaultProfile }));

    const token = await authenticate("nonexistent");

    expect(token).toBe("cached-token");
  });

  it("re-authenticates when token expires within 1 minute", async () => {
    const profile = makeProfile({
      access_token: "cached-token",
      expires_at: DateTime.now().plus({ seconds: 30 }).toISO()!,
    });
    mockedReadConfig.mockResolvedValue(makeConfig({ _default: profile }));
    mockedApiCall.mockResolvedValue(loginResponse);

    const token = await authenticate();

    expect(token).toBe("new-token");
  });
});
