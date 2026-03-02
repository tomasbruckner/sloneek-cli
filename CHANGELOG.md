# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [1.11.0] (2026-02-18)

### Added
- log: New `-a` (`--activity`) option for interactive activity (planning event) selection at log time, instead of always using the default from config

## [1.10.6] (2026-02-18)

### Changed
- Extracted duplicated `getMonthRangePrague`, `formatHours`, and calendar-user resolution helpers into shared utilities in `time.ts`
- Replaced `console.log` calls in API layer with `term.cyan` output in action files
- Simplified `createEvent` API function signature (moved display logging to `log.ts`)
- Unified error handling: removed redundant try-catch in `login.ts` to prevent double error output

### Fixed
- Fixed typo "Unknow type" → "Unknown type" in absence action
- Removed duplicate `Project`, `Client`, `ClientsResponse` interface definitions in types
- Added proper TypeScript types (`CalendarUser`, `EventsListPayload`, `NationalHolidaysResponse`, `ScheduledEventsResponse.events`) to eliminate `as any` casts
- Removed `as any` casts in router (`sloneek.ts`) where TypeScript narrowing already works

## [1.10.5] (2025-10-31)

### Added
- report: Added `getNationalHolidays` API helper that calls `POST /v1/module-core/national-holidays` with `from_date`, `to_date`, `is_show_company_holidays`, and `users_uuids`.

### Changed
- report: Exclude national and company holidays from workday calculations and absence totals in `--summary` and `--validate` modes. Holidays are resolved for the selected interval and users and compared by ISO date. If the holidays request fails, a warning is printed and behavior falls back to previous logic (no holiday exclusion).

## [1.10.4] (2025-09-19)

### Fixed
- report-detail: Sum of hours and overall totals now match the logic used in the `list` action (uses calculateDurationMinutes and subtracts 30 minutes for full-day absences). Also includes counts of work vs absence events in the summary.

## [1.10.3] (2025-08-30)

### Changed
- list: CLI option renamed from `--team-prefix` to `--team` (substring match, case-insensitive). Backward compatible with the legacy flag.
- report-detail: Added `--month` option to select a specific month; table now includes per-day Total column.
- README: Updated docs for list/team and report-detail month option.

## [1.10.2] (2025-08-30)

### Added
- list: New `--client` (`-c`) option to filter own work events by Client name (substring, case-insensitive). When used, absences are hidden from the list to show only matching work entries.
- report-detail: Added `--name` (`-n`) as an alias for `--user`.

## [1.10.1] (2025-08-28)

### Changed
- list: Added per-day Total column formatted as decimal hours (e.g., 8.5 hours) shown only on the first row per day.
- report-detail: Added per-day Total column and switched formatting to decimal hours, shown only on the first row per day.

## [1.10.0] (2025-08-25)

### Added
- New `report-detail` command to list one user's scheduled events and absences for the current month
- Interactive user picker using multi-column grid; shows only user names; names are sorted alphabetically
- Event/absence detail fetching with notes preserved as multiline (no truncation)
- Shows project name for scheduled events and absence event name for absences

### Changed
- `--user` parameter on `report-detail` filters by substring (UUID or name). If exactly one match remains, it auto-selects; if multiple, it opens the filtered picker; if none, it errors

## [1.9.5] (2025-08-20)

### Added
- Report: New `--name` (or `-n`) filter to include only users whose name contains the given substring (case-insensitive)

## [1.9.4] (2025-08-20)

### Changed
- Report: `--summary` table is now sorted by user name

## [1.9.3] (2025-08-20)

### Changed
- Report: `--summary` now renders a concise per-user totals table with columns: User, Team, Work h, Absence h, Total h (suppresses event listing)

## [1.9.2] (2025-08-20)

### Changed
- Report: Per-day sum columns are now opt-in via `--summary`. By default, the report shows the simple table without Work/Absence/Total columns

## [1.9.1] (2025-08-20)

### Added
- Report: Added three per-day total columns in non-validation mode: Work h, Absence h, and Total h (absence handling mirrors list action: ignores in_work and subtracts 30 minutes for full-day absences)

## [1.9.0] (2025-08-20)

### Changed
- Report: Removed `--planning` argument from the CLI and report implementation
- Report: Date format in report output changed to `dd.MM.yyyy` (e.g., `31.12.2025`) without weekday

## [1.8.10] (2025-08-20)

### Changed
- Report: Validation now ignores days where the user has an approved absence (such days are not counted as missing)

## [1.8.9] (2025-08-20)

### Changed
- Report: Validation output now includes a second column with the total number of missing workdays per user

## [1.8.8] (2025-08-20)

### Changed
- Report: Default interval is now the full current month instead of current week
- Report: New `--month` option to select a specific month when `--start/--end` are not provided (e.g., `2025-08`, `8`)

## [1.8.7] (2025-08-20)

### Added
- Report: new `--ignore-today` option to use with `--validate` that excludes today from validation (validates up to yesterday)

## [1.8.6] (2025-08-20)

### Changed
- Report: `--validate` still considers only workdays up to today, but output is now grouped by user as "User | Missing days" (no team column)

## [1.8.5] (2025-08-20)

### Changed
- Report: `--validate` now considers only workdays up to today and renders output grouped by day as "Day | Missing users" (no team column)

## [1.8.4] (2025-08-20)

### Changed
- Report: `--validate` now suppresses listing events and shows missing workdays (Mon–Fri) per user within the selected interval

## [1.8.3] (2025-08-20)

### Added
- Report: new `--validate` flag to list users who have not created any scheduled event within the selected interval (respects team and planning filters)

## [1.8.2] (2025-08-20)

### Added
- Report: allow specifying multiple teams via CLI using a comma-separated list in `--team`

## [1.8.1] (2025-08-20)

### Added
- Report table now includes Team column
- New `--team <name>` (or `-t <name>`) option to filter users by team name (substring, case-insensitive)

## [1.8.0] (2025-08-20)

### Added
- New command `report` which:
  - Calls GET /v2/module-planning/calendar/options to collect all users
  - Calls POST /v1/module-planning/scheduled-events-calendar with those users
  - Displays results in a readable table grouped by date
  - Supports --start/--end ISO interval and optional --planning filter

## [1.7.2] (2025-06-20)

### Added
- Summary of total hours for logs and absences in the `list` command

## [1.7.1] (2025-06-18)

### Added
- Category selection during initialization
- Support for including selected categories when creating events

## [1.7.0] (2025-06-15)

### Added
- New command `log-cancel` to cancel existing worklogs for the current month

## [1.6.1] (2025-06-12)

### Added
- New `--yesterday` (or `-y`) parameter for the `log` command to use yesterday's date (mutually exclusive with `--day`)

## [1.6.0] (2025-06-10)

### Added
- Ability to create and manage multiple profiles with the `init` command
- New `profile` command to display and manage multiple configuration profiles
- New `--profile` (or `-r`) parameter for all commands to specify which profile to use
- Added "Ends" column to `list --other` command output showing when absences end
  - If absence ends on the same day, the column is left blank
  - If absence ends in the future, the date is shown with day shorthand (e.g., "12.06.2025 Mon")

## [1.5.0] (2025-06-05)

### Added
- New command `absence-cancel` to cancel existing absences
- Default day (today) for date inputs in `absence` command


## [1.4.0] (2025-06-03)

### Added
- improved render of some actions

### Fixed
- render of `sloneek list --other` when user does not have a team

## [1.3.1] (2025-06-03)

### Fixed
- specifying time in `hours` type of vacation
- render of `sloneek list --other`

## 1.3.0 (2025-06-02)
Initial release.

<!-- markdown reference links -->
[1.11.0]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.10.6...v1.11.0
[1.10.6]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.10.5...v1.10.6
[1.10.5]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.10.4...v1.10.5
[1.10.4]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.10.3...v1.10.4
[1.10.3]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.10.2...v1.10.3
[1.10.2]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.10.1...v1.10.2
[1.10.1]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.9.5...v1.10.0
[1.7.2]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.7.1...v1.7.2
[1.7.1]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.3.0...v1.3.1
