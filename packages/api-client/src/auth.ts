import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import type { BareTraenClient } from "./index.ts";

export type EmailAccountPolicy = "existing-only" | "create-if-needed";

export type RequestEmailSignInInput = {
  email: string;
  redirectTo: string;
  accountPolicy: EmailAccountPolicy;
  captchaToken?: string;
};

export type VerifyEmailOtpInput = {
  email: string;
  code: string;
};

export type ParseAuthCallbackInput = {
  callbackUrl: string;
  expectedRedirectTo: string;
};

export type AuthCallbackCode = {
  code: string;
  flowId?: string;
};

export type BareTraenAuthSession = Session;
export type BareTraenAuthEvent = AuthChangeEvent;

export type AuthSessionListener = (
  event: BareTraenAuthEvent,
  session: BareTraenAuthSession | null,
) => void;

export type AuthSurface = "admin" | "mobile";
export type AppVariant = "development" | "preview" | "production";
export type AuthBackend = "local" | "development" | "preview" | "production";

export type AuthStorageScope = {
  surface: AuthSurface;
  appVariant: AppVariant;
  backend: AuthBackend;
};

export type AuthFlowErrorCode =
  | "invalid_account_policy"
  | "invalid_callback_code"
  | "invalid_callback_url"
  | "invalid_captcha_token"
  | "invalid_email"
  | "invalid_otp"
  | "invalid_redirect_url"
  | "invalid_storage_scope"
  | "callback_rejected"
  | "callback_target_mismatch"
  | "missing_callback_code"
  | "missing_session";

const AUTH_FLOW_ERROR_MESSAGES: Record<AuthFlowErrorCode, string> = {
  invalid_account_policy: "The email account policy is invalid.",
  invalid_callback_code: "The sign-in callback code is invalid.",
  invalid_callback_url: "The sign-in callback address is invalid.",
  invalid_captcha_token: "The CAPTCHA token is invalid.",
  invalid_email: "The email address is invalid.",
  invalid_otp: "The one-time code must contain exactly six digits.",
  invalid_redirect_url: "The sign-in redirect address is invalid.",
  invalid_storage_scope: "The authentication storage scope is invalid.",
  callback_rejected: "The sign-in callback was rejected.",
  callback_target_mismatch: "The sign-in callback target does not match.",
  missing_callback_code: "The sign-in callback code is missing.",
  missing_session: "Sign-in completed without a session.",
};

export class AuthFlowError extends Error {
  readonly code: AuthFlowErrorCode;

  constructor(code: AuthFlowErrorCode) {
    super(AUTH_FLOW_ERROR_MESSAGES[code]);
    this.name = "AuthFlowError";
    this.code = code;
  }
}

const MAX_EMAIL_LENGTH = 254;
const MAX_CAPTCHA_TOKEN_LENGTH = 4_096;
const MAX_CALLBACK_URL_LENGTH = 8_192;
const MAX_CALLBACK_CODE_LENGTH = 2_048;
const MIN_FLOW_ID_LENGTH = 8;
const MAX_FLOW_ID_LENGTH = 64;
const AUTH_CALLBACK_PATH = "/auth/callback";
const LOCAL_WEB_CALLBACK_PORTS = new Set(["11000", "11001"]);
const APP_CALLBACK_SCHEMES = new Set([
  "baretraen-dev:",
  "baretraen-preview:",
  "baretraen:",
]);
const AUTH_SURFACES = new Set<AuthSurface>(["admin", "mobile"]);
const APP_VARIANTS = new Set<AppVariant>([
  "development",
  "preview",
  "production",
]);
const AUTH_BACKENDS = new Set<AuthBackend>([
  "local",
  "development",
  "preview",
  "production",
]);

function authFlowError(code: AuthFlowErrorCode): AuthFlowError {
  return new AuthFlowError(code);
}

function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") {
    throw authFlowError("invalid_email");
  }

  const normalized = email.trim();

  const atIndex = normalized.indexOf("@");

  if (
    !normalized ||
    normalized.length > MAX_EMAIL_LENGTH ||
    /\s/.test(normalized) ||
    atIndex <= 0 ||
    atIndex !== normalized.lastIndexOf("@") ||
    atIndex === normalized.length - 1
  ) {
    throw authFlowError("invalid_email");
  }

  return normalized;
}

function normalizeOtp(code: unknown): string {
  if (typeof code !== "string") {
    throw authFlowError("invalid_otp");
  }

  const normalized = code.replace(/\s/g, "");

  if (!/^[0-9]{6}$/.test(normalized)) {
    throw authFlowError("invalid_otp");
  }

  return normalized;
}

function normalizeCaptchaToken(token: unknown): string | undefined {
  if (token === undefined) {
    return undefined;
  }

  if (typeof token !== "string") {
    throw authFlowError("invalid_captcha_token");
  }

  return requireSafeValue(
    token,
    MAX_CAPTCHA_TOKEN_LENGTH,
    "invalid_captcha_token",
  );
}

function requireSafeValue(
  value: string,
  maxLength: number,
  errorCode: AuthFlowErrorCode,
): string {
  if (
    !value ||
    value.length > maxLength ||
    /[\u0000-\u0020\u007f]/.test(value)
  ) {
    throw authFlowError(errorCode);
  }

  return value;
}

function parseUrl(
  value: unknown,
  errorCode: "invalid_callback_url" | "invalid_redirect_url",
): URL {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_CALLBACK_URL_LENGTH
  ) {
    throw authFlowError(errorCode);
  }

  try {
    const parsed = new URL(value);

    if (parsed.username || parsed.password) {
      throw authFlowError(errorCode);
    }

    return parsed;
  } catch (error) {
    if (error instanceof AuthFlowError) {
      throw error;
    }

    throw authFlowError(errorCode);
  }
}

function assertAllowedRedirectTarget(parsed: URL): void {
  if (parsed.search || parsed.hash) {
    throw authFlowError("invalid_redirect_url");
  }

  if (parsed.protocol === "https:") {
    if (!parsed.hostname || parsed.pathname !== AUTH_CALLBACK_PATH) {
      throw authFlowError("invalid_redirect_url");
    }

    return;
  }

  if (parsed.protocol === "http:") {
    const isLoopback =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

    if (
      !isLoopback ||
      !LOCAL_WEB_CALLBACK_PORTS.has(parsed.port) ||
      parsed.pathname !== AUTH_CALLBACK_PATH
    ) {
      throw authFlowError("invalid_redirect_url");
    }

    return;
  }

  if (
    APP_CALLBACK_SCHEMES.has(parsed.protocol) &&
    parsed.hostname === "auth" &&
    parsed.port === "" &&
    parsed.pathname === "/callback"
  ) {
    return;
  }

  throw authFlowError("invalid_redirect_url");
}

function normalizeRedirectTo(redirectTo: unknown): string {
  if (typeof redirectTo !== "string") {
    throw authFlowError("invalid_redirect_url");
  }

  const normalized = redirectTo.trim();
  const parsed = parseUrl(normalized, "invalid_redirect_url");
  assertAllowedRedirectTarget(parsed);
  return normalized;
}

function sameCallbackTarget(callback: URL, expected: URL): boolean {
  return (
    callback.protocol === expected.protocol &&
    callback.hostname === expected.hostname &&
    callback.port === expected.port &&
    callback.pathname === expected.pathname
  );
}

function requireSession(
  session: BareTraenAuthSession | null,
): BareTraenAuthSession {
  if (!session) {
    throw authFlowError("missing_session");
  }

  return session;
}

function assertAccountPolicy(
  policy: unknown,
): asserts policy is EmailAccountPolicy {
  if (policy !== "existing-only" && policy !== "create-if-needed") {
    throw authFlowError("invalid_account_policy");
  }
}

/**
 * Requests one passwordless email containing both the configured one-time code
 * and magic-link choices. `redirectTo` must come from trusted application
 * configuration, never directly from request or form input. Account creation
 * is deliberately explicit because Supabase otherwise creates a user by
 * default.
 */
export async function requestEmailSignIn(
  client: BareTraenClient,
  input: RequestEmailSignInInput,
): Promise<{ email: string }> {
  const email = normalizeEmail(input.email);
  const redirectTo = normalizeRedirectTo(input.redirectTo);
  const captchaToken = normalizeCaptchaToken(input.captchaToken);
  assertAccountPolicy(input.accountPolicy);

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: input.accountPolicy === "create-if-needed",
      ...(captchaToken ? { captchaToken } : {}),
    },
  });

  if (error) {
    throw error;
  }

  return { email };
}

/** Verifies the six-digit choice from the passwordless email. */
export async function verifyEmailOtp(
  client: BareTraenClient,
  input: VerifyEmailOtpInput,
): Promise<BareTraenAuthSession> {
  const email = normalizeEmail(input.email);
  const token = normalizeOtp(input.code);
  const { data, error } = await client.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    throw error;
  }

  return requireSession(data.session);
}

/**
 * Reads a PKCE callback without depending on a browser or native linking API.
 * The caller supplies the same trusted, clean redirect target used for the
 * request.
 */
export function parseAuthCallbackUrl(
  input: ParseAuthCallbackInput,
): AuthCallbackCode {
  const expectedRedirectTo = normalizeRedirectTo(input.expectedRedirectTo);
  const expected = parseUrl(expectedRedirectTo, "invalid_redirect_url");
  const callback = parseUrl(input.callbackUrl, "invalid_callback_url");

  if (callback.hash) {
    throw authFlowError("invalid_callback_url");
  }

  if (!sameCallbackTarget(callback, expected)) {
    throw authFlowError("callback_target_mismatch");
  }

  if (
    callback.searchParams.has("error") ||
    callback.searchParams.has("error_code") ||
    callback.searchParams.has("error_description")
  ) {
    throw authFlowError("callback_rejected");
  }

  if (
    callback.searchParams.has("access_token") ||
    callback.searchParams.has("refresh_token")
  ) {
    throw authFlowError("invalid_callback_url");
  }

  const codes = callback.searchParams.getAll("code");

  if (codes.length === 0) {
    throw authFlowError("missing_callback_code");
  }

  if (codes.length !== 1) {
    throw authFlowError("invalid_callback_code");
  }

  const code = requireSafeValue(
    codes[0] ?? "",
    MAX_CALLBACK_CODE_LENGTH,
    "invalid_callback_code",
  );
  const flowIds = callback.searchParams.getAll("sb_flow_id");

  if (flowIds.length > 1) {
    throw authFlowError("invalid_callback_code");
  }

  const flowId = flowIds[0];

  if (flowId === undefined) {
    return { code };
  }

  requireSafeValue(flowId, MAX_FLOW_ID_LENGTH, "invalid_callback_code");

  if (flowId.length < MIN_FLOW_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(flowId)) {
    throw authFlowError("invalid_callback_code");
  }

  return { code, flowId };
}

/** Exchanges a parsed PKCE callback code for its persisted client session. */
export async function completeAuthCallback(
  client: BareTraenClient,
  callback: AuthCallbackCode,
): Promise<BareTraenAuthSession> {
  const code = requireSafeValue(
    callback.code,
    MAX_CALLBACK_CODE_LENGTH,
    "invalid_callback_code",
  );
  const flowId = callback.flowId;

  if (flowId !== undefined) {
    requireSafeValue(flowId, MAX_FLOW_ID_LENGTH, "invalid_callback_code");

    if (
      flowId.length < MIN_FLOW_ID_LENGTH ||
      !/^[A-Za-z0-9_-]+$/.test(flowId)
    ) {
      throw authFlowError("invalid_callback_code");
    }
  }

  const { data, error } = flowId
    ? await client.auth.exchangeCodeForSession(code, { flowId })
    : await client.auth.exchangeCodeForSession(code);

  if (error) {
    throw error;
  }

  return requireSession(data.session);
}

/**
 * Restores client UI state from the configured storage adapter. A server route
 * must verify authorization with getUser/getClaims and database policy checks;
 * it must not trust this storage-derived value as proof of identity.
 */
export async function restoreSession(
  client: BareTraenClient,
): Promise<BareTraenAuthSession | null> {
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

/** Subscribes to auth changes and returns a platform-neutral cleanup function. */
export function onAuthSessionChange(
  client: BareTraenClient,
  listener: AuthSessionListener,
): () => void {
  const { data } = client.auth.onAuthStateChange((event, session): void => {
    listener(event, session);
  });

  return () => data.subscription.unsubscribe();
}

/** Signs out only this client session, leaving the user's other devices alone. */
export async function logout(client: BareTraenClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: "local" });

  if (error) {
    throw error;
  }
}

/**
 * Builds a stable, cookie-safe namespace. Backends intentionally never share
 * persisted sessions; bump the version when replacing a logical backend.
 */
export function createAuthStorageKey(scope: AuthStorageScope): string {
  if (
    !AUTH_SURFACES.has(scope.surface) ||
    !APP_VARIANTS.has(scope.appVariant) ||
    !AUTH_BACKENDS.has(scope.backend)
  ) {
    throw authFlowError("invalid_storage_scope");
  }

  return `bt-auth-v1-${scope.surface}-${scope.appVariant}-${scope.backend}`;
}
