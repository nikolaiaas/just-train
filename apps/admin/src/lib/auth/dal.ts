import "server-only";

import { decideAdminAccess, type AdminAccessDecision } from "./access";
import { getAdminRequestContext } from "./request-context";
import { createAdminServerClient } from "../supabase/server-client";

export async function getAdminAccess(): Promise<AdminAccessDecision> {
  const context = await getAdminRequestContext();

  if (!context.externalLocation || !context.resolution.configured) {
    return { kind: "unavailable" };
  }

  const client = createAdminServerClient(context.resolution, {
    getAll: () => context.requestCookies.getAll(),
    setAll(cookies) {
      try {
        for (const { name, value, options } of cookies) {
          context.requestCookies.set({ name, value, ...options });
        }
      } catch {
        // Server Components cannot write cookies. Proxy refreshes them first.
      }
    },
  });

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) {
    return { kind: "unauthenticated" };
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, display_name, avatar_url, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return decideAdminAccess({
    userId: user.id,
    profile,
    profileQueryFailed: Boolean(profileError),
  });
}
