import { terminal as term } from "terminal-kit";
import { ensureAuthenticated } from "../services/auth";

export async function authenticate(profileName?: string): Promise<string> {
  const session = await ensureAuthenticated(profileName);

  switch (session.loginReason) {
    case "cache":
      term.cyan("Using existing token\n");
      break;
    case "expired":
      term.cyan("Token expired, logging in again\n");
      term.green("✓ Login successful\n");
      break;
    case "first_login":
      term.cyan("Logging in...\n");
      term.green("✓ Login successful\n");
      break;
  }

  return session.accessToken;
}
