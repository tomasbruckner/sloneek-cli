import { terminal as term } from "terminal-kit";
import { authenticate } from "../utils/login";
import { getMonthRangePrague } from "../utils/time";
import { listClients, type ClientSummary } from "../services/clients";
import { getTeamProjectReport, type TeamProjectTotals } from "../services/team-reports";

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
  let selectedClient: ClientSummary | null = null;

  // If client not provided, fetch and let user choose one
  const clients = await listClients(accessToken, _config.user.uuid);

  const matchClients = (needle: string): ClientSummary[] => {
    const n = needle.toLowerCase();
    return clients.filter((c) => (c.name || "").toLowerCase().includes(n));
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
    const idx = await pickFromList("Select a client:", clients.map((c) => c.name));
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

  const { isoStart, isoEnd, label } = getMonthRangePrague(args.month, args.previousMonth);
  const range: MonthRange = { isoStart, isoEnd, rangeLabel: label };

  term.cyan(`Fetching scheduled events for ${label}...\n`);

  const totals = await getTeamProjectReport(accessToken, range, selectedClient.name, projectNeedles || []);

  if (totals.length === 0) {
    term.yellow("No matching project worklogs found in the selected interval.\n");
    return;
  }

  renderTeamReportTable(totals, {
    label,
    isoStart,
    isoEnd,
    clientName: selectedClient.name,
    projectNeedles: projectNeedles || [],
  });
}

// ─── Local render helper ──────────────────────────────────────────────────────

interface RenderContext {
  label: string;
  isoStart: string;
  isoEnd: string;
  clientName: string;
  projectNeedles: string[];
}

function renderTeamReportTable(totals: TeamProjectTotals[], ctx: RenderContext): void {
  term("\n");
  term.cyan("Team project hours summary\n");
  term.cyan(`Interval: ${ctx.label} (${ctx.isoStart} .. ${ctx.isoEnd})\n`);
  term.cyan(`Client: ${ctx.clientName}\n`);
  term.cyan(`Projects filter: ${ctx.projectNeedles.join(", ")}\n\n`);

  const totalMinutes = totals.reduce((acc, t) => acc + t.totalMinutes, 0);

  const sorted = [...totals].sort((a, b) => b.totalMinutes - a.totalMinutes);
  sorted.forEach(({ projectName, totalMinutes: mins }) => {
    const hours = (mins / 60).toFixed(2);
    term.green(`- ${projectName}: ${hours} h\n`);
  });

  term("\n");
  term.bold(`Total: ${(totalMinutes / 60).toFixed(2)} h\n`);
}
