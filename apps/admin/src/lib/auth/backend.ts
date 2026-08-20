import {
  createAuthStorageKey,
  parsePublicSupabaseConfig,
  type PublicSupabaseConfig,
} from "@bare-traen/api-client";

export const ADMIN_BACKEND_COOKIE = "bt-admin-backend-v1";

export type AdminBackend = "local" | "development";

export type AdminBackendEnvironment = {
  developmentUrl?: string;
  developmentPublishableKey?: string;
  localUrl?: string;
  localPublishableKey?: string;
};

export type AdminRequestLocation = {
  host: string | null;
  protocol: string | null;
  nodeEnvironment: string | undefined;
};

export type AdminBackendResolution = {
  backend: AdminBackend;
  config: PublicSupabaseConfig | null;
  configured: boolean;
  localAvailable: boolean;
  selectorVisible: boolean;
  secureCookies: boolean;
  storageKey: string;
};

function parseHost(host: string | null): URL | null {
  if (!host || host.length > 255) {
    return null;
  }

  try {
    const parsed = new URL(`http://${host}`);

    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function isLocalAdminRequest(location: AdminRequestLocation): boolean {
  if (
    location.nodeEnvironment !== "development" ||
    location.protocol !== "http:"
  ) {
    return false;
  }

  const parsedHost = parseHost(location.host);

  return Boolean(
    parsedHost &&
    parsedHost.port === "11000" &&
    (parsedHost.hostname === "localhost" ||
      parsedHost.hostname === "127.0.0.1"),
  );
}

function parseDevelopmentConfig(
  environment: AdminBackendEnvironment,
): PublicSupabaseConfig | null {
  try {
    const config = parsePublicSupabaseConfig({
      url: environment.developmentUrl,
      publishableKey: environment.developmentPublishableKey,
    });

    return new URL(config.url).protocol === "https:" ? config : null;
  } catch {
    return null;
  }
}

function parseLocalConfig(
  environment: AdminBackendEnvironment,
): PublicSupabaseConfig | null {
  try {
    const config = parsePublicSupabaseConfig({
      url: environment.localUrl,
      publishableKey: environment.localPublishableKey,
    });
    const parsed = new URL(config.url);

    return parsed.protocol === "http:" &&
      parsed.port === "54321" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
      ? config
      : null;
  } catch {
    return null;
  }
}

export function resolveAdminBackend(input: {
  selectedBackend: unknown;
  location: AdminRequestLocation;
  environment: AdminBackendEnvironment;
}): AdminBackendResolution {
  const selectorVisible = isLocalAdminRequest(input.location);
  const developmentConfig = parseDevelopmentConfig(input.environment);
  const localConfig = selectorVisible
    ? parseLocalConfig(input.environment)
    : null;
  const localAvailable = Boolean(localConfig);
  const backend: AdminBackend =
    input.selectedBackend === "local" && localAvailable
      ? "local"
      : "development";
  const config = backend === "local" ? localConfig : developmentConfig;

  return {
    backend,
    config,
    configured: Boolean(config),
    localAvailable,
    selectorVisible,
    secureCookies: !selectorVisible,
    storageKey: createAuthStorageKey({
      surface: "admin",
      appVariant: "development",
      backend,
    }),
  };
}
