import { DateTime } from "luxon";
import { terminal as term } from "terminal-kit";
import { authenticate } from "../utils/login";
import {
  fetchCalendarOptions,
  getAbsences,
  getEvents,
  fetchAbsenceDetail,
  fetchScheduledEventDetail,
} from "../utils/api";
import { calculateDurationMinutes } from "../utils/time";

function getMonthRangePrague(monthArg?: string) {
  const tz = "Europe/Prague";
  let year: number | undefined;
  let month: number | undefined;

  if (monthArg && typeof monthArg === "string") {
    const m = monthArg.trim();
    // Patterns: YYYY-MM
    let match = m.match(/^(\d{4})[-\/]?(\d{1,2})$/);
    if (match) {
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
    }
    // Patterns: MM.YYYY or M.YYYY or MM-YYYY
    if (!month) {
      match = m.match(/^(\d{1,2})[.\/-](\d{4})$/);
      if (match) {
        month = parseInt(match[1], 10);
        year = parseInt(match[2], 10);
      }
    }
    // Patterns: M or MM (current year)
    if (!month && /^\d{1,2}$/.test(m)) {
      month = parseInt(m, 10);
    }
  }

  const now = DateTime.now().setZone(tz);
  if (!year) year = now.year;
  if (!month || month < 1 || month > 12) month = now.month;

  const start = DateTime.fromObject({ year, month, day: 1 }, { zone: tz }).startOf("day");
  const end = start.endOf("month").startOf("second");

  return {
    isoStart: start.toISO({ suppressMilliseconds: true }) ?? "",
    isoEnd: end.toISO({ suppressMilliseconds: true }) ?? "",
    monthStart: start,
  };
}

export async function reportDetailAction(_config: ProfileConfig, args: ParsedArgsReportDetail): Promise<void> {
  const accessToken = await authenticate(args.profile);

  term.cyan("Fetching calendar options (users)...\n");
  const options = await fetchCalendarOptions(accessToken);
  const groups = options?.data?.users ?? [];

  const allUsers: { uuid: string; name: string; team?: string }[] = [];
  for (const g of groups) {
    const teamName = g.team_name || "";
    for (const u of g.users || []) {
      const uuid = (u as any).uuid || (u as any).value || "";
      const name = (u as any).full_name || (u as any).name || uuid;
      if (uuid) allUsers.push({ uuid, name, team: teamName });
    }
  }

  // Sort users by name for a consistent and user-friendly picker order
  allUsers.sort((a, b) => a.name.localeCompare(b.name));

  const pickUserInteractively = async (cands: { uuid: string; name: string; team?: string }[], title: string) => {
    if (!cands.length) {
      throw new Error("No users available to select");
    }
    term("\n");
    term.cyan(`${title}\n`);
    // Show only the user name and render menu in multiple columns
    const items = cands.map((c) => c.name);
    const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(items.length))));
    const res: any = await new Promise((resolve) =>
      (() => {
        const maxLen = Math.min(
          30,
          items.reduce((m, s) => Math.max(m, s.length), 0),
        );
        const colWidth = Math.max(12, maxLen + 2);
        const width = columns * colWidth + Math.max(0, (columns - 1) * 2);
        return (term as any).gridMenu(items, { cancelable: true, width }, (_err: any, r: any) => resolve(r));
      })(),
    );
    if (!res || typeof res.selectedIndex !== "number") {
      term.red("Action canceled.\n");
      throw new Error("canceled");
    }
    return cands[res.selectedIndex];
  };

  let user: { uuid: string; name: string; team?: string } | undefined;

  if (!args.user) {
    // No filter provided: let user choose from all
    user = await pickUserInteractively(allUsers, "Select a user");
  } else {
    const needle = args.user.trim().toLowerCase();
    const candidates = allUsers.filter((u) => (u.uuid + " " + u.name).toLowerCase().includes(needle));
    if (candidates.length === 0) {
      term.red("No users match the provided --user filter.\n");
      return;
    } else if (candidates.length > 1) {
      user = await pickUserInteractively(candidates, "Select a user (filtered)");
    } else {
      user = candidates[0];
    }
  }

  if (!user) return;

  term.green(`User selected: ${user.name} (${user.uuid})${user.team ? " – " + user.team : ""}\n`);

  const { isoStart, isoEnd, monthStart } = getMonthRangePrague(args.month);
  term.cyan(`Fetching events and absences for ${monthStart.toFormat("MMMM yyyy")}...\n`);

  const [evResp, abResp] = await Promise.all([
    getEvents(
      {
        interval_starting_at: isoStart,
        interval_ending_at: isoEnd,
        users_uuids: [user.uuid],
        quick_filter: null,
      },
      accessToken,
    ),
    getAbsences(
      {
        interval_starting_at: isoStart,
        interval_ending_at: isoEnd,
        users_uuids: [user.uuid],
        quick_filter: null,
      },
      accessToken,
    ),
  ]);

  const sched = (evResp?.data?.events || []).map((e: any) => ({
    kind: "scheduled" as const,
    uuid: e.uuid as string,
    started_at: e.started_at as string,
    ended_at: e.ended_at as string,
  }));

  const abs = (abResp?.data?.events || [])
    .filter((a: any) => a.type !== "in_work")
    .map((a: any) => ({
      kind: "absence" as const,
      uuid: a.uuid as string,
      started_at: a.started_at as string,
      ended_at: a.ended_at as string,
      event_type: (a as any).event_type as "full_day" | "half_day" | undefined,
    }));

  const all = [...sched, ...abs].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  if (all.length === 0) {
    term.red("No events or absences found for the selected month.\n");
    return;
  }

  term.cyan("Fetching detail notes...\n");
  const notesMap: Record<string, string> = {};
  const infoMap: Record<string, string> = {};

  await Promise.all(
    all.map(async (item) => {
      try {
        if (item.kind === "scheduled") {
          const d = await fetchScheduledEventDetail(accessToken, item.uuid);
          const note = d?.data?.scheduled_event_data?.note ?? "";
          const proj = d?.data?.scheduled_event_data?.client_project?.project_name ?? "";
          notesMap[item.uuid] = String(note ?? "");
          infoMap[item.uuid] = String(proj ?? "");
        } else {
          const d = await fetchAbsenceDetail(accessToken, item.uuid);
          const note = d?.data?.absence_data?.note ?? "";
          const absName = d?.data?.absence_data?.user_absence_event?.absence_event_name ?? "";
          notesMap[item.uuid] = String(note ?? "");
          infoMap[item.uuid] = String(absName ?? "");
        }
      } catch (e) {
        notesMap[item.uuid] = notesMap[item.uuid] ?? "";
        infoMap[item.uuid] = infoMap[item.uuid] ?? "";
      }
    }),
  );

  const headers = ["Date", "Total", "Time", "Type", "Project/Absence", "Note"];
  const rows: string[][] = [headers];

  // Compute total minutes per day (keyed by the same formatted date string used in the table)
  const totalMinutesByDate: Record<string, number> = {};
  for (const item of all) {
    const s = DateTime.fromISO(item.started_at).setZone("Europe/Prague");
    const e = DateTime.fromISO(item.ended_at).setZone("Europe/Prague");
    const dateKey = s.toFormat("dd.MM.yyyy ccc");
    let minutes = calculateDurationMinutes(s, e);
    // Apply the same 30-minute deduction for full-day absences as in list action
    const isFullDayAbsence = (item as any).kind === "absence" && (item as any).event_type === "full_day";
    if (isFullDayAbsence) {
      minutes -= 30;
    }
    totalMinutesByDate[dateKey] = (totalMinutesByDate[dateKey] || 0) + Math.max(0, minutes);
  }

  const seenDates = new Set<string>();
  const fmtTotal = (mins: number) => {
    const hours = mins / 60;
    return Number.isInteger(hours) ? `${hours} hours` : `${hours.toFixed(1)} hours`;
  };

  for (const item of all) {
    const s = DateTime.fromISO(item.started_at).setZone("Europe/Prague");
    const e = DateTime.fromISO(item.ended_at).setZone("Europe/Prague");
    const date = s.toFormat("dd.MM.yyyy ccc");
    const time = `${s.toFormat("HH:mm")}-${e.toFormat("HH:mm")}`;
    const type = item.kind === "scheduled" ? "Work" : "Absence";
    // Preserve original note including newlines; normalize CRLF to LF
    const rawNote = String(notesMap[item.uuid] ?? "").replace(/\r\n/g, "\n");
    const info = String(infoMap[item.uuid] ?? "");

    const totalForDay = !seenDates.has(date) ? fmtTotal(totalMinutesByDate[date] || 0) : "";
    seenDates.add(date);

    rows.push([date, totalForDay, time, type, info, rawNote]);
  }

  term.table(rows, {
    hasBorder: true,
    contentHasMarkup: true,
    borderChars: "lightRounded",
    // Use terminal default width; allow multiline notes without our own truncation
    fit: true,
  });

  // Calculate total hours for logs and absences (same logic as list action)
  let totalLogMinutes = 0;
  let totalAbsenceMinutes = 0;
  for (const item of all) {
    const s = DateTime.fromISO(item.started_at).setZone("Europe/Prague");
    const e = DateTime.fromISO(item.ended_at).setZone("Europe/Prague");
    let minutes = calculateDurationMinutes(s, e);
    const isFullDayAbsence = (item as any).kind === "absence" && (item as any).event_type === "full_day";
    if (isFullDayAbsence) {
      minutes -= 30;
    }
    if ((item as any).kind === "scheduled") totalLogMinutes += minutes; else totalAbsenceMinutes += minutes;
  }

  const logHours = totalLogMinutes / 60;
  const absenceHours = totalAbsenceMinutes / 60;
  const totalLogHours = Number.isInteger(logHours) ? logHours.toString() : logHours.toFixed(1);
  const totalAbsenceHours = Number.isInteger(absenceHours) ? absenceHours.toString() : absenceHours.toFixed(1);

  term(
    `\nTotal: ${all.length} events (${sched.length} work, ${abs.length} absence)\n` +
      `Hours: ${totalLogHours}h of logs, ${totalAbsenceHours}h of absences\n`
  );
  term("\n");
}
