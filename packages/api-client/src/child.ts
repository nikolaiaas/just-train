import type { BareTraenClient } from "./index.ts";

export const CHILD_PROFILE_CONSENT_VERSION = "child-profile-pilot-v1" as const;

export const CHILD_AVATAR_PRESETS = [
  "preset-star",
  "preset-rocket",
  "preset-rainbow",
  "preset-sprout",
] as const;

export type ChildAvatarPreset = (typeof CHILD_AVATAR_PRESETS)[number];

export type CreateChildProfileInput = {
  avatarSeed: ChildAvatarPreset;
  consentGranted: boolean;
  consentVersion: typeof CHILD_PROFILE_CONSENT_VERSION;
  creationRequestId: string;
  displayName: string;
  expectedUserId: string;
  familyId: string;
};

export type CreateChildProfileResult = {
  avatarSeed: ChildAvatarPreset;
  childProfileId: string;
  consentVersion: typeof CHILD_PROFILE_CONSENT_VERSION;
  consentedAt: string;
  created: boolean;
  displayName: string;
  familyId: string;
  isActive: boolean;
};

export type CreateChildProfileErrorCode =
  | "invalid_avatar_seed"
  | "invalid_consent_version"
  | "invalid_creation_request_id"
  | "invalid_display_name"
  | "invalid_expected_user_id"
  | "invalid_family_id"
  | "consent_required"
  | "session_changed"
  | "family_access_denied"
  | "child_limit_reached"
  | "creation_failed"
  | "invalid_creation_result";

const ERROR_MESSAGES: Record<CreateChildProfileErrorCode, string> = {
  invalid_avatar_seed: "The selected child avatar is invalid.",
  invalid_consent_version: "The child-profile notice version is invalid.",
  invalid_creation_request_id: "The child creation request id is invalid.",
  invalid_display_name: "The child display name is invalid.",
  invalid_expected_user_id: "The expected adult account id is invalid.",
  invalid_family_id: "The family id is invalid.",
  consent_required: "The child-profile notice must be accepted.",
  session_changed: "The signed-in account changed before child creation.",
  family_access_denied: "The family cannot create this child profile.",
  child_limit_reached: "The family has reached its active child limit.",
  creation_failed: "The child profile could not be created.",
  invalid_creation_result: "Child creation returned an invalid result.",
};

export class CreateChildProfileError extends Error {
  readonly code: CreateChildProfileErrorCode;

  constructor(code: CreateChildProfileErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "CreateChildProfileError";
    this.code = code;
  }
}

const MAX_CHILD_NAME_LENGTH = 60;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validateUuid(
  value: unknown,
  code:
    | "invalid_family_id"
    | "invalid_creation_request_id"
    | "invalid_expected_user_id",
): string {
  if (!isUuid(value) || value.toLowerCase() === NIL_UUID) {
    throw new CreateChildProfileError(code);
  }

  return value.toLowerCase();
}

function normalizeChildName(value: unknown): string {
  if (typeof value !== "string") {
    throw new CreateChildProfileError("invalid_display_name");
  }

  const normalized = value.trim();

  if (
    !normalized ||
    Array.from(normalized).length > MAX_CHILD_NAME_LENGTH ||
    /[\u0000-\u001f\u007f-\u009f]/.test(normalized)
  ) {
    throw new CreateChildProfileError("invalid_display_name");
  }

  return normalized;
}

function isNormalizedChildName(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    return normalizeChildName(value) === value;
  } catch {
    return false;
  }
}

function isAvatarPreset(value: unknown): value is ChildAvatarPreset {
  return (
    typeof value === "string" &&
    (CHILD_AVATAR_PRESETS as readonly string[]).includes(value)
  );
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function mapDatabaseError(error: { code?: string } | null) {
  if (error?.code === "54000") {
    return new CreateChildProfileError("child_limit_reached");
  }

  if (error?.code === "28000") {
    return new CreateChildProfileError("session_changed");
  }

  if (error?.code === "42501") {
    return new CreateChildProfileError("family_access_denied");
  }

  return new CreateChildProfileError("creation_failed");
}

/**
 * Creates one parent-owned child profile and its versioned consent record in a
 * retry-safe database operation. Authority always comes from the Supabase
 * session; the captured expected account id only makes an account switch fail
 * closed before the family is mutated.
 */
export async function createChildProfile(
  client: BareTraenClient,
  input: CreateChildProfileInput,
): Promise<CreateChildProfileResult> {
  const familyId = validateUuid(input.familyId, "invalid_family_id");
  const creationRequestId = validateUuid(
    input.creationRequestId,
    "invalid_creation_request_id",
  );
  const expectedUserId = validateUuid(
    input.expectedUserId,
    "invalid_expected_user_id",
  );
  const displayName = normalizeChildName(input.displayName);

  if (!isAvatarPreset(input.avatarSeed)) {
    throw new CreateChildProfileError("invalid_avatar_seed");
  }

  if (input.consentGranted !== true) {
    throw new CreateChildProfileError("consent_required");
  }

  if (input.consentVersion !== CHILD_PROFILE_CONSENT_VERSION) {
    throw new CreateChildProfileError("invalid_consent_version");
  }

  const request = () =>
    client.rpc("create_child_profile", {
      p_avatar_seed: input.avatarSeed,
      p_consent_granted: true,
      p_consent_version: input.consentVersion,
      p_creation_request_id: creationRequestId,
      p_display_name: displayName,
      p_expected_user_id: expectedUserId,
      p_family_id: familyId,
    });
  let response: Awaited<ReturnType<typeof request>>;

  try {
    response = await request();
  } catch {
    throw new CreateChildProfileError("creation_failed");
  }

  const { data, error } = response;

  if (error) {
    throw mapDatabaseError(error);
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new CreateChildProfileError("invalid_creation_result");
  }

  const row = data[0];

  if (
    !row ||
    !isUuid(row.child_profile_id) ||
    row.family_id !== familyId ||
    !isNormalizedChildName(row.display_name) ||
    row.display_name !== displayName ||
    !isAvatarPreset(row.avatar_seed) ||
    row.avatar_seed !== input.avatarSeed ||
    typeof row.is_active !== "boolean" ||
    row.consent_version !== CHILD_PROFILE_CONSENT_VERSION ||
    !isTimestamp(row.consented_at) ||
    typeof row.created !== "boolean"
  ) {
    throw new CreateChildProfileError("invalid_creation_result");
  }

  return {
    avatarSeed: row.avatar_seed,
    childProfileId: row.child_profile_id,
    consentVersion: row.consent_version,
    consentedAt: row.consented_at,
    created: row.created,
    displayName: row.display_name,
    familyId: row.family_id,
    isActive: row.is_active,
  };
}
