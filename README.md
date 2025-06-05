# Sloneek easy logger
This was motivated by frustating user experience of HR system Sloneek. If you want to do most common actions 100x faster than by using GUI, you can use this library.

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
# this should be run only once
sloneek init
```

Enter your login and password to Sloneek and choose default parameters.

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
- `--client` (or `-c`) - Interactive client selection (flag, no value needed)
- `--project` (or `-p`) - Interactive project selection (flag, no value needed)

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

## Creating absences (absence action)

Create absence

```bash
# everything will be asked interactively
sloneek absence
```

## Canceling absences (absence-cancel action)

Cancel an existing absence

```bash
# lists your absences and lets you select which one to cancel
sloneek absence-cancel
```

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
