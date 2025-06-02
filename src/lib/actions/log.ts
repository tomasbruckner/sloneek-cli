import { createEvent, getClients, login } from "../utils/api";
import { terminal as term } from "terminal-kit";
import {
  calculateDurationMinutes,
  createDateTimeForSpecificDay,
  createDateTimeForToday,
} from "../utils/time";

export async function createLogAction(
  config: Config,
  args: ParsedArgsLog
) {
  const { message, interactiveClient, interactiveProject, day } = args;

  const loginInfo = await login(
    config.credentials.email,
    config.credentials.password
  );

  let clientUuid: string,
    clientDisplayName: string,
    projectUuid: string,
    projectDisplayName: string;

  if (interactiveClient || interactiveProject) {
    const { selectedClient, selectedProject } =
      await interactiveClientProjectSelection(
        loginInfo.access_token,
        config.user.uuid,
        config,
        interactiveClient,
        interactiveProject
      );

    clientUuid = selectedClient?.uuid || config.client.uuid;
    clientDisplayName = selectedClient?.name || config.client.name;
    projectUuid = selectedProject?.uuid || config.project.uuid;
    projectDisplayName = selectedProject?.project_name || config.project.name;
  } else {
    // Use config defaults
    clientUuid = config.client.uuid;
    clientDisplayName = config.client.name;
    projectUuid = config.project.uuid;
    projectDisplayName = config.project.name;
  }

  const startTime = args.from || config.workHours.start;
  const endTime = args.to || config.workHours.end;

  const startDateTime = day
    ? createDateTimeForSpecificDay(startTime, day)
    : createDateTimeForToday(startTime);
  const endDateTime = day
    ? createDateTimeForSpecificDay(endTime, day)
    : createDateTimeForToday(endTime);

  if (endDateTime <= startDateTime) {
    throw new Error("End time must be after start time");
  }

  const duration = calculateDurationMinutes(startDateTime, endDateTime);

  // Use the same date as startDateTime for duration_time calculation
  const durationTime = startDateTime
    .startOf("day")
    .minus({ days: 1 })
    .plus({ hours: Math.floor(duration / 60), minutes: duration % 60 })
    .toISO();

  await createEvent(
    {
      isRepeat: false,
      user_planning_event_uuid: config.planningEvent.uuid,
      planning_categories: [],
      started_at: startDateTime.toISO({ suppressMilliseconds: true })!,
      ended_at: endDateTime.toISO({ suppressMilliseconds: true })!,
      start_time: startDateTime.toFormat("HH:mm:ssZZ"),
      end_time: endDateTime.toFormat("HH:mm:ssZZ"),
      days: [],
      duration_time: durationTime!,
      duration: duration,
      timezone: startDateTime.toISO()!,
      note: message ?? "",
      is_automatically_approve: false,
      message: message ?? "",
      mentions: [],
      client: clientUuid,
      client_project: projectUuid,
      user_uuid: config.user.uuid,
    },
    loginInfo.access_token,
    {
      user: config.user.name,
      clientDisplayName,
      projectDisplayName,
      startDateTime,
      startTime,
      endTime,
    }
  );

  console.log("✓ Event created successfully!");
}

async function interactiveClientProjectSelection(
  accessToken: string,
  userUuid: string,
  config: Config,
  selectClient: boolean = false,
  selectProject: boolean = false
): Promise<ClientProjectSelection> {
  if (!selectClient && !selectProject) {
    return { selectedClient: null, selectedProject: null };
  }

  term.cyan("Fetching clients...\n");
  const clientsResponse = await getClients(userUuid, accessToken);
  let selectedClient: Client | null = null;
  let selectedProject: Project | null = null;

  if (selectClient) {
    term.cyan("Choose client:\n");
    const clientItems = clientsResponse.data.map((client) => client.name);
    const selectedClientIndex = await term.singleColumnMenu(clientItems)
      .promise;
    selectedClient = clientsResponse.data[selectedClientIndex.selectedIndex];
    term("\n");
  }

  if (selectProject) {
    // Use client from config when only selecting project
    if (!selectClient && config.client && config.client.uuid) {
      // Find the client from config in the response data
      const configClient = clientsResponse.data.find(
        (client) => client.uuid === config.client.uuid
      );
      if (configClient) {
        selectedClient = configClient;
        term.cyan(`Using client from config: ${configClient.name}\n`);
        term.cyan("Choose project:\n");
        const projectItems = configClient.projects.map(
          (project) => project.project_name
        );
        const selectedProjectIndex = await term.singleColumnMenu(projectItems)
          .promise;
        selectedProject =
          configClient.projects[selectedProjectIndex.selectedIndex];
        term("\n");
      } else {
        throw new Error("Client from config not found in available clients");
      }
    } else {
      // Original logic for when client is also being selected or not in config
      const clientForProjects = selectedClient || clientsResponse.data[0];

      if (!selectedClient && clientsResponse.data.length > 1) {
        term.cyan("Choose client for project selection:\n");
        const clientItems = clientsResponse.data.map((client) => client.name);
        const selectedClientIndex = await term.singleColumnMenu(clientItems)
          .promise;
        const clientForProjectSelection =
          clientsResponse.data[selectedClientIndex.selectedIndex];
        term("\n");

        term.cyan("Choose project:\n");
        const projectItems = clientForProjectSelection.projects.map(
          (project) => project.project_name
        );
        const selectedProjectIndex = await term.singleColumnMenu(projectItems)
          .promise;
        selectedProject =
          clientForProjectSelection.projects[
            selectedProjectIndex.selectedIndex
          ];

        // If we're only selecting project and not client, we need the client info too
        if (!selectClient) {
          selectedClient = clientForProjectSelection;
        }
      } else {
        term.cyan("Choose project:\n");
        const projectItems = clientForProjects.projects.map(
          (project) => project.project_name
        );
        const selectedProjectIndex = await term.singleColumnMenu(projectItems)
          .promise;
        selectedProject =
          clientForProjects.projects[selectedProjectIndex.selectedIndex];

        // If we're only selecting project, we need the client info too
        if (!selectClient) {
          selectedClient = clientForProjects;
        }
      }
      term("\n");
    }
  }

  return { selectedClient, selectedProject };
}
