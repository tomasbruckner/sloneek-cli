import { terminal as term } from "terminal-kit";
import { ensureAuthenticated } from "../services/auth";

export async function authenticate(profileName?: string): Promise<string> {
  const before = Date.now();
  const session = await ensureAuthenticated(profileName);
  const elapsed = Date.now() - before;

  // Best-effort UX: instant return implies cache hit; >200ms implies a login round-trip.
  if (elapsed < 200) {
    term.cyan("Using existing token\n");
  } else {
    term.cyan("Token expired, logging in again\n");
    term.green("✓ Login successful\n");
  }

  return session.accessToken;
}
