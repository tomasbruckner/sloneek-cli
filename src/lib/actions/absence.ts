import { terminal as term } from "terminal-kit";
import { authenticate } from "../utils/login";
import { convertDayAndTimeToIso, convertDayToISO, getTodayFormatted } from "../utils/time";
import { listAbsenceTypes, createAbsence } from "../services/absences";
import type { CreateAbsenceInput } from "../services/absences";

interface AbsenceInputResolution {
  input: CreateAbsenceInput;
  display: {
    absenceTypeName: string;
  };
}

export async function createAbsenceAction(config: ProfileConfig, args?: BaseCommand) {
  const accessToken = await authenticate(args?.profile);
  const { input, display } = await resolveAbsenceInput(config, accessToken);
  term.green(`✓ Using absence: ${display.absenceTypeName}\n\n`);
  await createAbsence(accessToken, input);
  term.green("✓ Absence created\n\n");
}

async function resolveAbsenceInput(config: ProfileConfig, accessToken: string): Promise<AbsenceInputResolution> {
  const absenceTypes = await listAbsenceTypes(accessToken);

  let selectedType: { uuid: string; name: string; unitType: "hours" | "days_and_half_days" | "days" };
  if (absenceTypes.length === 1) {
    selectedType = absenceTypes[0];
  } else {
    term.cyan("\nSelect absence:\n");
    const items = absenceTypes.map((t) => t.name);
    const selectedItemIndex = await term.gridMenu(items).promise;
    term("\n");
    selectedType = absenceTypes[selectedItemIndex.selectedIndex];
  }

  term("Absence message: ");
  const message = (await term.inputField().promise) ?? "";
  term("\n");

  let input: CreateAbsenceInput;

  if (selectedType.unitType === "days") {
    input = await resolveFullDayInput(selectedType.uuid, message);
  } else if (selectedType.unitType === "hours") {
    input = await resolveHoursInput(selectedType.uuid, message);
  } else {
    input = await resolveHalfDayInput(selectedType.uuid, message);
  }

  return {
    input,
    display: { absenceTypeName: selectedType.name },
  };
}

async function resolveFullDayInput(absenceTypeUuid: string, note: string): Promise<CreateAbsenceInput> {
  term.cyan("Do you want absence to be single day or multiple days:\n");
  const selectedItemIndex = await term.singleColumnMenu(["Single day", "Multiple day"]).promise;
  term("\n");

  term("Start day (example 16.5.2025, default is today): ");
  const from = (await term.inputField().promise) || getTodayFormatted();
  term("\n");

  if (selectedItemIndex.selectedIndex === 0) {
    return {
      absenceTypeUuid,
      startIso: convertDayToISO(from),
      endIso: convertDayToISO(from),
      note,
      eventType: "full_day",
    };
  }

  term("End day (example 16.5.2025, default is today): ");
  const to = (await term.inputField().promise) || getTodayFormatted();
  term("\n");

  return {
    absenceTypeUuid,
    startIso: convertDayToISO(from),
    endIso: convertDayToISO(to),
    note,
    eventType: "full_day",
  };
}

async function resolveHalfDayInput(absenceTypeUuid: string, note: string): Promise<CreateAbsenceInput> {
  term.cyan("Select absence half/full day:\n");
  const selectedItemIndex = await term.singleColumnMenu(["Half day", "Full day"]).promise;
  term("\n");

  if (selectedItemIndex.selectedIndex === 1) {
    return resolveFullDayInput(absenceTypeUuid, note);
  }

  const selectedHalfDay = await term.singleColumnMenu([
    "First half of the day (before lunch)",
    "Second half of the day (after lunch)",
  ]).promise;

  term("Start day (example 16.5.2025, default is today): ");
  const from = (await term.inputField().promise) || getTodayFormatted();
  term("\n");

  return {
    absenceTypeUuid,
    startIso: convertDayToISO(from),
    endIso: null,
    note,
    eventType: "full_day",
    isHalfDay: true,
    isFirstHalfDay: selectedHalfDay.selectedIndex === 0,
  };
}

async function resolveHoursInput(absenceTypeUuid: string, note: string): Promise<CreateAbsenceInput> {
  term("Start day (example 16.5.2025, default is today): ");
  const from = (await term.inputField().promise) || getTodayFormatted();
  term("\n");

  term("Start time (example 12:30): ");
  const time = (await term.inputField().promise) ?? "";
  term("\n");

  term("Duration in hours: ");
  const duration = (await term.inputField().promise) ?? "";
  term("\n");

  return {
    absenceTypeUuid,
    startIso: convertDayAndTimeToIso(from, time),
    endIso: null,
    note,
    eventType: "partial_day",
    duration: Number(duration),
  };
}
