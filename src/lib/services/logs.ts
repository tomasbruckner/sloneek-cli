import { createEvent, fetchCancelWorklog } from "../utils/api";

export interface CreateLogInput {
  clientUuid: string;
  projectUuid: string;
  planningEventUuid: string;
  userUuid: string;
  categories: string[];
  startIso: string; // already in Europe/Prague, ISO string
  endIso: string; // already in Europe/Prague, ISO string
  startTime: string; // formatted as HH:mm:ssZZ
  endTime: string; // formatted as HH:mm:ssZZ
  durationMinutes: number;
  durationTime: string; // pre-computed duration_time ISO string
  note: string;
}

export interface CreatedLog {
  uuid: string;
}

export async function createLog(accessToken: string, input: CreateLogInput): Promise<CreatedLog> {
  await createEvent(
    {
      isRepeat: false,
      user_planning_event_uuid: input.planningEventUuid,
      planning_categories: input.categories,
      started_at: input.startIso,
      ended_at: input.endIso,
      start_time: input.startTime,
      end_time: input.endTime,
      days: [],
      duration_time: input.durationTime,
      duration: input.durationMinutes,
      timezone: input.startIso,
      note: input.note,
      is_automatically_approve: false,
      message: input.note,
      mentions: [],
      client: input.clientUuid,
      client_project: input.projectUuid,
      user_uuid: input.userUuid,
    },
    accessToken,
  );

  return { uuid: "" };
}

export async function cancelLog(accessToken: string, worklogUuid: string): Promise<void> {
  await fetchCancelWorklog(accessToken, worklogUuid);
}
