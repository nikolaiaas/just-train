import {
  AuthFlowError,
  parseAuthCallbackUrl,
  type AuthCallbackCode,
  type ParseAuthCallbackInput,
} from "@bare-traen/api-client";

const MAX_CALLBACK_URL_LENGTH = 8_192;
const ALLOWED_QUERY_KEYS = new Set(["code", "sb_flow_id"]);

/**
 * Mobile accepts only the PKCE code and the optional Bare Træn flow id. The
 * shared parser then verifies the exact callback target and both values.
 */
export function parseMobileAuthCallbackUrl(
  input: ParseAuthCallbackInput,
): AuthCallbackCode {
  if (
    typeof input.callbackUrl !== "string" ||
    !input.callbackUrl ||
    input.callbackUrl.length > MAX_CALLBACK_URL_LENGTH
  ) {
    throw new AuthFlowError("invalid_callback_url");
  }

  let callback: URL;

  try {
    callback = new URL(input.callbackUrl);
  } catch {
    throw new AuthFlowError("invalid_callback_url");
  }

  for (const key of callback.searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      throw new AuthFlowError("invalid_callback_url");
    }
  }

  if (
    callback.searchParams.getAll("code").length !== 1 ||
    callback.searchParams.getAll("sb_flow_id").length > 1
  ) {
    throw new AuthFlowError("invalid_callback_code");
  }

  return parseAuthCallbackUrl(input);
}
