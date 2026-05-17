import { terminal as term } from "terminal-kit";
import { authenticate } from "../utils/login";
import { getMonthRangePrague, formatHours } from "../utils/time";
import { getReport, getReportSummary, getValidateReport } from "../services/reports";
import type { ReportEventRow, ReportSummaryRow, ReportValidateRow } from "../services/reports";

// ─── Local helpers ────────────────────────────────────────────────────────────

function resolveRange(args: ParsedArgsReport): MonthRange {
  if (args.start && args.end) {
    return {
      isoStart: args.start,
      isoEnd: args.end,
      rangeLabel: `${args.start} – ${args.end}`,
    };
  }
  const { isoStart, isoEnd, label } = getMonthRangePrague(args.month);
  return { isoStart, isoEnd, rangeLabel: label };
}

const trunc = (s: string, n = 30) => (s && s.length > n ? s.slice(0, n - 3) + "..." : s);

function renderEventTable(rows: ReportEventRow[]): void {
  if (rows.length === 0) {
    term.red("No scheduled events found for the selected interval.\n");
    return;
  }

  const headers = ["Date", "Time", "User", "Team", "Client", "Project / Title"];
  const table: string[][] = [headers];
  const visitedDate: Record<string, boolean> = {};

  for (const row of rows) {
    table.push([
      visitedDate[row.date] ? "" : row.date,
      row.time,
      trunc(row.userName, 22),
      trunc(row.team, 22),
      trunc(row.client, 22),
      trunc(row.projectOrTitle, 38),
    ]);
    visitedDate[row.date] = true;
  }

  term.table(table, {
    hasBorder: true,
    contentHasMarkup: true,
    borderChars: "lightRounded",
    width: 120,
    fit: true,
  });
  term("\n");
}

function renderSummaryTable(rows: ReportSummaryRow[]): void {
  if (rows.length === 0) {
    term.red("No users found to summarize.\n");
    return;
  }

  const headers = ["User", "Team", "Work h", "Absence h", "Total h"];
  const table: string[][] = [headers];

  const sorted = [...rows].sort((a, b) => a.userName.localeCompare(b.userName));
  for (const row of sorted) {
    table.push([
      trunc(row.userName, 28),
      trunc(row.team, 28),
      formatHours(row.workMinutes),
      formatHours(row.absenceMinutes),
      formatHours(row.totalMinutes),
    ]);
  }

  term.table(table, {
    hasBorder: true,
    contentHasMarkup: true,
    borderChars: "lightRounded",
    width: 100,
    fit: true,
  });
  term("\n");
}

function renderValidateTable(rows: ReportValidateRow[]): void {
  term.cyan("Validation (missing workdays per user, up to today)\n");

  if (rows.length === 0) {
    term.green("✓ All selected users have at least one event for each workday up to today in the selected interval.\n\n");
    return;
  }

  const vHeaders = ["User", "Days", "Missing days"];
  const vTable: string[][] = [vHeaders];

  const sorted = [...rows].sort((a, b) => a.userName.localeCompare(b.userName));
  for (const row of sorted) {
    vTable.push([row.userName, String(row.missingCount), row.missingDates.join(", ")]);
  }

  term.table(vTable, {
    hasBorder: true,
    contentHasMarkup: true,
    borderChars: "lightRounded",
    width: 120,
    fit: true,
  });
  term("\n");
}

// ─── Action ───────────────────────────────────────────────────────────────────

export async function reportAction(_config: ProfileConfig, args: ParsedArgsReport): Promise<void> {
  const accessToken = await authenticate(args.profile);
  const range = resolveRange(args);
  const filters = { teamPrefixes: args.teams, namePrefix: args.name };

  term.cyan(`Fetching report for ${range.rangeLabel}...\n`);

  if (args.validate) {
    const rows = await getValidateReport(accessToken, range, filters, { ignoreToday: !!args.ignoreToday });
    // getValidateReport returns [] both when no users match AND when all users have coverage.
    // renderValidateTable always prints a useful message.
    renderValidateTable(rows);
  } else if (args.summary) {
    const rows = await getReportSummary(accessToken, range, filters);
    renderSummaryTable(rows);
  } else {
    const rows = await getReport(accessToken, range, filters);
    renderEventTable(rows);
  }
}
