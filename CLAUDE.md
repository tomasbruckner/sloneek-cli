# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build          # Compile TypeScript (tsc) from src/ to dist/
npm test               # Run vitest test suite
npm i -g .             # Install globally for manual testing
sloneek <command>      # Run a command after global install
```

Tests use vitest. Add tests under `src/lib/services/*.test.ts` (or `utils/*.test.ts`) for any non-trivial logic — services are the load-bearing test layer.

## Architecture

Sloneek CLI is a TypeScript CLI tool for managing worklogs, absences, and reports against the Sloneek HR API (`api2.sloneek.com`).

### Data Flow

```
bin/cli.ts → sloneek.ts (main router) → argument-parser.ts → action handler
                                                                  │
                                                                  ▼
                                                           services/*.ts ──→ utils/api.ts ──→ Sloneek API
                                                                  │
                                                                  ▼
                                                           terminal-kit render
```

The `services/` layer holds all API + data-shaping logic. Actions handle CLI prompts and rendering. This split is deliberate — it lets future non-CLI consumers (e.g., a TUI) reuse the same services without inheriting any terminal coupling.

### Key Directories

- `src/bin/cli.ts` — Entry point, calls `main()` from sloneek.ts
- `src/lib/sloneek.ts` — Command router: parses args, resolves profile config, dispatches to action
- `src/lib/actions/` — One file per command (log, list, absence, report, etc.). Thin orchestration: prompt → call service → render. Never imports `utils/api.ts` directly.
- `src/lib/services/` — Pure async functions consumed by actions (and the upcoming TUI). One module per domain (`auth`, `events`, `logs`, `absences`, `reports`, `team-reports`, `clients`, `profiles`). Never imports `terminal-kit`, never calls `process.exit`, never `console.log`.
- `src/lib/utils/api.ts` — All HTTP calls to Sloneek API. Every endpoint is a named function. Only called from services.
- `src/lib/utils/config.ts` — Reads/writes `~/.sloneek/config.json` (multi-profile support, default profile: `_default`)
- `src/lib/utils/login.ts` — Thin terminal-output wrapper around `services/auth.ensureAuthenticated`
- `src/lib/utils/time.ts` — Date/time utilities using Luxon, hardcoded to `Europe/Prague` timezone
- `src/lib/types/index.ts` — All TypeScript interfaces (global ambient types, no imports needed)

### Patterns

- **Action functions** receive `(config: ProfileConfig, args: ParsedArgs*)` and call `authenticate()` (CLI wrapper) then service functions
- **Service functions** take `(profileConfig, accessToken, ...)` or `(accessToken, ...)`, return plain data; never prompt, never render. Throw `Error` with human-readable messages.
- **Input-complete rule** — services never prompt. Actions resolve all input first (via local `resolveXInput` helpers returning `{ input, display }`), then pass a fully-populated input to the service.
- **Types are global** — `types/index.ts` declares interfaces without `export`; they're available project-wide via tsconfig `include`
- **ParsedArgs** is a discriminated union on the `command` field
- **Profile system** — multi-profile config in `~/.sloneek/config.json`; `--profile` / `-r` flag on any command
- **Token caching** — access tokens stored in config with expiration, auto-refreshed via password re-auth
- **Terminal UI** — `terminal-kit` for colors, tables, and interactive menus (action layer only)

## Versioning & Changelog

**Always** update the version and changelog when making code changes:

1. **Bump version** in `package.json` using [Semantic Versioning](http://semver.org/):
   - **patch** (1.10.6 → 1.10.7): bug fixes, small changes
   - **minor** (1.10.6 → 1.11.0): new features, new commands
   - **major** (1.10.6 → 2.0.0): breaking changes
2. **Update `CHANGELOG.md`** — add a new entry at the top of the file (below the header) following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format with sections like `### Added`, `### Changed`, `### Fixed`, `### Removed`
3. **Add a reference link** at the bottom of `CHANGELOG.md` for the new version (e.g., `[1.10.7]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.10.6...v1.10.7`)

## Code Style

- Prettier with `printWidth: 120`
- TypeScript strict mode
- CommonJS module system (target ES2020)
- Node.js >= 22.0.0
