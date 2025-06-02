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

    return JSON.parse(configData);
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
