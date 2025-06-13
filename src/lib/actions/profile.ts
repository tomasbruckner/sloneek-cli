import { terminal as term } from "terminal-kit";
import { readConfig, writeConfig } from "../utils/config";

export async function profileAction(profileName?: string, remove: boolean = false): Promise<void> {
  try {
    const config = await readConfig();

    if (profileName && remove) {
      if (config.profiles[profileName]) {
        displayProfileInfo(profileName, config.profiles[profileName]);
        await handleProfileRemoval(config, profileName);
      } else {
        term.red(`Profile "${profileName}" not found.\n\n`);
      }
      return;
    }

    if (remove) {
      await handleProfileRemoval(config, profileName);
      return;
    }

    term.cyan("Sloneek Profiles:\n\n");

    const headers = ["Profile Name", "Email", "Client", "Project", "From", "To"];

    const tableData = [headers];
    for (const [name, profile] of Object.entries(config.profiles)) {
      if (profileName && profileName !== name) {
        continue;
      }

      tableData.push([
        name,
        profile.credentials.email,
        profile.client.name,
        profile.project.name,
        profile.workHours.start,
        profile.workHours.end,
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

async function handleProfileRemoval(config: Config, profileName?: string): Promise<void> {
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

  const newProfiles = { ...config.profiles };
  delete newProfiles[profileToRemove];

  // If only one profile remains and it's not _default, rename it to _default
  if (Object.keys(newProfiles).length === 1) {
    const remainingProfile = Object.keys(newProfiles)[0];
    if (remainingProfile !== "_default") {
      newProfiles["_default"] = newProfiles[remainingProfile];
      delete newProfiles[remainingProfile];
    }
  }

  const updatedConfig: Config = {
    ...config,
    profiles: newProfiles,
  };

  await writeConfig(updatedConfig);

  term.green(`✓ Profile "${profileToRemove}" has been removed.\n`);

  if (Object.keys(newProfiles).length === 1 && "_default" in newProfiles) {
    term.green(`✓ The remaining profile has been renamed to "_default".\n`);
  }

  term("\n");
}
