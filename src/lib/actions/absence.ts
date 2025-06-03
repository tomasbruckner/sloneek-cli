import { fetchAbsenceOptions, fetchCreateAbsence, login } from "../utils/api";
import { terminal as term } from "terminal-kit";
import { convertDayAndTimeToIso, convertDayToISO } from "../utils/time";

export async function createAbsenceAction(config: Config) {
  const loginInfo = await login(
    config.credentials.email,
    config.credentials.password
  );
  term.green("✓ Login successful\n\n");
  const selected = await chooseAbsenceOptions(loginInfo.access_token);
  term.green(`✓ Using absence: ${selected.absence_event.display_name}\n\n`);

  term("Absence message: ");
  const message = (await term.inputField().promise) ?? "";
  term("\n");

  if (selected.absence_event.unit_type === "days") {
    await chooseFullDayAbsence(loginInfo.access_token, message, selected);
  } else if (selected.absence_event.unit_type === "hours") {
    await chooseHoursAbsence(loginInfo.access_token, message, selected);
  } else if (selected.absence_event.unit_type === "days_and_half_days") {
    await chooseHalfDayAbsence(loginInfo.access_token, message, selected);
  } else {
    throw new Error("Unknow type " + selected.absence_event.unit_type);
  }

  term.green("✓ Absence created\n\n");
}

async function chooseAbsenceOptions(accessToken: string) {
  term.cyan("Fetching absences...\n");
  const absenceResponse = await fetchAbsenceOptions(accessToken);
  if (absenceResponse.data.length === 1) {
    return absenceResponse.data[0];
  }

  term.cyan("Select absence:\n");
  const items = absenceResponse.data.map((o) => o.absence_event.display_name);
  const selectedItemIndex = await term.singleColumnMenu(items).promise;
  term("\n");

  return absenceResponse.data[selectedItemIndex.selectedIndex];
}

async function chooseFullDayAbsence(
  accessToken: string,
  message: string,
  option: AbsenceOption
) {
  term.cyan("Do you want absence to be single day or multiple days:\n");
  const selectedItemIndex = await term.singleColumnMenu([
    "Single day",
    "Multiple day",
  ]).promise;
  term("\n");

  term("Start day (example 16.5.2025): ");
  const from = (await term.inputField().promise) ?? "";
  term("\n");

  if (selectedItemIndex.selectedIndex === 0) {
    await fetchCreateAbsence(accessToken, {
      day_type: "full_day",
      automatically_approve: true,
      fullDay: true,
      mentions: [],
      message: message,
      note: message,
      user_absence_event_uuid: option.uuid,
      start_date_time: convertDayToISO(from),
      end_date_time: convertDayToISO(from),
    });
    return;
  }

  term("End day (example 16.5.2025): ");
  const to = (await term.inputField().promise) ?? "";
  term("\n");

  await fetchCreateAbsence(accessToken, {
    day_type: "full_day",
    automatically_approve: true,
    fullDay: true,
    mentions: [],
    message: message,
    note: message,
    user_absence_event_uuid: option.uuid,
    start_date_time: convertDayToISO(from),
    end_date_time: convertDayToISO(to),
  });
}

async function chooseHalfDayAbsence(
  accessToken: string,
  message: string,
  option: AbsenceOption
) {
  term.cyan("Select absence half/full day:\n");
  const selectedItemIndex = await term.singleColumnMenu([
    "Half day",
    "Full day",
  ]).promise;
  term("\n");
  if (selectedItemIndex.selectedIndex === 1) {
    await chooseFullDayAbsence(accessToken, message, option);
    return;
  }

  term("Select morning/afternoon: ");
  const selectedHalfDay = await term.singleColumnMenu([
    "First half of the day (before lunch)",
    "Second half of the day (after lunch)",
  ]).promise;

  term("Start day (example 16.5.2025): ");
  const from = (await term.inputField().promise) ?? "";
  term("\n");

  await fetchCreateAbsence(accessToken, {
    day_type: "half_day",
    automatically_approve: true,
    mentions: [],
    message: message,
    note: message,
    fullDay: false,
    is_first_half_day: selectedHalfDay.selectedIndex === 0,
    user_absence_event_uuid: option.uuid,
    start_date_time: convertDayToISO(from),
    end_date_time: null,
  });
}

async function chooseHoursAbsence(
  accessToken: string,
  message: string,
  option: AbsenceOption
) {
  term("Start day (example 16.5.2025): ");
  const from = (await term.inputField().promise) ?? "";
  term("\n");

  term("Start time (example 12:30): ");
  const time = (await term.inputField().promise) ?? "";
  term("\n");

  term("Duration in hours: ");
  const duration = (await term.inputField().promise) ?? "";
  term("\n");

  await fetchCreateAbsence(accessToken, {
    day_type: "half_day",
    automatically_approve: false,
    mentions: [],
    message: message,
    note: message,
    duration: Number(duration),
    user_absence_event_uuid: option.uuid,
    start_date_time: convertDayAndTimeToIso(from, time),
    end_date_time: null,
  });
}
