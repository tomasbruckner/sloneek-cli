import { DateTime } from "luxon";
import { getAbsences, getEvents, login } from "../utils/api";
import {
  getCurrentDay,
  getCurrentMonth,
  getStartDay,
  isSameDay,
  isWorkDay,
} from "../utils/time";

export async function listEventsAction(
  config: Config,
  args: ParsedArgsList
): Promise<void> {
  const loginInfo = await login(
    config.credentials.email,
    config.credentials.password
  );

  if (args.other) {
    await showOtherUsers(loginInfo, args.teamPrefix);
    return;
  }

  await showCurrentUser(config, loginInfo.access_token);
}

async function showCurrentUser(config: Config, accessToken: string) {
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
      accessToken
    ),
    getAbsences(
      {
        interval_starting_at: isoStart,
        interval_ending_at: isoEnd,
        users_uuids: [config.user.uuid],
        planning_events_uuids: [config.planningEvent.detail_uuid],
        quick_filter: null,
      },
      accessToken
    ),
  ]);

  const scheduledEvents: ScheduledEvent[] = (
    scheduledResponse.data?.events || []
  ).map(
    (event: any): ScheduledEvent => ({
      ...event,
      type: "scheduled",
      displayClient: event.client?.name || "N/A",
      displayProject: event.client_project?.project_name || "N/A",
      displayType: "Work",
    })
  );

  const expandedAbsenceEvents: AbsenceEvent[] = [];

  (absenceResponse.data?.events || []).forEach((event) => {
    if (event.type === "in_work") {
      return;
    }

    // If it's a single day absence
    if (isSameDay(event.started_at, event.ended_at)) {
      // Only include if it's not a weekend
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
      // Multi-day absence - create separate entries for each weekday
      let currentDate = getStartDay(event.started_at);
      const lastDate = getStartDay(event.ended_at);

      while (currentDate <= lastDate) {
        // Only include weekdays (Monday=1 to Friday=5)
        if (currentDate.weekday <= 5) {
          const dayEndTime = currentDate.plus({
            hours: 23,
            minutes: 59,
            seconds: 59,
          });

          expandedAbsenceEvents.push({
            ...event,
            started_at: currentDate.toISO()!,
            ended_at: dayEndTime.toISO()!,
            type: "absence",
            displayClient: "—",
            displayProject:
              event.user_absence_event?.absence_event_name || "N/A",
            displayType: "Absence",
          });
        }
        currentDate = currentDate.plus({ days: 1 });
      }
    }
  });

  const allEvents: ApiEvent[] = [
    ...scheduledEvents,
    ...expandedAbsenceEvents,
  ].sort((a, b) => {
    return new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
  });

  if (allEvents.length === 0) {
    console.log("No events found.");
    return;
  }

  console.log(
    `\nFound ${allEvents.length} events (${scheduledEvents.length} work, ${expandedAbsenceEvents.length} absence):\n`
  );
  console.log(
    "Date           | Time        | Type     | Client/Absence            | Project/Details"
  );
  console.log(
    "---------------|-------------|----------|---------------------------|---------------------------"
  );

  const visited: Record<string, boolean> = {};
  allEvents.forEach((event) => {
    const startTime = DateTime.fromISO(event.started_at).setZone(
      "Europe/Prague"
    );
    const endTime = DateTime.fromISO(event.ended_at).setZone("Europe/Prague");

    const date = startTime.toFormat("dd.MM.yyyy ccc");
    const timeRange = `${startTime.toFormat("HH:mm")}-${endTime.toFormat(
      "HH:mm"
    )}`;
    const typeIndicator = event.type === "scheduled" ? "Work" : "Absence";

    // Truncate long names for better table formatting
    const truncatedClient =
      event.displayClient.length > 25
        ? event.displayClient.substring(0, 22) + "..."
        : event.displayClient;
    const truncatedProject =
      event.displayProject.length > 25
        ? event.displayProject.substring(0, 22) + "..."
        : event.displayProject;

    console.log(
      `${visited[date] ? "              " : date} | ${timeRange.padEnd(
        11
      )} | ${typeIndicator.padEnd(8)} | ${truncatedClient.padEnd(
        25
      )} | ${truncatedProject}`
    );

    visited[date] = true;
  });

  console.log(
    `\nTotal: ${allEvents.length} events (${scheduledEvents.length} work, ${expandedAbsenceEvents.length} absence)`
  );
}

async function showOtherUsers(loginInfo: LoginInfo, teamPrefix: string) {
  const { isoStart, isoEnd } = getCurrentDay();

  const allEvents =
    (
      await getAbsences(
        {
          interval_starting_at: isoStart,
          interval_ending_at: isoEnd,
          quick_filter: null,
        },
        loginInfo.access_token
      )
    ).data.events ?? [];

  if (allEvents.length === 0) {
    console.log("No absences found.");
    return;
  }

  console.log(
    "Who                    | Team                       | Date           | Time        | Type                   |"
  );
  console.log(
    "-----------------------|----------------------------|----------------|-------------|------------------------|"
  );

  const date = DateTime.fromISO(isoStart).toFormat("dd.MM.yyyy ccc")

  allEvents
    .filter((x) => x.user.team.name.includes(teamPrefix))
    .forEach((event) => {
      const startTime = DateTime.fromISO(event.started_at).setZone(
        "Europe/Prague"
      );
      const endTime = DateTime.fromISO(event.ended_at).setZone("Europe/Prague");

      const timeRange = `${startTime.toFormat("HH:mm")}-${endTime.toFormat(
        "HH:mm"
      )}`;

      console.log(
        `${event.user.full_name.padEnd(22)} | ${event.user.team.name.padEnd(26)} | ${date} | ${timeRange.padEnd(
          11
        )} | ${event.user_absence_event.absence_event_name.padEnd(18)}`
      );
    });
}
