#!/usr/bin/env node

import { terminal as term } from "terminal-kit";
import { readConfig } from "./utils/config";
import { parseArgs } from "./utils/argument-parser";
import { listEventsAction } from "./actions/list";
import { createLogAction } from "./actions/log";
import { initConfigAction } from "./actions/init";
import { createAbsenceAction } from "./actions/absence";

export async function main(): Promise<void> {
  try {
    const args = parseArgs();

    if (args.command === "init") {
      await initConfigAction();
      return;
    }

    const config = await readConfig();

    if (args.command === "list") {
      await listEventsAction(config, args);
    } else if (args.command === "log") {
      await createLogAction(config, args);
    } else if (args.command === "absence") {
      await createAbsenceAction(config);
    } else {
      throw new Error("Invalid command");
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
}

// Handle Ctrl+C gracefully
term.on("key", (name: string) => {
  if (name === "CTRL_C") {
    term.clear();
    term.red("Operation cancelled.\n");
    process.exit(1);
  }
});
