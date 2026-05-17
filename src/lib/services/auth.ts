import { DateTime } from "luxon";
import { apiCall, fetchUsers } from "../utils/api";
import { readConfig, writeConfig } from "../utils/config";

export interface UserSummary {
  uuid: string;
  name: string;
}

export async function loginWithCredentials(email: string, password: string): Promise<LoginInfo> {
  const loginResponse = await apiCall<LoginResponse>("https://api2.sloneek.com/auth/login", {
    method: "POST",
    data: { email, password },
  });
  return loginResponse.data;
}

export async function listUsers(accessToken: string): Promise<UserSummary[]> {
  const response = await fetchUsers(accessToken);
  return (response.data || []).map((u) => ({ uuid: u.uuid, name: u.name }));
}

export async function ensureAuthenticated(profileName?: string): Promise<AuthenticatedSession> {
  const config = await readConfig(true);
  const resolvedName = profileName && config.profiles[profileName] ? profileName : "_default";
  const profileConfig = config.profiles[resolvedName];

  if (profileConfig.token?.access_token && profileConfig.token?.expires_at) {
    const expiresAt = DateTime.fromISO(profileConfig.token.expires_at);
    if (expiresAt > DateTime.now().plus({ minutes: 1 })) {
      return { accessToken: profileConfig.token.access_token, profileConfig, loginReason: "cache" };
    }
  }

  // Capture whether there was a previous token before mutating
  const hadPreviousToken = !!profileConfig.token?.access_token;

  const loginResponse = await apiCall<LoginResponse>("https://api2.sloneek.com/auth/login", {
    method: "POST",
    data: { email: profileConfig.credentials.email, password: profileConfig.credentials.password },
  });

  const accessToken = loginResponse.data.access_token;
  const expiresAt = DateTime.fromSeconds(loginResponse.data.access_token_expires_at).toISO();

  const updatedProfile: ProfileConfig = {
    ...profileConfig,
    token: { access_token: accessToken, expires_at: expiresAt },
  };

  await writeConfig(
    { ...config, profiles: { ...config.profiles, [resolvedName]: updatedProfile } },
    true,
  );

  return { accessToken, profileConfig: updatedProfile, loginReason: hadPreviousToken ? "expired" : "first_login" };
}
