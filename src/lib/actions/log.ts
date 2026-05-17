import { fetchUserEvents } from "../utils/api";
import { terminal as term } from "terminal-kit";
import { authenticate } from "../utils/login";
import { calculateDurationMinutes, createDateTimeForSpecificDay, createDateTimeForToday } from "../utils/time";
import { DateTime } from "luxon";
import { listClients, type ClientSummary, type ProjectSummary } from "../services/clients";
import { createLog, type CreateLogInput } from "../services/logs";

export async function createLogAction(config: ProfileConfig, args: ParsedArgsLog) {
  const { message, interactiveClient, interactiveProject, interactiveActivity, day, yesterday, profile } = args;

  const accessToken = await authenticate(profile);
  const input = await resolveLogInput(config, args, accessToken);

  term.cyan("Creating event...\n");
  term.cyan(`User: ${config.user.name}\n`);
  term.cyan(`Activity: ${input._activityDisplayName}\n`);
  term.cyan(`Client: ${input._clientDisplayName}\n`);
  term.cyan(`Project: ${input._projectDisplayName}\n`);
  term.cyan(`Time: ${args.from || config.workHours.start} - ${args.to || config.workHours.end} (${input.durationMinutes} minutes)\n`);
  term.cyan(`Date: ${DateTime.fromISO(input.startIso).toFormat("yyyy-MM-dd")}\n`);
  term.cyan(`Message: ${message ?? ""}\n\n`);

  await createLog(accessToken, input);

  term.green("✓ Event created successfully!");
}

interface ResolvedLogInput extends CreateLogInput {
  _activityDisplayName: string;
  _clientDisplayName: string;
  _projectDisplayName: string;
}

async function resolveLogInput(
  config: ProfileConfig,
  args: ParsedArgsLog,
  accessToken: string,
): Promise<ResolvedLogInput> {
  const { message, interactiveClient, interactiveProject, interactiveActivity, day, yesterday } = args;

  let clientUuid: string, clientDisplayName: string, projectUuid: string, projectDisplayName: string;
  let planningEventUuid = config.planningEvent.uuid;
  let activityDisplayName = config.planningEvent.name;

  if (interactiveActivity) {
    term.cyan("Fetching activities...\n");
    const planningEventsResponse = await fetchUserEvents(accessToken, config.user.uuid);

    if (planningEventsResponse.data.length === 1) {
      const selected = planningEventsResponse.data[0];
      planningEventUuid = selected.uuid;
      activityDisplayName = selected.planning_event.display_name;
      term.green(`✓ Using activity: ${activityDisplayName}\n\n`);
    } else {
      term.cyan("Choose activity:\n");
      const activityItems = planningEventsResponse.data.map((event) => event.planning_event.display_name);
      const selectedIndex = await term.gridMenu(activityItems).promise;
      const selected = planningEventsResponse.data[selectedIndex.selectedIndex];
      planningEventUuid = selected.uuid;
      activityDisplayName = selected.planning_event.display_name;
      term("\n");
    }
  }

  if (interactiveClient || interactiveProject) {
    const { selectedClient, selectedProject } = await interactiveClientProjectSelection(
      accessToken,
      config.user.uuid,
      config,
      interactiveClient,
      interactiveProject,
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

  let startDateTime: DateTime;
  let endDateTime: DateTime;

  if (day) {
    startDateTime = createDateTimeForSpecificDay(startTime, day);
    endDateTime = createDateTimeForSpecificDay(endTime, day);
  } else if (yesterday) {
    startDateTime = createDateTimeForToday(startTime).minus({ days: 1 });
    endDateTime = createDateTimeForToday(endTime).minus({ days: 1 });
  } else {
    startDateTime = createDateTimeForToday(startTime);
    endDateTime = createDateTimeForToday(endTime);
  }

  if (endDateTime <= startDateTime) {
    throw new Error("End time must be after start time");
  }

  const durationMinutes = calculateDurationMinutes(startDateTime, endDateTime);

  // Use the same date as startDateTime for duration_time calculation
  const durationTime = startDateTime
    .startOf("day")
    .minus({ days: 1 })
    .plus({ hours: Math.floor(durationMinutes / 60), minutes: durationMinutes % 60 })
    .toISO({ suppressMilliseconds: true })!;

  return {
    clientUuid,
    projectUuid,
    planningEventUuid,
    userUuid: config.user.uuid,
    categories: config.categories ? config.categories.map((category) => category.uuid) : [],
    startIso: startDateTime.toISO({ suppressMilliseconds: true })!,
    endIso: endDateTime.toISO({ suppressMilliseconds: true })!,
    startTime: startDateTime.toFormat("HH:mm:ssZZ"),
    endTime: endDateTime.toFormat("HH:mm:ssZZ"),
    durationMinutes,
    durationTime,
    note: message ?? "",
    _activityDisplayName: activityDisplayName,
    _clientDisplayName: clientDisplayName,
    _projectDisplayName: projectDisplayName,
  };
}

async function interactiveClientProjectSelection(
  accessToken: string,
  userUuid: string,
  config: ProfileConfig,
  selectClient: boolean = false,
  selectProject: boolean = false,
): Promise<{ selectedClient: ClientSummary | null; selectedProject: ProjectSummary | null }> {
  if (!selectClient && !selectProject) {
    return { selectedClient: null, selectedProject: null };
  }

  term.cyan("Fetching clients...\n");
  const clients = await listClients(accessToken, userUuid);
  let selectedClient: ClientSummary | null = null;
  let selectedProject: ProjectSummary | null = null;

  if (selectClient) {
    term.cyan("Choose client:\n");
    const clientItems = clients.map((client) => client.name);
    const selectedClientIndex = await term.gridMenu(clientItems).promise;
    selectedClient = clients[selectedClientIndex.selectedIndex];
    term("\n");
  }

  if (selectProject) {
    // Use client from config when only selecting project
    if (!selectClient && config.client && config.client.uuid) {
      // Find the client from config in the response data
      const configClient = clients.find((client) => client.uuid === config.client.uuid);
      if (configClient) {
        selectedClient = configClient;
        term.cyan(`Using client from config: ${configClient.name}\n`);
        term.cyan("Choose project:\n");
        const projectItems = configClient.projects.map((project) => project.project_name);
        const selectedProjectIndex = await term.gridMenu(projectItems).promise;
        selectedProject = configClient.projects[selectedProjectIndex.selectedIndex];
        term("\n");
      } else {
        throw new Error("Client from config not found in available clients");
      }
    } else {
      // Original logic for when client is also being selected or not in config
      const clientForProjects = selectedClient || clients[0];

      if (!selectedClient && clients.length > 1) {
        term.cyan("Choose client for project selection:\n");
        const clientItems = clients.map((client) => client.name);
        const selectedClientIndex = await term.gridMenu(clientItems).promise;
        const clientForProjectSelection = clients[selectedClientIndex.selectedIndex];
        term("\n");

        term.cyan("Choose project:\n");
        const projectItems = clientForProjectSelection.projects.map((project) => project.project_name);
        const selectedProjectIndex = await term.gridMenu(projectItems).promise;
        selectedProject = clientForProjectSelection.projects[selectedProjectIndex.selectedIndex];

        // If we're only selecting project and not client, we need the client info too
        if (!selectClient) {
          selectedClient = clientForProjectSelection;
        }
      } else {
        term.cyan("Choose project:\n");
        const projectItems = clientForProjects.projects.map((project) => project.project_name);
        const selectedProjectIndex = await term.gridMenu(projectItems).promise;
        selectedProject = clientForProjects.projects[selectedProjectIndex.selectedIndex];

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
