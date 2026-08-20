import { isLocalAdminRequest, type AdminRequestLocation } from "./backend.ts";
import { resolveExternalRequestLocation } from "./request-location.ts";

function parseCleanOrigin(value: string | null | undefined): URL | null {
  if (!value || value.length > 2_048) {
    return null;
  }

  try {
    const parsed = new URL(value);

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

function canonicalHostedOrigin(input: {
  configuredOrigin?: string;
  vercelProjectProductionUrl?: string;
}): string | null {
  const configured = parseCleanOrigin(input.configuredOrigin);

  if (configured?.protocol === "https:") {
    return configured.origin;
  }

  const vercelHost = input.vercelProjectProductionUrl;

  if (
    vercelHost &&
    vercelHost.length <= 253 &&
    /^[a-z0-9.-]+$/i.test(vercelHost)
  ) {
    const vercelOrigin = parseCleanOrigin(`https://${vercelHost}`);
    return vercelOrigin?.origin ?? null;
  }

  return null;
}

function sameHost(origin: URL, host: string | null): boolean {
  if (!host || host.length > 255) {
    return false;
  }

  try {
    const parsedHost = new URL(`http://${host}`);
    return (
      !parsedHost.username &&
      !parsedHost.password &&
      parsedHost.pathname === "/" &&
      !parsedHost.search &&
      !parsedHost.hash &&
      parsedHost.host === origin.host
    );
  } catch {
    return false;
  }
}

export function resolveTrustedActionOrigin(input: {
  originHeader: string | null;
  hostHeader: string | null;
  nodeEnvironment: string | undefined;
  configuredOrigin?: string;
  vercelProjectProductionUrl?: string;
}): string | null {
  const origin = parseCleanOrigin(input.originHeader);

  if (!origin || !sameHost(origin, input.hostHeader)) {
    return null;
  }

  const location: AdminRequestLocation = {
    host: origin.host,
    protocol: origin.protocol,
    nodeEnvironment: input.nodeEnvironment,
  };

  if (isLocalAdminRequest(location)) {
    return origin.origin;
  }

  const canonical = canonicalHostedOrigin(input);
  return canonical === origin.origin ? canonical : null;
}

export function resolveTrustedCallbackOrigin(input: {
  requestUrl: string;
  hostHeader: string | null;
  forwardedProtocol: string | null;
  isVercel: boolean;
  nodeEnvironment: string | undefined;
  configuredOrigin?: string;
  vercelProjectProductionUrl?: string;
}): string | null {
  const externalLocation = resolveExternalRequestLocation(input);

  if (!externalLocation || externalLocation.pathname !== "/auth/callback") {
    return null;
  }

  if (
    isLocalAdminRequest({
      host: externalLocation.host,
      protocol: externalLocation.protocol,
      nodeEnvironment: input.nodeEnvironment,
    })
  ) {
    return externalLocation.origin;
  }

  const canonical = canonicalHostedOrigin(input);
  return canonical === externalLocation.origin ? canonical : null;
}
