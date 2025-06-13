#!/usr/bin/env node

import { terminal as term } from "terminal-kit";
import { fetchClients, fetchUserEvents, fetchUsers, login } from "../utils/api";
import { configExists, readConfig, writeConfig } from "../utils/config";

export async function initConfigAction(profileName?: string): Promise<void> {
  try {
    term.clear();
    term.cyan("Sloneek Configuration Setup\n\n");

    let selectedProfileName = profileName || "_default";
    let existingConfig: Config | null = null;
    let overwriteDefault = false;

    const hasExistingConfig = await configExists();
    if (hasExistingConfig) {
      existingConfig = await readConfig();

      if (profileName) {
        if (profileName === "_default") {
          overwriteDefault = true;
          term.green("✓ Will overwrite default profile\n\n");
        } else {
          selectedProfileName = profileName;
          term.green(`✓ Will create/update profile: ${selectedProfileName}\n\n`);
        }
      } else {
        term.cyan("A configuration already exists.\n");
        term.cyan("Do you want to:\n");
        const options = ["Overwrite default profile", "Create a new profile"];
        const response = await term.singleColumnMenu(options).promise;

        if (response.selectedIndex === 0) {
          overwriteDefault = true;
          selectedProfileName = "_default";
          term.green("✓ Will overwrite default profile\n\n");
        } else {
          term("Enter profile name: ");
          selectedProfileName = (await term.inputField({ echo: true }).promise) ?? "profile1";
          term("\n\n");
          term.green(`✓ Will create new profile: ${selectedProfileName}\n\n`);
        }
      }
    }

    term("Username: ");
    const email = (await term.inputField({ echo: true }).promise) ?? "";
    term("\n");

    term("Password: ");
    const password = (await term.inputField({ echo: false }).promise) ?? "";
    term("\n\n");

    const loginInfo = await login(email, password);
    term.green("✓ Login successful\n\n");

    term.cyan("Fetching users...\n");
    const usersResponse = await fetchUsers(loginInfo.access_token);

    let selectedUserUuid: string;

    if (usersResponse.data.length === 1) {
      selectedUserUuid = usersResponse.data[0].uuid;
      term.green(`✓ Using user: ${usersResponse.data[0].name}\n\n`);
    } else {
      term.cyan("Select user:\n");
      const userItems = usersResponse.data.map((user) => user.name);
      const selectedUserIndex = await term.singleColumnMenu(userItems).promise;
      selectedUserUuid =
        usersResponse.data[selectedUserIndex.selectedIndex].uuid;
      term("\n");
    }

    term.cyan("Fetching clients...\n");
    const clientsResponse = await fetchClients(loginInfo.access_token, selectedUserUuid);

    term.cyan("Choose client:\n");
    const clientItems = clientsResponse.data.map((client) => client.name);
    const selectedClientIndex = await term.singleColumnMenu(clientItems)
      .promise;
    const selectedClient =
      clientsResponse.data[selectedClientIndex.selectedIndex];
    term("\n");

    term.cyan("Choose project:\n");
    const projectItems = selectedClient.projects.map(
      (project) => project.project_name
    );
    const selectedProjectIndex = await term.singleColumnMenu(projectItems)
      .promise;
    const selectedProject =
      selectedClient.projects[selectedProjectIndex.selectedIndex];
    term("\n");

    term.cyan("Fetching planning events...\n");
    const planningEventsResponse = await fetchUserEvents(
      loginInfo.access_token,
      selectedUserUuid
    );

    term.green("✓ Planning event retrieved\n\n");

    term("Start time (default 8:00): ");
    const startTimeInput = await term.inputField({
      echo: true,
      default: "8:00",
    }).promise;
    const startTime = startTimeInput || "8:00";
    term("\n");

    term("End time (default 16:00): ");
    const endTimeInput = await term.inputField({
      echo: true,
      default: "16:00",
    }).promise;
    const endTime = endTimeInput || "16:00";
    term("\n\n");

    const selectedUser = usersResponse.data.find(
      (u) => u.uuid === selectedUserUuid
    );
    if (!selectedUser) {
      throw new Error("Selected user not found");
    }

    const profileConfig: ProfileConfig = {
      credentials: {
        email,
        password,
      },
      user: {
        uuid: selectedUserUuid,
        name: selectedUser.name,
      },
      client: {
        uuid: selectedClient.uuid,
        name: selectedClient.name,
      },
      project: {
        uuid: selectedProject.uuid,
        name: selectedProject.project_name,
      },
      planningEvent: {
        uuid: planningEventsResponse.data[0].uuid,
        detail_uuid: planningEventsResponse.data[0].planning_event.uuid,
        name: planningEventsResponse.data[0].planning_event.display_name,
      },
      workHours: {
        start: startTime,
        end: endTime,
      },
      timestamp: new Date().toISOString(),
    };

    // Create or update the configuration
    let config: Config;
    if (existingConfig && !overwriteDefault) {
      // Add new profile to existing config
      config = {
        ...existingConfig,
        profiles: {
          ...existingConfig.profiles,
          [selectedProfileName]: profileConfig
        }
      };
    } else if (existingConfig && overwriteDefault) {
      // Overwrite default profile in existing config
      config = {
        ...existingConfig,
        profiles: {
          ...existingConfig.profiles,
          "_default": profileConfig
        }
      };
    } else {
      // Create new config with default profile
      config = {
        profiles: {
          "_default": profileConfig
        }
      };
    }

    await writeConfig(config);

    term.green("✓ Configuration saved\n\n");

    term.cyan("Configuration Summary:\n");
    term(`Profile: ${selectedProfileName}\n`);
    term(`User: ${profileConfig.user.name}\n`);
    term(`Client: ${profileConfig.client.name}\n`);
    term(`Project: ${profileConfig.project.name}\n`);
    term(`Work Hours: ${profileConfig.workHours.start} - ${profileConfig.workHours.end}\n\n`);

    term.green("Setup completed successfully!\n");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    term.red(`\nError: ${errorMessage}\n`);
    process.exit(1);
  }

  process.exit(0);
}
