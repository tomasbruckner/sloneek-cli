import { DateTime } from "luxon";
import { terminal as term } from "terminal-kit";
import { authenticate } from "../utils/login";
import { fetchCalendarOptions, getEvents, getClients } from "../utils/api";
import { calculateDurationMinutes } from "../utils/time";

function getMonthRangePrague(monthArg?: string, previousMonth?: boolean) {
  const tz = "Europe/Prague";
  const now = DateTime.now().setZone(tz);

  let target = now.startOf("month");

  // Parse explicit month if provided
  if (monthArg && typeof monthArg === "string") {
    const m = monthArg.trim();
    let year: number | undefined;
    let month: number | undefined;

    // Accept formats like YYYY-MM or YYYY/MM
    let match = m.match(/^(\d{4})[-\/]?(\d{1,2})$/);
    if (match) {
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
    }
    // Accept MM.YYYY or M.YYYY or MM-YYYY
    if (!month) {
      match = m.match(/^(\d{1,2})[.\/-](\d{4})$/);
      if (match) {
        month = parseInt(match[1], 10);
        year = parseInt(match[2], 10);
      }
    }
    // Accept M or MM => current year
    if (!month && /^\d{1,2}$/.test(m)) {
      month = parseInt(m, 10);
      year = now.year;
    }

    if (year && month && month >= 1 && month <= 12) {
      target = DateTime.fromObject({ year, month, day: 1 }, { zone: tz }).startOf("day");
    }
  }

  if (!monthArg && previousMonth) {
    target = target.minus({ months: 1 });
  }

  const start = target.startOf("month");
  const end = target.endOf("month").startOf("second");

  return {
    isoStart: start.toISO({ suppressMilliseconds: true }) ?? "",
    isoEnd: end.toISO({ suppressMilliseconds: true }) ?? "",
    label: target.toFormat("LLLL yyyy"),
  };
}

export async function teamReportAction(_config: ProfileConfig, args: ParsedArgsTeamReport): Promise<void> {
  const accessToken = await authenticate(args.profile);

  // Helper to pick from list using gridMenu
  const pickFromList = async (title: string, items: string[]): Promise<number> => {
    if (!items.length) return -1;
    term("\n");
    term.cyan(`${title}\n`);
    const res: any = await new Promise((resolve) => (term as any).gridMenu(items, { cancelable: true }, (_err: any, r: any) => resolve(r)));
    if (!res || typeof res.selectedIndex !== "number") {
      throw new Error("canceled");
    }
    return res.selectedIndex;
  };

  // Resolve client selection if missing or ambiguous
  let clientNameFilter = (args.client || "").trim();
  let selectedClient: Client | null = null;

  // If client not provided, fetch and let user choose one
  const clientsResp = await getClients(_config.user.uuid, accessToken);
  const clients = clientsResp.data || [];

  const matchClients = (needle: string): Client[] => {
    const n = needle.toLowerCase();
    return clients.filter((c: any) => (c.name || "").toLowerCase().includes(n));
  };

  if (clientNameFilter) {
    const matching = matchClients(clientNameFilter);
    if (matching.length === 1) {
      selectedClient = matching[0];
    } else if (matching.length > 1) {
      const idx = await pickFromList("Multiple clients match, select one:", matching.map((c) => c.name));
      selectedClient = matching[idx];
    } else {
      term.yellow("No client matches the provided filter. Please choose from all clients.\n");
    }
  }

  if (!selectedClient) {
    const idx = await pickFromList("Select a client:", clients.map((c: any) => c.name));
    selectedClient = clients[idx];
  }

  if (!selectedClient) {
    term.red("No client selected.\n");
    return;
  }

  // Determine project filters
  let projectNeedles: string[] | undefined = args.projects && args.projects.length ? args.projects : undefined;

  if (!projectNeedles || projectNeedles.length === 0) {
    // Let user select projects from the selected client
    const projects = selectedClient.projects || [];
    if (!projects.length) {
      term.yellow("Selected client has no projects.\n");
      return;
    }

    term("\n");
    term.cyan("Available projects (enter numbers separated by commas to select; empty = all):\n");
    projects.forEach((p, i) => {
      term(`${String(i + 1).padStart(2, " ")}. ${p.project_name}\n`);
    });

    const input: any = await new Promise((resolve) => (term as any).inputField({ cancelable: true }, (_err: any, r: any) => resolve(r)));
    if (input === undefined) {
      throw new Error("canceled");
    }
    const txt = String(input || "").trim();
    if (!txt) {
      // All projects
      projectNeedles = projects.map((p) => p.project_name);
    } else {
      const indices = txt
        .split(/[,\s]+/)
        .map((s: string) => parseInt(s, 10))
        .filter((n: number) => !isNaN(n) && n >= 1 && n <= projects.length);
      if (!indices.length) {
        term.red("No valid selection.\n");
        return;
      }
      projectNeedles = indices.map((n) => projects[n - 1].project_name);
    }
  }

  term.cyan("Fetching users (calendar options)...\n");
  const options = await fetchCalendarOptions(accessToken);
  const usersGroups = options?.data?.users ?? [];

  const usersUuids: string[] = [];
  usersGroups.forEach((group) => {
    (group.users || []).forEach((u) => {
      const id = (u as any).uuid || (u as any).value;
      if (id) usersUuids.push(id);
    });
  });

  if (usersUuids.length === 0) {
    term.red("No users found in calendar options.\n");
    return;
  }

  const { isoStart, isoEnd, label } = getMonthRangePrague(args.month, args.previousMonth);

  term.cyan(`Fetching scheduled events for ${label}...\n`);
  const resp = await getEvents(
    {
      interval_starting_at: isoStart,
      interval_ending_at: isoEnd,
      users_uuids: usersUuids,
      quick_filter: null,
    },
    accessToken,
  );

  const events: ScheduledEvent[] = (resp.data?.events || []).map((event: any): ScheduledEvent => ({
    ...event,
    type: "scheduled",
    displayClient: event.client?.name || "N/A",
    displayProject: event.client_project?.project_name || "N/A",
    displayType: "Work",
  }));

  const needles = (projectNeedles || []).map((p) => p.toLowerCase());
  const clientFilterLc = (selectedClient?.name || "").toLowerCase();

  // Aggregate minutes per project (by actual project name in event), restrict to selected client
  const perProjectMinutes: Record<string, number> = {};
  let totalMinutes = 0;

  events.forEach((ev) => {
    const evClient = (ev.client?.name || ev.displayClient || "").toLowerCase();
    if (clientFilterLc && !evClient.includes(clientFilterLc)) return;

    const projectName = ev.client_project?.project_name || ev.displayProject || "";
    const pnLc = projectName.toLowerCase();
    const match = needles.length === 0 || needles.some((n) => pnLc.includes(n));
    if (!match) return;

    const start = DateTime.fromISO(ev.started_at);
    const end = DateTime.fromISO(ev.ended_at);
    const minutes = calculateDurationMinutes(start, end);

    perProjectMinutes[projectName] = (perProjectMinutes[projectName] || 0) + minutes;
    totalMinutes += minutes;
  });

  if (totalMinutes === 0) {
    term.yellow("No matching project worklogs found in the selected interval.\n");
    return;
  }

  // Print results
  term("\n");
  term.cyan("Team project hours summary\n");
  term.cyan(`Interval: ${label} (${isoStart} .. ${isoEnd})\n`);
  term.cyan(`Client: ${selectedClient?.name}\n`);
  term.cyan(`Projects filter: ${(projectNeedles || []).join(", ")}\n\n`);

  const entries = Object.entries(perProjectMinutes).sort((a, b) => b[1] - a[1]);
  entries.forEach(([name, minutes]) => {
    const hours = (minutes / 60).toFixed(2);
    term.green(`- ${name}: ${hours} h\n`);
  });

  term("\n");
  term.bold(`Total: ${(totalMinutes / 60).toFixed(2)} h\n`);
}