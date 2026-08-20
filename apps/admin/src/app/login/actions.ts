"use server";

import {
  logout,
  requestEmailSignIn,
  verifyEmailOtp,
} from "@bare-traen/api-client";
import { redirect } from "next/navigation";

import { ADMIN_BACKEND_COOKIE, type AdminBackend } from "@/lib/auth/backend";
import { readCanonicalOriginEnvironment } from "@/lib/auth/environment";
import { isCurrentAuthCookie } from "@/lib/auth/auth-cookie";
import { resolveTrustedActionOrigin } from "@/lib/auth/origin";
import { getAdminRequestContext } from "@/lib/auth/request-context";
import { createAdminServerClient } from "@/lib/supabase/server-client";

import type { RequestCodeState, VerifyCodeState } from "./login-state";

const GENERIC_SENT_MESSAGE =
  "Hvis mailadressen har adgang, har vi sendt en mail med et loginlink og en sekscifret kode.";

function normalizeFormEmail(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim();
  const at = email.indexOf("@");

  return email.length > 0 &&
    email.length <= 254 &&
    !/\s/.test(email) &&
    at > 0 &&
    at === email.lastIndexOf("@") &&
    at < email.length - 1
    ? email
    : null;
}

async function createActionClient() {
  const context = await getAdminRequestContext();

  if (!context.resolution.configured) {
    return { client: null, context };
  }

  const client = createAdminServerClient(context.resolution, {
    getAll: () => context.requestCookies.getAll(),
    setAll(cookies) {
      for (const { name, value, options } of cookies) {
        context.requestCookies.set({ name, value, ...options });
      }
    },
  });

  return { client, context };
}

function trustedActionOrigin(
  context: Awaited<ReturnType<typeof getAdminRequestContext>>,
): string | null {
  return resolveTrustedActionOrigin({
    originHeader: context.requestHeaders.get("origin"),
    hostHeader: context.requestHeaders.get("host"),
    nodeEnvironment: process.env.NODE_ENV,
    ...readCanonicalOriginEnvironment(),
  });
}

export async function switchAdminBackend(formData: FormData): Promise<never> {
  const context = await getAdminRequestContext();
  const values = formData.getAll("backend");
  const backend = values.length === 1 ? values[0] : null;

  if (
    !trustedActionOrigin(context) ||
    !context.resolution.selectorVisible ||
    (backend !== "local" && backend !== "development") ||
    (backend === "local" && !context.resolution.localAvailable)
  ) {
    redirect("/login");
  }

  context.requestCookies.set(ADMIN_BACKEND_COOKIE, backend as AdminBackend, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secure: false,
  });

  redirect("/login");
}

export async function requestAdminLoginCode(
  _previousState: RequestCodeState,
  formData: FormData,
): Promise<RequestCodeState> {
  const email = normalizeFormEmail(formData.get("email"));

  if (!email) {
    return {
      status: "invalid",
      email: "",
      message: "Skriv en gyldig mailadresse.",
      requestedAt: null,
    };
  }

  const { client, context } = await createActionClient();
  const origin = trustedActionOrigin(context);

  if (!client || !origin) {
    return {
      status: "unavailable",
      email,
      message: "Login er ikke tilgængeligt lige nu. Prøv igen senere.",
      requestedAt: null,
    };
  }

  try {
    await requestEmailSignIn(client, {
      accountPolicy: "existing-only",
      email,
      redirectTo: `${origin}/auth/callback`,
    });
  } catch {
    // Keep the response identical for registered and unknown addresses.
  }

  return {
    status: "sent",
    email,
    message: GENERIC_SENT_MESSAGE,
    requestedAt: Date.now(),
  };
}

export async function verifyAdminLoginCode(
  _previousState: VerifyCodeState,
  formData: FormData,
): Promise<VerifyCodeState> {
  const email = normalizeFormEmail(formData.get("email"));
  const code = formData.get("code");

  if (!email || typeof code !== "string") {
    return {
      status: "invalid",
      message: "Koden kan ikke bruges. Bed om en ny mail og prøv igen.",
    };
  }

  const { client, context } = await createActionClient();

  if (!client || !trustedActionOrigin(context)) {
    return {
      status: "unavailable",
      message: "Login er ikke tilgængeligt lige nu. Prøv igen senere.",
    };
  }

  try {
    await verifyEmailOtp(client, { code, email });
  } catch {
    return {
      status: "invalid",
      message:
        "Koden er forkert eller udløbet. Bed om en ny mail og prøv igen.",
    };
  }

  redirect("/");
}

export async function logoutAdmin(): Promise<never> {
  const { client, context } = await createActionClient();

  if (!trustedActionOrigin(context)) {
    redirect("/login");
  }

  if (client) {
    try {
      await logout(client);
    } catch {
      // The current namespace is cleared below even if the provider is offline.
    }
  }

  for (const cookie of context.requestCookies.getAll()) {
    if (isCurrentAuthCookie(cookie.name, context.resolution.storageKey)) {
      context.requestCookies.delete(cookie.name);
    }
  }

  redirect("/login?reason=signed-out");
}
