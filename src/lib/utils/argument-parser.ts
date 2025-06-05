import { Command } from "@commander-js/extra-typings";
import packageJson from '../../../package.json';

export function parseArgs(): ParsedArgs {
  const program = new Command()
    .name(packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version);

  let result: ParsedArgs | null = null;

  program
    .command("log")
    .description("Create a new Sloneek worklog")
    .requiredOption("-m, --message <message>", "Your message here")
    .option("-f, --from <time>", "Start time in HH:MM format", (value) => {
      if (!/^\d{1,2}:\d{2}$/.test(value)) {
        program.error("Error: --from parameter must be in HH:MM format");
      }
      return value;
    })
    .option("-t, --to <time>", "End time in HH:MM format", (value) => {
      if (!/^\d{1,2}:\d{2}$/.test(value)) {
        program.error("Error: --to parameter must be in HH:MM format");
      }
      return value;
    })
    .option("-d, --day <day>", "Day in DD.MM or DD.MM. format", (value) => {
      if (!/^\d{1,2}\.\d{1,2}\.?$/.test(value)) {
        program.error(
          'Error: --day parameter must be in "DD.MM" or "DD.MM." format (e.g., "28.5" or "28.5.")'
        );
      }
      return value;
    })
    .option("-c, --client", "Interactive client mode")
    .option("-p, --project", "Interactive project mode")
    .action((options) => {
      const processedMessage = options.message
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\\\/g, "\\");

      result = {
        command: "log",
        message: processedMessage,
        interactiveClient: options.client ?? false,
        interactiveProject: options.project ?? false,
      } as const;

      if (options.from) result.from = options.from;
      if (options.to) result.to = options.to;
      if (options.day) result.day = options.day;
    });

  program
    .command("absence")
    .description("Create a new Sloneek absence")
    .action(() => {
      result = { command: "absence" } as const;
    });

  program
    .command("absence-cancel")
    .description("Cancel an existing Sloneek absence")
    .action(() => {
      result = { command: "absence-cancel" } as const;
    });

  program
    .command("list")
    .option(
      "-o, --other",
      "Show absences and events for other users in your team for current day"
    )
    .option(
      "-t, --team-prefix <team_name>",
      "Filter absences only for specific team. With conjuction with --other parameter"
    )
    .description("List existing events and absences")
    .action((option) => {
      result = { command: "list", other: !!option.other, teamPrefix: option.teamPrefix ?? ''  } as const;
    });

  program
    .command("init")
    .description("Initialize Sloneek configuration")
    .action(() => {
      result = { command: "init" } as const;
    });

  program.parse();

  if (!result) {
    program.help();
    process.exit(1);
  }

  return result;
}
