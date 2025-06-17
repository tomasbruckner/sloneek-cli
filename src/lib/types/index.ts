interface BaseCommand {
  profile?: string;
}

type ParsedArgsProfile = {
  command: "profile";
  remove: boolean;
} & BaseCommand;

type ParsedArgs =
  | ParsedArgsLog
  | ParsedArgsList
  | ParsedArgsProfile
  | ({
      command: "init";
    } & BaseCommand)
  | ({
      command: "absence";
    } & BaseCommand)
  | ({
      command: "absence-cancel";
    } & BaseCommand)
  | ({
      command: "log-cancel";
    } & BaseCommand);

type ParsedArgsLog = {
  command: "log";
  message: string;
  from?: string;
  to?: string;
  day?: string;
  yesterday?: boolean;
  interactiveClient: boolean;
  interactiveProject: boolean;
} & BaseCommand;

type ParsedArgsList = {
  command: "list";
  other: boolean;
  teamPrefix: string;
} & BaseCommand;

interface Client {
  uuid: string;
  name: string;
  projects: Project[];
}

interface Project {
  uuid: string;
  project_name: string;
}

interface ClientsResponse {
  data: Client[];
}

interface ClientProjectSelection {
  selectedClient: Client | null;
  selectedProject: Project | null;
}

interface EventBase {
  started_at: string;
  ended_at: string;
  type: "scheduled" | "absence";
  displayClient: string;
  displayProject: string;
  displayType: string;
}

interface ScheduledEvent extends EventBase {
  type: "scheduled";
  client?: {
    name: string;
  };
  client_project?: {
    project_name: string;
  };
}

interface AbsenceEvent extends EventBase {
  type: "absence";
  user_absence_event?: {
    absence_event_name: string;
  };
}

type ApiEvent = ScheduledEvent | AbsenceEvent;

interface ScheduledEventsResponse {
  data?: {
    events?: any[];
  };
}

type AbsenceType = "type_in_work" | "type_vacation";

interface AbsenceOptionsResponse {
  data: AbsenceOption[];
}

interface AbsenceOption {
  uuid: string;
  absence_event: {
    display_name: string;
    type: AbsenceType;
    unit_type: "hours" | "days_and_half_days" | "days";
  };
}

type AbsencePayload =
  | {
      user_absence_event_uuid: string;
      day_type: "full_day";
      automatically_approve: boolean;
      note: string;
      message: string;
      mentions: [];
      fullDay: true;
      start_date_time: string;
      end_date_time: string;
    }
  | {
      user_absence_event_uuid: string;
      day_type: "half_day";
      automatically_approve: boolean;
      note: string;
      message: string;
      mentions: [];
      fullDay: false;
      start_date_time: string;
      is_first_half_day: boolean;
      end_date_time: null;
    }
  | {
      user_absence_event_uuid: string;
      day_type: "half_day";
      automatically_approve: boolean;
      note: string;
      message: string;
      mentions: [];
      start_date_time: string;
      duration: number;
      end_date_time: null;
    };

interface AbsenceListPayload {
  absence_events_uuids?: string[];
  interval_starting_at: string;
  interval_ending_at: string;
  users_uuids?: string[];
  planning_events_uuids?: string[];
  quick_filter: null;
}

interface AbsenceEventsResponse {
  data: {
    events?: {
      uuid: string;
      user: {
        uuid: string;
        email: string;
        full_name: string;
        name: string;
        surname: string;
        team: {
          uuid: string;
          name: string;
          color: null;
        };
      };
      started_at: string;
      ended_at: string;
      user_absence_event: {
        absence_event_name: string;
      };
      duration: number;
      event_type: "full_day" | "half_day";
      type: "vacation" | "in_work";
      unit_type: "hour" | "full_day";
    }[];
  };
}

interface EventPayload {
  isRepeat: boolean;
  user_planning_event_uuid: string;
  planning_categories: any[];
  started_at: string;
  ended_at: string;
  start_time: string;
  end_time: string;
  days: any[];
  duration_time: string;
  duration: number;
  timezone: string;
  note: string;
  is_automatically_approve: boolean;
  message: string;
  mentions: any[];
  client: string;
  client_project: string;
  user_uuid: string;
}

interface LoginResponse {
  data: LoginInfo;
}

interface LoginInfo {
  access_token: string;
  user: {
    team: {
      name: string;
      uuid: string;
    };
    uuid: string;
  };
}

interface User {
  uuid: string;
  name: string;
}

interface UsersResponse {
  data: User[];
}

interface Project {
  uuid: string;
  project_name: string;
}

interface Client {
  uuid: string;
  name: string;
  projects: Project[];
}

interface ClientsResponse {
  data: Client[];
}

interface PlanningEvent {
  uuid: string;
  display_name: string;
}

interface PlanningEventData {
  uuid: string;
  planning_event: PlanningEvent;
}

interface PlanningEventsResponse {
  data: PlanningEventData[];
}

interface ApiOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface ProfileConfig {
  credentials: {
    email: string;
    password: string;
  };
  user: {
    uuid: string;
    name: string;
  };
  client: {
    uuid: string;
    name: string;
  };
  project: {
    uuid: string;
    name: string;
  };
  planningEvent: {
    uuid: string;
    detail_uuid: string;
    name: string;
  };
  workHours: {
    start: string;
    end: string;
  };
  timestamp: string;
}

interface Config {
  profiles: {
    [key: string]: ProfileConfig;
  };
}
