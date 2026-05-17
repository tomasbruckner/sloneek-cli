import { terminal as term } from "terminal-kit";
import { authenticate } from "../utils/login";
import { listOwnAbsences, cancelAbsence } from "../services/absences";
import { DateTime } from "luxon";

export async function absenceCancelAction(config: ProfileConfig, args?: BaseCommand) {
  const accessToken = await authenticate(args?.profile);

  const own = await listOwnAbsences(config, accessToken);

  if (own.length === 0) {
    term.green("\nYou don't have any absences to cancel.\n\n");
    return;
  }

  const sorted = [...own].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  term.cyan("\nSelect an absence to cancel:\n");

  const items = sorted.map((absence) => {
    const startDate = DateTime.fromISO(absence.startedAt).setZone("Europe/Prague");
    const endDate = DateTime.fromISO(absence.endedAt).setZone("Europe/Prague");

    const startFormatted = startDate.toFormat("dd.MM.yyyy");
    const endFormatted = endDate.toFormat("dd.MM.yyyy");

    const dateRange = startFormatted === endFormatted ? startFormatted : `${startFormatted} - ${endFormatted}`;

    return `${dateRange} | ${absence.absenceTypeName}`;
  });

  const selectedItemIndex = await term.gridMenu(items).promise;
  term("\n");

  const selectedAbsence = sorted[selectedItemIndex.selectedIndex];

  term.yellow(`Are you sure you want to cancel this absence? (y/n) - default YES: `);
  const confirmation = await term.yesOrNo({ yes: ["y", "ENTER", "z"], no: ["n"] }).promise;
  term("\n");

  if (!confirmation) {
    term.red("Action aborted by user.\n\n");
    return;
  }

  await cancelAbsence(accessToken, selectedAbsence.uuid);

  term.green("✓ Absence cancelled successfully\n\n");
}
