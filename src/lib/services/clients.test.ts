import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  getClients: vi.fn(),
}));

import { listClients, listProjectsForClient } from "./clients";
import { getClients } from "../utils/api";

const mockedGetClients = vi.mocked(getClients);

// Fixture mirrors the real API shape: { data: Client[] }
// where Client = { uuid, name, projects: Project[] }
// and Project = { uuid, project_name }
const fixture = {
  data: [
    {
      uuid: "client-a",
      name: "Acme",
      projects: [
        { uuid: "proj-a1", project_name: "Web" },
        { uuid: "proj-a2", project_name: "Mobile" },
      ],
    },
    {
      uuid: "client-b",
      name: "Beta Corp",
      projects: [
        { uuid: "proj-b1", project_name: "Backend" },
        { uuid: "proj-b2", project_name: "Frontend" },
      ],
    },
  ],
};

describe("listClients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns flat list of clients with uuid, name and projects", async () => {
    mockedGetClients.mockResolvedValue(fixture as any);
    const result = await listClients("tok", "user-uuid");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ uuid: "client-a", name: "Acme" });
    expect(result[1]).toMatchObject({ uuid: "client-b", name: "Beta Corp" });
  });

  it("passes userUuid and accessToken to getClients in the correct order", async () => {
    mockedGetClients.mockResolvedValue(fixture as any);
    await listClients("my-token", "my-user");
    expect(mockedGetClients).toHaveBeenCalledWith("my-user", "my-token");
  });

  it("returns empty array when API returns no clients", async () => {
    mockedGetClients.mockResolvedValue({ data: [] } as any);
    const result = await listClients("tok", "user-uuid");
    expect(result).toEqual([]);
  });

  it("includes nested projects on each ClientSummary", async () => {
    mockedGetClients.mockResolvedValue(fixture as any);
    const result = await listClients("tok", "user-uuid");
    expect(result[0].projects).toHaveLength(2);
    expect(result[0].projects[0]).toMatchObject({ uuid: "proj-a1", project_name: "Web" });
  });
});

describe("listProjectsForClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns projects only for the requested client", async () => {
    mockedGetClients.mockResolvedValue(fixture as any);
    const result = await listProjectsForClient("tok", "user-uuid", "client-a");
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.project_name)).toEqual(["Web", "Mobile"]);
  });

  it("returns the other client's projects when filtering by client-b", async () => {
    mockedGetClients.mockResolvedValue(fixture as any);
    const result = await listProjectsForClient("tok", "user-uuid", "client-b");
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.project_name)).toEqual(["Backend", "Frontend"]);
  });

  it("returns empty array when clientUuid is unknown", async () => {
    mockedGetClients.mockResolvedValue(fixture as any);
    const result = await listProjectsForClient("tok", "user-uuid", "ghost");
    expect(result).toEqual([]);
  });

  it("includes uuid and project_name on each ProjectSummary", async () => {
    mockedGetClients.mockResolvedValue(fixture as any);
    const result = await listProjectsForClient("tok", "user-uuid", "client-a");
    expect(result[0]).toMatchObject({ uuid: "proj-a1", project_name: "Web" });
  });
});
