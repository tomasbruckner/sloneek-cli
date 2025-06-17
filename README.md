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

- `--other` (or `-o`) - Lists other users absences
- `--team substring` (or `-t substring`) - used only together with `--other` to filter users that you are interested in by their team
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
