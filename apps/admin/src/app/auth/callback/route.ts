import { completeAuthCallback } from "@bare-traen/api-client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_BACKEND_COOKIE, resolveAdminBackend } from "@/lib/auth/backend";
import { parseAdminCallback, type LoginReason } from "@/lib/auth/callback";
import {
  readAdminBackendEnvironment,
  readCanonicalOriginEnvironment,
} from "@/lib/auth/environment";
import { resolveTrustedCallbackOrigin } from "@/lib/auth/origin";
import { externalizeRequestUrl } from "@/lib/auth/request-location";
import { CookieMutationCollector } from "@/lib/supabase/cookie-collector";
import { createAdminServerClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function redirectWithoutAuthQuery(
  destination: "/" | "/login",
  reason?: LoginReason,
): NextResponse {
  const location = reason
    ? destination + "?reason=" + encodeURIComponent(reason)
    : destination;
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: location },
  });
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "X-Robots-Tag",
    "noindex, nofollow, noarchive, noimageindex",
  );
  return response;
}

export async function GET(request: NextRequest): Promise<Response> {
  const trustedOrigin = resolveTrustedCallbackOrigin({
    requestUrl: request.url,
    hostHeader: request.headers.get("host"),
    forwardedProtocol: request.headers.get("x-forwarded-proto"),
    isVercel: process.env.VERCEL === "1",
    nodeEnvironment: process.env.NODE_ENV,
    ...readCanonicalOriginEnvironment(),
  });

  if (!trustedOrigin) {
    return redirectWithoutAuthQuery("/login", "link-invalid");
  }

  const externalOrigin = new URL(trustedOrigin);
  const resolution = resolveAdminBackend({
    selectedBackend: request.cookies.get(ADMIN_BACKEND_COOKIE)?.value,
    location: {
      host: externalOrigin.host,
      protocol: externalOrigin.protocol,
      nodeEnvironment: process.env.NODE_ENV,
    },
    environment: readAdminBackendEnvironment(),
  });

  if (!resolution.configured) {
    return redirectWithoutAuthQuery("/login", "configuration");
  }

  const externalCallbackUrl = externalizeRequestUrl(request.url, trustedOrigin);
  let callback;

  try {
    if (!externalCallbackUrl) {
      throw new Error("Invalid callback.");
    }

    callback = parseAdminCallback(externalCallbackUrl, trustedOrigin);
  } catch {
    return redirectWithoutAuthQuery("/login", "link-invalid");
  }

  const collector = new CookieMutationCollector(request.cookies.getAll());
  const client = createAdminServerClient(resolution, collector);

  try {
    await completeAuthCallback(client, callback);
  } catch {
    const response = redirectWithoutAuthQuery("/login", "link-expired");
    collector.apply(response);
    return response;
  }

  const response = redirectWithoutAuthQuery("/");
  collector.apply(response);
  return response;
}
