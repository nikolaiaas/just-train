import "server-only";

import { cookies, headers } from "next/headers";

import { ADMIN_BACKEND_COOKIE, resolveAdminBackend } from "./backend";
import { readAdminBackendEnvironment } from "./environment";
import { resolveExternalRequestLocation } from "./request-location";

export async function getAdminRequestContext() {
  const [requestCookies, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  const host = requestHeaders.get("host");
  const externalLocation = resolveExternalRequestLocation({
    requestUrl: "http://" + (host ?? "invalid.local") + "/",
    hostHeader: host,
    forwardedProtocol: requestHeaders.get("x-forwarded-proto"),
    isVercel: process.env.VERCEL === "1",
  });
  const resolution = resolveAdminBackend({
    selectedBackend: requestCookies.get(ADMIN_BACKEND_COOKIE)?.value,
    location: {
      host: externalLocation?.host ?? null,
      protocol: externalLocation?.protocol ?? null,
      nodeEnvironment: process.env.NODE_ENV,
    },
    environment: readAdminBackendEnvironment(),
  });

  return { externalLocation, requestCookies, requestHeaders, resolution };
}
