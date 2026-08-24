import "server-only";

import { cache } from "react";

import type { BareTraenClient } from "@bare-traen/api-client";

import { decideAdminAccess, type AdminAccessDecision } from "./access";
import type { AdminBackend } from "./backend";
import { getAdminRequestContext } from "./request-context";
import { createAdminServerClient } from "../supabase/server-client";

export type AdminAccessSession = {
  access: AdminAccessDecision;
  backend: AdminBackend;
  client: BareTraenClient | null;
};

export const getAdminAccessSession = cache(
  async (): Promise<AdminAccessSession> => {
    const context = await getAdminRequestContext();

    if (!context.externalLocation || !context.resolution.configured) {
      return {
        access: { kind: "unavailable" },
        backend: context.resolution.backend,
        client: null,
      };
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
      return {
        access: { kind: "unauthenticated" },
        backend: context.resolution.backend,
        client,
      };
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, display_name, avatar_url, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    return {
      access: decideAdminAccess({
        userId: user.id,
        profile,
        profileQueryFailed: Boolean(profileError),
      }),
      backend: context.resolution.backend,
      client,
    };
  },
);

export async function getAdminAccess(): Promise<AdminAccessDecision> {
  return (await getAdminAccessSession()).access;
}
