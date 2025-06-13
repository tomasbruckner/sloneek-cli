import path from "path";
import { promises as fs } from "fs";
import os from "os";
import { terminal as term } from "terminal-kit";

export async function readConfig(): Promise<Config> {
  try {
    const configDir = path.join(os.homedir(), ".sloneek");
    const configPath = path.join(configDir, "config.json");
    term.cyan(`Reading config from ${configPath} \n`);
    const configData = await fs.readFile(configPath, "utf8");

    const parsedConfig = JSON.parse(configData);

    if (!parsedConfig.profiles) {
      const legacyConfig = parsedConfig as ProfileConfig;
      return {
        profiles: {
          "_default": legacyConfig
        }
      };
    }

    // If there's an activeProfile property in the config, remove it
    if ('activeProfile' in parsedConfig) {
      const { activeProfile, ...rest } = parsedConfig;
      return rest;
    }

    return parsedConfig;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(
        "config.json not found. Please run the configuration script first."
      );
    }
    throw new Error(`Error reading config.json: ${error.message}`);
  }
}

export async function writeConfig(config: Config) {
  const configDir = path.join(os.homedir(), ".sloneek");
  const configPath = path.join(configDir, "config.json");
  term.cyan(`Writing config to ${configPath} \n`);

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

export async function configExists(): Promise<boolean> {
  const configDir = path.join(os.homedir(), ".sloneek");
  const configPath = path.join(configDir, "config.json");

  try {
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

export async function getProfileConfig(config: Config, profileName?: string): Promise<ProfileConfig> {
  if (Object.keys(config.profiles).length === 0) {
    throw new Error("No profiles found. Please run 'sloneek init' to create a profile.");
  }

  if (profileName && config.profiles[profileName]) {
    term.cyan(`Using profile: ${profileName}\n`);
    return config.profiles[profileName];
  }

  term.cyan(`Using default profile\n`);
  return config.profiles["_default"];
}
