# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

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
[1.7.1]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.6.1...v1.7.0
[1.6.1]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.3.0...v1.3.1
