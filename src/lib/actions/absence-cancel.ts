import { terminal as term } from "terminal-kit";
import { fetchCancelAbsence, getAbsences } from "../utils/api";
import { authenticate } from "../utils/login";
import { getTodayToEndOfYear } from "../utils/time";
import { DateTime } from "luxon";

export async function absenceCancelAction(config: ProfileConfig, args?: BaseCommand) {
  const accessToken = await authenticate(args?.profile);

  const { isoStart, isoEnd } = getTodayToEndOfYear();

  const absenceResponse = await getAbsences(
    {
      interval_starting_at: isoStart,
      interval_ending_at: isoEnd,
      users_uuids: [config.user.uuid],
      quick_filter: null,
    },
    accessToken,
  );

  const absences = (absenceResponse.data?.events || []).sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  );

  if (absences.length === 0) {
    term.green("\nYou don't have any absences to cancel.\n\n");
    return;
  }

  term.cyan("\nSelect an absence to cancel:\n");

  const items = absences.map((absence) => {
    const startDate = DateTime.fromISO(absence.started_at).setZone("Europe/Prague");
    const endDate = DateTime.fromISO(absence.ended_at).setZone("Europe/Prague");

    const startFormatted = startDate.toFormat("dd.MM.yyyy");
    const endFormatted = endDate.toFormat("dd.MM.yyyy");

    const dateRange = startFormatted === endFormatted ? startFormatted : `${startFormatted} - ${endFormatted}`;

    return `${dateRange} | ${absence.user_absence_event.absence_event_name}`;
  });

  const selectedItemIndex = await term.gridMenu(items).promise;
  term("\n");

  const selectedAbsence = absences[selectedItemIndex.selectedIndex];

  term.yellow(`Are you sure you want to cancel this absence? (y/n) - default YES: `);
  const confirmation = await term.yesOrNo({ yes: ["y", "ENTER", "z"], no: ["n"] }).promise;
  term("\n");

  if (!confirmation) {
    term.red("Action aborted by user.\n\n");
    return;
  }

  await fetchCancelAbsence(accessToken, selectedAbsence.uuid);

  term.green("✓ Absence cancelled successfully\n\n");
}
