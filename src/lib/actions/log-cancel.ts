import { terminal as term } from "terminal-kit";
import { fetchCancelWorklog, getEvents, login } from "../utils/api";
import { getCurrentMonth } from "../utils/time";
import { DateTime } from "luxon";

export async function logCancelAction(config: ProfileConfig) {
  const loginInfo = await login(config.credentials.email, config.credentials.password);

  // Get the first and last day of the current month
  const { isoStart, isoEnd } = getCurrentMonth();

  const eventsResponse = await getEvents(
    {
      interval_starting_at: isoStart,
      interval_ending_at: isoEnd,
      users_uuids: [config.user.uuid],
      quick_filter: null,
    },
    loginInfo.access_token,
  );

  const worklogs = (eventsResponse.data?.events || []).sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  );

  if (worklogs.length === 0) {
    term.green("\nYou don't have any worklogs for the current month to cancel.\n\n");
    return;
  }

  term.cyan("\nSelect a worklog to cancel:\n");

  const items = worklogs.map((worklog) => {
    const startDate = DateTime.fromISO(worklog.started_at).setZone("Europe/Prague");
    const endDate = DateTime.fromISO(worklog.ended_at).setZone("Europe/Prague");

    const startFormatted = startDate.toFormat("dd.MM.yyyy HH:mm");
    const endFormatted = endDate.toFormat("HH:mm");

    const clientName = worklog.client?.name || "No client";
    const projectName = worklog.client_project?.project_name || "No project";
    const message = worklog.message || "";

    return `${startFormatted} - ${endFormatted} | ${clientName} | ${projectName} | ${message}`;
  });

  const selectedItemIndex = await term.singleColumnMenu(items).promise;
  term("\n");

  const selectedWorklog = worklogs[selectedItemIndex.selectedIndex];

  term.yellow(`Are you sure you want to cancel this worklog? (y/n) - default YES: `);
  const confirmation = await term.yesOrNo({ yes: ["y", "ENTER", "z"], no: ["n"] }).promise;
  term("\n");

  if (!confirmation) {
    term.red("Action aborted by user.\n\n");
    return;
  }

  await fetchCancelWorklog(loginInfo.access_token, selectedWorklog.uuid);

  term.green("✓ Worklog cancelled successfully\n\n");
}
