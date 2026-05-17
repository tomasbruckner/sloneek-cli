# TUI Support for sloneek-cli — Design

**Date:** 2026-05-17
**Status:** Approved — Plan 1 (services refactor) shipped on 2026-05-17 (`services-refactor` branch, see `docs/superpowers/plans/2026-05-17-services-refactor.md`). Plan 2 (Ink TUI build) pending.
**Author:** brainstorming session

## Summary

Add a full-screen, keyboard-driven Terminal UI to `sloneek-cli`. Bare `sloneek` (no subcommand) launches the TUI; every existing `sloneek <subcommand>` keeps working exactly as today. v1 ships full parity with the current CLI: logs, absences, reports, team reports, and profile management.

Built with **Ink** (React for terminals). The implementation extracts a new `services/` layer from today's `actions/*.ts` so CLI commands and TUI screens share one source of truth.

## Goals

- A discoverable, keyboard-driven interface that covers every current CLI capability
- One source of truth for business logic — CLI and TUI both consume the same services
- No regression in existing CLI behavior: same flags, same output, same exit codes
- Incremental rollout — each PR shippable on its own, TUI gated behind a flag until complete

## Non-goals (v1)

- TUI themes / color customization
- Mouse support
- Plugin or extension API
- Bulk operations (multi-select log creation)
- Inline editing of existing logs (only create + cancel)
- End-to-end PTY-driven TUI tests
- Windows-terminal polish beyond what Ink ships with

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Shape:** full-screen dashboard (k9s/lazygit style) | User chose this over richer prompts or list-only modes |
| 2 | **Library:** Ink (React for terminals) | Declarative components, mature ecosystem, easy testing via `ink-testing-library` |
| 3 | **Ink major:** v4 (last CJS-compatible major) | Avoids wholesale CJS→ESM project migration in v1 |
| 4 | **Entry point:** bare `sloneek` → TUI; subcommands unchanged | Discoverable for new users, zero disruption to scripts |
| 5 | **Scope (v1):** full parity with current CLI commands | User explicitly chose full parity over incremental scope |
| 6 | **Code sharing:** extract `services/` layer | Single source of truth; required by full-parity TUI |

## Architecture

### Directory layout

```
src/
├── bin/cli.ts                  # unchanged
├── lib/
│   ├── sloneek.ts              # router: if no subcommand → launch TUI
│   ├── services/               # NEW — pure async functions, no terminal I/O
│   │   ├── auth.ts             # ensureAuthenticated(cfg)
│   │   ├── events.ts           # getMonthEvents, getEventDetail
│   │   ├── logs.ts             # createLog, cancelLog
│   │   ├── absences.ts         # createAbsence, cancelAbsence, listAbsenceTypes
│   │   ├── reports.ts          # getReport, getReportSummary, getValidateReport, getUserReport
│   │   ├── team-reports.ts     # getTeamProjectReport
│   │   ├── clients.ts          # listClients, listProjects
│   │   ├── users.ts            # listUsers
│   │   └── profiles.ts         # listProfiles, removeProfile, initProfile
│   ├── actions/                # thin: parse args → call service → render
│   ├── tui/                    # NEW
│   │   ├── App.tsx             # root: layout + tab state + global hotkeys
│   │   ├── launch.ts           # mounts <App/> via Ink's render()
│   │   ├── screens/
│   │   │   ├── Logs.tsx
│   │   │   ├── Absences.tsx
│   │   │   ├── Reports.tsx
│   │   │   ├── ReportDetail.tsx
│   │   │   ├── TeamReport.tsx
│   │   │   └── Profiles.tsx
│   │   ├── components/         # Table, MonthPicker, ClientPicker, ProjectPicker, Form, Spinner, ErrorBanner, StatusBar
│   │   └── hooks/              # useService (loading/error/data), useHotkeys, useProfile
│   ├── utils/                  # unchanged (api.ts, config.ts, time.ts, login.ts)
│   └── types/                  # unchanged
```

### Router change in `sloneek.ts`

If `parseArgs()` returns no command (bare `sloneek`), call `launchTui(profileConfig)` instead of throwing `"Invalid command"`. Otherwise dispatch as today.

### Build impact

- New runtime deps: `react@^18`, `ink@^4`, `ink-select-input`, `ink-text-input`, `ink-spinner`, `ink-table`
- New dev deps: `@types/react`, `ink-testing-library`
- `tsconfig.json`: add `"jsx": "react"` and `"esModuleInterop": true`
- `.tsx` files compile through the same `tsc` build that produces `dist/`
- No bundler change; output stays CommonJS; `bin` entrypoint unchanged
- `terminal-kit` stays — CLI rendering still uses it

## Navigation model

### Layout

```
┌─ sloneek · profile: _default ────────────── 17.05.2026 ─┐
│ [1]Logs  [2]Absences  [3]Reports  [4]Team  [5]Profiles  │  ← tab bar
├─────────────────────────────────────────────────────────┤
│                                                         │
│                  active screen renders here             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ status / hint line · last action · errors               │  ← status bar
└─────────────────────────────────────────────────────────┘
```

### Global keys

| Key | Action |
|---|---|
| `1`–`5` | Switch top-level screens |
| `?` | Open help overlay (lists current screen's keys) |
| `p` | Open profile switcher (changes active profile without restart) |
| `R` | Reload current screen's data |
| `q` / `Ctrl+C` | Quit |
| `Esc` | Close overlay / cancel form / back out one level |

### Screen inventory

| # | Screen | Replaces CLI | Sub-views / actions |
|---|---|---|---|
| 1 | **Logs** | `list`, `log`, `log-cancel` | month nav (`[`/`]`), `n` new log, `d` cancel, `enter` detail, `/` filter, `o` toggle "other users' absences", `D` toggle notes (= `--detail`) |
| 2 | **Absences** | `absence`, `absence-cancel` | list own absences, `n` new (interactive form), `d` cancel |
| 3 | **Reports** | `report` (all users) | month nav, mode toggle: `e` events / `s` summary / `v` validate; filter by `t` team, `n` name; `T` toggle "ignore today" |
| 4 | **Team Report** | `team-report` | pick client, multi-select projects, month nav, show totals |
| 5 | **Profiles** | `profile`, `init` | list profiles, `a` add (init flow), `d` remove, `enter` switch active |

**Report-detail placement:** opened from the Reports screen by pressing `enter` on a user row. Not a top-level tab.

### Forms (new log, new absence, init profile)

- Open as a modal panel over the current screen
- `tab`/`shift+tab` move between fields, `enter` on last field saves, `esc` cancels
- Client/Project/Absence-type pickers reuse the same searchable-list component
- Date field uses a small inline calendar widget (arrows to pick day, `pgup`/`pgdn` to change month)
- Multiline note field: Ink's `<TextInput>` with multi-line variant; `Ctrl+Enter` to save (avoids accidental submit on newline)

### Profile selection at launch

- **No config exists yet** → fall through to the existing `init` flow (same as `sloneek init` today), then launch TUI on the newly created profile
- Exactly one profile → use it
- Multiple profiles → small picker before mounting `<App/>`
- `sloneek --profile foo` → TUI with `foo` pre-selected

## Data flow

### Service contract

Every service function is `async`, takes `(profileConfig, …params)`, calls `ensureAuthenticated(cfg)` first, then calls `api.ts` and returns plain data. No terminal output, no `process.exit`, no `term.*`. Errors throw with a human-readable message.

```ts
// services/events.ts
export async function getMonthEvents(
  cfg: ProfileConfig,
  month: { year: number; month: number },
  opts?: { includeNotes?: boolean; onProgress?: (done: number, total: number) => void },
): Promise<EventRow[]> { … }
```

### The `useService` hook

Single primitive every screen uses:

```ts
const { data, loading, error, reload } = useService(
  () => getMonthEvents(cfg, month, { includeNotes: showDetail }),
  [cfg.profileName, month.year, month.month, showDetail],
);
```

- `loading: true` on mount and whenever deps change → screen renders `<Spinner/>`
- `error` non-null → screen renders `<ErrorBanner message={…} />` with `r` to retry
- `data` populated → screen renders normally
- `reload()` available for explicit refresh (`R` key on every screen) and after mutations

No Redux, no react-query, no global store. Each screen owns its own fetch.

### Mutations

Form submit → `setLoading(true)` → call service → on success: close modal, call parent's `reload()`, flash one-line success in status bar. On error: keep form open, show error inline, don't lose user's input.

### Long-running operations

`list --detail`, `report` (all users), `report --validate`, `team-report` all hit the API many times. Services accept an optional `onProgress(done, total)` callback so the UI can render `Loading event notes 12/47…` in the status bar without polluting the data shape.

### Caching

- v1 default: **no cache.** Each `useService` call hits the API. Navigating away and back re-fetches.
- Exception: `listClients` and `listProjects` cached for the lifetime of the TUI session in a module-level memo. Invalidated on profile switch.

### Token refresh during long sessions

`ensureAuthenticated` already exists and checks expiry — every service call goes through it, so refresh happens transparently. If refresh fails (password changed), the service throws; the screen surfaces the error; status bar offers `p` to re-pick / re-init profile.

### Error model

- Services throw `Error` with human-readable messages (matches what `term.red(…)` shows today)
- TUI catches at the screen boundary via `useService` — no global error boundary in v1
- Uncaught React render error crashes Ink (loud enough during dev); add a top-level `<ErrorBoundary>` later if it bites

## Refactor plan for existing actions

Goal: turn each `actions/*.ts` into a thin "parse args → call service → render to terminal" wrapper while preserving today's CLI behavior exactly.

### Mechanics — per action, same recipe

1. Identify three concerns intertwined today:
   - **I/O:** `authenticate()`, `api.foo(…)` calls, data shaping
   - **Interactive prompts:** `term.singleColumnMenu`, client/project pickers
   - **Rendering:** `term.table`, colored text, summaries
2. Extract concern #1 into `services/<area>.ts` as a pure async function. No `term.*`, no `process.exit`, no prompts.
3. Leave concerns #2 and #3 in the action file. Interactive prompts stay CLI-only — the TUI has its own React pickers.
4. Action file becomes: `const data = await service(cfg, args); render(data);` (plus any pre-prompts for missing args).

### Order of attack (each PR keeps everything green)

| Order | Service module | Actions it serves | Why this order |
|---|---|---|---|
| 1 | `auth.ts` | all | trivial wrapper around `login.ts`; sets the pattern |
| 2 | `events.ts` | `list`, `report-detail` | unlocks Logs + ReportDetail screens |
| 3 | `clients.ts`, `projects.ts` | log, team-report | needed by every form/picker |
| 4 | `logs.ts` | `log`, `log-cancel` | unlocks log form |
| 5 | `absences.ts` | `absence`, `absence-cancel` | unlocks absence screen |
| 6 | `reports.ts` | `report` | biggest action (summary + validate variants) |
| 7 | `team-reports.ts` | `team-report` | last domain action |
| 8 | `profiles.ts` | `profile`, `init` | mostly local I/O — easy cleanup last |

After each extraction, run the affected CLI command end-to-end manually against staging.

### Things to preserve verbatim

- Existing CLI flags, output formatting, exit codes
- `process.exit(0/1)` behavior in `sloneek.ts` — stays at the top level
- `term.on("key", "CTRL_C")` global abort handler — stays for CLI runs

### Input-complete service rule

`actions/log.ts` and `actions/absence.ts` mix "ask user for missing inputs" with "create the thing." The service must be **input-complete**: it doesn't prompt. The action file does any pre-prompting, then hands a fully-populated input to the service. This keeps services testable and lets the TUI build the same input via its form.

```ts
// actions/log.ts (after refactor)
const input = await resolveLogInput(cfg, args);   // CLI prompts here if needed
const created = await createLog(cfg, input);      // pure service
renderLogCreated(created);
```

### Refactor non-goals

- Renaming functions in `api.ts`, restructuring types, "improving" anything the TUI doesn't need
- Adding new flags or behavior to existing CLI commands

## Testing strategy

Three layers, deliberately uneven.

### 1. Services — unit tests (real coverage)

Services are pure async functions with one external dependency: `api.ts`. Mock `api.ts` with `vi.mock`; assert each service shapes, filters, sorts, and aggregates data correctly. Highest-payoff layer.

- One test file per service module
- Cover: happy path, empty result, awkward data shapes (mixed events + absences, multi-day absences spanning month edges, etc.)
- No `terminal-kit` imports in these tests

### 2. TUI components — smoke tests with `ink-testing-library`

Not exhaustive. For each screen: one test that renders it with a mocked service, advances to "data loaded" state, and asserts the rendered frame contains the expected anchors (a known event row, the right tab being active). For the new-log form: one test that fills fields, submits, and asserts the service was called with the right input.

- Add `ink-testing-library` as a devDependency
- One test file per screen, ~3–5 frames each
- Goal: catch broken renders and obvious wire-up regressions, not pixel-perfect snapshots

### 3. CLI actions — manually verified after refactor

No new automated tests for `actions/*.ts` in v1. They're now thin (parse → call service → render); logic they wrap is covered by service tests; rendering is hard to assert meaningfully without snapshotting `terminal-kit` output. After each extraction PR, run the affected command end-to-end against staging.

### Explicitly NOT tested in v1

- End-to-end TUI keystroke flows (would need a real PTY harness)
- `api.ts` itself (it's a thin HTTP wrapper)
- `terminal-kit` rendering (snapshot brittleness > value)

### CI impact

Existing GitHub Actions workflow already runs `npm test`. New tests slot into the same run — no workflow changes needed, no new jobs.

## Rollout plan

Sequence of PRs, each shippable.

| PR | Contents | Version bump |
|---|---|---|
| 1 | Services skeleton + `auth.ts` | patch |
| 2–8 | One service extraction per PR (order per Refactor section) + service tests + action file becomes thin | minor each |
| 9 | Add Ink dependencies, tsconfig changes, empty `<App/>` mounted by `launchTui()`. Feature-gated behind `SLONEEK_TUI=1` env var | minor |
| 10–14 | One screen per PR (Logs → Absences → Reports → TeamReport → Profiles). Each PR adds its smoke tests | minor each |
| 15 | Remove feature gate, update README, version bump to **2.0.0** | **major** |

PR-15 is the breaking change: bare `sloneek` now opens a TUI instead of printing help. Per the project's semver policy in `CLAUDE.md`, that warrants a major bump.

### Documentation

- README gets a new top section: "Interactive TUI" with a screenshot/GIF and the key map
- Existing CLI sections stay verbatim — no behavior change to subcommands
- `CHANGELOG.md` entry per PR following Keep-a-Changelog format (per `CLAUDE.md` rule)

## Open questions (deferred to implementation)

- Exact API shape of `useService`'s deps array — whether to pass a `key` prop instead of bare deps. Decide while building screen #1.
- Whether `ink-table` is rich enough for the Reports screen or if we render a custom `<Box>` grid. Decide while building Reports.
- Whether the profile picker at launch is itself an Ink component or a plain `terminal-kit` prompt before mounting Ink. Either works; pick the lower-friction option during PR-9.
