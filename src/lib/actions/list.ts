import { DateTime } from "luxon";
import { terminal as term } from "terminal-kit";
import { getAbsences, getEvents, login } from "../utils/api";
import {
  calculateDurationMinutes,
  getCurrentDay,
  getCurrentMonth,
  getStartDay,
  isSameDay,
  isWorkDay,
} from "../utils/time";

export async function listEventsAction(config: ProfileConfig, args: ParsedArgsList): Promise<void> {
  const loginInfo = await login(config.credentials.email, config.credentials.password);

  if (args.other) {
    await showOtherUsers(loginInfo, args.teamPrefix);
    return;
  }

  await showCurrentUser(config, loginInfo.access_token);
}

async function showCurrentUser(config: ProfileConfig, accessToken: string) {
  const { now, isoStart, isoEnd } = getCurrentMonth();

  console.log(`Fetching events for ${now.toFormat("MMMM yyyy")}...`);

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

  const scheduledEvents: ScheduledEvent[] = (scheduledResponse.data?.events || []).map(
    (event: any): ScheduledEvent => ({
      ...event,
      type: "scheduled",
      displayClient: event.client?.name || "N/A",
      displayProject: event.client_project?.project_name || "N/A",
      displayType: "Work",
    }),
  );

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

  const allEvents: ApiEvent[] = [...scheduledEvents, ...expandedAbsenceEvents].sort((a, b) => {
    return new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
  });

  if (allEvents.length === 0) {
    term.red("No events found.\n");
    return;
  }

  // Create a table with headers
  const headers = ["Date", "Time", "Type", "Client/Absence", "Project/Details"];

  // Create table data
  const tableData = [headers];

  const visited: Record<string, boolean> = {};
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

    tableData.push([visited[date] ? "" : date, timeRange, typeIndicator, truncatedClient, truncatedProject]);

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
    const isFullDay = event.type === "absence" && (event as any).event_type === "full_day";

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

async function showOtherUsers(loginInfo: LoginInfo, teamPrefix: string) {
  const { isoStart, isoEnd } = getCurrentDay();

  const allEvents = (
    (
      await getAbsences(
        {
          interval_starting_at: isoStart,
          interval_ending_at: isoEnd,
          quick_filter: null,
        },
        loginInfo.access_token,
      )
    ).data.events ?? []
  )
    .filter((x) => !x.user?.team?.name || x.user.team.name.includes(teamPrefix))
    .sort((a, b) => a.user.full_name.localeCompare(b.user.full_name));

  if (allEvents.length === 0) {
    term.red("No absences found.\n");
    return;
  }

  // Create a table with headers
  const headers = ["Who", "Team", "Type", "Date", "Time", "Ends"];

  // Create table data
  const tableData = [headers];

  const date = DateTime.fromISO(isoStart).toFormat("dd.MM.yyyy ccc");

  allEvents.forEach((event) => {
    const startTime = DateTime.fromISO(event.started_at).setZone("Europe/Prague");
    const endTime = DateTime.fromISO(event.ended_at).setZone("Europe/Prague");

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
      date,
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
