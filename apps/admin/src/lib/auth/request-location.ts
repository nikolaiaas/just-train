export type ExternalRequestLocation = {
  host: string;
  origin: string;
  pathname: string;
  protocol: "http:" | "https:";
};

function normalizeHostHeader(value: string | null): string | null {
  if (!value || value.length > 255 || value.trim() !== value) {
    return null;
  }

  try {
    const parsed = new URL("http://" + value);

    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return parsed.host;
  } catch {
    return null;
  }
}

function firstForwardedProtocol(
  value: string | null,
): "http:" | "https:" | null {
  const protocol = value?.split(",", 1)[0]?.trim().toLowerCase();

  if (protocol === "http") return "http:";
  if (protocol === "https") return "https:";

  return null;
}

export function resolveExternalRequestLocation(input: {
  requestUrl: string;
  hostHeader: string | null;
  forwardedProtocol: string | null;
  isVercel: boolean;
}): ExternalRequestLocation | null {
  const host = normalizeHostHeader(input.hostHeader);

  if (!host) {
    return null;
  }

  let internalUrl: URL;

  try {
    internalUrl = new URL(input.requestUrl);
  } catch {
    return null;
  }

  const forwardedProtocol = firstForwardedProtocol(input.forwardedProtocol);
  const internalProtocol =
    internalUrl.protocol === "http:" || internalUrl.protocol === "https:"
      ? internalUrl.protocol
      : null;
  const protocol = input.isVercel
    ? "https:"
    : (forwardedProtocol ?? internalProtocol);

  if (!protocol || internalUrl.username || internalUrl.password) {
    return null;
  }

  const origin = new URL(protocol + "//" + host);

  return {
    host,
    origin: origin.origin,
    pathname: internalUrl.pathname,
    protocol,
  };
}

export function isSameExternalOrigin(
  originHeader: string | null,
  externalLocation: ExternalRequestLocation,
): boolean {
  if (!originHeader || originHeader.length > 2_048) {
    return false;
  }

  try {
    const origin = new URL(originHeader);

    return (
      !origin.username &&
      !origin.password &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash &&
      origin.origin === externalLocation.origin
    );
  } catch {
    return false;
  }
}

export function externalizeRequestUrl(
  requestUrl: string,
  trustedOrigin: string,
): string | null {
  try {
    const internalUrl = new URL(requestUrl);
    const externalOrigin = new URL(trustedOrigin);

    if (
      internalUrl.username ||
      internalUrl.password ||
      internalUrl.hash ||
      externalOrigin.username ||
      externalOrigin.password ||
      externalOrigin.pathname !== "/" ||
      externalOrigin.search ||
      externalOrigin.hash
    ) {
      return null;
    }

    return externalOrigin.origin + internalUrl.pathname + internalUrl.search;
  } catch {
    return null;
  }
}
