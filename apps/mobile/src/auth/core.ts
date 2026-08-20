export const APP_VARIANTS = ["development", "preview", "production"] as const;

export type MobileAppVariant = (typeof APP_VARIANTS)[number];
export type MobilePlatform = "native" | "web";

const SCHEMES: Record<MobileAppVariant, string> = {
  development: "baretraen-dev",
  preview: "baretraen-preview",
  production: "baretraen",
};

const LOCAL_WEB_HOSTS = new Set(["localhost", "127.0.0.1"]);
const NON_HOSTED_HOSTS = new Set([...LOCAL_WEB_HOSTS, "[::1]", "0.0.0.0"]);
const MAX_ENCRYPTED_VALUE_LENGTH = 1_048_576;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type EncryptedStorageEnvelope = {
  algorithm: "A256GCM";
  combined: string;
  version: 1;
};

export function parseMobileAppVariant(value: unknown): MobileAppVariant {
  if (
    value === "development" ||
    value === "preview" ||
    value === "production"
  ) {
    return value;
  }

  throw new Error("App-varianten mangler eller er ugyldig.");
}

export function resolveMobileAppVariant(input: {
  updatesChannel: unknown;
  extraVariant: unknown;
  allowExtraVariantFallback: boolean;
}): MobileAppVariant {
  if (typeof input.updatesChannel === "string" && input.updatesChannel) {
    return parseMobileAppVariant(input.updatesChannel);
  }

  if (input.allowExtraVariantFallback) {
    return parseMobileAppVariant(input.extraVariant);
  }

  throw new Error("Den installerede app mangler en sikker update-kanal.");
}

export function resolveMobileAuthBackend(input: {
  platform: MobilePlatform;
  url: string;
  variant: MobileAppVariant;
}): "local" | "development" | "production" {
  let parsed: URL;

  try {
    parsed = new URL(input.url);
  } catch {
    throw new Error("Supabase-adressen er ugyldig.");
  }

  const isCleanBaseUrl =
    !parsed.username &&
    !parsed.password &&
    parsed.pathname === "/" &&
    !parsed.search &&
    !parsed.hash;
  const isExactLocalBackend =
    parsed.protocol === "http:" &&
    LOCAL_WEB_HOSTS.has(parsed.hostname) &&
    parsed.port === "54321" &&
    isCleanBaseUrl;
  const isHostedBackend =
    parsed.protocol === "https:" &&
    Boolean(parsed.hostname) &&
    !NON_HOSTED_HOSTS.has(parsed.hostname) &&
    isCleanBaseUrl;

  if (isExactLocalBackend) {
    if (input.platform !== "web" || input.variant === "production") {
      throw new Error("Denne app-variant må ikke bruge Local Supabase.");
    }

    return "local";
  }

  if (!isHostedBackend) {
    throw new Error("Supabase-adressen passer ikke til app-miljøet.");
  }

  return input.variant === "production" ? "production" : "development";
}

export function createAuthRedirect(
  variant: MobileAppVariant,
  platform: MobilePlatform,
  webOrigin?: string,
): string {
  if (platform === "native") {
    return `${SCHEMES[variant]}://auth/callback`;
  }

  if (!webOrigin) {
    throw new Error("Browserens adresse kunne ikke bestemmes.");
  }

  let origin: URL;

  try {
    origin = new URL(webOrigin);
  } catch {
    throw new Error("Browserens adresse er ugyldig.");
  }

  const isAllowedLocalOrigin =
    origin.protocol === "http:" &&
    LOCAL_WEB_HOSTS.has(origin.hostname) &&
    origin.port === "11001";
  const isAllowedHostedOrigin =
    origin.protocol === "https:" && Boolean(origin.hostname);

  if (
    (!isAllowedLocalOrigin && !isAllowedHostedOrigin) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error("Browserens login-adresse er ikke tilladt.");
  }

  return `${origin.origin}/auth/callback`;
}

export function secondsUntilResend(
  sentAt: number,
  now: number,
  cooldownMilliseconds = 60_000,
): number {
  if (!Number.isFinite(sentAt) || !Number.isFinite(now)) {
    return Math.ceil(cooldownMilliseconds / 1_000);
  }

  return Math.max(0, Math.ceil((sentAt + cooldownMilliseconds - now) / 1_000));
}

function normalizeShortName(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} mangler.`);
  }

  const normalized = value.trim();
  const characterCount = Array.from(normalized).length;

  if (
    characterCount < 1 ||
    characterCount > 80 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new Error(`${label} skal være mellem 1 og 80 tegn.`);
  }

  return normalized;
}

export function normalizeParentOnboarding(input: {
  displayName: unknown;
  familyName: unknown;
}): { displayName: string; familyName: string } {
  return {
    displayName: normalizeShortName(input.displayName, "Dit navn"),
    familyName: normalizeShortName(input.familyName, "Familiens navn"),
  };
}

export function serializeEncryptedStorageEnvelope(combined: string): string {
  if (
    !combined ||
    combined.length > MAX_ENCRYPTED_VALUE_LENGTH ||
    !BASE64_PATTERN.test(combined)
  ) {
    throw new Error("Den krypterede login-session er ugyldig.");
  }

  return JSON.stringify({
    algorithm: "A256GCM",
    combined,
    version: 1,
  } satisfies EncryptedStorageEnvelope);
}

export function parseEncryptedStorageEnvelope(
  value: string,
): EncryptedStorageEnvelope {
  if (!value || value.length > MAX_ENCRYPTED_VALUE_LENGTH) {
    throw new Error("Den gemte login-session er ugyldig.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Den gemte login-session er ugyldig.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("algorithm" in parsed) ||
    parsed.algorithm !== "A256GCM" ||
    !("combined" in parsed) ||
    typeof parsed.combined !== "string" ||
    !parsed.combined ||
    parsed.combined.length > MAX_ENCRYPTED_VALUE_LENGTH ||
    !BASE64_PATTERN.test(parsed.combined)
  ) {
    throw new Error("Den gemte login-session er ugyldig.");
  }

  return parsed as EncryptedStorageEnvelope;
}
