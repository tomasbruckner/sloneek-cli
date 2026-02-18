import { DateTime } from "luxon";
import { terminal as term } from "terminal-kit";
import { authenticate } from "../utils/login";
import { fetchCalendarOptions, getEvents, getAbsences, getNationalHolidays } from "../utils/api";
import { formatHours, getMonthRangePrague, resolveCalendarUserId, resolveCalendarUserName } from "../utils/time";

export async function reportAction(_config: ProfileConfig, args: ParsedArgsReport): Promise<void> {
  const accessToken = await authenticate(args.profile);

  term.cyan("Fetching calendar options (users)...\n");
  const options = await fetchCalendarOptions(accessToken);

  const usersGroups = options?.data?.users ?? [];

  // Build user UUID list and maps: UUID -> team name, UUID -> user name, with optional team filter(s)
  const usersUuids: string[] = [];
  const userTeamMap: Record<string, string> = {};
  const userNameMap: Record<string, string> = {};

  const teamFilters = (args.teams || [])
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length > 0);

  const nameFilter = (args.name || "").toLowerCase().trim();

  usersGroups.forEach((group) => {
    const teamName = group.team_name || "";
    const teamNameLc = teamName.toLowerCase();
    const includeGroup = teamFilters.length === 0 || teamFilters.some((f) => teamNameLc.includes(f));
    if (!includeGroup) return;

    (group.users || []).forEach((u) => {
      const id = resolveCalendarUserId(u);
      const uname = resolveCalendarUserName(u) || String(id || "");
      const unameLc = (uname || "").toLowerCase();
      const includeUser = !nameFilter || unameLc.includes(nameFilter);
      if (id && includeUser) {
        usersUuids.push(id);
        userTeamMap[id] = teamName;
        userNameMap[id] = uname;
      }
    });
  });

  if (usersUuids.length === 0) {
    term.red("No users found in calendar options for the selected team filter(s).\n");
    return;
  }

  let interval_starting_at: string;
  let interval_ending_at: string;

  if (args.start && args.end) {
    interval_starting_at = args.start;
    interval_ending_at = args.end;
  } else {
    const { isoStart, isoEnd } = getMonthRangePrague(args.month);
    interval_starting_at = isoStart;
    interval_ending_at = isoEnd;
  }

  // Fetch national holidays for the interval and selected users (used to exclude from workdays/absence totals)
  const tz = "Europe/Prague";
  const fromDate = DateTime.fromISO(interval_starting_at).setZone(tz).toISODate()!;
  const toDate = DateTime.fromISO(interval_ending_at).setZone(tz).toISODate()!;
  let holidaySet = new Set<string>();
  try {
    term.cyan("Fetching national holidays...\n");
    const holidaysResp = await getNationalHolidays(
      {
        from_date: fromDate,
        to_date: toDate,
        is_show_company_holidays: true,
        users_uuids: usersUuids,
      },
      accessToken,
    );
    const items = holidaysResp?.data || [];
    for (const it of items) {
      const d = it?.date;
      if (typeof d === "string" && d.match(/^\d{4}-\d{2}-\d{2}$/)) holidaySet.add(d);
    }
  } catch (e) {
    term.yellow("Warning: failed to fetch national holidays; holidays will not be excluded.\n");
  }
  const isHoliday = (dt: DateTime) => {
    const iso = dt.toISODate();
    return !!(iso && holidaySet.has(iso));
  };

  term.cyan("Fetching scheduled events for all users...\n");
  const resp = await getEvents(
    {
      interval_starting_at,
      interval_ending_at,
      users_uuids: usersUuids,
      quick_filter: null,
    },
    accessToken,
  );

  let events: any[] = resp?.data?.events ?? [];

  // If backend still returns events outside filtered filters, apply a defensive filter by user_uuid
  if (teamFilters.length > 0 || nameFilter) {
    const allowed = new Set(usersUuids);
    events = events.filter((e) => {
      const uid = e.user?.uuid;
      return !uid || allowed.has(uid);
    });
  }

  // Sort by start time
  events.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  // Show events table only when not validating
  if (!args.validate) {
    if (args.summary) {
      // Summary mode: render per-user totals only (User, Team, Work h, Absence h, Total h)
      type Totals = { work: number; absence: number };
      const perUser: Record<string, Totals> = {};
      const ensure = (uid: string) => (perUser[uid] ??= { work: 0, absence: 0 });

      // Sum scheduled events per user across the interval
      for (const e of events) {
        const uid: string | undefined = e.user?.uuid;
        if (!uid) continue;
        const start = DateTime.fromISO(e.started_at).setZone("Europe/Prague");
        const end = DateTime.fromISO(e.ended_at).setZone("Europe/Prague");
        const minutes = Math.max(0, Math.round(end.diff(start, "minutes").minutes));
        ensure(uid).work += minutes;
      }

      // Fetch absences and add to per-user totals (ignore in_work, subtract 30m for full-day, expand multi-day on workdays)
      try {
        const absResp = await getAbsences(
          {
            interval_starting_at,
            interval_ending_at,
            users_uuids: usersUuids,
            quick_filter: null,
          },
          accessToken,
        );
        const absences = absResp?.data?.events || [];

        for (const a of absences) {
          if (a.type === "in_work") continue;
          const uid: string | undefined = a.user?.uuid;
          if (!uid) continue;
          const start = DateTime.fromISO(a.started_at).setZone("Europe/Prague");
          const end = DateTime.fromISO(a.ended_at).setZone("Europe/Prague");

          if (start.hasSame(end, "day")) {
            if (start.weekday <= 5 && !isHoliday(start.startOf("day"))) {
              let minutes = Math.round(end.diff(start, "minutes").minutes);
              const isFullDay = a.event_type === "full_day";
              if (isFullDay) minutes -= 30;
              ensure(uid).absence += Math.max(0, minutes);
            }
          } else {
            let cursor = start.startOf("day");
            const last = end.startOf("day");
            while (cursor <= last) {
              if (cursor.weekday <= 5 && !isHoliday(cursor.startOf("day"))) {
                const dayStart = cursor;
                const dayEnd = cursor.plus({ hours: 23, minutes: 59, seconds: 59 });
                let minutes = Math.round(dayEnd.diff(dayStart, "minutes").minutes);
                const isFullDay = a.event_type === "full_day";
                if (isFullDay) minutes -= 30;
                ensure(uid).absence += Math.max(0, minutes);
              }
              cursor = cursor.plus({ days: 1 });
            }
          }
        }
      } catch (e) {
        term.yellow("Warning: failed to fetch absences; summary will include only scheduled events.\n");
      }

      // Prepare table
      const headers = ["User", "Team", "Work h", "Absence h", "Total h"];
      const table: string[][] = [headers];
      const trunc = (s: string, n = 30) => (s && s.length > n ? s.slice(0, n - 3) + "..." : s);

      // Include all selected users, even with zeros
      const rows = usersUuids.map((uid) => {
        const name = userNameMap[uid] || uid;
        const team = userTeamMap[uid] || "-";
        const totals = perUser[uid] || { work: 0, absence: 0 };
        const workH = formatHours(totals.work);
        const absH = formatHours(totals.absence);
        const totalH = formatHours(totals.work + totals.absence);
        return [trunc(name, 28), trunc(team, 28), workH, absH, totalH];
      });

      // Sort by user name
      rows.sort((a, b) => a[0].localeCompare(b[0]));
      table.push(...rows);

      if (table.length === 1) {
        term.red("No users found to summarize.\n");
      } else {
        term.table(table, {
          hasBorder: true,
          contentHasMarkup: true,
          borderChars: "lightRounded",
          width: 100,
          fit: true,
        });
        term("\n");
      }
    } else {
      // Simple table without per-day summary columns
      const headers = ["Date", "Time", "User", "Team", "Client", "Project / Title"]; 
      const table: string[][] = [headers];
      const visitedDate: Record<string, boolean> = {};
      const trunc = (s: string, n = 30) => (s && s.length > n ? s.slice(0, n - 3) + "..." : s);

      for (const e of events) {
        const start = DateTime.fromISO(e.started_at).setZone("Europe/Prague");
        const end = DateTime.fromISO(e.ended_at).setZone("Europe/Prague");

        const date = start.toFormat("dd.MM.yyyy");
        const time = `${start.toFormat("HH:mm")}-${end.toFormat("HH:mm")}`;

        const userName = e.user?.full_name || e.user?.name || "-";
        const userUuid = e.user?.uuid;
        const teamName = (userUuid && userTeamMap[userUuid]) || e.user?.team?.name || "-";
        const client = e.client?.name || e.client?.display_name || "-";
        const project = e.client_project?.project_name || e.title || e.message || "-";

        table.push([
          visitedDate[date] ? "" : date,
          time,
          trunc(userName, 22),
          trunc(teamName, 22),
          trunc(client, 22),
          trunc(project, 38),
        ]);

        visitedDate[date] = true;
      }

      if (table.length === 1) {
        term.red("No scheduled events found for the selected interval.\n");
      } else {
        term.table(table, {
          hasBorder: true,
          contentHasMarkup: true,
          borderChars: "lightRounded",
          width: 120,
          fit: true,
        });
        term("\n");
      }
    }
  }

  // Validation: show, for each user, which workdays up to today are missing any event (respecting filters)
  if (args.validate) {
    const tz = "Europe/Prague";

    // Build list of workdays (Mon-Fri) within interval [start, min(end, today+1day))
    let cursor = DateTime.fromISO(interval_starting_at).setZone(tz).startOf("day");
    const end = DateTime.fromISO(interval_ending_at).setZone(tz).startOf("day");
    const todayStart = DateTime.now().setZone(tz).startOf("day");
    const todayEnd = todayStart.plus({ days: 1 });
    const todayBoundary = args.ignoreToday ? todayStart : todayEnd;
    const effectiveEnd = end < todayBoundary ? end : todayBoundary; // ignore future days (and optionally today)

    const workdays: string[] = [];
    while (cursor < effectiveEnd) {
      if (cursor.weekday <= 5 && !isHoliday(cursor.startOf("day"))) {
        workdays.push(cursor.toISODate()!); // ISO date key YYYY-MM-DD
      }
      cursor = cursor.plus({ days: 1 });
    }

    // Build per-user set of dates that have at least one event or absence
    const userDatesMap: Record<string, Set<string>> = {};
    for (const uid of usersUuids) userDatesMap[uid] = new Set<string>();

    // Mark days with scheduled events
    for (const e of events) {
      const uid: string | undefined = e.user?.uuid;
      if (!uid || !(uid in userDatesMap)) continue;
      let s = DateTime.fromISO(e.started_at).setZone(tz).startOf("day");
      let en = DateTime.fromISO(e.ended_at).setZone(tz).startOf("day");
      while (s <= en) {
        const key = s.toISODate()!;
        userDatesMap[uid].add(key);
        s = s.plus({ days: 1 });
      }
    }

    // Fetch and fold in absences so they are NOT considered missing days
    try {
      const absResp = await getAbsences(
        {
          interval_starting_at,
          interval_ending_at,
          users_uuids: usersUuids,
          quick_filter: null,
        },
        accessToken,
      );

      const absenceEvents = absResp?.data?.events || [];
      // Precompute a set of workday ISO dates we evaluate against for quick check
      const workdaySet = new Set(workdays);

      for (const a of absenceEvents) {
        // Ignore in_work type absences, same as list.ts
        if (a.type === "in_work") continue;
        const uid: string | undefined = a.user?.uuid;
        if (!uid || !(uid in userDatesMap)) continue;

        let s = DateTime.fromISO(a.started_at).setZone(tz).startOf("day");
        const endDay = DateTime.fromISO(a.ended_at).setZone(tz).startOf("day");
        // Clip to effectiveEnd boundary
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
    } catch (e) {
      // Be resilient: if absences fetch fails, continue with events-only logic
      term.yellow("Warning: failed to fetch absences; validation will ignore absences.\n");
    }

    // Compute missing workdays per user (up to today)
    type Row = { user: string; count: number; missing: string };
    const rows: Row[] = [];
    for (const uid of usersUuids) {
      const had = userDatesMap[uid] || new Set<string>();
      const missingIsoDates = workdays.filter((d) => !had.has(d));
      if (missingIsoDates.length > 0) {
        const formatted = missingIsoDates
          .map((d) => DateTime.fromISO(d, { zone: tz }).toFormat("dd.MM.yyyy"))
          .join(", ");
        rows.push({ user: userNameMap[uid] || uid, count: missingIsoDates.length, missing: formatted });
      }
    }

    term.cyan("Validation (missing workdays per user, up to today)\n");
    if (rows.length === 0) {
      term.green("✓ All selected users have at least one event for each workday up to today in the selected interval.\n\n");
    } else {
      const vHeaders = ["User", "Days", "Missing days"];
      const vTable: string[][] = [vHeaders];
      rows
        .sort((a, b) => a.user.localeCompare(b.user))
        .forEach((r) => vTable.push([r.user, String(r.count), r.missing]));

      term.table(vTable, {
        hasBorder: true,
        contentHasMarkup: true,
        borderChars: "lightRounded",
        width: 120,
        fit: true,
      });
      term("\n");
    }
  }
}
