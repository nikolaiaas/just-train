import "server-only";

import type { BareTraenClient } from "@bare-traen/api-client";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import type { AdminBackendResolution } from "../auth/backend";

export type AdminCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export type AdminCookieAdapter = {
  getAll: () =>
    | Promise<{ name: string; value: string }[] | null>
    | { name: string; value: string }[]
    | null;
  setAll: (
    cookies: AdminCookie[],
    cacheHeaders: Record<string, string>,
  ) => Promise<void> | void;
};

export class AdminAuthConfigurationError extends Error {
  constructor() {
    super("Admin authentication is not configured.");
    this.name = "AdminAuthConfigurationError";
  }
}

function secureCookieOptions(
  options: CookieOptions,
  secure: boolean,
): CookieOptions {
  return {
    ...options,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure,
  };
}

export function createAdminServerClient(
  resolution: AdminBackendResolution,
  adapter: AdminCookieAdapter,
): BareTraenClient {
  if (!resolution.config) {
    throw new AdminAuthConfigurationError();
  }

  return createServerClient(
    resolution.config.url,
    resolution.config.publishableKey,
    {
      auth: {
        debug: false,
        detectSessionInUrl: false,
        persistSession: true,
      },
      cookieEncoding: "base64url",
      cookieOptions: {
        httpOnly: true,
        name: resolution.storageKey,
        path: "/",
        sameSite: "lax",
        secure: resolution.secureCookies,
      },
      cookies: {
        getAll: adapter.getAll,
        async setAll(cookies, cacheHeaders) {
          await adapter.setAll(
            cookies.map((cookie) => ({
              ...cookie,
              options: secureCookieOptions(
                cookie.options,
                resolution.secureCookies,
              ),
            })),
            cacheHeaders,
          );
        },
      },
    },
  ) as BareTraenClient;
}
