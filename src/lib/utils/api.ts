import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { DateTime } from "luxon";
import { terminal as term } from "terminal-kit";

export async function apiCall<T = any>(
  url: string,
  options: AxiosRequestConfig = {}
): Promise<T> {
  try {
    const response: AxiosResponse<T> = await axios({
      url,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      data: options.data,
    });

    return response.data;
  } catch (error: any) {
    if (error.response) {
      throw new Error(
        `API call failed: ${error.response.status} ${
          error.response.statusText
        }\n${JSON.stringify(error.response.data, null, 2)}`
      );
    } else {
      throw new Error(`API call failed: ${error.message}`);
    }
  }
}

export async function fetchUsers(accessToken: string) {
  return await apiCall<UsersResponse>(
    "https://api2.sloneek.com/v2/module-planning/scheduled-events/options/users",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

export async function fetchClients(
  accessToken: string,
  selectedUserUuid: string
) {
  return await apiCall<ClientsResponse>(
    `https://api2.sloneek.com/v2/module-planning/scheduled-events/options/clients?user_uuid=${selectedUserUuid}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

export async function fetchUserEvents(
  accessToken: string,
  selectedUserUuid: string
) {
  return await apiCall<PlanningEventsResponse>(
    `https://api2.sloneek.com/v2/module-planning/scheduled-events/options/user-planning-events?user_uuid=${selectedUserUuid}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

export async function login(email: string, password: string): Promise<LoginInfo> {
  term.cyan("Logging in...\n");

  const loginResponse = await apiCall<LoginResponse>(
    "https://api2.sloneek.com/auth/login",
    {
      method: "POST",
      data: { email, password },
    }
  );

  return loginResponse.data;
}

export async function createEvent(
  payload: EventPayload,
  accessToken: string,
  {
    user,
    clientDisplayName,
    projectDisplayName,
    startTime,
    endTime,
    startDateTime,
  }: {
    clientDisplayName: string;
    user: string;
    projectDisplayName: string;
    startTime: string;
    endTime: string;
    startDateTime: DateTime<boolean>;
  }
) {
  console.log("Creating event...");
  console.log(`User: ${user}`);
  console.log(`Client: ${clientDisplayName}`);
  console.log(`Project: ${projectDisplayName}`);
  console.log(`Time: ${startTime} - ${endTime} (${payload.duration} minutes)`);
  console.log(`Date: ${startDateTime.toFormat("yyyy-MM-dd")}`);
  console.log(`Message: ${payload.message}`);
  console.log("");

  await apiCall(
    "https://api2.sloneek.com/v2/module-planning/scheduled-events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: payload,
    }
  );
}

export async function getClients(userUuid: string, accessToken: string) {
  return await apiCall<ClientsResponse>(
    `https://api2.sloneek.com/v2/module-planning/scheduled-events/options/clients?user_uuid=${userUuid}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

export async function getAbsences(payload: AbsenceListPayload, accessToken: string) {
  return apiCall<AbsenceEventsResponse>(
    "https://api2.sloneek.com/v1/module-absence/absences-calendar",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: payload,
    }
  );
}

export async function getEvents(payload: any, accessToken: string) {
  return apiCall<ScheduledEventsResponse>(
    "https://api2.sloneek.com/v1/module-planning/scheduled-events-calendar",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: payload,
    }
  );
}

export async function fetchAbsenceOptions(accessToken: string) {
  return apiCall<AbsenceOptionsResponse>(
    "https://api2.sloneek.com/v2/module-absence/absence/absence-options?action=create&data_type=user_absence_events",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
}


export async function fetchCreateAbsence(accessToken: string, payload: AbsencePayload) {
  console.log("Creating absence...");
  return apiCall<unknown>(
    "https://api2.sloneek.com/v2/module-absence/absence/absence",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: payload,
    }
  );
}

