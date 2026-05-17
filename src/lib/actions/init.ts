#!/usr/bin/env node

import { DateTime } from "luxon";
import { terminal as term } from "terminal-kit";
import { configExists, readConfig } from "../utils/config";
import { loginWithCredentials, listUsers } from "../services/auth";
import { listClients } from "../services/clients";
import { listPlanningEvents, listCategories } from "../services/events";
import { saveProfile } from "../services/profiles";

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

    const loginInfo = await loginWithCredentials(email, password);
    term.green("✓ Login successful\n\n");

    term.cyan("Fetching users...\n");
    const users = await listUsers(loginInfo.access_token);

    let selectedUserUuid: string;
    let selectedUserName: string;

    if (users.length === 1) {
      selectedUserUuid = users[0].uuid;
      selectedUserName = users[0].name;
      term.green(`✓ Using user: ${users[0].name}\n\n`);
    } else {
      term.cyan("Select user:\n");
      const userItems = users.map((user) => user.name);
      const selectedUserIndex = await term.gridMenu(userItems).promise;
      selectedUserUuid = users[selectedUserIndex.selectedIndex].uuid;
      selectedUserName = users[selectedUserIndex.selectedIndex].name;
      term("\n");
    }

    term.cyan("Fetching clients...\n");
    const clients = await listClients(loginInfo.access_token, selectedUserUuid);

    term.cyan("Choose client:\n");
    const clientItems = clients.map((client) => client.name);
    const selectedClientIndex = await term.gridMenu(clientItems).promise;
    const selectedClient = clients[selectedClientIndex.selectedIndex];
    term("\n");

    term.cyan("Choose project:\n");
    const projectItems = selectedClient.projects.map((project) => project.project_name);
    const selectedProjectIndex = await term.gridMenu(projectItems).promise;
    const selectedProject = selectedClient.projects[selectedProjectIndex.selectedIndex];
    term("\n");

    term.cyan("Fetching planning events...\n");
    const planningEvents = await listPlanningEvents(loginInfo.access_token, selectedUserUuid);

    let selectedPlanningEvent: { uuid: string; planningEventUuid: string; displayName: string };
    if (planningEvents.length === 1) {
      selectedPlanningEvent = planningEvents[0];
      term.green(`✓ Using planning event: ${selectedPlanningEvent.displayName}\n\n`);
    } else {
      term.cyan("Choose planning event:\n");
      const planningEventItems = planningEvents.map((event) => event.displayName);
      const selectedPlanningEventIndex = await term.gridMenu(planningEventItems).promise;
      selectedPlanningEvent = planningEvents[selectedPlanningEventIndex.selectedIndex];
      term("\n");
      term.green(`✓ Selected planning event: ${selectedPlanningEvent.displayName}\n\n`);
    }

    term.cyan("Fetching categories...\n");
    const categories = await listCategories(loginInfo.access_token);

    term.cyan("Select categories:\n");
    const selectedCategories: { uuid: string; name: string }[] = [];

    for (const category of categories) {
      term.cyan(`Include category "${category.name}"? (y/n) `);
      const includeCategory = await term.yesOrNo({ yes: ["y", "ENTER"], no: ["n"] }).promise;

      if (includeCategory) {
        selectedCategories.push({
          uuid: category.uuid,
          name: category.name,
        });
        term.green(` ✓ Added\n`);
      } else {
        term.yellow(` ✗ Skipped\n`);
      }
    }

    term("\n");
    if (selectedCategories.length > 0) {
      term.green(`✓ Selected categories: ${selectedCategories.map((c) => c.name).join(", ")}\n\n`);
    } else {
      term.yellow("No categories selected\n\n");
    }

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

    const profileConfig: ProfileConfig = {
      credentials: {
        email,
        password,
      },
      user: {
        uuid: selectedUserUuid,
        name: selectedUserName,
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
        uuid: selectedPlanningEvent.uuid,
        detail_uuid: selectedPlanningEvent.planningEventUuid,
        name: selectedPlanningEvent.displayName,
      },
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      workHours: {
        start: startTime,
        end: endTime,
      },
      timestamp: new Date().toISOString(),
      token: {
        access_token: loginInfo.access_token,
        expires_at: DateTime.fromSeconds(loginInfo.access_token_expires_at).toISO(),
      },
    };

    // Determine the profile name to save under, accounting for overwrite logic
    const nameToSave = overwriteDefault ? "_default" : selectedProfileName;
    await saveProfile(nameToSave, profileConfig);

    term.green("✓ Configuration saved\n\n");

    term.cyan("Configuration Summary:\n");
    term(`Profile: ${selectedProfileName}\n`);
    term(`User: ${profileConfig.user.name}\n`);
    term(`Client: ${profileConfig.client.name}\n`);
    term(`Project: ${profileConfig.project.name}\n`);
    if (profileConfig.categories && profileConfig.categories.length > 0) {
      term(`Categories: ${profileConfig.categories.map((c) => c.name).join(", ")}\n`);
    }
    term(`Work Hours: ${profileConfig.workHours.start} - ${profileConfig.workHours.end}\n\n`);

    term.green("Setup completed successfully!\n");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    term.red(`\nError: ${errorMessage}\n`);
    process.exit(1);
  }

  process.exit(0);
}
