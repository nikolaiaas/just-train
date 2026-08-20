import {
  isSameExternalOrigin,
  resolveExternalRequestLocation,
} from "../../../lib/auth/request-location.ts";

const LOCAL_SUPABASE_ORIGINS = [
  "http://127.0.0.1:54321",
  "http://localhost:54321",
] as const;

const MAX_CONFIRMATION_URL_LENGTH = 8_192;
const MAX_FORM_BODY_LENGTH = 12_000;

export type ConfirmationUrlOptions = {
  configuredSupabaseUrl: string | undefined;
  allowLocalSupabase: boolean;
  isVercel?: boolean;
};

const responseSecurityHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive, noimageindex",
} as const;

function parseConfiguredOrigin(
  configuredUrl: string | undefined,
  allowLocalSupabase: boolean,
): string | null {
  if (!configuredUrl) {
    return null;
  }

  try {
    const parsed = new URL(configuredUrl);
    const isLocalOrigin = LOCAL_SUPABASE_ORIGINS.includes(
      parsed.origin as (typeof LOCAL_SUPABASE_ORIGINS)[number],
    );

    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== "https:" && !(allowLocalSupabase && isLocalOrigin))
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

export function isLocalDevelopmentHost(
  host: string | null,
  environment: string | undefined,
): boolean {
  if (!host || environment !== "development") {
    return false;
  }

  try {
    const parsed = new URL(`http://${host}`);

    return (
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

export function validateConfirmationUrl(
  value: unknown,
  options: ConfirmationUrlOptions,
): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_CONFIRMATION_URL_LENGTH
  ) {
    return null;
  }

  const allowedOrigins = new Set<string>();
  const configuredOrigin = parseConfiguredOrigin(
    options.configuredSupabaseUrl,
    options.allowLocalSupabase,
  );

  if (configuredOrigin) {
    allowedOrigins.add(configuredOrigin);
  }

  if (options.allowLocalSupabase) {
    LOCAL_SUPABASE_ORIGINS.forEach((origin) => allowedOrigins.add(origin));
  }

  try {
    const parsed = new URL(value);
    const tokens = [
      ...parsed.searchParams.getAll("token"),
      ...parsed.searchParams.getAll("token_hash"),
    ].filter(Boolean);

    if (
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      parsed.pathname !== "/auth/v1/verify" ||
      !allowedOrigins.has(parsed.origin) ||
      tokens.length !== 1 ||
      !parsed.searchParams.get("type")
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function isSameOriginPost(request: Request, isVercel = false): boolean {
  if (request.method !== "POST") {
    return false;
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  const externalLocation = resolveExternalRequestLocation({
    requestUrl: request.url,
    hostHeader: request.headers.get("host"),
    forwardedProtocol: request.headers.get("x-forwarded-proto"),
    isVercel,
  });

  if (!externalLocation || (fetchSite && fetchSite !== "same-origin")) {
    return false;
  }

  return isSameExternalOrigin(request.headers.get("origin"), externalLocation);
}

function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      ...responseSecurityHeaders,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function handleConfirmationPost(
  request: Request,
  options: ConfirmationUrlOptions,
): Promise<Response> {
  if (!isSameOriginPost(request, options.isVercel)) {
    return textResponse("Anmodningen kunne ikke godkendes.", 403);
  }

  const contentType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (contentType !== "application/x-www-form-urlencoded") {
    return textResponse("Formularen kunne ikke læses.", 415);
  }

  let body: string;

  try {
    body = await request.text();
  } catch {
    return textResponse("Formularen kunne ikke læses.", 400);
  }

  if (body.length > MAX_FORM_BODY_LENGTH) {
    return textResponse("Formularen er for stor.", 413);
  }

  const formData = new URLSearchParams(body);
  const submittedUrls = formData.getAll("confirmation_url");
  const confirmationUrl = validateConfirmationUrl(
    submittedUrls.length === 1 ? submittedUrls[0] : null,
    options,
  );

  if (!confirmationUrl) {
    return textResponse(
      "Loginlinket kunne ikke godkendes. Bed om en ny mail.",
      400,
    );
  }

  return new Response(null, {
    status: 303,
    headers: {
      ...responseSecurityHeaders,
      Location: confirmationUrl,
    },
  });
}
