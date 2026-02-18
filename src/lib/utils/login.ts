import { DateTime } from "luxon";
import { terminal as term } from "terminal-kit";
import { apiCall } from "./api";
import { readConfig, writeConfig } from "./config";

export async function authenticate(profileName?: string): Promise<string> {
  const config = await readConfig(true);
  const profileConfig =
    profileName && config.profiles[profileName] ? config.profiles[profileName] : config.profiles["_default"];

  if (profileConfig.token?.access_token && profileConfig.token?.expires_at) {
    const expiresAt = DateTime.fromISO(profileConfig.token.expires_at);
    const now = DateTime.now();

    if (expiresAt > now.plus({ minutes: 1 })) {
      term.cyan("Using existing token\n");
      return profileConfig.token.access_token;
    }

    term.cyan("Token expired, logging in again\n");
  }

  return await loginAndSaveToken(profileConfig, config, profileName);
}

async function loginAndSaveToken(profileConfig: ProfileConfig, config: Config, profileName?: string): Promise<string> {
  const { email, password } = profileConfig.credentials;

  const loginResponse = await apiCall<LoginResponse>("https://api2.sloneek.com/auth/login", {
    method: "POST",
    data: { email, password },
  });

  const accessToken = loginResponse.data.access_token;
  const expiresAt = DateTime.fromSeconds(loginResponse.data.access_token_expires_at).toISO();

  const updatedProfileConfig = {
    ...profileConfig,
    token: {
      access_token: accessToken,
      expires_at: expiresAt,
    },
  };

  const updatedConfig = {
    ...config,
    profiles: {
      ...config.profiles,
      [profileName || "_default"]: updatedProfileConfig,
    },
  };

  await writeConfig(updatedConfig, true);

  term.green("✓ Login successful\n");
  return accessToken;
}
