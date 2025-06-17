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
    .option("-r, --profile <profile>", "Use specific profile instead of the default one")
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
    .option("-y, --yesterday", "Use yesterday's date")
    .option("-c, --client", "Interactive client mode")
    .option("-p, --project", "Interactive project mode")
    .action((options) => {
      // Check for mutual exclusivity between --day and --yesterday
      if (options.day && options.yesterday) {
        program.error("Error: --day and --yesterday cannot be used together");
      }
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
        profile: options.profile
      } as const;

      if (options.from) result.from = options.from;
      if (options.to) result.to = options.to;
      if (options.day) result.day = options.day;
      if (options.yesterday) result.yesterday = true;
    });

  program
    .command("absence")
    .description("Create a new Sloneek absence")
    .option("-r, --profile <profile>", "Use specific profile instead of the default one")
    .action((options) => {
      result = { 
        command: "absence",
        profile: options.profile
      } as const;
    });

  program
    .command("absence-cancel")
    .description("Cancel an existing Sloneek absence")
    .option("-r, --profile <profile>", "Use specific profile instead of the default one")
    .action((options) => {
      result = { 
        command: "absence-cancel",
        profile: options.profile
      } as const;
    });

  program
    .command("log-cancel")
    .description("Cancel an existing Sloneek worklog")
    .option("-r, --profile <profile>", "Use specific profile instead of the default one")
    .action((options) => {
      result = { 
        command: "log-cancel",
        profile: options.profile
      } as const;
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
    .option("-r, --profile <profile>", "Use specific profile instead of the default one")
    .description("List existing events and absences")
    .action((option) => {
      result = { 
        command: "list", 
        other: !!option.other, 
        teamPrefix: option.teamPrefix ?? '',
        profile: option.profile
      } as const;
    });

  program
    .command("profile")
    .description("Display profile information")
    .option("-r, --profile <profile>", "Show specific profile instead of all profiles")
    .option("-d, --delete", "Remove a profile")
    .option("--remove", "Remove a profile (alias for --delete)")
    .option("--cancel", "Remove a profile (alias for --delete)")
    .action((options) => {
      result = { 
        command: "profile",
        profile: options.profile,
        remove: !!(options.remove || options.delete || options.cancel)
      } as const;
    });

  program
    .command("init")
    .description("Initialize Sloneek configuration")
    .option("-r, --profile <profile>", "Create or update a specific profile")
    .action((options) => {
      result = { 
        command: "init",
        profile: options.profile
      } as const;
    });

  program.parse();

  if (!result) {
    program.help();
    process.exit(1);
  }

  return result;
}
