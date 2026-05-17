import { readConfig, writeConfig } from "../utils/config";

export interface ProfileSummary {
  name: string;
  isActive: boolean;
  email: string;
  clientName: string;
  projectName: string;
  workHoursStart: string;
  workHoursEnd: string;
}

export async function listProfiles(): Promise<ProfileSummary[]> {
  const config = await readConfig();
  return Object.entries(config.profiles).map(([name, profile]) => ({
    name,
    isActive: name === "_default",
    email: profile.credentials.email,
    clientName: profile.client.name,
    projectName: profile.project.name,
    workHoursStart: profile.workHours.start,
    workHoursEnd: profile.workHours.end,
  }));
}

export async function removeProfile(name: string): Promise<{ renamedRemainingToDefault: boolean }> {
  const config = await readConfig();
  const profileCount = Object.keys(config.profiles).length;

  if (profileCount <= 1) {
    throw new Error("Cannot remove the only remaining profile.");
  }

  const newProfiles = { ...config.profiles };
  delete newProfiles[name];

  // If only one profile remains and it's not _default, rename it to _default
  let renamedRemainingToDefault = false;
  if (Object.keys(newProfiles).length === 1) {
    renamedRemainingToDefault = true;
    const remainingName = Object.keys(newProfiles)[0];
    if (remainingName !== "_default") {
      newProfiles["_default"] = newProfiles[remainingName];
      delete newProfiles[remainingName];
    }
  }

  const updatedConfig: Config = {
    ...config,
    profiles: newProfiles,
  };

  await writeConfig(updatedConfig);

  return { renamedRemainingToDefault };
}

export async function saveProfile(name: string, profile: ProfileConfig): Promise<void> {
  let existingConfig: Config | null = null;
  try {
    existingConfig = await readConfig();
  } catch {
    // No config yet — will create a fresh one
  }

  const config: Config = existingConfig
    ? {
        ...existingConfig,
        profiles: {
          ...existingConfig.profiles,
          [name]: profile,
        },
      }
    : {
        profiles: {
          [name]: profile,
        },
      };

  await writeConfig(config);
}
