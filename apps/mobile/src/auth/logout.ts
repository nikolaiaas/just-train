export type LogoutAttemptResult = "failed" | "local-only" | "signed-out";

type LogoutAttempt = {
  clearStoredSession(): Promise<void>;
  pausePersistence(): Promise<void>;
  resumePersistence(): Promise<void>;
  signOut(): Promise<void>;
};

/**
 * Falls back to removing only this app's persisted session when Supabase
 * cannot complete sign-out. Persistence is paused first so an auto-refresh
 * cannot race the removal and write the old session back.
 */
export async function attemptLogout({
  clearStoredSession,
  pausePersistence,
  resumePersistence,
  signOut,
}: LogoutAttempt): Promise<LogoutAttemptResult> {
  try {
    await signOut();
    return "signed-out";
  } catch {
    try {
      await pausePersistence();
      await clearStoredSession();
      return "local-only";
    } catch {
      try {
        await resumePersistence();
      } catch {
        // The deliberate `failed` result keeps the authenticated UI in place.
      }

      return "failed";
    }
  }
}
