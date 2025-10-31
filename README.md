# Sloneek easy logger
This was motivated by frustating user experience of HR system Sloneek. If you want to do most common actions 100x faster than by using GUI, you can use this library.

[![npm version](https://badge.fury.io/js/sloneek-cli.svg)](https://badge.fury.io/js/sloneek-cli)

## Prerequisities
Install Node.js 22 or newer. You can download it from [here](https://nodejs.org/en).

It may work with older Node.js, but it is tested on version 22.

## Getting started

To install run

```bash
# this should be run only once and it installs this libary globally
npm i -g sloneek-cli
```

To init configuration run

```bash
# this creates your initial configuration
sloneek init
```

Enter your login and password to Sloneek and choose default parameters.

### Multiple Profiles

You can create and manage multiple configuration profiles:

```bash
# Run init again to either overwrite the default profile or create a new one
sloneek init

# Create or update a specific profile directly
sloneek init --profile myprofile  # or -r myprofile
```

If a configuration already exists, you'll be asked if you want to:
1. Overwrite the default profile
2. Create a new profile (you'll be prompted for a name)

The "_default" profile will be used for all commands when no profile is specified.

You can also specify a profile directly when running a command:

```bash
# Use a specific profile for a command
sloneek log --message "Working on feature development" --profile myprofile  # or -r myprofile
```

This allows you to use different profiles for different commands without changing the active profile.

## Creating worklogs (log action)

To create worklog in Sloneek run

### Basic

```bash
# Create event with default settings from config
sloneek log --message "Working on feature development"

# Create event with multiline message (use \n to create newline character)
sloneek log --message "First line\nSecond line"

# Specify custom time range
sloneek log --message "Meeting with client" --from "9:30" --to "11:00"

# Create event for specific date
sloneek log --message "Bug fixes" --day "28.5."
sloneek log --message "Bug fixes" --day "28.5"   # you can omit last dot
```

### Interactive Selection

```bash
# Choose project interactively (uses client from config)
sloneek log --message "Project work" --project

# Choose both client and project interactively
sloneek log --message "Project work" --client --project
```

### Complex

```bash
# Full example with all parameters
sloneek log --message "Sprint planning meeting" --day "15.12" --from "9:00" --to "10:30" --project
```

### Command Line Parameters

#### Required Parameters

- `--message "text"` (or `-m`) - Description of the work performed

#### Optional Parameters

- `--from HH:MM` (or `-f HH:MM`) - Start time (default: from config, usually 8:00)
- `--to HH:MM` (or `-t HH:MM`) - End time (default: from config, usually 16:00)
- `--day "DD.MM"` or `--day "DD.MM."` (or `-d DD.MM`) - Specific date (default: today)
- `--yesterday` (or `-y`) - Use yesterday's date (mutually exclusive with `--day`)
- `--client` (or `-c`) - Interactive client selection (flag, no value needed)
- `--project` (or `-p`) - Interactive project selection (flag, no value needed)
- `--profile <profile>` (or `-r <profile>`) - Use specific profile instead of the active one

## Listing worklogs and absences (list action)

List what you logged for current month

```bash
# show what you have logged this month
sloneek list
```

Filter your own work events by Client name (absences are hidden when filtering)

```bash
# show only your work events for a specific client (case-insensitive substring match)
sloneek list --client "Acme"
```

List your teammates absences for current day

```bash
# show absences of other users for current day
sloneek list --other
```

List your teammates absences for current day and filter teammates by their team substring

```bash
# show absences of other users filtered by their team name SuperTeam
sloneek list --other --team SuperTeam
```

### Command Line Parameters

#### Optional Parameters

- `--other` (or `-o`) - Lists other users' absences (current day)
- `--team <team_name>` (or `-t <team_name>`) - Used only together with `--other` to filter users by their team name (substring, case-insensitive). Accepts a comma-separated list
- `--client <client_name>` (or `-c <client_name>`) - Filter your own work events by Client name (substring, case-insensitive). When used, absences are hidden from the list
- `--profile <profile>` (or `-r <profile>`) - Use specific profile instead of the active one

## Creating absences (absence action)

Create absence

```bash
# everything will be asked interactively
sloneek absence
```

### Command Line Parameters

#### Optional Parameters

- `--profile <profile>` (or `-r <profile>`) - Use specific profile instead of the active one

## Canceling absences (absence-cancel action)

Cancel an existing absence

```bash
# lists your absences and lets you select which one to cancel
sloneek absence-cancel
```

### Command Line Parameters

#### Optional Parameters

- `--profile <profile>` (or `-r <profile>`) - Use specific profile instead of the active one

## Reporting scheduled events for all users (report action)

Report scheduled events for all users available in the calendar options. By default, it shows the current month (full month).

The report displays columns: Date, Time, User, Team, Client, Project / Title.

Use --summary to show a concise per-user totals table with columns: User, Team, Work h, Absence h, Total h.

```bash
# current month for all users
sloneek report

# per-user totals summary (User, Team, Work h, Absence h, Total h)
sloneek report --summary

# pick specific month (applies when --start/--end are not used)
sloneek report --month 2025-08
sloneek report --month 8      # current year August

# explicit interval
sloneek report --start "2025-08-04T00:00:00+02:00" --end "2025-08-31T23:59:59+02:00"


# filter only specific teams (substring match, case-insensitive)
sloneek report --team "Dev"

# filter multiple teams (comma-separated)
sloneek report --team "Dev,Ops"

# filter users whose name contains substring (case-insensitive)
sloneek report --name "Jaroslav"

# validate (up to today) and show, for each user, which workdays are missing any event (respects filters)
sloneek report --validate
```

### Command Line Parameters

#### Optional Parameters
- `--start <ISO>` - Interval start in ISO format
- `--end <ISO>` - Interval end in ISO format
- `--team <team_names>` (or `-t <team_names>`) - Filter users by team name(s), comma-separated list (substring match, case-insensitive)
- `--name <name>` (or `-n <name>`) - Filter users by name (substring match, case-insensitive)
- `--month <month>` - Select target month when `--start/--end` are not provided. Accepts `YYYY-MM`, `MM-YYYY`, `MM.YYYY`, or just `M`/`MM` for current year
- `--validate` - Suppress listing events and show, for each user, which workdays up to today (Mon–Fri) are missing any scheduled event, including the total count of missing days (respects team filters). Days with approved absences are not counted as missing
- `--summary` - Show a per-user totals table with columns: User, Team, Work h, Absence h, Total h (suppresses the event listing)
- `--ignore-today` - When used with `--validate`, exclude today from validation (validate up to yesterday)
- `--profile <profile>` (or `-r <profile>`) - Use specific profile instead of the active one

## Reporting one user's monthly details (report-detail action)

## Team projects monthly summary (team-report action)

Sum logged hours across all users for specified projects in a given month. By default, it uses the current month. You can also target a specific month in format "9.2025" or use --previous-month.

If you don't provide --client and/or --projects, you'll be prompted interactively to choose a client and select one or more projects.

Examples:

```bash
# Sum this month for projects matching names (substring match, case-insensitive)
sloneek team-report --projects "Project Alpha,Website Redesign"

# Choose client and projects interactively
sloneek team-report

# Provide client substring, select projects interactively
sloneek team-report --client "Acme"

# Target a specific month in M.YYYY format
sloneek team-report --projects "Alpha" --month "9.2025"

# Use previous month quickly
sloneek team-report --projects "Alpha,Beta" --previous-month
```

Options:
- `--client <name>` (or `-c <name>`) — Client name substring; if omitted, you'll choose interactively.
- `--projects <list>` (or `-p <list>`) — Comma-separated list of project names or substrings to include; if omitted, you'll select interactively.
- `--month <month>` — Target month; accepts formats like `9.2025`, `09.2025`, or `2025-09`.
- `--previous-month` — Use previous month instead of current.
- `--profile <profile>` (or `-r <profile>`) — Use a specific profile.

## Reporting one user's monthly details (report-detail action)

List one user's scheduled events and absences for a selected month. Notes are fetched from the detail endpoints and rendered without truncation, allowing multiline content. The table shows: Date, Total, Time, Type, Project/Absence, Note.

Usage examples:

```bash
# Pick the user interactively (multi-column name list) for the current month
sloneek report-detail

# Pick a specific month
sloneek report-detail --month 2025-08
sloneek report-detail --month 8    # current year August

# Filter users by substring (name or UUID)
# - if exactly one user matches, it auto-selects
# - if multiple match, you'll select from the filtered list
# - if none match, it errors
sloneek report-detail --user "john"
```

Options:
- `--user <name|uuid>` (or `-u <name|uuid>`, or `--name <name|uuid>`) — Optional substring to filter users by name or UUID. If omitted, you'll choose interactively.
- `--month <month>` — Target month (e.g., `2025-08`, `08`, or `8`). Defaults to current month.
- `--profile <profile>` (or `-r <profile>`) — Use a specific profile.

What is displayed:
- For scheduled events: project name is shown in Project/Absence column; notes come from `data.scheduled_event_data.note`.
- For absences: absence event name is shown; notes come from `data.absence_data.note`.

## Viewing profiles (profile action)

Display information about your profiles

```bash
# Show all profiles
sloneek profile

# Show a specific profile
sloneek profile -r myprofile  # or --profile myprofile

# Remove a profile (you'll be prompted to select which one)
sloneek profile --remove  # or -d

# Remove a specific profile (will be removed without confirmation)
sloneek profile -r myprofile --remove  # or -d
```

This command displays a table with the following information for each profile:
- Profile name
- Whether it's the active profile
- Username
- Client
- Project
- Default from time
- Default to time

When removing a profile:
- If you don't specify a profile name, you'll be prompted to select one and confirm the removal
- If you specify a profile name, it will be removed without asking for confirmation
- If only one profile remains after removal, it will be renamed to "_default"
- You cannot remove the only profile

### Command Line Parameters

#### Optional Parameters

- `--profile <profile>` (or `-r <profile>`) - Show specific profile instead of all profiles
- `--remove` (or `-d`) - Remove a profile (you'll be prompted to select which one if no profile is specified, or it will be removed without confirmation if a profile is specified)
- `--delete` (or `-d`) - Alias for --remove
- `--cancel` (or `-d`) - Alias for --remove

## Help
Prints help for every action
```bash
# show help for log action
sloneek help log

# show help for list action
sloneek help list

# show help for absence action
sloneek help absence

# show help for absence-cancel action
sloneek help absence-cancel

# show help for profile action
sloneek help profile

# show help for init action
sloneek help init
```

## Version
Prints current version of this app
```bash
sloneek --version
```

## How to update
If you want to update this library, run
```bash
npm i -g sloneek-cli@latest
```
