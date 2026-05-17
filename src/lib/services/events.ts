import {
  getEvents,
  getAbsences,
  getEventDetail,
  fetchAbsenceReportCalendarOptions,
  fetchScheduledEventDetail,
  fetchAbsenceDetail,
} from "../utils/api";
import { getCurrentDay, getStartDay, isSameDay, isWorkDay } from "../utils/time";

// ─── MonthEvents ──────────────────────────────────────────────────────────────

export interface MonthEventsOptions {
  includeNotes?: boolean;
  clientFilter?: string;
  onProgress?: ProgressCallback;
}

export interface MonthEvents {
  scheduledEvents: ScheduledEvent[];
  expandedAbsenceEvents: AbsenceEvent[];
  allEvents: ApiEvent[];
  eventNotes: Record<string, string>;
  rangeLabel: string;
  isoStart: string;
  isoEnd: string;
}

export async function getMonthEvents(
  profileConfig: ProfileConfig,
  accessToken: string,
  range: MonthRange,
  opts?: MonthEventsOptions,
): Promise<MonthEvents> {
  const { isoStart, isoEnd, rangeLabel } = range;

  const [scheduledResponse, absenceResponse] = await Promise.all([
    getEvents(
      {
        interval_starting_at: isoStart,
        interval_ending_at: isoEnd,
        users_uuids: [profileConfig.user.uuid],
        quick_filter: null,
      },
      accessToken,
    ),
    getAbsences(
      {
        interval_starting_at: isoStart,
        interval_ending_at: isoEnd,
        users_uuids: [profileConfig.user.uuid],
        planning_events_uuids: [profileConfig.planningEvent.detail_uuid],
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

  // Apply clientFilter (case-insensitive substring on client name)
  const clientFilter = opts?.clientFilter?.toLowerCase().trim();
  if (clientFilter) {
    scheduledEvents = scheduledEvents.filter((ev) =>
      (ev.client?.name || ev.displayClient || "").toLowerCase().includes(clientFilter),
    );
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

  // Build final events list; when clientFilter is active, only include scheduled events
  const allEvents: ApiEvent[] = (
    clientFilter ? scheduledEvents : [...scheduledEvents, ...expandedAbsenceEvents]
  ).sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  // Fetch notes for scheduled events when includeNotes is set
  const eventNotes: Record<string, string> = {};
  if (opts?.includeNotes) {
    const total = scheduledEvents.length;
    let done = 0;
    for (const event of scheduledEvents) {
      try {
        const detailResponse = await getEventDetail(event.uuid, accessToken);
        const note = detailResponse.data?.scheduled_event_data?.note;
        if (note) {
          eventNotes[event.uuid] = note;
        }
      } catch {
        // Swallow failed detail fetch — continue processing
      }
      done += 1;
      opts.onProgress?.(done, total);
    }
  }

  return {
    scheduledEvents,
    expandedAbsenceEvents,
    allEvents,
    eventNotes,
    rangeLabel,
    isoStart,
    isoEnd,
  };
}

// ─── OtherUsersAbsencesToday ──────────────────────────────────────────────────

export interface OtherUserAbsence {
  user: { full_name: string; team?: { name: string } };
  user_absence_event: { absence_event_name: string };
  started_at: string;
  ended_at: string;
}

export async function getOtherUsersAbsencesToday(
  accessToken: string,
  teamPrefixes?: string[],
): Promise<OtherUserAbsence[]> {
  const { isoStart, isoEnd } = getCurrentDay();

  // Fetch absence report calendar options to get all user UUIDs
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

  return allEvents as OtherUserAbsence[];
}

// ─── UserMonthlyDetail ────────────────────────────────────────────────────────

export interface ScheduledEventWithNote {
  kind: "scheduled";
  uuid: string;
  started_at: string;
  ended_at: string;
  project: string;
  note: string;
  info: string;
}

export interface AbsenceWithNote {
  kind: "absence";
  uuid: string;
  started_at: string;
  ended_at: string;
  event_type?: "full_day" | "half_day";
  note: string;
  info: string;
}

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
): Promise<UserMonthlyDetail> {
  const { isoStart, isoEnd, rangeLabel } = range;

  const [evResp, abResp] = await Promise.all([
    getEvents(
      {
        interval_starting_at: isoStart,
        interval_ending_at: isoEnd,
        users_uuids: [userUuid],
        quick_filter: null,
      },
      accessToken,
    ),
    getAbsences(
      {
        interval_starting_at: isoStart,
        interval_ending_at: isoEnd,
        users_uuids: [userUuid],
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
    project: (e.client_project?.project_name ?? "") as string,
    note: "",
    info: "",
  }));

  const abs = (abResp?.data?.events || [])
    .filter((a: any) => a.type !== "in_work")
    .map((a: any) => ({
      kind: "absence" as const,
      uuid: a.uuid as string,
      started_at: a.started_at as string,
      ended_at: a.ended_at as string,
      event_type: a.event_type as "full_day" | "half_day" | undefined,
      note: "",
      info: "",
    }));

  // Fetch detail notes; silently swallow failures and report progress
  const notesMap: Record<string, string> = {};
  const infoMap: Record<string, string> = {};

  const total = sched.length + abs.length;
  let done = 0;
  const bump = () => {
    done += 1;
    onProgress?.(done, total);
  };

  const schedPromises = sched.map((item) =>
    fetchScheduledEventDetail(accessToken, item.uuid)
      .then((d) => {
        notesMap[item.uuid] = d?.data?.scheduled_event_data?.note ?? "";
        infoMap[item.uuid] = d?.data?.scheduled_event_data?.client_project?.project_name ?? "";
      })
      .catch(() => {
        notesMap[item.uuid] = "";
        infoMap[item.uuid] = "";
      })
      .finally(bump),
  );

  const absPromises = abs.map((item) =>
    fetchAbsenceDetail(accessToken, item.uuid)
      .then((d) => {
        notesMap[item.uuid] = d?.data?.absence_data?.note ?? "";
        infoMap[item.uuid] = d?.data?.absence_data?.user_absence_event?.absence_event_name ?? "";
      })
      .catch(() => {
        notesMap[item.uuid] = "";
        infoMap[item.uuid] = "";
      })
      .finally(bump),
  );

  await Promise.all([...schedPromises, ...absPromises]);

  const scheduledEvents: ScheduledEventWithNote[] = sched.map((item) => ({
    ...item,
    note: notesMap[item.uuid] ?? "",
    info: infoMap[item.uuid] ?? "",
  }));

  const absences: AbsenceWithNote[] = abs.map((item) => ({
    ...item,
    note: notesMap[item.uuid] ?? "",
    info: infoMap[item.uuid] ?? "",
  }));

  return {
    scheduledEvents,
    absences,
    rangeLabel,
  };
}
