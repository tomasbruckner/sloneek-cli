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
      const [hours, minutes] = value.split(":").map(Number);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        program.error("Error: --from parameter has invalid time range (hours: 0-23, minutes: 0-59)");
      }
      return value;
    })
    .option("-t, --to <time>", "End time in HH:MM format", (value) => {
      if (!/^\d{1,2}:\d{2}$/.test(value)) {
        program.error("Error: --to parameter must be in HH:MM format");
      }
      const [hours, minutes] = value.split(":").map(Number);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        program.error("Error: --to parameter has invalid time range (hours: 0-23, minutes: 0-59)");
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
    .option("-a, --activity", "Interactive activity mode")
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
        interactiveActivity: options.activity ?? false,
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
      "-t, --team <team_name>",
      "Filter absences by team name(s) (substring, case-insensitive). Accepts a comma-separated list; used with --other"
    )
    .option("-d, --detail", "Show event notes/messages (requires extra API calls)")
    .option("-M, --month <month>", "Show specific month (1-12) instead of current month", (value) => {
      const month = parseInt(value, 10);
      if (isNaN(month) || month < 1 || month > 12) {
        program.error("Error: --month must be a number between 1 and 12");
      }
      return value;
    })
    .option("-c, --client <client_name>", "Filter own events by Client name (substring, case-insensitive)")
    .option("-r, --profile <profile>", "Use specific profile instead of the default one")
    .description("List existing events and absences")
    .action((option) => {
      // Normalize --team (new) or --team-prefix (legacy) to string[] (comma-separated list supported)
      const rawTeam = option.team ?? (option as any).teamPrefix; // keep backward compatibility
      const teamPrefixes: string[] = (rawTeam ? String(rawTeam).split(",") : [])
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      result = {
        command: "list",
        other: !!option.other,
        teamPrefixes: teamPrefixes.length ? teamPrefixes : undefined,
        client: option.client,
        detail: !!option.detail,
        month: option.month ? parseInt(option.month, 10) : undefined,
        profile: option.profile
      } as const;
    });

  program
    .command("report")
    .description("Report scheduled events for all users in calendar options")
    .option("-r, --profile <profile>", "Use specific profile instead of the default one")
    .option("--start <iso>", "Interval start ISO (e.g., 2025-08-04T00:00:00+02:00)")
    .option("--end <iso>", "Interval end ISO (e.g., 2025-08-11T00:00:00+02:00)")
    .option(
      "-t, --team <team_name>",
      "Filter users by team name(s) (substring, case-insensitive). Accepts a comma-separated list"
    )
    .option(
      "-n, --name <name>",
      "Filter users by name (substring, case-insensitive)"
    )
    .option(
      "--validate",
      "Show users who have no scheduled event in the selected interval (respects filters)"
    )
    .option(
      "--ignore-today",
      "When used with --validate, exclude today from validation (validate up to yesterday)"
    )
    .option(
      "--month <month>",
      "Target month to report (e.g., 2025-08, 08, or 8). Applies only when --start/--end are not provided; defaults to current month"
    )
    .option(
      "--summary",
      "Include per-day summary columns (Work h, Absence h, Total h) in the report table"
    )
    .action((options) => {
      if ((options.start && !options.end) || (!options.start && options.end)) {
        program.error("Error: both --start and --end must be provided together");
      }

      // Normalize --team to string[] (comma-separated list supported)
      const teams: string[] = (options.team ? String(options.team).split(",") : [])
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      result = {
        command: "report",
        start: options.start,
        end: options.end,
        teams: teams.length ? teams : undefined,
        name: options.name,
        validate: !!options.validate,
        ignoreToday: !!options.ignoreToday,
        month: options.month,
        summary: !!options.summary,
        profile: options.profile,
      } as const;
    });

  program
    .command("team-report")
    .description("Sum logged hours for specified projects in a month")
    .option("-r, --profile <profile>", "Use specific profile instead of the default one")
    .option("-c, --client <name>", "Client name substring; if omitted, choose interactively")
    .option("-p, --projects <names>", "Comma-separated list of project names or substrings to include; if omitted, choose interactively", (s) => String(s))
    .option("--month <month>", "Target month in formats like '9.2025', '09.2025', or '2025-09'; defaults to current month")
    .option("--previous-month", "Use previous month instead of current month")
    .action((options) => {
      if (options.month && options.previousMonth) {
        program.error("Error: --month and --previous-month cannot be used together");
      }
      let projects: string[] | undefined;
      if (options.projects) {
        projects = String(options.projects)
          .split(",")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        if (!projects.length) {
          projects = undefined;
        }
      }
      result = {
        command: "team-report",
        client: options.client,
        projects,
        month: options.month,
        previousMonth: !!options.previousMonth,
        profile: options.profile,
      } as const;
    });

  program
    .command("report-detail")
    .description("Report one user's events and absences for a month with notes")
    .option("-r, --profile <profile>", "Use specific profile instead of the default one")
    .option("-u, --user <name|uuid>", "User name or UUID (substring match); if omitted, choose interactively")
    .option("-n, --name <name|uuid>", "Alias for --user: user name or UUID (substring match)")
    .option("--month <month>", "Target month (e.g., 2025-08, 08, or 8). Defaults to current month")
    .action((options) => {
      result = {
        command: "report-detail",
        user: options.user ?? options.name,
        month: options.month,
        profile: options.profile,
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
