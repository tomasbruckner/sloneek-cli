import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("terminal-kit", () => ({
  terminal: {
    cyan: vi.fn(),
    green: vi.fn(),
  },
}));

vi.mock("../services/auth", () => ({
  ensureAuthenticated: vi.fn(),
}));

import { authenticate } from "./login";
import { ensureAuthenticated } from "../services/auth";
import { terminal as term } from "terminal-kit";

const mockedEnsure = vi.mocked(ensureAuthenticated);
const mockedCyan = vi.mocked(term.cyan);
const mockedGreen = vi.mocked(term.green);

beforeEach(() => vi.clearAllMocks());

describe("authenticate (CLI wrapper)", () => {
  it("returns the access token from the session", async () => {
    mockedEnsure.mockResolvedValue({ accessToken: "abc", profileConfig: {} as ProfileConfig, loginReason: "cache" });
    const token = await authenticate("work");
    expect(token).toBe("abc");
    expect(mockedEnsure).toHaveBeenCalledWith("work");
  });

  it('prints "Using existing token" when loginReason is "cache"', async () => {
    mockedEnsure.mockResolvedValue({ accessToken: "x", profileConfig: {} as ProfileConfig, loginReason: "cache" });
    await authenticate();
    expect(mockedCyan).toHaveBeenCalledWith("Using existing token\n");
    expect(mockedGreen).not.toHaveBeenCalled();
  });

  it('prints expired + success messages when loginReason is "expired"', async () => {
    mockedEnsure.mockResolvedValue({ accessToken: "x", profileConfig: {} as ProfileConfig, loginReason: "expired" });
    await authenticate();
    expect(mockedCyan).toHaveBeenCalledWith("Token expired, logging in again\n");
    expect(mockedGreen).toHaveBeenCalledWith("✓ Login successful\n");
  });

  it('prints first-login messages when loginReason is "first_login"', async () => {
    mockedEnsure.mockResolvedValue({
      accessToken: "x",
      profileConfig: {} as ProfileConfig,
      loginReason: "first_login",
    });
    await authenticate();
    expect(mockedCyan).toHaveBeenCalledWith("Logging in...\n");
    expect(mockedGreen).toHaveBeenCalledWith("✓ Login successful\n");
  });
});
