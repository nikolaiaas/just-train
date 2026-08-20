import {
  parseAuthCallbackUrl,
  type AuthCallbackCode,
} from "@bare-traen/api-client";

export const LOGIN_REASONS = [
  "configuration",
  "link-expired",
  "link-invalid",
  "signed-out",
] as const;

export type LoginReason = (typeof LOGIN_REASONS)[number];

export function parseLoginReason(value: unknown): LoginReason | null {
  if (typeof value !== "string") {
    return null;
  }

  return (LOGIN_REASONS as readonly string[]).includes(value)
    ? (value as LoginReason)
    : null;
}

export function parseAdminCallback(
  callbackUrl: string,
  trustedOrigin: string,
): AuthCallbackCode {
  const parsed = new URL(callbackUrl);
  const allowedKeys = new Set(["code", "sb_flow_id"]);

  for (const key of parsed.searchParams.keys()) {
    if (!allowedKeys.has(key)) {
      throw new Error("Unexpected callback parameter.");
    }
  }

  return parseAuthCallbackUrl({
    callbackUrl,
    expectedRedirectTo: `${trustedOrigin}/auth/callback`,
  });
}
