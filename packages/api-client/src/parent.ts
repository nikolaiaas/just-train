import type { BareTraenClient } from "./index.ts";

export type CompleteParentOnboardingInput = {
  displayName: string;
  familyName: string;
};

export type ParentOnboardingResult = {
  profileId: string;
  displayName: string;
  familyId: string;
  familyName: string;
  role: "owner" | "caregiver";
  created: boolean;
};

export type ParentOnboardingErrorCode =
  | "invalid_display_name"
  | "invalid_family_name"
  | "onboarding_failed"
  | "invalid_onboarding_result";

const ERROR_MESSAGES: Record<ParentOnboardingErrorCode, string> = {
  invalid_display_name: "The adult display name is invalid.",
  invalid_family_name: "The family name is invalid.",
  onboarding_failed: "Parent onboarding could not be completed.",
  invalid_onboarding_result: "Parent onboarding returned an invalid result.",
};

export class ParentOnboardingError extends Error {
  readonly code: ParentOnboardingErrorCode;

  constructor(code: ParentOnboardingErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ParentOnboardingError";
    this.code = code;
  }
}

const MAX_NAME_LENGTH = 80;

function normalizeName(
  value: unknown,
  code: "invalid_display_name" | "invalid_family_name",
): string {
  if (typeof value !== "string") {
    throw new ParentOnboardingError(code);
  }

  const normalized = value.trim();

  if (
    !normalized ||
    normalized.length > MAX_NAME_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new ParentOnboardingError(code);
  }

  return normalized;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isNormalizedName(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    return normalizeName(value, "invalid_display_name") === value;
  } catch {
    return false;
  }
}

/**
 * Completes the authenticated adult's first-family setup as one retry-safe
 * database operation. The RPC derives identity from the session; callers never
 * supply a user or family id.
 */
export async function completeParentOnboarding(
  client: BareTraenClient,
  input: CompleteParentOnboardingInput,
): Promise<ParentOnboardingResult> {
  const displayName = normalizeName(input.displayName, "invalid_display_name");
  const familyName = normalizeName(input.familyName, "invalid_family_name");

  const request = () =>
    client.rpc("complete_parent_onboarding", {
      p_display_name: displayName,
      p_family_name: familyName,
    });
  let response: Awaited<ReturnType<typeof request>>;

  try {
    response = await request();
  } catch {
    throw new ParentOnboardingError("onboarding_failed");
  }

  const { data, error } = response;

  if (error) {
    throw new ParentOnboardingError("onboarding_failed");
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new ParentOnboardingError("invalid_onboarding_result");
  }

  const row = data[0];

  if (
    !row ||
    !isUuid(row.profile_id) ||
    !isUuid(row.family_id) ||
    !isNormalizedName(row.display_name) ||
    !isNormalizedName(row.family_name) ||
    (row.role !== "owner" && row.role !== "caregiver") ||
    typeof row.created !== "boolean"
  ) {
    throw new ParentOnboardingError("invalid_onboarding_result");
  }

  return {
    profileId: row.profile_id,
    displayName: row.display_name,
    familyId: row.family_id,
    familyName: row.family_name,
    role: row.role,
    created: row.created,
  };
}
