import { DateTime } from "luxon";
import { fetchCalendarOptions, getEvents } from "../utils/api";
import { calculateDurationMinutes, resolveCalendarUserId } from "../utils/time";

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface TeamProjectTotals {
  projectName: string;
  totalMinutes: number;
  perUser: Array<{ userName: string; minutes: number }>;
}

// ─── getTeamProjectReport ─────────────────────────────────────────────────────

/**
 * Fetch all scheduled events for the given month range, filter by client name
 * (substring, case-insensitive) and project matchers (substring, case-insensitive),
 * then aggregate total minutes and per-user minutes per matched project.
 *
 * @param accessToken   Bearer token for the Sloneek API
 * @param range         Month range with isoStart / isoEnd
 * @param clientNameFilter  Substring to match against event client names (case-insensitive)
 * @param projectMatchers   Substrings to match against project names (case-insensitive). Empty = all projects.
 */
export async function getTeamProjectReport(
  accessToken: string,
  range: MonthRange,
  clientNameFilter: string,
  projectMatchers: string[],
): Promise<TeamProjectTotals[]> {
  // Resolve all user UUIDs from calendar options (same as action layer)
  const options = await fetchCalendarOptions(accessToken);
  const usersGroups = options?.data?.users ?? [];

  const usersUuids: string[] = [];
  usersGroups.forEach((group) => {
    (group.users || []).forEach((u) => {
      const id = resolveCalendarUserId(u);
      if (id) usersUuids.push(id);
    });
  });

  if (usersUuids.length === 0) {
    return [];
  }

  const resp = await getEvents(
    {
      interval_starting_at: range.isoStart,
      interval_ending_at: range.isoEnd,
      users_uuids: usersUuids,
      quick_filter: null,
    },
    accessToken,
  );

  const events = resp.data?.events ?? [];

  const needles = projectMatchers.map((p) => p.toLowerCase());
  const clientFilterLc = clientNameFilter.toLowerCase();

  // Aggregate minutes per project name, and per user within each project
  const perProjectMinutes: Record<string, number> = {};
  const perProjectPerUser: Record<string, Record<string, number>> = {};

  events.forEach((ev) => {
    const evClient = (ev.client?.name || "").toLowerCase();
    if (clientFilterLc && !evClient.includes(clientFilterLc)) return;

    const projectName = ev.client_project?.project_name || "";
    const pnLc = projectName.toLowerCase();
    const match = needles.length === 0 || needles.some((n) => pnLc.includes(n));
    if (!match) return;

    const start = DateTime.fromISO(ev.started_at);
    const end = DateTime.fromISO(ev.ended_at);
    const minutes = calculateDurationMinutes(start, end);

    perProjectMinutes[projectName] = (perProjectMinutes[projectName] || 0) + minutes;

    // Per-user breakdown (enrichment over original action)
    const userName = ev.user?.full_name || ev.user?.name || "Unknown";
    if (!perProjectPerUser[projectName]) perProjectPerUser[projectName] = {};
    perProjectPerUser[projectName][userName] = (perProjectPerUser[projectName][userName] || 0) + minutes;
  });

  return Object.entries(perProjectMinutes).map(([projectName, totalMinutes]) => {
    const userMap = perProjectPerUser[projectName] || {};
    const perUser = Object.entries(userMap).map(([userName, minutes]) => ({ userName, minutes }));
    return { projectName, totalMinutes, perUser };
  });
}
