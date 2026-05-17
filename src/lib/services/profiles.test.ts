import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/config", () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
}));

import { listProfiles, removeProfile, saveProfile } from "./profiles";
import { readConfig, writeConfig } from "../utils/config";

const mockedReadConfig = vi.mocked(readConfig);
const mockedWriteConfig = vi.mocked(writeConfig);

const makeProfile = (overrides: Partial<ProfileConfig> = {}): ProfileConfig => ({
  credentials: { email: "x@y.z", password: "secret" },
  user: { uuid: "u1", name: "Tester" },
  client: { uuid: "c1", name: "Acme" },
  project: { uuid: "p1", name: "Web" },
  planningEvent: { uuid: "pe1", detail_uuid: "ped1", name: "PE" },
  workHours: { start: "09:00", end: "17:00" },
  timestamp: "2025-01-01T00:00:00",
  ...overrides,
});

// ─── listProfiles ─────────────────────────────────────────────────────────────

describe("listProfiles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns one ProfileSummary per profile, marking _default as active", async () => {
    mockedReadConfig.mockResolvedValue({
      profiles: {
        _default: makeProfile(),
        work: makeProfile({ credentials: { email: "w@k.z", password: "s" } }),
      },
    });
    const result = await listProfiles();
    expect(result).toHaveLength(2);
    expect(result.find((p) => p.name === "_default")?.isActive).toBe(true);
    expect(result.find((p) => p.name === "work")?.isActive).toBe(false);
  });

  it("maps profile fields to ProfileSummary correctly", async () => {
    mockedReadConfig.mockResolvedValue({
      profiles: {
        _default: makeProfile({
          credentials: { email: "admin@corp.com", password: "pw" },
          client: { uuid: "c1", name: "Corp" },
          project: { uuid: "p1", name: "Portal" },
          workHours: { start: "08:00", end: "16:30" },
        }),
      },
    });
    const result = await listProfiles();
    expect(result).toHaveLength(1);
    const summary = result[0];
    expect(summary.name).toBe("_default");
    expect(summary.isActive).toBe(true);
    expect(summary.email).toBe("admin@corp.com");
    expect(summary.clientName).toBe("Corp");
    expect(summary.projectName).toBe("Portal");
    expect(summary.workHoursStart).toBe("08:00");
    expect(summary.workHoursEnd).toBe("16:30");
  });

  it("returns empty array when no profiles exist", async () => {
    mockedReadConfig.mockResolvedValue({ profiles: {} });
    const result = await listProfiles();
    expect(result).toHaveLength(0);
  });

  it("non-_default profiles have isActive false", async () => {
    mockedReadConfig.mockResolvedValue({
      profiles: {
        alpha: makeProfile(),
        beta: makeProfile(),
      },
    });
    const result = await listProfiles();
    expect(result.every((p) => p.isActive === false)).toBe(true);
  });
});

// ─── removeProfile ────────────────────────────────────────────────────────────

describe("removeProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when only 1 profile exists", async () => {
    mockedReadConfig.mockResolvedValue({ profiles: { _default: makeProfile() } });
    await expect(removeProfile("_default")).rejects.toThrow();
  });

  it("removes the named profile and writes updated config", async () => {
    const workProfile = makeProfile({ credentials: { email: "w@x.z", password: "pw" } });
    mockedReadConfig.mockResolvedValue({
      profiles: {
        _default: makeProfile(),
        work: workProfile,
        extra: makeProfile(),
      },
    });
    mockedWriteConfig.mockResolvedValue(undefined);

    await removeProfile("work");

    expect(mockedWriteConfig).toHaveBeenCalledTimes(1);
    const savedConfig: Config = mockedWriteConfig.mock.calls[0][0];
    expect(savedConfig.profiles).not.toHaveProperty("work");
    expect(savedConfig.profiles).toHaveProperty("_default");
    expect(savedConfig.profiles).toHaveProperty("extra");
  });

  it("when 2 profiles and one is removed, renames surviving profile to _default and returns renamedRemainingToDefault: true", async () => {
    const survivalProfile = makeProfile({ credentials: { email: "s@x.z", password: "pw" } });
    mockedReadConfig.mockResolvedValue({
      profiles: {
        _default: makeProfile(),
        survival: survivalProfile,
      },
    });
    mockedWriteConfig.mockResolvedValue(undefined);

    const result = await removeProfile("_default");

    expect(result.renamedRemainingToDefault).toBe(true);
    const savedConfig: Config = mockedWriteConfig.mock.calls[0][0];
    expect(savedConfig.profiles).toHaveProperty("_default");
    expect(savedConfig.profiles["_default"]).toEqual(survivalProfile);
    expect(savedConfig.profiles).not.toHaveProperty("survival");
  });

  it("when only 1 profile remains after removal (was already _default), keeps _default and returns renamedRemainingToDefault: true", async () => {
    const remainingProfile = makeProfile({ credentials: { email: "r@x.z", password: "pw" } });
    mockedReadConfig.mockResolvedValue({
      profiles: {
        _default: makeProfile(),
        other: remainingProfile,
      },
    });
    mockedWriteConfig.mockResolvedValue(undefined);

    const result = await removeProfile("other");

    expect(result.renamedRemainingToDefault).toBe(true);
    const savedConfig: Config = mockedWriteConfig.mock.calls[0][0];
    // _default was already _default — it stays
    expect(savedConfig.profiles).toHaveProperty("_default");
    expect(Object.keys(savedConfig.profiles)).toHaveLength(1);
  });

  it("when 3+ profiles and one is removed, leaves remaining names alone and returns renamedRemainingToDefault: false", async () => {
    mockedReadConfig.mockResolvedValue({
      profiles: {
        _default: makeProfile(),
        alpha: makeProfile(),
        beta: makeProfile(),
        gamma: makeProfile(),
      },
    });
    mockedWriteConfig.mockResolvedValue(undefined);

    const result = await removeProfile("alpha");

    expect(result.renamedRemainingToDefault).toBe(false);
    const savedConfig: Config = mockedWriteConfig.mock.calls[0][0];
    expect(Object.keys(savedConfig.profiles)).toHaveLength(3);
    expect(savedConfig.profiles).toHaveProperty("_default");
    expect(savedConfig.profiles).toHaveProperty("beta");
    expect(savedConfig.profiles).toHaveProperty("gamma");
  });
});

// ─── saveProfile ──────────────────────────────────────────────────────────────

describe("saveProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a new profile into existing config without touching others", async () => {
    const existingProfile = makeProfile();
    mockedReadConfig.mockResolvedValue({ profiles: { _default: existingProfile } });
    mockedWriteConfig.mockResolvedValue(undefined);

    const newProfile = makeProfile({ credentials: { email: "new@x.z", password: "pw" } });
    await saveProfile("work", newProfile);

    expect(mockedWriteConfig).toHaveBeenCalledTimes(1);
    const savedConfig: Config = mockedWriteConfig.mock.calls[0][0];
    expect(savedConfig.profiles).toHaveProperty("_default");
    expect(savedConfig.profiles["_default"]).toEqual(existingProfile);
    expect(savedConfig.profiles).toHaveProperty("work");
    expect(savedConfig.profiles["work"]).toEqual(newProfile);
  });

  it("overwrites an existing profile under the same name", async () => {
    const oldProfile = makeProfile({ credentials: { email: "old@x.z", password: "old" } });
    mockedReadConfig.mockResolvedValue({ profiles: { _default: oldProfile } });
    mockedWriteConfig.mockResolvedValue(undefined);

    const updatedProfile = makeProfile({ credentials: { email: "new@x.z", password: "new" } });
    await saveProfile("_default", updatedProfile);

    const savedConfig: Config = mockedWriteConfig.mock.calls[0][0];
    expect(savedConfig.profiles["_default"]).toEqual(updatedProfile);
  });

  it("creates a brand new config when readConfig fails with ENOENT-style error", async () => {
    mockedReadConfig.mockRejectedValue(new Error("config.json not found"));
    mockedWriteConfig.mockResolvedValue(undefined);

    const profile = makeProfile();
    await saveProfile("_default", profile);

    const savedConfig: Config = mockedWriteConfig.mock.calls[0][0];
    expect(savedConfig.profiles).toHaveProperty("_default");
    expect(savedConfig.profiles["_default"]).toEqual(profile);
  });
});
