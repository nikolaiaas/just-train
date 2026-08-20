import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_BACKEND_COOKIE, resolveAdminBackend } from "@/lib/auth/backend";
import { readAdminBackendEnvironment } from "@/lib/auth/environment";
import { shouldRefreshAuthForPath } from "@/lib/auth/proxy-session";
import { resolveExternalRequestLocation } from "@/lib/auth/request-location";
import type { AdminCookie } from "@/lib/supabase/server-client";
import { createAdminServerClient } from "@/lib/supabase/server-client";

function applyPrivateHeaders(
  response: NextResponse,
  headers: Map<string, string>,
): void {
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");

  for (const [name, value] of headers) {
    response.headers.set(name, value);
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!shouldRefreshAuthForPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const externalLocation = resolveExternalRequestLocation({
    requestUrl: request.url,
    hostHeader: request.headers.get("host"),
    forwardedProtocol: request.headers.get("x-forwarded-proto"),
    isVercel: process.env.VERCEL === "1",
  });
  const resolution = resolveAdminBackend({
    selectedBackend: request.cookies.get(ADMIN_BACKEND_COOKIE)?.value,
    location: {
      host: externalLocation?.host ?? null,
      protocol: externalLocation?.protocol ?? null,
      nodeEnvironment: process.env.NODE_ENV,
    },
    environment: readAdminBackendEnvironment(),
  });
  const mutations = new Map<string, AdminCookie>();
  const cacheHeaders = new Map<string, string>();

  const buildResponse = (): NextResponse => {
    const nextResponse = NextResponse.next({ request });

    for (const { name, value, options } of mutations.values()) {
      nextResponse.cookies.set({ name, value, ...options });
    }

    applyPrivateHeaders(nextResponse, cacheHeaders);
    return nextResponse;
  };

  let response = buildResponse();

  if (!externalLocation || !resolution.configured) {
    return response;
  }

  const client = createAdminServerClient(resolution, {
    getAll: () => request.cookies.getAll(),
    setAll(cookies, headers) {
      for (const cookie of cookies) {
        request.cookies.set(cookie.name, cookie.value);
        mutations.set(cookie.name, cookie);
      }

      for (const [name, value] of Object.entries(headers)) {
        cacheHeaders.set(name, value);
      }

      response = buildResponse();
    },
  });

  try {
    await client.auth.getClaims();
  } catch {
    // Authorization remains in the server-only DAL, never in Proxy.
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:avif|css|gif|ico|jpe?g|js|json|map|png|svg|webp|woff2?)$).*)",
  ],
};
