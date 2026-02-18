import { DateTime } from "luxon";
import { terminal as term } from "terminal-kit";
import { getAbsences, getEvents, fetchAbsenceReportCalendarOptions } from "../utils/api";
import { authenticate } from "../utils/login";
import {
  calculateDurationMinutes,
  formatHours,
  getCurrentDay,
  getCurrentMonth,
  getStartDay,
  isSameDay,
  isWorkDay,
} from "../utils/time";

export async function listEventsAction(config: ProfileConfig, args: ParsedArgsList): Promise<void> {
  const accessToken = await authenticate(args.profile);

  if (args.other) {
    await showOtherUsers(accessToken, args.teamPrefixes);
    return;
  }

  await showCurrentUser(config, accessToken, args);
}

async function showCurrentUser(config: ProfileConfig, accessToken: string, args?: ParsedArgsList) {
  const { now, isoStart, isoEnd } = getCurrentMonth();

  term.cyan(`Fetching events for ${now.toFormat("MMMM yyyy")}...\n`);

  const [scheduledResponse, absenceResponse] = await Promise.all([
    getEvents(
      {
        interval_starting_at: isoStart,
        interval_ending_at: isoEnd,
        users_uuids: [config.user.uuid],
        quick_filter: null,
      },
      accessToken,
    ),
    getAbsences(
      {
        interval_starting_at: isoStart,
        interval_ending_at: isoEnd,
        users_uuids: [config.user.uuid],
        planning_events_uuids: [config.planningEvent.detail_uuid],
        quick_filter: null,
      },
      accessToken,
    ),
  ]);

  let scheduledEvents: ScheduledEvent[] = (scheduledResponse.data?.events || []).map(
    (event: any): ScheduledEvent => ({
      ...event,
      type: "scheduled",
      displayClient: event.client?.name || "N/A",
      displayProject: event.client_project?.project_name || "N/A",
      displayType: "Work",
    }),
  );

  // If --client is provided, filter only scheduled events for matching client name (case-insensitive)
  const clientFilter = args?.client?.toLowerCase().trim();
  if (clientFilter) {
    scheduledEvents = scheduledEvents.filter((ev) => (ev.client?.name || ev.displayClient || "").toLowerCase().includes(clientFilter));
  }

  const expandedAbsenceEvents: AbsenceEvent[] = [];

  (absenceResponse.data?.events || []).forEach((event) => {
    if (event.type === "in_work") {
      return;
    }

    if (isSameDay(event.started_at, event.ended_at)) {
      if (isWorkDay(event.started_at)) {
        expandedAbsenceEvents.push({
          ...event,
          type: "absence",
          displayClient: "—",
          displayProject: event.user_absence_event?.absence_event_name || "N/A",
          displayType: "Absence",
        });
      }
    } else {
      let currentDate = getStartDay(event.started_at);
      const lastDate = getStartDay(event.ended_at);

      while (currentDate <= lastDate) {
        if (currentDate.weekday <= 5) {
          const dayEndTime = currentDate.plus({
            hours: 23,
            minutes: 59,
            seconds: 59,
          });

          expandedAbsenceEvents.push({
            ...event,
            started_at: currentDate.toISO({ suppressMilliseconds: true })!,
            ended_at: dayEndTime.toISO({ suppressMilliseconds: true })!,
            type: "absence",
            displayClient: "—",
            displayProject: event.user_absence_event?.absence_event_name || "N/A",
            displayType: "Absence",
          });
        }
        currentDate = currentDate.plus({ days: 1 });
      }
    }
  });

  // Build final events list; when client filter is active, we only display scheduled (work) events
  const allEvents: ApiEvent[] = (
    clientFilter ? scheduledEvents : [...scheduledEvents, ...expandedAbsenceEvents]
  ).sort((a, b) => {
    return new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
  });

  if (allEvents.length === 0) {
    term.red("No events found.\n");
    return;
  }

  // Create a table with headers
  const headers = ["Date", "Total", "Time", "Type", "Client/Absence", "Project/Details"];

  // Create table data
  const tableData = [headers];

  // Compute total minutes per day with the same logic as monthly totals
  const totalMinutesByDate: Record<string, number> = {};
  allEvents.forEach((event) => {
    const startTime = DateTime.fromISO(event.started_at).setZone("Europe/Prague");
    const endTime = DateTime.fromISO(event.ended_at).setZone("Europe/Prague");
    let durationMinutes = calculateDurationMinutes(startTime, endTime);

    // Apply the same 30-minute deduction for full-day absences
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

    // Truncate long names for better table formatting
    const truncatedClient =
      event.displayClient.length > 25 ? event.displayClient.substring(0, 22) + "..." : event.displayClient;
    const truncatedProject =
      event.displayProject.length > 25 ? event.displayProject.substring(0, 22) + "..." : event.displayProject;

    const totalForDay = visited[date] ? "" : fmtHoursLabel(totalMinutesByDate[date] || 0);

    tableData.push([visited[date] ? "" : date, totalForDay, timeRange, typeIndicator, truncatedClient, truncatedProject]);

    visited[date] = true;
  });

  // Display the table
  term.table(tableData, {
    hasBorder: true,
    contentHasMarkup: true,
    borderChars: "lightRounded",
    width: 100,
    fit: true,
  });

  // Calculate total hours for logs and absences
  let totalLogMinutes = 0;
  let totalAbsenceMinutes = 0;

  allEvents.forEach((event) => {
    const startTime = DateTime.fromISO(event.started_at).setZone("Europe/Prague");
    const endTime = DateTime.fromISO(event.ended_at).setZone("Europe/Prague");
    let durationMinutes = calculateDurationMinutes(startTime, endTime);

    // Check if this is a full-day absence by event_type
    const isFullDay = event.type === "absence" && event.event_type === "full_day";

    // Subtract 30 minutes from full-day absences
    if (isFullDay) {
      durationMinutes -= 30;
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

async function showOtherUsers(accessToken: string, teamPrefixes?: string[]) {
  const { isoStart, isoEnd } = getCurrentDay();

  // Fetch absence report calendar options to get all users UUIDs
  const absCalOpts = await fetchAbsenceReportCalendarOptions(accessToken);
  const usersUuids: string[] = [];
  for (const group of absCalOpts?.data?.users_select ?? []) {
    for (const u of group.users ?? []) {
      if (u?.uuid) usersUuids.push(u.uuid);
    }
  }

  const filtersLc = (teamPrefixes || []).map((s) => s.toLowerCase());

  const allEvents = (
    (
      await getAbsences(
        {
          interval_starting_at: isoStart,
          interval_ending_at: isoEnd,
          users_uuids: usersUuids,
          quick_filter: null,
        },
        accessToken,
      )
    ).data.events ?? []
  )
    .filter((x) => {
      const teamName = x.user?.team?.name;
      if (!teamName) return true; // keep users without a team
      if (filtersLc.length === 0) return true; // no filters => include all
      const teamLc = teamName.toLowerCase();
      return filtersLc.some((f) => teamLc.includes(f));
    })
    .sort((a, b) => a.user.full_name.localeCompare(b.user.full_name));

  if (allEvents.length === 0) {
    term.red("No absences found.\n");
    return;
  }

  // Create a table with headers
  const headers = ["Who", "Team", "Type", "From", "Today", "Ends"];

  // Create table data
  const tableData = [headers];

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

  // Display the table
  term.table(tableData, {
    hasBorder: true,
    contentHasMarkup: true,
    borderChars: "lightRounded",
    width: 100,
    fit: true,
  });

  term("\n");
}
