#!/usr/bin/env node

import { terminal as term } from "terminal-kit";
import { getProfileConfig, readConfig } from "./utils/config";
import { parseArgs } from "./utils/argument-parser";
import { listEventsAction } from "./actions/list";
import { createLogAction } from "./actions/log";
import { initConfigAction } from "./actions/init";
import { createAbsenceAction } from "./actions/absence";
import { absenceCancelAction } from "./actions/absence-cancel";
import { logCancelAction } from "./actions/log-cancel";
import { profileAction } from "./actions/profile";

export async function main(): Promise<void> {
  try {
    const args = parseArgs();

    if (args.command === "init") {
      await initConfigAction(args.profile);
      return;
    }

    if (args.command === "profile") {
      await profileAction(args.profile, args.remove);
      return;
    }

    const config = await readConfig();
    const profileConfig = await getProfileConfig(config, args.profile);

    if (args.command === "list") {
      await listEventsAction(profileConfig, args);
    } else if (args.command === "log") {
      await createLogAction(profileConfig, args);
    } else if (args.command === "absence") {
      await createAbsenceAction(profileConfig);
    } else if (args.command === "absence-cancel") {
      await absenceCancelAction(profileConfig);
    } else if (args.command === "log-cancel") {
      await logCancelAction(profileConfig);
    } else {
      throw new Error("Invalid command");
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
}

term.on("key", (name: string) => {
  if (name === "CTRL_C") {
    term.clear();
    term.red("Action aborted by user.\n");
    process.exit(1);
  }
});
