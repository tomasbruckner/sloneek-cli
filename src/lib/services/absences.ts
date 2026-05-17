import { fetchAbsenceOptions, fetchCreateAbsence, fetchCancelAbsence, getAbsences } from "../utils/api";
import { getTodayToEndOfYear } from "../utils/time";

export interface AbsenceType {
  uuid: string;
  name: string;
  unitType: string;
}

export interface OwnAbsence {
  uuid: string;
  absenceTypeName: string;
  startedAt: string;
  endedAt: string;
}

export interface CreateAbsenceInput {
  absenceTypeUuid: string;
  startIso: string;
  endIso: string | null;
  note: string;
  eventType: "full_day" | "partial_day";
  // Additional fields needed for partial_day (hours) absences
  duration?: number;
  // Additional fields needed for half_day (days_and_half_days) absences
  isHalfDay?: boolean;
  isFirstHalfDay?: boolean;
}

export async function listAbsenceTypes(accessToken: string): Promise<AbsenceType[]> {
  const response = await fetchAbsenceOptions(accessToken);
  return response.data.map((option) => ({
    uuid: option.uuid,
    name: option.absence_event.display_name,
    unitType: option.absence_event.unit_type,
  }));
}

export async function listOwnAbsences(
  profileConfig: ProfileConfig,
  accessToken: string,
  range?: MonthRange,
): Promise<OwnAbsence[]> {
  const isoStart = range?.isoStart ?? getTodayToEndOfYear().isoStart;
  const isoEnd = range?.isoEnd ?? getTodayToEndOfYear().isoEnd;

  const response = await getAbsences(
    {
      interval_starting_at: isoStart,
      interval_ending_at: isoEnd,
      users_uuids: [profileConfig.user.uuid],
      quick_filter: null,
    },
    accessToken,
  );

  return (response.data?.events || []).map((event) => ({
    uuid: event.uuid,
    absenceTypeName: event.user_absence_event.absence_event_name,
    startedAt: event.started_at,
    endedAt: event.ended_at,
  }));
}

export async function createAbsence(accessToken: string, input: CreateAbsenceInput): Promise<void> {
  if (input.eventType === "full_day") {
    if (input.isHalfDay) {
      // days_and_half_days type — half day variant
      await fetchCreateAbsence(accessToken, {
        day_type: "half_day",
        automatically_approve: true,
        mentions: [],
        message: input.note,
        note: input.note,
        fullDay: false,
        is_first_half_day: input.isFirstHalfDay ?? true,
        user_absence_event_uuid: input.absenceTypeUuid,
        start_date_time: input.startIso,
        end_date_time: null,
      });
    } else {
      // full_day type
      await fetchCreateAbsence(accessToken, {
        day_type: "full_day",
        automatically_approve: true,
        fullDay: true,
        mentions: [],
        message: input.note,
        note: input.note,
        user_absence_event_uuid: input.absenceTypeUuid,
        start_date_time: input.startIso,
        end_date_time: input.endIso ?? input.startIso,
      });
    }
  } else {
    // partial_day — hours-based absence
    await fetchCreateAbsence(accessToken, {
      day_type: "half_day",
      automatically_approve: false,
      mentions: [],
      message: input.note,
      note: input.note,
      duration: input.duration ?? 0,
      user_absence_event_uuid: input.absenceTypeUuid,
      start_date_time: input.startIso,
      end_date_time: null,
    });
  }
}

export async function cancelAbsence(accessToken: string, absenceUuid: string): Promise<void> {
  await fetchCancelAbsence(accessToken, absenceUuid);
}
