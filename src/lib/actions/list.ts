import { DateTime } from "luxon";
import { terminal as term } from "terminal-kit";
import { authenticate } from "../utils/login";
import { calculateDurationMinutes, formatHours, getMonthRangePrague } from "../utils/time";
import { getMonthEvents, getOtherUsersAbsencesToday } from "../services/events";
import type { MonthEvents, OtherUserAbsence } from "../services/events";

const FULL_DAY_ABSENCE_OFFSET_MINUTES = 30;

export async function listEventsAction(config: ProfileConfig, args: ParsedArgsList): Promise<void> {
  const accessToken = await authenticate(args.profile);

  if (args.other) {
    await showOtherUsers(accessToken, args.teamPrefixes);
    return;
  }

  await showCurrentUser(config, accessToken, args);
}

async function showCurrentUser(config: ProfileConfig, accessToken: string, args?: ParsedArgsList) {
  const { isoStart, isoEnd, label } = getMonthRangePrague(args?.month, args?.previousMonth);
  const range: MonthRange = { isoStart, isoEnd, rangeLabel: label };
  const detail = args?.detail;

  term.cyan(`Fetching events for ${label}...\n`);

  if (detail) {
    console.log("Fetching event details...");
  }

  const result = await getMonthEvents(config, accessToken, range, {
    includeNotes: detail,
    clientFilter: args?.client,
  });

  if (result.allEvents.length === 0) {
    term.red("No events found.\n");
    return;
  }

  renderEventsTable(result, detail);
  renderTotals(result);
}

async function showOtherUsers(accessToken: string, teamPrefixes?: string[]) {
  const allEvents = await getOtherUsersAbsencesToday(accessToken, teamPrefixes);

  if (allEvents.length === 0) {
    term.red("No absences found.\n");
    return;
  }

  renderOtherUsersTable(allEvents);
}

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderEventsTable(result: MonthEvents, detail?: boolean) {
  const { allEvents, scheduledEvents, eventNotes } = result;

  const headers = detail
    ? ["Date", "Total", "Time", "Type", "Client/Absence", "Project/Details", "Note"]
    : ["Date", "Total", "Time", "Type", "Client/Absence", "Project/Details"];

  const tableData: string[][] = [headers];

  // Compute total minutes per day
  const totalMinutesByDate: Record<string, number> = {};
  allEvents.forEach((event) => {
    const startTime = DateTime.fromISO(event.started_at).setZone("Europe/Prague");
    const endTime = DateTime.fromISO(event.ended_at).setZone("Europe/Prague");
    let durationMinutes = calculateDurationMinutes(startTime, endTime);

    const isFullDay = event.type === "absence" && event.event_type === "full_day";
    if (isFullDay) {
      durationMinutes -= 30;
    }

    const dateKey = startTime.toFormat("dd.MM.yyyy ccc");
    totalMinutesByDate[dateKey] = (totalMinutesByDate[dateKey] || 0) + Math.max(0, durationMinutes);
  });

  const visited: Record<string, boolean> = {};
  const fmtHoursLabel = (mins: number) => `${formatHours(mins)} hours`;

  allEvents.forEach((event) => {
    const startTime = DateTime.fromISO(event.started_at).setZone("Europe/Prague");
    const endTime = DateTime.fromISO(event.ended_at).setZone("Europe/Prague");

    const date = startTime.toFormat("dd.MM.yyyy ccc");
    const timeRange = `${startTime.toFormat("HH:mm")}-${endTime.toFormat("HH:mm")}`;
    const typeIndicator = event.type === "scheduled" ? "Work" : "Absence";

    const truncatedClient =
      event.displayClient.length > 25 ? event.displayClient.substring(0, 22) + "..." : event.displayClient;
    const truncatedProject =
      event.displayProject.length > 25 ? event.displayProject.substring(0, 22) + "..." : event.displayProject;

    const totalForDay = visited[date] ? "" : fmtHoursLabel(totalMinutesByDate[date] || 0);

    const row = [visited[date] ? "" : date, totalForDay, timeRange, typeIndicator, truncatedClient, truncatedProject];

    if (detail) {
      const note = (event as any).uuid ? eventNotes[(event as any).uuid] || "" : "";
      const truncatedNote = note.length > 40 ? note.substring(0, 37) + "..." : note;
      row.push(truncatedNote);
    }

    tableData.push(row);

    visited[date] = true;
  });

  term.table(tableData, {
    hasBorder: true,
    contentHasMarkup: true,
    borderChars: "lightRounded",
    width: detail ? 140 : 100,
    fit: true,
  });
}

function renderTotals(result: MonthEvents) {
  const { allEvents, scheduledEvents, expandedAbsenceEvents } = result;

  let totalLogMinutes = 0;
  let totalAbsenceMinutes = 0;

  allEvents.forEach((event) => {
    const startTime = DateTime.fromISO(event.started_at).setZone("Europe/Prague");
    const endTime = DateTime.fromISO(event.ended_at).setZone("Europe/Prague");
    let durationMinutes = calculateDurationMinutes(startTime, endTime);

    const isFullDay = event.type === "absence" && event.event_type === "full_day";
    if (isFullDay) {
      durationMinutes -= FULL_DAY_ABSENCE_OFFSET_MINUTES;
    }

    if (event.type === "scheduled") {
      totalLogMinutes += durationMinutes;
    } else {
      totalAbsenceMinutes += durationMinutes;
    }
  });

  const logHours = totalLogMinutes / 60;
  const absenceHours = totalAbsenceMinutes / 60;

  const totalLogHours = Number.isInteger(logHours) ? logHours.toString() : logHours.toFixed(1);
  const totalAbsenceHours = Number.isInteger(absenceHours) ? absenceHours.toString() : absenceHours.toFixed(1);

  term(
    `\nTotal: ${allEvents.length} events (${scheduledEvents.length} work, ${expandedAbsenceEvents.length} absence)\n` +
      `Hours: ${totalLogHours}h of logs, ${totalAbsenceHours}h of absences\n`,
  );
}

function renderOtherUsersTable(allEvents: OtherUserAbsence[]) {
  const headers = ["Who", "Team", "Type", "From", "Today", "Ends"];
  const tableData: string[][] = [headers];

  allEvents.forEach((event) => {
    const startTime = DateTime.fromISO(event.started_at).setZone("Europe/Prague");
    const endTime = DateTime.fromISO(event.ended_at).setZone("Europe/Prague");

    const startDateFormatted = startTime.toFormat("dd.MM.yyyy ccc");
    const timeRange = `${startTime.toFormat("HH:mm")}-${endTime.toFormat("HH:mm")}`;

    const today = DateTime.now().setZone("Europe/Prague").startOf("day");
    const endDay = endTime.startOf("day");
    const endsToday = endDay.equals(today);

    let endDateFormatted = "";
    if (!endsToday) {
      endDateFormatted = endTime.toFormat("dd.MM.yyyy ccc");
    }

    tableData.push([
      event.user.full_name,
      event.user?.team?.name ?? "-",
      event.user_absence_event.absence_event_name,
      startDateFormatted,
      timeRange,
      endDateFormatted,
    ]);
  });

  term.table(tableData, {
    hasBorder: true,
    contentHasMarkup: true,
    borderChars: "lightRounded",
    width: 100,
    fit: true,
  });

  term("\n");
}
