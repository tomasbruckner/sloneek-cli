import { DateTime } from "luxon";
import { terminal as term } from "terminal-kit";
import { authenticate } from "../utils/login";
import { fetchCalendarOptions } from "../utils/api";
import {
  calculateDurationMinutes,
  formatHours,
  getMonthRangePrague,
  resolveCalendarUserId,
  resolveCalendarUserName,
} from "../utils/time";
import { getUserMonthlyDetail } from "../services/events";
import type { ScheduledEventWithNote, AbsenceWithNote } from "../services/events";

export async function reportDetailAction(_config: ProfileConfig, args: ParsedArgsReportDetail): Promise<void> {
  const accessToken = await authenticate(args.profile);

  term.cyan("Fetching calendar options (users)...\n");
  const options = await fetchCalendarOptions(accessToken);
  const groups = options?.data?.users ?? [];

  const allUsers: { uuid: string; name: string; team?: string }[] = [];
  for (const g of groups) {
    const teamName = g.team_name || "";
    for (const u of g.users || []) {
      const uuid = resolveCalendarUserId(u);
      const name = resolveCalendarUserName(u) || uuid;
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

  const { isoStart, isoEnd, monthStart, label } = getMonthRangePrague(args.month);
  const range: MonthRange = { isoStart, isoEnd, rangeLabel: label };
  term.cyan(`Fetching events, absences, and detail notes for ${monthStart.toFormat("MMMM yyyy")}...\n`);

  const detail = await getUserMonthlyDetail(accessToken, user.uuid, range);

  // Apply --project filter (UI concern: filter after service returns)
  let { scheduledEvents, absences } = detail;
  let all: (ScheduledEventWithNote | AbsenceWithNote)[] = [...scheduledEvents, ...absences].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  );

  if (args.project) {
    const needle = args.project.trim().toLowerCase();
    all = all.filter((item) => item.kind === "scheduled" && item.project.toLowerCase().includes(needle));
    scheduledEvents = all.filter((item): item is ScheduledEventWithNote => item.kind === "scheduled");
    absences = [];
    term.cyan(`Project filter: ${args.project}\n`);
  }

  if (all.length === 0) {
    term.red("No events or absences found for the selected month.\n");
    return;
  }

  renderDetailTable(all);
  renderDetailTotals(scheduledEvents, absences, all);
}

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderDetailTable(all: (ScheduledEventWithNote | AbsenceWithNote)[]) {
  const headers = ["Date", "Total", "Time", "Type", "Project/Absence", "Note"];
  const rows: string[][] = [headers];

  // Compute total minutes per day
  const totalMinutesByDate: Record<string, number> = {};
  for (const item of all) {
    const s = DateTime.fromISO(item.started_at).setZone("Europe/Prague");
    const e = DateTime.fromISO(item.ended_at).setZone("Europe/Prague");
    const dateKey = s.toFormat("dd.MM.yyyy ccc");
    let minutes = calculateDurationMinutes(s, e);
    const isFullDayAbsence = item.kind === "absence" && item.event_type === "full_day";
    if (isFullDayAbsence) {
      minutes -= 30;
    }
    totalMinutesByDate[dateKey] = (totalMinutesByDate[dateKey] || 0) + Math.max(0, minutes);
  }

  const seenDates = new Set<string>();
  const fmtTotal = (mins: number) => `${formatHours(mins)} hours`;

  for (const item of all) {
    const s = DateTime.fromISO(item.started_at).setZone("Europe/Prague");
    const e = DateTime.fromISO(item.ended_at).setZone("Europe/Prague");
    const date = s.toFormat("dd.MM.yyyy ccc");
    const time = `${s.toFormat("HH:mm")}-${e.toFormat("HH:mm")}`;
    const type = item.kind === "scheduled" ? "Work" : "Absence";
    // Preserve original note including newlines; normalize CRLF to LF
    const rawNote = String(item.note ?? "").replace(/\r\n/g, "\n");
    const info = String(item.info ?? "");

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
}

function renderDetailTotals(
  scheduledEvents: ScheduledEventWithNote[],
  absences: AbsenceWithNote[],
  all: (ScheduledEventWithNote | AbsenceWithNote)[],
) {
  let totalLogMinutes = 0;
  let totalAbsenceMinutes = 0;

  for (const item of all) {
    const s = DateTime.fromISO(item.started_at).setZone("Europe/Prague");
    const e = DateTime.fromISO(item.ended_at).setZone("Europe/Prague");
    let minutes = calculateDurationMinutes(s, e);
    const isFullDayAbsence = item.kind === "absence" && item.event_type === "full_day";
    if (isFullDayAbsence) {
      minutes -= 30;
    }
    if (item.kind === "scheduled") totalLogMinutes += minutes;
    else totalAbsenceMinutes += minutes;
  }

  const logHours = totalLogMinutes / 60;
  const absenceHours = totalAbsenceMinutes / 60;
  const totalLogHours = Number.isInteger(logHours) ? logHours.toString() : logHours.toFixed(1);
  const totalAbsenceHours = Number.isInteger(absenceHours) ? absenceHours.toString() : absenceHours.toFixed(1);

  term(
    `\nTotal: ${all.length} events (${scheduledEvents.length} work, ${absences.length} absence)\n` +
      `Hours: ${totalLogHours}h of logs, ${totalAbsenceHours}h of absences\n`,
  );
  term("\n");
}
