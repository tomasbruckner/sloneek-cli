# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm run build          # Compile TypeScript (tsc) from src/ to dist/
npm i -g .             # Install globally for manual testing
sloneek <command>      # Run a command after global install
```

No test framework is configured. Test manually after changes.

## Architecture

Sloneek CLI is a TypeScript CLI tool for managing worklogs, absences, and reports against the Sloneek HR API (`api2.sloneek.com`).

### Data Flow

```
bin/cli.ts → sloneek.ts (main router) → argument-parser.ts → action handler → api.ts → Sloneek API
```

### Key Directories

- `src/bin/cli.ts` — Entry point, calls `main()` from sloneek.ts
- `src/lib/sloneek.ts` — Command router: parses args, resolves profile config, dispatches to action
- `src/lib/actions/` — One file per command (log, list, absence, report, etc.). Each exports an async action function
- `src/lib/utils/api.ts` — All HTTP calls to Sloneek API. Every endpoint is a named function
- `src/lib/utils/config.ts` — Reads/writes `~/.sloneek/config.json` (multi-profile support, default profile: `_default`)
- `src/lib/utils/login.ts` — Authentication with token caching and expiration checks
- `src/lib/utils/time.ts` — Date/time utilities using Luxon, hardcoded to `Europe/Prague` timezone
- `src/lib/types/index.ts` — All TypeScript interfaces (global ambient types, no imports needed)

### Patterns

- **Action functions** receive `(config: ProfileConfig, args: ParsedArgs*)` and call `authenticate()` then API functions
- **Types are global** — `types/index.ts` declares interfaces without `export`; they're available project-wide via tsconfig `include`
- **ParsedArgs** is a discriminated union on the `command` field
- **Profile system** — multi-profile config in `~/.sloneek/config.json`; `--profile` / `-r` flag on any command
- **Token caching** — access tokens stored in config with expiration, auto-refreshed via password re-auth
- **Terminal UI** — `terminal-kit` for colors, tables, and interactive menus

## Code Style

- Prettier with `printWidth: 120`
- TypeScript strict mode
- CommonJS module system (target ES2020)
- Node.js >= 22.0.0
