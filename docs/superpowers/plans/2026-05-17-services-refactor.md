# Services Refactor Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all API + data-shaping logic from `src/lib/actions/*.ts` into a new `src/lib/services/*.ts` layer with unit tests. CLI behavior, flags, output, and exit codes remain unchanged.

**Architecture:** Each existing action does three things — auth + API calls + data shaping, interactive prompts, terminal rendering. This plan extracts only concern #1 into pure async functions in `services/`. Prompts and rendering stay in `actions/`. Services have one external dependency (`api.ts`) and are unit-tested with `vi.mock`.

**Tech Stack:** TypeScript, vitest, axios (via existing `api.ts`), luxon.

**Why Plan 1 of 2:** This refactor is the prerequisite for the TUI build in Plan 2 (`2026-05-17-tui-build.md`, to be written after this plan ships). It produces shippable, valuable software on its own: cleaner action files, reusable services with tests, and a clean seam for the future TUI.

**Spec:** `docs/superpowers/specs/2026-05-17-tui-design.md` — sections "Refactor plan for existing actions" and "Testing strategy" are the source of truth for this plan.

---

## Conventions used in every task

- **Service signature shape:** `async function <verb><Noun>(profileConfig: ProfileConfig, ...params): Promise<T>`. The first param is always `profileConfig`. Services never read or write the config file directly except via `ensureAuthenticated` (Task 1).
- **No terminal output in services:** never import `terminal-kit`. Never call `process.exit`. Never call `console.log` except for genuinely diagnostic warnings (e.g., a single `console.warn` on a recoverable detail-fetch failure that today is silently swallowed).
- **Error model:** services throw `new Error("<human-readable message>")`. Action wrappers catch via the existing `try/catch` in `sloneek.ts:53` which already renders with `term.red`.
- **Input-complete rule:** services never prompt. Action files do any pre-prompting (interactive client/project pickers, etc.) and pass a fully-populated input object to the service.
- **Test pattern:** mirror `src/lib/utils/login.test.ts`. Mock `./api` and (when needed) `./config` with `vi.mock`. Build fixtures with small `make*()` helpers at the top of the file. Use `beforeEach(() => vi.clearAllMocks())`.
- **Commit message style:** match recent history (`Add tests and ci (#3)`, `Add GitHub Actions CI workflow…`). Use short imperative sentence; reference the service module being added.

### Test file skeleton (use for every service test in Tasks 3–8)

Every service test file follows the same shape as Task 1 and Task 2. The skeleton:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  // list only the api.ts functions this service consumes
  someApiFn: vi.fn(),
}));

import { /* service exports under test */ } from "./<service-name>";
import { someApiFn } from "../utils/api";

const mockedSomeApiFn = vi.mocked(someApiFn);

const profile: ProfileConfig = { /* same fixture as events.test.ts */ };

beforeEach(() => vi.clearAllMocks());

describe("<serviceFn>", () => {
  it("<behavior>", async () => {
    mockedSomeApiFn.mockResolvedValue(/* fixture */);
    const result = await serviceFn(/* args */);
    expect(result).toEqual(/* expected */);
  });
});
```

For Tasks 3–8, the per-task "Write failing test" steps name the specific assertions; build the test file from the skeleton above plus the named assertions.

### Note on `services/users.ts`

The spec's directory layout lists `services/users.ts` (`listUsers`). In practice, `fetchUsers`/`fetchAbsenceReportCalendarOptions` are consumed by `report-detail` (user picker) and `report --other` (calendar options for absence listing). These calls are absorbed into `services/events.ts` (Task 2) and `services/reports.ts` (Task 6) where they are needed. If a third consumer surfaces later (e.g., the TUI profile-switcher needs a global user list), promote the call to its own `services/users.ts` then. Avoid the file in v1 to keep the surface minimal.

## Cross-task type definitions

Add the following to `src/lib/types/index.ts` once, in Task 1, before any service uses them:

```ts
interface AuthenticatedSession {
  accessToken: string;
  profileConfig: ProfileConfig;
}

interface ProgressCallback {
  (done: number, total: number): void;
}

// Already-resolved month range. Services always receive this; action files
// compute it from CLI args via the existing `getMonthRangePrague` helper.
interface MonthRange {
  isoStart: string;
  isoEnd: string;
  rangeLabel: string;
}
```

`ProgressCallback` is exposed by services that fan out many API calls (`getMonthEvents` with `includeNotes`, `getReport`, etc.). Action files pass `undefined`; the TUI in Plan 2 will pass a real callback.

`MonthRange` standardizes the month input across all services. The CLI action computes it once from `args.month`/`args.previousMonth` using the existing `getMonthRangePrague` helper, then passes the resolved range to the service. This avoids each service re-parsing CLI-shaped arguments.

---

## Task 1: Services skeleton + auth service

**Files:**
- Create: `src/lib/services/auth.ts`
- Create: `src/lib/services/auth.test.ts`
- Modify: `src/lib/types/index.ts` (append the three interfaces above)
- Modify: `src/lib/utils/login.ts` (becomes thin wrapper that adds terminal output)

- [ ] **Step 1.1: Add shared types**

Append to `src/lib/types/index.ts` (file uses global ambient declarations, no `export`):

```ts
interface AuthenticatedSession {
  accessToken: string;
  profileConfig: ProfileConfig;
}

interface ProgressCallback {
  (done: number, total: number): void;
}

interface MonthRange {
  isoStart: string;
  isoEnd: string;
  rangeLabel: string;
}
```

- [ ] **Step 1.2: Write failing test for `ensureAuthenticated`**

Create `src/lib/services/auth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DateTime } from "luxon";

vi.mock("../utils/api", () => ({
  apiCall: vi.fn(),
}));

vi.mock("../utils/config", () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
}));

import { ensureAuthenticated } from "./auth";
import { apiCall } from "../utils/api";
import { readConfig, writeConfig } from "../utils/config";

const mockedApiCall = vi.mocked(apiCall);
const mockedReadConfig = vi.mocked(readConfig);
const mockedWriteConfig = vi.mocked(writeConfig);

const makeProfile = (token?: ProfileConfig["token"]): ProfileConfig => ({
  credentials: { email: "test@example.com", password: "secret" },
  user: { uuid: "u1", name: "Test" },
  client: { uuid: "c1", name: "Client" },
  project: { uuid: "p1", name: "Project" },
  planningEvent: { uuid: "pe1", detail_uuid: "ped1", name: "PE" },
  workHours: { start: "09:00", end: "17:00" },
  timestamp: "2025-01-01T00:00:00",
  token,
});

const validToken = {
  access_token: "cached-token",
  expires_at: DateTime.now().plus({ hours: 1 }).toISO()!,
};

const loginResponse = {
  data: {
    access_token: "new-token",
    access_token_expires_at: DateTime.now().plus({ hours: 2 }).toSeconds(),
  },
};

beforeEach(() => vi.clearAllMocks());

describe("ensureAuthenticated", () => {
  it("returns cached token when not expired without writing to terminal", async () => {
    const profile = makeProfile(validToken);
    mockedReadConfig.mockResolvedValue({ profiles: { _default: profile } } as Config);

    const session = await ensureAuthenticated();

    expect(session.accessToken).toBe("cached-token");
    expect(session.profileConfig.user.uuid).toBe("u1");
    expect(mockedApiCall).not.toHaveBeenCalled();
  });

  it("re-authenticates and persists when token is expired", async () => {
    const profile = makeProfile({
      access_token: "old",
      expires_at: DateTime.now().minus({ hours: 1 }).toISO()!,
    });
    mockedReadConfig.mockResolvedValue({ profiles: { _default: profile } } as Config);
    mockedApiCall.mockResolvedValue(loginResponse);

    const session = await ensureAuthenticated();

    expect(session.accessToken).toBe("new-token");
    expect(mockedWriteConfig).toHaveBeenCalledTimes(1);
  });

  it("re-authenticates when no token is stored", async () => {
    mockedReadConfig.mockResolvedValue({ profiles: { _default: makeProfile() } } as Config);
    mockedApiCall.mockResolvedValue(loginResponse);

    const session = await ensureAuthenticated();
    expect(session.accessToken).toBe("new-token");
  });

  it("uses named profile when provided", async () => {
    mockedReadConfig.mockResolvedValue({ profiles: { work: makeProfile(validToken) } } as Config);
    const session = await ensureAuthenticated("work");
    expect(session.accessToken).toBe("cached-token");
  });

  it("falls back to _default when named profile is missing", async () => {
    mockedReadConfig.mockResolvedValue({ profiles: { _default: makeProfile(validToken) } } as Config);
    const session = await ensureAuthenticated("ghost");
    expect(session.accessToken).toBe("cached-token");
  });

  it("re-authenticates when token expires within 1 minute", async () => {
    const profile = makeProfile({
      access_token: "stale",
      expires_at: DateTime.now().plus({ seconds: 30 }).toISO()!,
    });
    mockedReadConfig.mockResolvedValue({ profiles: { _default: profile } } as Config);
    mockedApiCall.mockResolvedValue(loginResponse);

    const session = await ensureAuthenticated();
    expect(session.accessToken).toBe("new-token");
  });
});
```

- [ ] **Step 1.3: Run test to verify it fails**

Run: `npm test -- auth.test`
Expected: FAIL — `Cannot find module './auth'` or similar.

- [ ] **Step 1.4: Implement `ensureAuthenticated`**

Create `src/lib/services/auth.ts`:

```ts
import { DateTime } from "luxon";
import { apiCall } from "../utils/api";
import { readConfig, writeConfig } from "../utils/config";

export async function ensureAuthenticated(profileName?: string): Promise<AuthenticatedSession> {
  const config = await readConfig(true);
  const resolvedName = profileName && config.profiles[profileName] ? profileName : "_default";
  const profileConfig = config.profiles[resolvedName];

  if (profileConfig.token?.access_token && profileConfig.token?.expires_at) {
    const expiresAt = DateTime.fromISO(profileConfig.token.expires_at);
    if (expiresAt > DateTime.now().plus({ minutes: 1 })) {
      return { accessToken: profileConfig.token.access_token, profileConfig };
    }
  }

  const loginResponse = await apiCall<LoginResponse>("https://api2.sloneek.com/auth/login", {
    method: "POST",
    data: { email: profileConfig.credentials.email, password: profileConfig.credentials.password },
  });

  const accessToken = loginResponse.data.access_token;
  const expiresAt = DateTime.fromSeconds(loginResponse.data.access_token_expires_at).toISO();

  const updatedProfile: ProfileConfig = {
    ...profileConfig,
    token: { access_token: accessToken, expires_at: expiresAt },
  };

  await writeConfig(
    { ...config, profiles: { ...config.profiles, [resolvedName]: updatedProfile } },
    true,
  );

  return { accessToken, profileConfig: updatedProfile };
}
```

- [ ] **Step 1.5: Run test to verify it passes**

Run: `npm test -- auth.test`
Expected: PASS, 6 tests.

- [ ] **Step 1.6: Refactor `login.ts` to use the service**

Replace the contents of `src/lib/utils/login.ts` with:

```ts
import { terminal as term } from "terminal-kit";
import { ensureAuthenticated } from "../services/auth";

export async function authenticate(profileName?: string): Promise<string> {
  const before = Date.now();
  const session = await ensureAuthenticated(profileName);
  const elapsed = Date.now() - before;

  // Best-effort UX: if the call returned essentially instantly, we used the cache;
  // if it took more than 200ms, we did a login round-trip.
  if (elapsed < 200) {
    term.cyan("Using existing token\n");
  } else {
    term.cyan("Token expired, logging in again\n");
    term.green("✓ Login successful\n");
  }

  return session.accessToken;
}
```

Rationale: existing `login.test.ts` only asserts the token value and the mocked calls — not the terminal output. The user-visible change is that the "Using existing token" / "Login successful" messages are now best-effort heuristics rather than precise state. This is acceptable: they are purely informational and the underlying behavior is unchanged.

- [ ] **Step 1.7: Run full test suite**

Run: `npm test`
Expected: all tests pass, including `login.test.ts` (which only mocks `apiCall`, `readConfig`, `writeConfig` — same as the new service test does).

- [ ] **Step 1.8: Manual smoke test**

Run: `npm run build && node dist/bin/cli.js list`
Expected: same output as before (table of this month's events). If profile is missing, same `Error: ...` as before.

- [ ] **Step 1.9: Bump version and update CHANGELOG**

Per `CLAUDE.md` — patch bump (refactor, no behavior change):
- `package.json`: bump `version` from current to `+0.0.1` (e.g., `1.14.0` → `1.14.1`)
- `CHANGELOG.md`: add an entry at the top under the header, in Keep-a-Changelog format:

```markdown
## [1.14.1] - 2026-05-17

### Changed
- Extracted authentication logic into `services/auth.ts` for reuse between CLI and the upcoming TUI. CLI behavior unchanged.
```

Add reference link at the bottom of `CHANGELOG.md`:

```markdown
[1.14.1]: https://github.com/tomasbruckner/sloneek-cli/compare/v1.14.0...v1.14.1
```

- [ ] **Step 1.10: Commit**

```bash
git add src/lib/services/auth.ts src/lib/services/auth.test.ts src/lib/types/index.ts src/lib/utils/login.ts package.json CHANGELOG.md
git commit -m "Add services/auth and extract authentication logic"
```

---

## Task 2: Events service (powers `list` and `report-detail`)

**Source actions:** `src/lib/actions/list.ts` (showCurrentUser and showOtherUsers), `src/lib/actions/report-detail.ts`.

**Service surface:**

```ts
// src/lib/services/events.ts

export interface MonthEventsOptions {
  includeNotes?: boolean;            // when true, fetches detail for each scheduled event
  clientFilter?: string;             // substring, case-insensitive; filters scheduled events only
  onProgress?: ProgressCallback;     // called as notes are fetched
}

export interface MonthEvents {
  scheduledEvents: ScheduledEvent[];
  expandedAbsenceEvents: AbsenceEvent[];   // one row per workday for multi-day absences
  allEvents: ApiEvent[];                   // sorted by started_at; respects clientFilter
  eventNotes: Record<string, string>;      // uuid -> note (empty when includeNotes is false)
  rangeLabel: string;                      // e.g. "May 2026"
  isoStart: string;
  isoEnd: string;
}

export async function getMonthEvents(
  profileConfig: ProfileConfig,
  accessToken: string,
  range: MonthRange,
  opts?: MonthEventsOptions,
): Promise<MonthEvents>;

export interface OtherUserAbsence {
  user: { full_name: string; team?: { name: string } };
  user_absence_event: { absence_event_name: string };
  started_at: string;
  ended_at: string;
}

export async function getOtherUsersAbsencesToday(
  accessToken: string,
  teamPrefixes?: string[],
): Promise<OtherUserAbsence[]>;

export interface UserMonthlyDetail {
  scheduledEvents: ScheduledEventWithNote[];
  absences: AbsenceWithNote[];
  rangeLabel: string;
}

export async function getUserMonthlyDetail(
  accessToken: string,
  userUuid: string,
  range: MonthRange,
  onProgress?: ProgressCallback,
): Promise<UserMonthlyDetail>;
```

**Files:**
- Create: `src/lib/services/events.ts`
- Create: `src/lib/services/events.test.ts`
- Modify: `src/lib/actions/list.ts` (becomes thin: call service → render)
- Modify: `src/lib/actions/report-detail.ts` (becomes thin: call service → render)

- [ ] **Step 2.1: Write failing test for `getMonthEvents` (happy path + client filter + absence expansion)**

Create `src/lib/services/events.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../utils/api", () => ({
  getEvents: vi.fn(),
  getAbsences: vi.fn(),
  getEventDetail: vi.fn(),
  fetchAbsenceReportCalendarOptions: vi.fn(),
}));

import { getMonthEvents, getOtherUsersAbsencesToday, getUserMonthlyDetail } from "./events";
import {
  getEvents,
  getAbsences,
  getEventDetail,
  fetchAbsenceReportCalendarOptions,
} from "../utils/api";

const mockedGetEvents = vi.mocked(getEvents);
const mockedGetAbsences = vi.mocked(getAbsences);
const mockedGetEventDetail = vi.mocked(getEventDetail);
const mockedFetchAbsCal = vi.mocked(fetchAbsenceReportCalendarOptions);

const profile: ProfileConfig = {
  credentials: { email: "x", password: "y" },
  user: { uuid: "u1", name: "Me" },
  client: { uuid: "c1", name: "Acme" },
  project: { uuid: "p1", name: "Web" },
  planningEvent: { uuid: "pe1", detail_uuid: "ped1", name: "PE" },
  workHours: { start: "08:00", end: "16:00" },
  timestamp: "2026-01-01",
};

const range: MonthRange = {
  isoStart: "2026-05-01T00:00:00+02:00",
  isoEnd: "2026-05-31T23:59:59+02:00",
  rangeLabel: "May 2026",
};

beforeEach(() => vi.clearAllMocks());

describe("getMonthEvents", () => {
  it("returns scheduled + expanded absence events sorted by start time", async () => {
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          {
            uuid: "e1",
            started_at: "2026-05-15T08:00:00+02:00",
            ended_at: "2026-05-15T16:00:00+02:00",
            client: { name: "Acme" },
            client_project: { project_name: "Web" },
          },
        ],
      },
    } as any);

    mockedGetAbsences.mockResolvedValue({
      data: {
        events: [
          {
            type: "vacation",
            event_type: "full_day",
            started_at: "2026-05-17T00:00:00+02:00",
            ended_at: "2026-05-17T23:59:59+02:00",
            user_absence_event: { absence_event_name: "Vacation" },
          },
        ],
      },
    } as any);

    const result = await getMonthEvents(profile, "tok", range);

    expect(result.scheduledEvents).toHaveLength(1);
    expect(result.expandedAbsenceEvents).toHaveLength(1);
    expect(result.allEvents).toHaveLength(2);
    expect(result.allEvents[0].started_at < result.allEvents[1].started_at).toBe(true);
    expect(result.eventNotes).toEqual({});
    expect(mockedGetEventDetail).not.toHaveBeenCalled();
  });

  it("expands a multi-day absence into one row per workday (Mon–Fri)", async () => {
    mockedGetEvents.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetAbsences.mockResolvedValue({
      data: {
        events: [
          {
            type: "vacation",
            event_type: "full_day",
            started_at: "2026-05-15T00:00:00+02:00", // Fri
            ended_at: "2026-05-19T23:59:59+02:00",   // Tue
            user_absence_event: { absence_event_name: "Vacation" },
          },
        ],
      },
    } as any);

    const result = await getMonthEvents(profile, "tok", range);

    // Fri 15, Mon 18, Tue 19 → 3 entries (Sat 16, Sun 17 skipped)
    expect(result.expandedAbsenceEvents).toHaveLength(3);
  });

  it("filters scheduled events by client (case-insensitive substring) and hides absences", async () => {
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          { uuid: "e1", started_at: "2026-05-15T08:00:00+02:00", ended_at: "2026-05-15T16:00:00+02:00", client: { name: "Acme Corp" }, client_project: { project_name: "X" } },
          { uuid: "e2", started_at: "2026-05-16T08:00:00+02:00", ended_at: "2026-05-16T16:00:00+02:00", client: { name: "Other" }, client_project: { project_name: "Y" } },
        ],
      },
    } as any);
    mockedGetAbsences.mockResolvedValue({
      data: { events: [{ type: "vacation", event_type: "full_day", started_at: "2026-05-17T00:00:00+02:00", ended_at: "2026-05-17T23:59:59+02:00", user_absence_event: { absence_event_name: "V" } }] },
    } as any);

    const result = await getMonthEvents(profile, "tok", range, { clientFilter: "acme" });

    expect(result.allEvents).toHaveLength(1);
    expect((result.allEvents[0] as ScheduledEvent).client?.name).toBe("Acme Corp");
  });

  it("fetches notes per event when includeNotes is set, and reports progress", async () => {
    mockedGetEvents.mockResolvedValue({
      data: {
        events: [
          { uuid: "e1", started_at: "2026-05-15T08:00:00+02:00", ended_at: "2026-05-15T09:00:00+02:00", client: { name: "Acme" }, client_project: { project_name: "X" } },
          { uuid: "e2", started_at: "2026-05-15T09:00:00+02:00", ended_at: "2026-05-15T10:00:00+02:00", client: { name: "Acme" }, client_project: { project_name: "X" } },
        ],
      },
    } as any);
    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetEventDetail
      .mockResolvedValueOnce({ data: { scheduled_event_data: { note: "one" } } } as any)
      .mockResolvedValueOnce({ data: { scheduled_event_data: { note: "two" } } } as any);

    const progress: Array<[number, number]> = [];
    const result = await getMonthEvents(profile, "tok", range, {
      includeNotes: true,
      onProgress: (d, t) => progress.push([d, t]),
    });

    expect(result.eventNotes).toEqual({ e1: "one", e2: "two" });
    expect(progress).toEqual([[1, 2], [2, 2]]);
  });

  it("swallows a single failed detail fetch and continues", async () => {
    mockedGetEvents.mockResolvedValue({
      data: { events: [
        { uuid: "e1", started_at: "2026-05-15T08:00:00+02:00", ended_at: "2026-05-15T09:00:00+02:00", client: { name: "A" }, client_project: { project_name: "X" } },
        { uuid: "e2", started_at: "2026-05-15T09:00:00+02:00", ended_at: "2026-05-15T10:00:00+02:00", client: { name: "A" }, client_project: { project_name: "X" } },
      ] },
    } as any);
    mockedGetAbsences.mockResolvedValue({ data: { events: [] } } as any);
    mockedGetEventDetail
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ data: { scheduled_event_data: { note: "ok" } } } as any);

    const result = await getMonthEvents(profile, "tok", range, { includeNotes: true });

    expect(result.eventNotes).toEqual({ e2: "ok" });
  });
});

describe("getOtherUsersAbsencesToday", () => {
  it("returns absences filtered by team prefix (substring, case-insensitive)", async () => {
    mockedFetchAbsCal.mockResolvedValue({
      data: { users_select: [{ users: [{ uuid: "u1" }, { uuid: "u2" }] }] },
    } as any);
    mockedGetAbsences.mockResolvedValue({
      data: { events: [
        { user: { full_name: "A", team: { name: "Dev Team" } }, user_absence_event: { absence_event_name: "V" }, started_at: "x", ended_at: "y" },
        { user: { full_name: "B", team: { name: "Ops" } },      user_absence_event: { absence_event_name: "V" }, started_at: "x", ended_at: "y" },
      ] },
    } as any);

    const result = await getOtherUsersAbsencesToday("tok", ["dev"]);

    expect(result).toHaveLength(1);
    expect(result[0].user.full_name).toBe("A");
  });

  it("keeps users without a team when filters are present", async () => {
    mockedFetchAbsCal.mockResolvedValue({ data: { users_select: [{ users: [{ uuid: "u1" }] }] } } as any);
    mockedGetAbsences.mockResolvedValue({
      data: { events: [{ user: { full_name: "X" }, user_absence_event: { absence_event_name: "V" }, started_at: "x", ended_at: "y" }] },
    } as any);

    const result = await getOtherUsersAbsencesToday("tok", ["dev"]);
    expect(result).toHaveLength(1);
  });
});
```

(`getUserMonthlyDetail` tests follow the same patterns; add 2 cases — happy path with mixed events + absences, and note-fetch failure swallowed silently.)

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npm test -- events.test`
Expected: FAIL — `Cannot find module './events'`.

- [ ] **Step 2.3: Implement `src/lib/services/events.ts`**

Extract the logic in three blocks:

1. **`getMonthEvents`** = the body of `actions/list.ts:showCurrentUser` (lines 28–146), minus the table-build / total-print code. Replace `term.cyan(...)` with no-op. Replace the inline `console.log("Fetching event details...")` with `onProgress` callback invocations: call `onProgress(done, total)` after each `getEventDetail` resolution. On a thrown `getEventDetail`, swallow (matches today's `catch {}` at line 140) but do call `onProgress` for the failed index too so totals stay accurate.

2. **`getOtherUsersAbsencesToday`** = the body of `actions/list.ts:showOtherUsers` (lines 249–283), returning the raw filtered+sorted events array. Drop the `term.red("No absences found.\n")` branch — let the caller decide.

3. **`getUserMonthlyDetail`** = the body of `actions/report-detail.ts` (read the file fully when implementing this task). Extract: month range resolution + scheduled-event listing + absence listing + per-event detail fetches. Notes come from `data.scheduled_event_data.note` (scheduled) and `data.absence_data.note` (absence). Mirror today's silent `catch` on detail failures.

Module preamble:

```ts
import { DateTime } from "luxon";
import {
  getEvents,
  getAbsences,
  getEventDetail,
  fetchAbsenceReportCalendarOptions,
  fetchScheduledEventDetail,
  fetchAbsenceDetail,
} from "../utils/api";
import {
  getCurrentDay,
  getMonthRangePrague,
  getStartDay,
  isSameDay,
  isWorkDay,
} from "../utils/time";
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npm test -- events.test`
Expected: PASS for all cases.

- [ ] **Step 2.5: Refactor `actions/list.ts`**

Replace `showCurrentUser` and `showOtherUsers` so they each become roughly:

```ts
async function showCurrentUser(config: ProfileConfig, accessToken: string, args?: ParsedArgsList) {
  const { rangeLabel } = getMonthRangePrague(args?.month, args?.previousMonth);
  term.cyan(`Fetching events for ${rangeLabel}...\n`);

  if (args?.detail) {
    console.log("Fetching event details...");
  }

  const result = await getMonthEvents(config, accessToken, { month: args?.month, previousMonth: args?.previousMonth }, {
    includeNotes: args?.detail,
    clientFilter: args?.client,
  });

  if (result.allEvents.length === 0) {
    term.red("No events found.\n");
    return;
  }

  renderEventsTable(result, args?.detail);  // helper containing all the existing term.table + totals code
  renderTotals(result);
}
```

`renderEventsTable` and `renderTotals` are local helpers extracted from the existing terminal-rendering code (lines 147–246). They live in `actions/list.ts` and import nothing new.

- [ ] **Step 2.6: Refactor `actions/report-detail.ts`**

Similar shape: call `getUserMonthlyDetail`, then call local render helpers extracted from the existing table-building code.

- [ ] **Step 2.7: Run full test suite**

Run: `npm test`
Expected: all green, including unchanged tests.

- [ ] **Step 2.8: Manual smoke tests**

```bash
npm run build
node dist/bin/cli.js list
node dist/bin/cli.js list --detail
node dist/bin/cli.js list --client "Acme"
node dist/bin/cli.js list --other
node dist/bin/cli.js list --month 2026-04
node dist/bin/cli.js report-detail
```

Expected: output identical to pre-refactor (modulo the auth-message heuristic from Task 1).

- [ ] **Step 2.9: Bump version and update CHANGELOG**

Patch bump per Task 1 recipe. CHANGELOG entry:

```markdown
### Changed
- Extracted event-listing logic into `services/events.ts`. CLI behavior unchanged.
```

- [ ] **Step 2.10: Commit**

```bash
git add src/lib/services/events.ts src/lib/services/events.test.ts src/lib/actions/list.ts src/lib/actions/report-detail.ts package.json CHANGELOG.md
git commit -m "Add services/events and thin list/report-detail actions"
```

---

## Task 3: Clients and projects service

**Source action:** `src/lib/actions/log.ts` (interactive client/project pickers) and `src/lib/actions/team-report.ts` (same).

**Service surface:**

```ts
// src/lib/services/clients.ts

export interface ClientSummary { uuid: string; name: string; }
export interface ProjectSummary { uuid: string; name: string; clientUuid: string; }

export async function listClients(accessToken: string, userUuid: string): Promise<ClientSummary[]>;
export async function listProjectsForClient(
  accessToken: string,
  userUuid: string,
  clientUuid: string,
): Promise<ProjectSummary[]>;
```

(One file — clients and projects come from the same `getClients` endpoint per `utils/api.ts:114-121`. If the endpoint also returns projects nested under each client, expose both.)

**Files:**
- Create: `src/lib/services/clients.ts`
- Create: `src/lib/services/clients.test.ts`
- Modify (light): `src/lib/actions/log.ts` and `src/lib/actions/team-report.ts` — only replace the direct `getClients(...)` call with the service. The interactive picker stays in the action file.

- [ ] **Step 3.1: Write failing test**

Mock `../utils/api`'s `getClients`. Assert that `listClients` returns a flat `{uuid, name}` array and that `listProjectsForClient` filters projects by `clientUuid`. (Concrete fixtures: 2 clients, each with 2 projects — verify the right 2 projects come back when asked for client A.)

- [ ] **Step 3.2: Run test, confirm fail.** `npm test -- clients.test`

- [ ] **Step 3.3: Implement `src/lib/services/clients.ts`**

Read the actual response shape from `actions/log.ts` where `getClients` is consumed today; mirror that mapping but expose plain TS types. No prompts.

- [ ] **Step 3.4: Run tests, confirm pass.** `npm test -- clients.test`

- [ ] **Step 3.5: Refactor consumers**

In `actions/log.ts` and `actions/team-report.ts`, replace the in-line `getClients` call with `await listClients(accessToken, userUuid)`. Leave the interactive `term.singleColumnMenu(...)` selection loop in place. (Consumers will get further trimmed by Tasks 4 and 7.)

- [ ] **Step 3.6: Run full test suite.** `npm test`

- [ ] **Step 3.7: Manual smoke**

```bash
npm run build
node dist/bin/cli.js log -m "smoke" --client --project    # picks client+project interactively
node dist/bin/cli.js team-report                          # picks client+projects interactively
```

Expected: same pickers, same final behavior.

- [ ] **Step 3.8: Version + CHANGELOG bump**

Patch bump. Entry: `Extracted client/project listing into services/clients.ts.`

- [ ] **Step 3.9: Commit**

```bash
git add src/lib/services/clients.ts src/lib/services/clients.test.ts src/lib/actions/log.ts src/lib/actions/team-report.ts package.json CHANGELOG.md
git commit -m "Add services/clients for client and project listing"
```

---

## Task 4: Logs service (`createLog`, `cancelLog`)

**Source actions:** `src/lib/actions/log.ts`, `src/lib/actions/log-cancel.ts`.

**Service surface:**

```ts
// src/lib/services/logs.ts

export interface CreateLogInput {
  clientUuid: string;
  projectUuid: string;
  planningEventUuid: string;
  startIso: string;     // already in Europe/Prague
  endIso: string;
  note: string;
}

export interface CreatedLog { uuid: string; }

export async function createLog(accessToken: string, input: CreateLogInput): Promise<CreatedLog>;
export async function cancelLog(accessToken: string, worklogUuid: string): Promise<void>;
```

**Input-complete rule:** `createLog` does NOT prompt for missing client/project. The CLI action does any pre-prompting (today's interactive flow) and then calls the service with a complete input.

**Files:**
- Create: `src/lib/services/logs.ts`
- Create: `src/lib/services/logs.test.ts`
- Modify: `src/lib/actions/log.ts` (split prompts/render from API call) — introduce a local `resolveLogInput(config, args, accessToken): Promise<CreateLogInput>` helper that owns all interactive prompting and date/time math; then `await createLog(accessToken, input); renderLogCreated();`
- Modify: `src/lib/actions/log-cancel.ts` (similar)

- [ ] **Step 4.1: Write failing test**

For `createLog`: mock `createEvent` from `../utils/api`, assert the payload matches the input shape exactly. For `cancelLog`: mock `fetchCancelWorklog`, assert it was called with the right UUID.

- [ ] **Step 4.2: Run, confirm fail.** `npm test -- logs.test`

- [ ] **Step 4.3: Implement `src/lib/services/logs.ts`**

Read `actions/log.ts` to see exactly how `createEvent` payload is built today; lift only the payload-building + API call into the service, with `input` already containing everything needed. No prompts. No terminal output.

- [ ] **Step 4.4: Run, confirm pass.** `npm test -- logs.test`

- [ ] **Step 4.5: Refactor `actions/log.ts`**

The action becomes:

```ts
export async function createLogAction(config: ProfileConfig, args: ParsedArgsLog): Promise<void> {
  const accessToken = await authenticate(args.profile);
  const input = await resolveLogInput(config, args, accessToken);  // prompts + date/time math
  await createLog(accessToken, input);
  term.green("✓ Worklog created\n");
}
```

`resolveLogInput` is a local async helper that:
1. Asks (or reads from `args`) for from/to times, date, client, project, message.
2. Builds the `CreateLogInput` and returns it.

This keeps all interactive `terminal-kit` selectors in the action file.

- [ ] **Step 4.6: Refactor `actions/log-cancel.ts`**

The action lists today's logs (using `getMonthEvents` from Task 2 narrowed to today), prompts user to pick one, calls `cancelLog(accessToken, picked.uuid)`, prints success.

- [ ] **Step 4.7: Run full test suite.** `npm test`

- [ ] **Step 4.8: Manual smoke**

```bash
npm run build
node dist/bin/cli.js log -m "smoke test" --from "10:00" --to "10:15"
node dist/bin/cli.js log-cancel    # cancel the worklog you just created
```

Expected: same behavior.

- [ ] **Step 4.9: Version + CHANGELOG bump.** Patch.

- [ ] **Step 4.10: Commit**

```bash
git add src/lib/services/logs.ts src/lib/services/logs.test.ts src/lib/actions/log.ts src/lib/actions/log-cancel.ts package.json CHANGELOG.md
git commit -m "Add services/logs for worklog create and cancel"
```

---

## Task 5: Absences service

**Source actions:** `src/lib/actions/absence.ts`, `src/lib/actions/absence-cancel.ts`.

**Service surface:**

```ts
// src/lib/services/absences.ts

export interface AbsenceType { uuid: string; name: string; }
export interface OwnAbsence { uuid: string; absenceTypeName: string; startedAt: string; endedAt: string; }

export interface CreateAbsenceInput {
  absenceTypeUuid: string;
  startIso: string;
  endIso: string;
  note: string;
  eventType: "full_day" | "partial_day";
}

export async function listAbsenceTypes(accessToken: string): Promise<AbsenceType[]>;
export async function listOwnAbsences(
  profileConfig: ProfileConfig,
  accessToken: string,
  range?: MonthRange,
): Promise<OwnAbsence[]>;
export async function createAbsence(accessToken: string, input: CreateAbsenceInput): Promise<void>;
export async function cancelAbsence(accessToken: string, absenceUuid: string): Promise<void>;
```

**Files:**
- Create: `src/lib/services/absences.ts`
- Create: `src/lib/services/absences.test.ts`
- Modify: `src/lib/actions/absence.ts` and `src/lib/actions/absence-cancel.ts` per the Task 4 pattern.

- [ ] **Step 5.1: Write failing test**

Mock `fetchAbsenceOptions`, `fetchCreateAbsence`, `fetchCancelAbsence`, `getAbsences`. Assert: `listAbsenceTypes` returns flat list; `createAbsence` POSTs the right payload; `cancelAbsence` calls cancel with the right UUID; `listOwnAbsences` filters by current user.

- [ ] **Step 5.2: Confirm fail.** `npm test -- absences.test`

- [ ] **Step 5.3: Implement `src/lib/services/absences.ts`**

Lift API + shaping code from `actions/absence.ts` and `actions/absence-cancel.ts`. No prompts. Read the actual payload shape from the existing actions when implementing.

- [ ] **Step 5.4: Confirm pass.** `npm test -- absences.test`

- [ ] **Step 5.5: Refactor `actions/absence.ts`**

`resolveAbsenceInput` helper does all prompting; then `await createAbsence(...)`.

- [ ] **Step 5.6: Refactor `actions/absence-cancel.ts`**

Action: `await listOwnAbsences(...) → menu → cancelAbsence(uuid)`.

- [ ] **Step 5.7: Run full test suite.** `npm test`

- [ ] **Step 5.8: Manual smoke**

```bash
npm run build
node dist/bin/cli.js absence            # walk through prompts to create a test absence
node dist/bin/cli.js absence-cancel     # cancel the one just created
```

- [ ] **Step 5.9: Version + CHANGELOG bump.** Patch.

- [ ] **Step 5.10: Commit**

```bash
git add src/lib/services/absences.ts src/lib/services/absences.test.ts src/lib/actions/absence.ts src/lib/actions/absence-cancel.ts package.json CHANGELOG.md
git commit -m "Add services/absences for absence create, cancel, listing"
```

---

## Task 6: Reports service

**Source action:** `src/lib/actions/report.ts` (371 lines — by far the largest action).

**Service surface:**

```ts
// src/lib/services/reports.ts

export interface ReportFilters {
  teamPrefixes?: string[];    // substring filter on team name
  namePrefix?: string;        // substring filter on user name
}

export interface ReportEventRow {
  date: string;
  time: string;
  userName: string;
  team: string;
  client: string;
  projectOrTitle: string;
}

export interface ReportSummaryRow {
  userName: string;
  team: string;
  workMinutes: number;
  absenceMinutes: number;
  totalMinutes: number;
}

export interface ReportValidateRow {
  userName: string;
  team: string;
  missingDates: string[];      // YYYY-MM-DD
  missingCount: number;
}

export async function getReport(
  accessToken: string,
  range: MonthRange,
  filters: ReportFilters,
  onProgress?: ProgressCallback,
): Promise<ReportEventRow[]>;

export async function getReportSummary(
  accessToken: string,
  range: MonthRange,
  filters: ReportFilters,
  onProgress?: ProgressCallback,
): Promise<ReportSummaryRow[]>;

export async function getValidateReport(
  accessToken: string,
  range: MonthRange,
  filters: ReportFilters,
  opts: { ignoreToday: boolean },
  onProgress?: ProgressCallback,
): Promise<ReportValidateRow[]>;
```

**Files:**
- Create: `src/lib/services/reports.ts`
- Create: `src/lib/services/reports.test.ts`
- Modify: `src/lib/actions/report.ts` (thin: build range from args, call appropriate service, render).

- [ ] **Step 6.1: Write failing tests**

For each of the three services, write 2–3 cases: happy path with mixed users, team filter narrowing, summary minute-aggregation (verify the 30-minute full-day-absence deduction matches today's logic in `actions/list.ts:163-169`), validate missing-days count (verify weekends + days with approved absences are not counted as missing).

- [ ] **Step 6.2: Confirm fail.** `npm test -- reports.test`

- [ ] **Step 6.3: Implement `src/lib/services/reports.ts`**

Read `actions/report.ts` carefully — it has three modes (events listing, summary, validate). Extract each into its own service function. Reuse `getMonthEvents` machinery where it's a fit; otherwise lift the API+aggregation code directly. Be careful about the `--ignore-today` behavior (today's events shouldn't count toward missing-days when the flag is set).

- [ ] **Step 6.4: Confirm pass.** `npm test -- reports.test`

- [ ] **Step 6.5: Refactor `actions/report.ts`**

The action becomes a router:

```ts
const range = resolveRange(args);
const filters = { teamPrefixes: args.teamPrefixes, namePrefix: args.name };

if (args.validate) {
  const rows = await getValidateReport(accessToken, range, filters, { ignoreToday: args.ignoreToday });
  renderValidateTable(rows);
} else if (args.summary) {
  const rows = await getReportSummary(accessToken, range, filters);
  renderSummaryTable(rows);
} else {
  const rows = await getReport(accessToken, range, filters);
  renderEventTable(rows);
}
```

`renderValidateTable`, `renderSummaryTable`, `renderEventTable` are local helpers extracted from the existing terminal-rendering code.

- [ ] **Step 6.6: Run full test suite.** `npm test`

- [ ] **Step 6.7: Manual smoke**

```bash
npm run build
node dist/bin/cli.js report
node dist/bin/cli.js report --summary
node dist/bin/cli.js report --validate
node dist/bin/cli.js report --validate --ignore-today
node dist/bin/cli.js report --team "Dev" --name "Tom"
node dist/bin/cli.js report --month 2026-04
```

- [ ] **Step 6.8: Version + CHANGELOG bump.** Minor bump (largest action, biggest change). E.g. `1.14.4 → 1.15.0`. Justification: noticeable internal restructuring even though external behavior is identical — bumping minor lets consumers visually see a meaningful refactor landed.

- [ ] **Step 6.9: Commit**

```bash
git add src/lib/services/reports.ts src/lib/services/reports.test.ts src/lib/actions/report.ts package.json CHANGELOG.md
git commit -m "Add services/reports and thin report action"
```

---

## Task 7: Team reports service

**Source action:** `src/lib/actions/team-report.ts`.

**Service surface:**

```ts
// src/lib/services/team-reports.ts

export interface TeamProjectTotals {
  projectName: string;
  totalMinutes: number;
  perUser: Array<{ userName: string; minutes: number }>;
}

export async function getTeamProjectReport(
  accessToken: string,
  range: MonthRange,
  clientUuid: string,
  projectMatchers: string[],   // substrings, case-insensitive
): Promise<TeamProjectTotals[]>;
```

**Files:**
- Create: `src/lib/services/team-reports.ts`
- Create: `src/lib/services/team-reports.test.ts`
- Modify: `src/lib/actions/team-report.ts` (thin — interactive client/project pickers stay; aggregation moves out).

- [ ] **Step 7.1: Write failing test** — mock the underlying API calls; assert aggregation sums hours correctly across users and respects project name matchers.

- [ ] **Step 7.2: Confirm fail.** `npm test -- team-reports.test`

- [ ] **Step 7.3: Implement.** Lift aggregation from `actions/team-report.ts`.

- [ ] **Step 7.4: Confirm pass.** `npm test -- team-reports.test`

- [ ] **Step 7.5: Refactor `actions/team-report.ts`**

Action: prompt for client (if not in args, via `listClients` from Task 3) → prompt for projects (via `listProjectsForClient`) → `await getTeamProjectReport(...)` → render table.

- [ ] **Step 7.6: Run full test suite.** `npm test`

- [ ] **Step 7.7: Manual smoke**

```bash
npm run build
node dist/bin/cli.js team-report                          # interactive
node dist/bin/cli.js team-report --client "Acme" --projects "Web"
node dist/bin/cli.js team-report --previous-month
```

- [ ] **Step 7.8: Version + CHANGELOG bump.** Patch.

- [ ] **Step 7.9: Commit**

```bash
git add src/lib/services/team-reports.ts src/lib/services/team-reports.test.ts src/lib/actions/team-report.ts package.json CHANGELOG.md
git commit -m "Add services/team-reports and thin team-report action"
```

---

## Task 8: Profiles service

**Source actions:** `src/lib/actions/profile.ts`, `src/lib/actions/init.ts`.

These are mostly *local* I/O (read/write config), not Sloneek API calls. The service surface is intentionally narrow — the interactive parts of `init` stay in the action because they're CLI-shaped (sequential prompts for email/password/work hours/etc.). The TUI will need its own form for that and will reuse only the leaf operations.

**Service surface:**

```ts
// src/lib/services/profiles.ts

export interface ProfileSummary {
  name: string;
  isActive: boolean;
  email: string;
  clientName: string;
  projectName: string;
  workHoursStart: string;
  workHoursEnd: string;
}

export async function listProfiles(): Promise<ProfileSummary[]>;
export async function removeProfile(name: string): Promise<{ renamedRemainingToDefault: boolean }>;
export async function saveProfile(name: string, profile: ProfileConfig): Promise<void>;
```

`saveProfile` is the leaf operation that `init` will use after collecting all values from the user — both CLI prompts (today) and the TUI form (Plan 2).

**Files:**
- Create: `src/lib/services/profiles.ts`
- Create: `src/lib/services/profiles.test.ts`
- Modify: `src/lib/actions/profile.ts` (uses `listProfiles`, `removeProfile`)
- Modify: `src/lib/actions/init.ts` (uses `saveProfile` at the end)

- [ ] **Step 8.1: Write failing tests**

Mock `readConfig` and `writeConfig`. Cover: `listProfiles` returns `isActive` correctly; `removeProfile` errors when removing the only profile; `removeProfile` renames the remaining one to `_default` and returns `renamedRemainingToDefault: true`; `saveProfile` round-trips through `writeConfig` with merged config.

- [ ] **Step 8.2: Confirm fail.** `npm test -- profiles.test`

- [ ] **Step 8.3: Implement `src/lib/services/profiles.ts`**

Lift the config-manipulation logic from `actions/profile.ts` (the removal/rename branches) and from `actions/init.ts` (the final write).

- [ ] **Step 8.4: Confirm pass.** `npm test -- profiles.test`

- [ ] **Step 8.5: Refactor `actions/profile.ts` and `actions/init.ts`**

Both shed their config-juggling code and use the service for the leaf operations. Interactive prompts in `init` stay verbatim.

- [ ] **Step 8.6: Run full test suite.** `npm test`

- [ ] **Step 8.7: Manual smoke**

```bash
npm run build
node dist/bin/cli.js profile                  # lists profiles
node dist/bin/cli.js init --profile smoketest # create + populate a throwaway profile
node dist/bin/cli.js profile --remove --profile smoketest
```

- [ ] **Step 8.8: Version + CHANGELOG bump.** Patch.

- [ ] **Step 8.9: Commit**

```bash
git add src/lib/services/profiles.ts src/lib/services/profiles.test.ts src/lib/actions/profile.ts src/lib/actions/init.ts package.json CHANGELOG.md
git commit -m "Add services/profiles for profile listing, removal, and save"
```

---

## Task 9: Final sweep and readiness check

This is the gate before Plan 2 (TUI build) starts.

**Files:** none directly — verification + commit if any.

- [ ] **Step 9.1: Verify no `actions/*.ts` calls `api.ts` directly** (every API call should now flow through a service)

Use Grep:

```
pattern: from\s+"\.\./utils/api"
glob: src/lib/actions/*.ts
output_mode: files_with_matches
```

Expected: zero matches. If any matches show up, evaluate whether they belong (rare cases like one-off endpoints) or should move to a service. Fix before moving on.

- [ ] **Step 9.2: Verify no service imports terminal-kit**

```
pattern: from\s+"terminal-kit"
glob: src/lib/services/*.ts
output_mode: files_with_matches
```

Expected: zero matches.

- [ ] **Step 9.3: Verify no service calls `process.exit`**

```
pattern: process\.exit
glob: src/lib/services/*.ts
output_mode: files_with_matches
```

Expected: zero matches.

- [ ] **Step 9.4: Run full test suite + build**

```bash
npm test
npm run build
```

Expected: all tests pass, no TypeScript errors.

- [ ] **Step 9.5: End-to-end smoke against staging**

Run every top-level command once. Quick mental diff against the README to confirm nothing's regressed.

```bash
node dist/bin/cli.js list
node dist/bin/cli.js list --detail
node dist/bin/cli.js list --other
node dist/bin/cli.js log -m "smoke" --from "10:00" --to "10:15"
node dist/bin/cli.js log-cancel
node dist/bin/cli.js absence
node dist/bin/cli.js absence-cancel
node dist/bin/cli.js report
node dist/bin/cli.js report --summary
node dist/bin/cli.js report --validate
node dist/bin/cli.js report-detail
node dist/bin/cli.js team-report
node dist/bin/cli.js profile
```

- [ ] **Step 9.6: No commit unless step 9.1–9.3 forced cleanups.** If any cleanups landed:

```bash
git add -p   # interactively stage what was changed
git commit -m "Finalize services refactor (cleanup pass)"
```

---

## Definition of Done for Plan 1

- All 8 services exist in `src/lib/services/` with unit tests
- Every CLI command still works exactly as before (manual verification per Step 9.5)
- No `actions/*.ts` file imports from `../utils/api` (Step 9.1)
- No service file imports `terminal-kit` (Step 9.2)
- `npm test` is green
- `package.json` is at the version bumped through Tasks 1–8
- `CHANGELOG.md` has an entry per task

When all of the above is true, Plan 1 is done and Plan 2 (TUI build) can begin from a clean slate.

---

## What Plan 2 will cover (forward reference, not a commitment)

Plan 2 will be written after this plan ships and will cover:

- Ink dependencies, `tsconfig` JSX changes, feature gate (`SLONEEK_TUI=1`)
- `tui/launch.ts` mounting an empty `<App/>`
- One screen per task (Logs → Absences → Reports → TeamReport → Profiles)
- `useService` hook, profile picker, modal forms, status bar
- README updates and the 2.0.0 cut that removes the feature gate

Writing it as a separate plan lets us absorb learnings from this refactor before locking in the TUI task breakdown.
