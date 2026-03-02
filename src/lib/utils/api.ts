import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

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

export async function fetchCategories(accessToken: string) {
  return await apiCall<CategoriesResponse>(
    "https://api2.sloneek.com/v2/module-planning/scheduled-events/options/categories",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

export async function fetchCalendarOptions(accessToken: string) {
  return await apiCall<CalendarOptionsResponse>(
    "https://api2.sloneek.com/v2/module-planning/calendar/options",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

export async function fetchAbsenceReportCalendarOptions(accessToken: string) {
  return await apiCall<AbsenceReportCalendarOptionsResponse>(
    "https://api2.sloneek.com/v2/module-absence/absence/report/calendar-options",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}

export async function login(email: string, password: string): Promise<LoginInfo> {
  const loginResponse = await apiCall<LoginResponse>(
    "https://api2.sloneek.com/auth/login",
    {
      method: "POST",
      data: { email, password },
    }
  );

  return loginResponse.data;
}

export async function createEvent(payload: EventPayload, accessToken: string) {
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

export async function getEventDetail(eventUuid: string, accessToken: string) {
  return await apiCall<EventDetailResponse>(
    `https://api2.sloneek.com/v2/module-planning/scheduled-events/${eventUuid}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
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

export async function getEvents(payload: EventsListPayload, accessToken: string) {
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

export async function fetchScheduledEventDetail(accessToken: string, eventUuid: string) {
  return apiCall<any>(
    `https://api2.sloneek.com/v2/module-planning/scheduled-events/${eventUuid}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
}

export async function fetchAbsenceDetail(accessToken: string, absenceUuid: string) {
  return apiCall<any>(
    `https://api2.sloneek.com/v2/module-absence/absence/absence/${absenceUuid}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
}

export async function fetchCreateAbsence(accessToken: string, payload: AbsencePayload) {
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

export async function fetchCancelAbsence(accessToken: string, absenceUuid: string) {
  return apiCall<unknown>(
    `https://api2.sloneek.com/v2/module-absence/absence/absence/${absenceUuid}/change-status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: { action: "user_cancel" },
    }
  );
}

export async function fetchCancelWorklog(accessToken: string, worklogUuid: string) {
  return apiCall<unknown>(
    `https://api2.sloneek.com/planning/scheduled-events/${worklogUuid}/change-status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: { action: "user_cancel" },
    }
  );
}

export async function getNationalHolidays(
  payload: {
    from_date: string; // YYYY-MM-DD
    to_date: string;   // YYYY-MM-DD
    is_show_company_holidays: boolean;
    users_uuids: string[];
  },
  accessToken: string
) {
  return apiCall<NationalHolidaysResponse>(
    "https://api2.sloneek.com/v1/module-core/national-holidays",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      data: payload,
    }
  );
}
