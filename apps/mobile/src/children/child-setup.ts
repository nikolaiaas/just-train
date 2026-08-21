import {
  CHILD_AVATAR_PRESETS,
  type ChildAvatarPreset,
} from "@bare-traen/api-client";

export type { ChildAvatarPreset };

export type ChildAvatarOption = {
  id: ChildAvatarPreset;
  label: string;
  symbol: string;
};

const AVATAR_PRESENTATION: Record<
  ChildAvatarPreset,
  Omit<ChildAvatarOption, "id">
> = {
  "preset-star": { label: "Stjerne", symbol: "⭐" },
  "preset-rocket": { label: "Raket", symbol: "🚀" },
  "preset-rainbow": { label: "Regnbue", symbol: "🌈" },
  "preset-sprout": { label: "Spire", symbol: "🌱" },
};

export const CHILD_AVATAR_OPTIONS: readonly ChildAvatarOption[] =
  CHILD_AVATAR_PRESETS.map((id) => ({ id, ...AVATAR_PRESENTATION[id] }));

const FALLBACK_AVATAR: ChildAvatarOption = {
  id: "preset-star",
  label: "Stjerne",
  symbol: "⭐",
};

export type ChildSetupValidationField =
  "displayName" | "avatarSeed" | "consentGranted";

export class ChildSetupValidationError extends Error {
  readonly field: ChildSetupValidationField;

  constructor(field: ChildSetupValidationField, message: string) {
    super(message);
    this.name = "ChildSetupValidationError";
    this.field = field;
  }
}

export type NormalizedChildSetup = {
  avatarSeed: ChildAvatarPreset;
  consentGranted: true;
  displayName: string;
};

export type PendingChildCreation = NormalizedChildSetup & {
  creationRequestId: string;
  familyId: string;
  userId: string;
};

const PENDING_CHILD_CREATION_VERSION = 1;
const MAX_PENDING_CHILD_CREATION_LENGTH = 2_048;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function serializePendingChildCreation(
  pending: PendingChildCreation,
): string {
  const normalized = normalizeChildSetup(pending);

  if (
    !isUuid(pending.creationRequestId) ||
    !isUuid(pending.familyId) ||
    !isUuid(pending.userId)
  ) {
    throw new Error("Den ventende børneprofil er ugyldig.");
  }

  return JSON.stringify({
    avatarSeed: normalized.avatarSeed,
    consentGranted: true,
    creationRequestId: pending.creationRequestId.toLowerCase(),
    displayName: normalized.displayName,
    familyId: pending.familyId.toLowerCase(),
    userId: pending.userId.toLowerCase(),
    version: PENDING_CHILD_CREATION_VERSION,
  });
}

export function parsePendingChildCreation(
  serialized: string,
  expectedUserId: string,
): PendingChildCreation {
  if (
    serialized.length < 1 ||
    serialized.length > MAX_PENDING_CHILD_CREATION_LENGTH ||
    !isUuid(expectedUserId)
  ) {
    throw new Error("Den ventende børneprofil er ugyldig.");
  }

  const parsed: unknown = JSON.parse(serialized);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Den ventende børneprofil er ugyldig.");
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = [
    "avatarSeed",
    "consentGranted",
    "creationRequestId",
    "displayName",
    "familyId",
    "userId",
    "version",
  ].sort();

  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    record.version !== PENDING_CHILD_CREATION_VERSION ||
    record.consentGranted !== true ||
    !isUuid(record.creationRequestId) ||
    !isUuid(record.familyId) ||
    !isUuid(record.userId) ||
    record.userId.toLowerCase() !== expectedUserId.toLowerCase()
  ) {
    throw new Error("Den ventende børneprofil er ugyldig.");
  }

  const normalized = normalizeChildSetup({
    avatarSeed: record.avatarSeed,
    consentGranted: record.consentGranted,
    displayName: record.displayName,
  });

  if (normalized.displayName !== record.displayName) {
    throw new Error("Den ventende børneprofil er ugyldig.");
  }

  return {
    ...normalized,
    creationRequestId: record.creationRequestId.toLowerCase(),
    familyId: record.familyId.toLowerCase(),
    userId: record.userId.toLowerCase(),
  };
}

export function acquireChildCreationAttempt(lock: {
  current: boolean;
}): (() => void) | null {
  if (lock.current) {
    return null;
  }

  lock.current = true;
  let released = false;

  return () => {
    if (!released) {
      released = true;
      lock.current = false;
    }
  };
}

export function normalizedSetupFromPending(
  pending: PendingChildCreation | null,
): NormalizedChildSetup | null {
  if (!pending) {
    return null;
  }

  return {
    avatarSeed: pending.avatarSeed,
    consentGranted: true,
    displayName: pending.displayName,
  };
}

export function pendingChildCreationMatchesContext(
  pending: PendingChildCreation | null,
  context: { familyId: string; userId: string },
): boolean {
  return (
    !pending ||
    (pending.userId === context.userId && pending.familyId === context.familyId)
  );
}

export function isSamePendingChildCreation(
  active: PendingChildCreation | null,
  expected: PendingChildCreation,
): boolean {
  return (
    active !== null &&
    active.creationRequestId === expected.creationRequestId &&
    active.userId === expected.userId &&
    active.familyId === expected.familyId &&
    active.displayName === expected.displayName &&
    active.avatarSeed === expected.avatarSeed &&
    active.consentGranted === expected.consentGranted
  );
}

export function isChildAvatarPreset(
  value: unknown,
): value is ChildAvatarPreset {
  return (
    typeof value === "string" &&
    CHILD_AVATAR_PRESETS.some((preset) => preset === value)
  );
}

export function normalizeChildSetup(input: {
  avatarSeed: unknown;
  consentGranted: unknown;
  displayName: unknown;
}): NormalizedChildSetup {
  if (typeof input.displayName !== "string") {
    throw new ChildSetupValidationError(
      "displayName",
      "Skriv et navn eller kaldenavn på 1–60 tegn uden linjeskift.",
    );
  }

  const displayName = input.displayName.trim();
  const characterCount = Array.from(displayName).length;

  if (
    characterCount < 1 ||
    characterCount > 60 ||
    /[\u0000-\u001f\u007f-\u009f]/.test(displayName)
  ) {
    throw new ChildSetupValidationError(
      "displayName",
      "Skriv et navn eller kaldenavn på 1–60 tegn uden linjeskift.",
    );
  }

  if (!isChildAvatarPreset(input.avatarSeed)) {
    throw new ChildSetupValidationError(
      "avatarSeed",
      "Vælg en avatar til barnet.",
    );
  }

  if (input.consentGranted !== true) {
    throw new ChildSetupValidationError(
      "consentGranted",
      "Du skal bekræfte, at børneprofilen må oprettes.",
    );
  }

  return {
    avatarSeed: input.avatarSeed,
    consentGranted: true,
    displayName,
  };
}

export function resolveChildAvatar(
  avatarSeed: string | null,
): ChildAvatarOption {
  return (
    CHILD_AVATAR_OPTIONS.find((option) => option.id === avatarSeed) ??
    FALLBACK_AVATAR
  );
}

export function childSetupErrorMessage(error: unknown): string {
  if (error instanceof ChildSetupValidationError) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "child_limit_reached"
  ) {
    return "Familien har allerede det maksimale antal på 10 aktive børneprofiler.";
  }

  return "Vi kunne ikke bekræfte, om børneprofilen blev oprettet. Kontrollér forbindelsen, og prøv igen. Det er sikkert at trykke på Opret igen.";
}

export function isCurrentChildCreationContext(input: {
  bootstrapFamilyId: string | null;
  bootstrapProfileId: string | null;
  currentSessionUserId: string | null;
  requestedFamilyId: string;
  requestedUserId: string;
}): boolean {
  return (
    input.currentSessionUserId === input.requestedUserId &&
    input.bootstrapProfileId === input.requestedUserId &&
    input.bootstrapFamilyId === input.requestedFamilyId
  );
}

export function shouldRetainPendingChildCreation(error: unknown): boolean {
  if (error instanceof ChildSetupValidationError) {
    return false;
  }

  if (typeof error !== "object" || error === null || !("code" in error)) {
    return true;
  }

  return (
    error.code === "creation_failed" || error.code === "invalid_creation_result"
  );
}
