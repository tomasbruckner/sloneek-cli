import { describe, it, expect, vi } from "vitest";

vi.mock("terminal-kit", () => ({
  terminal: {
    cyan: vi.fn(),
  },
}));

import { getProfileConfig } from "./config";

const makeConfig = (profiles: Record<string, any>): Config => ({ profiles });

const sampleProfile: ProfileConfig = {
  credentials: { email: "test@example.com", password: "pass" },
  user: { uuid: "u1", name: "Test User" },
  client: { uuid: "c1", name: "Client" },
  project: { uuid: "p1", name: "Project" },
  planningEvent: { uuid: "pe1", detail_uuid: "ped1", name: "PE" },
  workHours: { start: "09:00", end: "17:00" },
  timestamp: "2025-01-01T00:00:00",
};

describe("getProfileConfig", () => {
  it("returns the named profile when it exists", async () => {
    const config = makeConfig({ myProfile: sampleProfile });
    const result = await getProfileConfig(config, "myProfile", true);
    expect(result).toBe(sampleProfile);
  });

  it("returns _default profile when no name specified", async () => {
    const config = makeConfig({ _default: sampleProfile });
    const result = await getProfileConfig(config, undefined, true);
    expect(result).toBe(sampleProfile);
  });

  it("throws when profiles object is empty", async () => {
    const config = makeConfig({});
    await expect(getProfileConfig(config, undefined, true)).rejects.toThrow("No profiles found");
  });

  it("returns undefined when named profile does not exist", async () => {
    const config = makeConfig({ _default: sampleProfile });
    const result = await getProfileConfig(config, "nonexistent", true);
    // Falls through to _default
    expect(result).toBe(sampleProfile);
  });

  it("returns undefined when named profile missing and no _default", async () => {
    const config = makeConfig({ other: sampleProfile });
    const result = await getProfileConfig(config, "nonexistent", true);
    expect(result).toBeUndefined();
  });
});
