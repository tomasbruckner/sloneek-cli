import { DateTime } from "luxon";
import { fetchCalendarOptions, getEvents, getAbsences, getNationalHolidays } from "../utils/api";
import { resolveCalendarUserId, resolveCalendarUserName } from "../utils/time";

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface ReportFilters {
  /** Substring matches against team_name (case-insensitive). Empty array = no filter. */
  teamPrefixes?: string[];
  /** Substring match against user full_name (case-insensitive). Undefined / "" = no filter. */
  namePrefix?: string;
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
  /** Formatted dates: "dd.MM.yyyy" */
  missingDates: string[];
  missingCount: number;
}

// ─── Internal constants ───────────────────────────────────────────────────────

const TZ = "Europe/Prague";
/** Minutes subtracted from each full-day absence workday span (existing behavior). */
const FULL_DAY_ABSENCE_OFFSET_MINUTES = 30;

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface UserEntry {
  uuid: string;
  name: string;
  team: string;
}

/** Fetch the calendar user list and apply optional team + name filters. */
async function fetchFilteredUsers(accessToken: string, filters: ReportFilters): Promise<UserEntry[]> {
  const options = await fetchCalendarOptions(accessToken);
  const usersGroups = options?.data?.users ?? [];

  const teamFilters = (filters.teamPrefixes || [])
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 0);
  const nameFilter = (filters.namePrefix || "").toLowerCase().trim();

  const users: UserEntry[] = [];

  for (const group of usersGroups) {
    const teamName = group.team_name || "";
    const teamNameLc = teamName.toLowerCase();
    const includeGroup = teamFilters.length === 0 || teamFilters.some((f) => teamNameLc.includes(f));
    if (!includeGroup) continue;

    for (const u of group.users || []) {
      const id = resolveCalendarUserId(u);
      const uname = resolveCalendarUserName(u) || String(id || "");
      const unameLc = uname.toLowerCase();
      const includeUser = !nameFilter || unameLc.includes(nameFilter);
      if (id && includeUser) {
        users.push({ uuid: id, name: uname, team: teamName });
      }
    }
  }

  return users;
}

/** Build a set of ISO date strings (YYYY-MM-DD) that are national holidays. */
async function fetchHolidaySet(
  accessToken: string,
  usersUuids: string[],
  fromDate: string,
  toDate: string,
): Promise<Set<string>> {
  const holidaySet = new Set<string>();
  try {
    const resp = await getNationalHolidays(
      {
        from_date: fromDate,
        to_date: toDate,
        is_show_company_holidays: true,
        users_uuids: usersUuids,
      },
      accessToken,
    );
    for (const it of resp?.data || []) {
      const d = it?.date;
      if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        holidaySet.add(d);
      }
    }
  } catch {
    // Silently continue — holidays won't be excluded but we won't crash
  }
  return holidaySet;
}

// ─── getReport ────────────────────────────────────────────────────────────────

/**
 * Fetch all scheduled events for users matching `filters` within `range`,
 * returning one row per event sorted by start time.
 */
export async function getReport(
  accessToken: string,
  range: MonthRange,
  filters: ReportFilters,
  onProgress?: ProgressCallback,
): Promise<ReportEventRow[]> {
  const users = await fetchFilteredUsers(accessToken, filters);
  if (users.length === 0) return [];

  const usersUuids = users.map((u) => u.uuid);
  const userTeamMap: Record<string, string> = {};
  for (const u of users) userTeamMap[u.uuid] = u.team;

  const evResp = await getEvents(
    {
      interval_starting_at: range.isoStart,
      interval_ending_at: range.isoEnd,
      users_uuids: usersUuids,
      quick_filter: null,
    },
    accessToken,
  );

  const allowed = new Set(usersUuids);
  let events: any[] = (evResp?.data?.events ?? []).filter((e) => {
    const uid = e.user?.uuid;
    return !uid || allowed.has(uid);
  });

  // Sort by start time
  events.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  const total = events.length;
  let done = 0;

  const rows: ReportEventRow[] = events.map((e) => {
    const start = DateTime.fromISO(e.started_at).setZone(TZ);
    const end = DateTime.fromISO(e.ended_at).setZone(TZ);

    const userName = e.user?.full_name || e.user?.name || "-";
    const userUuid = e.user?.uuid;
    const team = (userUuid && userTeamMap[userUuid]) || e.user?.team?.name || "-";
    const client = e.client?.name || e.client?.display_name || "-";
    const projectOrTitle = e.client_project?.project_name || e.title || e.message || "-";

    done += 1;
    onProgress?.(done, total);

    return {
      date: start.toFormat("dd.MM.yyyy"),
      time: `${start.toFormat("HH:mm")}-${end.toFormat("HH:mm")}`,
      userName,
      team,
      client,
      projectOrTitle,
    };
  });

  return rows;
}

// ─── getReportSummary ─────────────────────────────────────────────────────────

/**
 * Fetch scheduled events + absences for all matching users, returning one
 * summary row per user (including users with zero activity).
 */
export async function getReportSummary(
  accessToken: string,
  range: MonthRange,
  filters: ReportFilters,
  onProgress?: ProgressCallback,
): Promise<ReportSummaryRow[]> {
  const users = await fetchFilteredUsers(accessToken, filters);
  if (users.length === 0) return [];

  const usersUuids = users.map((u) => u.uuid);

  const fromDate = DateTime.fromISO(range.isoStart).setZone(TZ).toISODate()!;
  const toDate = DateTime.fromISO(range.isoEnd).setZone(TZ).toISODate()!;

  const [evResp, absResp, holidaySet] = await Promise.all([
    getEvents(
      {
        interval_starting_at: range.isoStart,
        interval_ending_at: range.isoEnd,
        users_uuids: usersUuids,
        quick_filter: null,
      },
      accessToken,
    ),
    getAbsences(
      {
        interval_starting_at: range.isoStart,
        interval_ending_at: range.isoEnd,
        users_uuids: usersUuids,
        quick_filter: null,
      },
      accessToken,
    ).catch((): AbsenceEventsResponse => ({ data: { events: [] } })),
    fetchHolidaySet(accessToken, usersUuids, fromDate, toDate),
  ]);

  const isHoliday = (dt: DateTime) => {
    const iso = dt.toISODate();
    return !!(iso && holidaySet.has(iso));
  };

  type Totals = { work: number; absence: number };
  const perUser: Record<string, Totals> = {};
  const ensure = (uid: string) => (perUser[uid] ??= { work: 0, absence: 0 });

  // Sum scheduled events per user
  const events: any[] = evResp?.data?.events ?? [];
  for (const e of events) {
    const uid: string | undefined = e.user?.uuid;
    if (!uid) continue;
    const start = DateTime.fromISO(e.started_at).setZone(TZ);
    const end = DateTime.fromISO(e.ended_at).setZone(TZ);
    const minutes = Math.max(0, Math.round(end.diff(start, "minutes").minutes));
    ensure(uid).work += minutes;
  }

  // Sum absences per user (with full-day deduction and workday / holiday filter)
  const absences = absResp?.data?.events || [];
  for (const a of absences) {
    if (a.type === "in_work") continue;
    const uid: string | undefined = a.user?.uuid;
    if (!uid) continue;

    const start = DateTime.fromISO(a.started_at).setZone(TZ);
    const end = DateTime.fromISO(a.ended_at).setZone(TZ);
    const isFullDay = a.event_type === "full_day";

    if (start.hasSame(end, "day")) {
      if (start.weekday <= 5 && !isHoliday(start.startOf("day"))) {
        let minutes = Math.round(end.diff(start, "minutes").minutes);
        if (isFullDay) minutes -= FULL_DAY_ABSENCE_OFFSET_MINUTES;
        ensure(uid).absence += Math.max(0, minutes);
      }
    } else {
      let cursor = start.startOf("day");
      const last = end.startOf("day");
      while (cursor <= last) {
        if (cursor.weekday <= 5 && !isHoliday(cursor)) {
          const dayStart = cursor;
          const dayEnd = cursor.plus({ hours: 23, minutes: 59, seconds: 59 });
          let minutes = Math.round(dayEnd.diff(dayStart, "minutes").minutes);
          if (isFullDay) minutes -= FULL_DAY_ABSENCE_OFFSET_MINUTES;
          ensure(uid).absence += Math.max(0, minutes);
        }
        cursor = cursor.plus({ days: 1 });
      }
    }
  }

  const total = users.length;
  let done = 0;

  const rows: ReportSummaryRow[] = users.map((u) => {
    const totals = perUser[u.uuid] || { work: 0, absence: 0 };

    done += 1;
    onProgress?.(done, total);

    return {
      userName: u.name,
      team: u.team,
      workMinutes: totals.work,
      absenceMinutes: totals.absence,
      totalMinutes: totals.work + totals.absence,
    };
  });

  return rows;
}

// ─── getValidateReport ────────────────────────────────────────────────────────

/**
 * For each matching user, compute which workdays (Mon–Fri, non-holiday) in the
 * effective window [rangeStart, min(rangeEnd, today-or-yesterday)] have NO
 * scheduled event AND NO approved absence. Returns only users with at least one
 * missing day.
 */
export async function getValidateReport(
  accessToken: string,
  range: MonthRange,
  filters: ReportFilters,
  opts: { ignoreToday: boolean },
  onProgress?: ProgressCallback,
): Promise<ReportValidateRow[]> {
  const users = await fetchFilteredUsers(accessToken, filters);
  if (users.length === 0) return [];

  const usersUuids = users.map((u) => u.uuid);

  const fromDate = DateTime.fromISO(range.isoStart).setZone(TZ).toISODate()!;
  const toDate = DateTime.fromISO(range.isoEnd).setZone(TZ).toISODate()!;

  const [evResp, absResp, holidaySet] = await Promise.all([
    getEvents(
      {
        interval_starting_at: range.isoStart,
        interval_ending_at: range.isoEnd,
        users_uuids: usersUuids,
        quick_filter: null,
      },
      accessToken,
    ),
    getAbsences(
      {
        interval_starting_at: range.isoStart,
        interval_ending_at: range.isoEnd,
        users_uuids: usersUuids,
        quick_filter: null,
      },
      accessToken,
    ).catch((): AbsenceEventsResponse => ({ data: { events: [] } })),
    fetchHolidaySet(accessToken, usersUuids, fromDate, toDate),
  ]);

  const isHoliday = (dt: DateTime) => {
    const iso = dt.toISODate();
    return !!(iso && holidaySet.has(iso));
  };

  // Compute effective end: cap at today (exclusive) or yesterday (exclusive if ignoreToday)
  const todayStart = DateTime.now().setZone(TZ).startOf("day");
  const todayEnd = todayStart.plus({ days: 1 });
  const todayBoundary = opts.ignoreToday ? todayStart : todayEnd;
  // Use end-of-range as exclusive upper bound: startOf("day") (original behavior, isoEnd day is excluded)
  const rangeEnd = DateTime.fromISO(range.isoEnd).setZone(TZ).startOf("day");
  const effectiveEnd = rangeEnd < todayBoundary ? rangeEnd : todayBoundary;

  // Build list of workdays (Mon-Fri, non-holiday) in effective window
  const workdays: string[] = [];
  let cursor = DateTime.fromISO(range.isoStart).setZone(TZ).startOf("day");
  while (cursor < effectiveEnd) {
    if (cursor.weekday <= 5 && !isHoliday(cursor)) {
      workdays.push(cursor.toISODate()!);
    }
    cursor = cursor.plus({ days: 1 });
  }

  // Build per-user covered-days set (events + approved absences)
  const userDatesMap: Record<string, Set<string>> = {};
  for (const u of users) userDatesMap[u.uuid] = new Set<string>();

  const workdaySet = new Set(workdays);

  // Mark days covered by scheduled events
  const events: any[] = evResp?.data?.events ?? [];
  for (const e of events) {
    const uid: string | undefined = e.user?.uuid;
    if (!uid || !(uid in userDatesMap)) continue;
    let s = DateTime.fromISO(e.started_at).setZone(TZ).startOf("day");
    const en = DateTime.fromISO(e.ended_at).setZone(TZ).startOf("day");
    while (s <= en) {
      const key = s.toISODate()!;
      userDatesMap[uid].add(key);
      s = s.plus({ days: 1 });
    }
  }

  // Mark days covered by approved absences (skip in_work)
  const absences = absResp?.data?.events || [];
  for (const a of absences) {
    if (a.type === "in_work") continue;
    const uid: string | undefined = a.user?.uuid;
    if (!uid || !(uid in userDatesMap)) continue;

    let s = DateTime.fromISO(a.started_at).setZone(TZ).startOf("day");
    const endDay = DateTime.fromISO(a.ended_at).setZone(TZ).startOf("day");
    while (s <= endDay) {
      if (s.weekday <= 5) {
        const key = s.toISODate()!;
        if (workdaySet.has(key)) {
          userDatesMap[uid].add(key);
        }
      }
      s = s.plus({ days: 1 });
    }
  }

  // Compute missing days per user
  const total = users.length;
  let done = 0;
  const rows: ReportValidateRow[] = [];

  for (const u of users) {
    const covered = userDatesMap[u.uuid] || new Set<string>();
    const missingIsoDates = workdays.filter((d) => !covered.has(d));

    done += 1;
    onProgress?.(done, total);

    if (missingIsoDates.length > 0) {
      const missingDates = missingIsoDates.map((d) => DateTime.fromISO(d, { zone: TZ }).toFormat("dd.MM.yyyy"));
      rows.push({
        userName: u.name,
        team: u.team,
        missingDates,
        missingCount: missingIsoDates.length,
      });
    }
  }

  return rows;
}
