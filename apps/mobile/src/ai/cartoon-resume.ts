const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_NAMESPACE_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
const SERIALIZED_RESUME_MAX_LENGTH = 1_024;

export type AiCartoonResumeScope = {
  childProfileId: string;
  familyId: string;
  userId: string;
};

export type AiCartoonResume = AiCartoonResumeScope & {
  jobId: string;
  requestId: string;
  version: 1;
};

function parseUuid(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Det gemte profilbillede er ugyldigt.");
  }

  const normalized = value.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("Det gemte profilbillede er ugyldigt.");
  }

  return normalized;
}

function normalizeAiCartoonResume(value: unknown): AiCartoonResume {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Det gemte profilbillede er ugyldigt.");
  }

  const record = value as Record<string, unknown>;

  if (record.version !== 1) {
    throw new Error("Det gemte profilbillede er ugyldigt.");
  }

  return {
    childProfileId: parseUuid(record.childProfileId),
    familyId: parseUuid(record.familyId),
    jobId: parseUuid(record.jobId),
    requestId: parseUuid(record.requestId),
    userId: parseUuid(record.userId),
    version: 1,
  };
}

function normalizeScope(scope: AiCartoonResumeScope): AiCartoonResumeScope {
  return {
    childProfileId: parseUuid(scope.childProfileId),
    familyId: parseUuid(scope.familyId),
    userId: parseUuid(scope.userId),
  };
}

export function createAiCartoonResumeStorageKey(
  input: AiCartoonResumeScope & { namespace: string },
): string {
  if (!STORAGE_NAMESPACE_PATTERN.test(input.namespace)) {
    throw new Error("Lagerområdet til profilbilledet er ugyldigt.");
  }

  const scope = normalizeScope(input);
  const key = `${input.namespace}.cartoon-resume.${scope.userId}.${scope.familyId}.${scope.childProfileId}`;

  if (key.length > 240) {
    throw new Error("Lagerområdet til profilbilledet er ugyldigt.");
  }

  return key;
}

export function parseAiCartoonResume(
  serialized: string,
  expectedScope: AiCartoonResumeScope,
): AiCartoonResume {
  if (
    typeof serialized !== "string" ||
    serialized.length === 0 ||
    serialized.length > SERIALIZED_RESUME_MAX_LENGTH
  ) {
    throw new Error("Det gemte profilbillede er ugyldigt.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Det gemte profilbillede er ugyldigt.");
  }

  const resume = normalizeAiCartoonResume(parsed);
  const scope = normalizeScope(expectedScope);

  if (
    resume.userId !== scope.userId ||
    resume.familyId !== scope.familyId ||
    resume.childProfileId !== scope.childProfileId
  ) {
    throw new Error("Det gemte profilbillede tilhører en anden profil.");
  }

  return resume;
}

export function serializeAiCartoonResume(resume: AiCartoonResume): string {
  return JSON.stringify(normalizeAiCartoonResume(resume));
}

export function shouldProtectAiCartoonNavigation(input: {
  phase: "idle" | "submitting" | "processing" | "succeeded" | "failed";
  picking: boolean;
  restoring: boolean;
  savingProfile: boolean;
}): boolean {
  return (
    input.restoring ||
    input.picking ||
    input.phase === "submitting" ||
    input.phase === "processing" ||
    input.savingProfile
  );
}
