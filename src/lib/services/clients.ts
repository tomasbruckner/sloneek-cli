import { getClients } from "../utils/api";

export interface ProjectSummary {
  uuid: string;
  project_name: string;
}

export interface ClientSummary {
  uuid: string;
  name: string;
  projects: ProjectSummary[];
}

export async function listClients(accessToken: string, userUuid: string): Promise<ClientSummary[]> {
  const response = await getClients(userUuid, accessToken);
  return (response.data || []).map((client) => ({
    uuid: client.uuid,
    name: client.name,
    projects: (client.projects || []).map((project) => ({
      uuid: project.uuid,
      project_name: project.project_name,
    })),
  }));
}

export async function listProjectsForClient(
  accessToken: string,
  userUuid: string,
  clientUuid: string,
): Promise<ProjectSummary[]> {
  const clients = await listClients(accessToken, userUuid);
  return clients.find((c) => c.uuid === clientUuid)?.projects ?? [];
}
