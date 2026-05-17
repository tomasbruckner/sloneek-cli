import { terminal as term } from "terminal-kit";
import { readConfig } from "../utils/config";
import { listProfiles, removeProfile } from "../services/profiles";

export async function profileAction(profileName?: string, remove: boolean = false): Promise<void> {
  try {
    if (profileName && remove) {
      const config = await readConfig();
      if (config.profiles[profileName]) {
        displayProfileInfo(profileName, config.profiles[profileName]);
        await handleProfileRemoval(profileName);
      } else {
        term.red(`Profile "${profileName}" not found.\n\n`);
      }
      return;
    }

    if (remove) {
      await handleProfileRemoval(profileName);
      return;
    }

    term.cyan("Sloneek Profiles:\n\n");

    const headers = ["Profile Name", "Email", "Client", "Project", "From", "To"];

    const tableData = [headers];
    const profiles = await listProfiles();
    for (const profile of profiles) {
      if (profileName && profileName !== profile.name) {
        continue;
      }

      tableData.push([
        profile.name,
        profile.email,
        profile.clientName,
        profile.projectName,
        profile.workHoursStart,
        profile.workHoursEnd,
      ]);
    }

    term.table(tableData, {
      hasBorder: true,
      contentHasMarkup: true,
      borderChars: "lightRounded",
      width: 100,
      fit: true,
    });

    term("\n");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    term.red(`\nError: ${errorMessage}\n`);
    process.exit(1);
  }
}

function displayProfileInfo(name: string, profile: ProfileConfig): void {
  term.cyan(`Profile: ${name}\n\n`);

  term.table(
    [
      ["Email", profile.credentials.email],
      ["Client", profile.client.name],
      ["Project", profile.project.name],
      ["From", profile.workHours.start],
      ["To", profile.workHours.end],
      ["Last Updated", new Date(profile.timestamp).toLocaleString()],
    ],
    {
      hasBorder: true,
      contentHasMarkup: true,
      borderChars: "lightRounded",
      width: 80,
      fit: true,
    },
  );

  term("\n");
}

async function handleProfileRemoval(profileName?: string): Promise<void> {
  const config = await readConfig();
  const profileCount = Object.keys(config.profiles).length;

  if (profileCount === 0) {
    term.red("No profiles found to remove.\n\n");
    return;
  }

  let profileToRemove: string;
  if (profileName && config.profiles[profileName]) {
    profileToRemove = profileName;
  } else {
    term.cyan("Select a profile to remove:\n");

    const profileNames = Object.keys(config.profiles);
    const selectedIndex = await term.singleColumnMenu(profileNames).promise;
    profileToRemove = profileNames[selectedIndex.selectedIndex];
    term("\n");

    term.yellow(`Are you sure you want to remove the profile "${profileToRemove}"? (y/n): `);
    const confirmed = await term.yesOrNo({ yes: ["y", "ENTER"], no: ["n"] }).promise;
    term("\n");

    if (!confirmed) {
      term.yellow("Profile removal cancelled.\n\n");
      return;
    }
  }

  const { renamedRemainingToDefault } = await removeProfile(profileToRemove);

  term.green(`✓ Profile "${profileToRemove}" has been removed.\n`);

  if (renamedRemainingToDefault) {
    term.green(`✓ The remaining profile has been renamed to "_default".\n`);
  }

  term("\n");
}
