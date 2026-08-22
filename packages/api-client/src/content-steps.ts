import type { BareTraenClient } from "./index.ts";

export type AdminContentDifficulty = "beginner" | "intermediate" | "advanced";

export type AdminExerciseMeasurement =
  "completion" | "repetitions" | "duration";

export type AdminGoalDraft = {
  contentVersion: number;
  createdAt: string;
  createdBy: string;
  difficulty: AdminContentDifficulty;
  equipment: string[];
  estimatedMinutes: number | null;
  heroMediaUrl: string | null;
  id: string;
  publishedAt: null;
  slug: string;
  sortOrder: number;
  status: "draft";
  summary: string;
  title: string;
  topicId: string;
  updatedAt: string;
};

export type AdminExerciseDraft = {
  contentVersion: number;
  createdAt: string;
  createdBy: string;
  equipment: string[];
  estimatedMinutes: number | null;
  goalId: string;
  id: string;
  instructions: string;
  measurement: AdminExerciseMeasurement;
  publishedAt: null;
  safetyNotes: string;
  slug: string;
  sortOrder: number;
  status: "draft";
  targetValue: number | null;
  title: string;
  updatedAt: string;
  videoUrl: string | null;
};

export type CreateAdminGoalDraftInput = {
  /** Resolved from the authenticated admin session by trusted server code. */
  authenticatedUserId: string;
  difficulty: AdminContentDifficulty;
  equipment: string[];
  estimatedMinutes: number | null;
  heroMediaUrl: string | null;
  /** A stable request UUID that also becomes the new goal id. */
  requestId: string;
  slug: string;
  sortOrder: number;
  summary: string;
  title: string;
  topicId: string;
};

export type CreateAdminExerciseDraftInput = {
  /** Resolved from the authenticated admin session by trusted server code. */
  authenticatedUserId: string;
  equipment: string[];
  estimatedMinutes: number | null;
  goalId: string;
  instructions: string;
  measurement: AdminExerciseMeasurement;
  /** A stable request UUID that also becomes the new exercise id. */
  requestId: string;
  safetyNotes: string;
  slug: string;
  sortOrder: number;
  targetValue: number | null;
  title: string;
  videoUrl: string | null;
};

/** Uses `requestId` as the id of the existing unpublished goal draft. */
export type UpdateAdminGoalDraftInput = CreateAdminGoalDraftInput & {
  /** The revision returned by the last successful load or save. */
  expectedUpdatedAt: string;
};

/** Uses `requestId` as the id of the existing unpublished exercise draft. */
export type UpdateAdminExerciseDraftInput = CreateAdminExerciseDraftInput & {
  /** The revision returned by the last successful load or save. */
  expectedUpdatedAt: string;
};

export type CreateAdminGoalDraftResult = {
  created: boolean;
  goal: AdminGoalDraft;
};

export type CreateAdminExerciseDraftResult = {
  created: boolean;
  exercise: AdminExerciseDraft;
};

export type UpdateAdminGoalDraftResult = {
  goal: AdminGoalDraft;
};

export type UpdateAdminExerciseDraftResult = {
  exercise: AdminExerciseDraft;
};

export type AdminContentStepErrorCode =
  | "admin_access_denied"
  | "exercise_creation_conflict"
  | "exercise_creation_failed"
  | "exercise_draft_conflict"
  | "exercise_draft_not_editable"
  | "exercise_slug_conflict"
  | "exercise_update_failed"
  | "goal_creation_conflict"
  | "goal_creation_failed"
  | "goal_draft_conflict"
  | "goal_draft_not_editable"
  | "goal_slug_conflict"
  | "goal_update_failed"
  | "invalid_authenticated_user_id"
  | "invalid_difficulty"
  | "invalid_equipment"
  | "invalid_estimated_minutes"
  | "invalid_expected_updated_at"
  | "invalid_exercise_creation_result"
  | "invalid_exercise_update_result"
  | "invalid_goal_creation_result"
  | "invalid_goal_update_result"
  | "invalid_goal_id"
  | "invalid_hero_media_url"
  | "invalid_instructions"
  | "invalid_measurement"
  | "invalid_request_id"
  | "invalid_safety_notes"
  | "invalid_slug"
  | "invalid_sort_order"
  | "invalid_summary"
  | "invalid_target_value"
  | "invalid_title"
  | "invalid_topic_id"
  | "invalid_video_url";

const ERROR_MESSAGES: Record<AdminContentStepErrorCode, string> = {
  admin_access_denied: "The account cannot administer training content.",
  exercise_creation_conflict:
    "The exercise draft request conflicts with existing content.",
  exercise_creation_failed: "The exercise draft could not be created.",
  exercise_draft_conflict: "The exercise draft was changed by another editor.",
  exercise_draft_not_editable: "The exercise draft is no longer editable.",
  exercise_slug_conflict: "An exercise already uses this slug in the goal.",
  exercise_update_failed: "The exercise draft could not be updated.",
  goal_creation_conflict:
    "The training goal draft request conflicts with existing content.",
  goal_creation_failed: "The training goal draft could not be created.",
  goal_draft_conflict: "The training goal draft was changed by another editor.",
  goal_draft_not_editable: "The training goal draft is no longer editable.",
  goal_slug_conflict: "A training goal already uses this slug in the topic.",
  goal_update_failed: "The training goal draft could not be updated.",
  invalid_authenticated_user_id:
    "The authenticated administrator id is invalid.",
  invalid_difficulty: "The training goal difficulty is invalid.",
  invalid_equipment: "The training goal equipment is invalid.",
  invalid_estimated_minutes: "The training goal estimated duration is invalid.",
  invalid_expected_updated_at: "The expected draft revision is invalid.",
  invalid_exercise_creation_result:
    "Exercise creation returned an invalid result.",
  invalid_exercise_update_result: "Exercise update returned an invalid result.",
  invalid_goal_creation_result:
    "Training goal creation returned an invalid result.",
  invalid_goal_update_result:
    "Training goal update returned an invalid result.",
  invalid_goal_id: "The exercise training goal id is invalid.",
  invalid_hero_media_url: "The training goal media URL is invalid.",
  invalid_instructions: "The exercise instructions are invalid.",
  invalid_measurement: "The exercise measurement is invalid.",
  invalid_request_id: "The content draft request id is invalid.",
  invalid_safety_notes: "The exercise safety guidance is invalid.",
  invalid_slug: "The content slug is invalid.",
  invalid_sort_order: "The content sort order is invalid.",
  invalid_summary: "The training goal summary is invalid.",
  invalid_target_value: "The exercise target value is invalid.",
  invalid_title: "The content title is invalid.",
  invalid_topic_id: "The training goal topic id is invalid.",
  invalid_video_url: "The exercise video URL is invalid.",
};

export class AdminContentStepError extends Error {
  readonly code: AdminContentStepErrorCode;

  constructor(code: AdminContentStepErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "AdminContentStepError";
    this.code = code;
  }
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SINGLE_LINE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const DIFFICULTIES = new Set<AdminContentDifficulty>([
  "beginner",
  "intermediate",
  "advanced",
]);
const MEASUREMENTS = new Set<AdminExerciseMeasurement>([
  "completion",
  "repetitions",
  "duration",
]);
const MAX_TITLE_LENGTH = 120;
const MAX_SLUG_LENGTH = 120;
const MAX_SUMMARY_LENGTH = 1_000;
const MAX_INSTRUCTIONS_LENGTH = 1_500;
const MAX_SAFETY_NOTES_LENGTH = 1_000;
const MAX_EQUIPMENT_ITEMS = 12;
const MAX_EQUIPMENT_ITEM_LENGTH = 80;
const MAX_URL_LENGTH = 2_048;
const MAX_SORT_ORDER = 2_147_483_647;
const MAX_REPETITION_TARGET = 10_000;
const MAX_DURATION_TARGET_SECONDS = 86_400;

const GOAL_COLUMNS =
  "id, topic_id, slug, title, summary, difficulty, estimated_minutes, equipment, hero_media_url, sort_order, content_version, is_published, published_at, created_by, created_at, updated_at" as const;
const EXERCISE_COLUMNS =
  "id, goal_id, slug, title, instructions, measurement, target_value, estimated_minutes, equipment, safety_notes, video_url, sort_order, content_version, is_published, published_at, created_by, created_at, updated_at" as const;
const GOAL_SLUG_UNIQUE_CONSTRAINT = "goals_topic_slug_key";
const EXERCISE_SLUG_UNIQUE_CONSTRAINT = "exercises_goal_slug_key";

type UnknownRecord = Record<string, unknown>;

type NormalizedGoalDraft = Omit<CreateAdminGoalDraftInput, "difficulty"> & {
  difficulty: AdminContentDifficulty;
};

type NormalizedExerciseDraft = Omit<
  CreateAdminExerciseDraftInput,
  "measurement"
> & {
  measurement: AdminExerciseMeasurement;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    UUID_PATTERN.test(value) &&
    value.toLowerCase() !== NIL_UUID
  );
}

function normalizeUuid(
  value: unknown,
  code:
    | "invalid_authenticated_user_id"
    | "invalid_goal_id"
    | "invalid_request_id"
    | "invalid_topic_id",
): string {
  if (!isUuid(value)) {
    throw new AdminContentStepError(code);
  }

  return value.toLowerCase();
}

function normalizeSingleLine(
  value: unknown,
  code: "invalid_equipment" | "invalid_slug" | "invalid_title",
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new AdminContentStepError(code);
  }

  const normalized = value.trim();

  if (
    !normalized ||
    codePointLength(normalized) > maximumLength ||
    SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new AdminContentStepError(code);
  }

  return normalized;
}

function normalizeSlug(value: unknown): string {
  const slug = normalizeSingleLine(
    value,
    "invalid_slug",
    MAX_SLUG_LENGTH,
  ).toLowerCase();

  if (!SLUG_PATTERN.test(slug)) {
    throw new AdminContentStepError("invalid_slug");
  }

  return slug;
}

function normalizeMultiline(
  value: unknown,
  code: "invalid_instructions" | "invalid_safety_notes" | "invalid_summary",
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new AdminContentStepError(code);
  }

  const normalized = value.replace(/\r\n?/gu, "\n").trim();

  if (
    codePointLength(normalized) > maximumLength ||
    DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new AdminContentStepError(code);
  }

  return normalized;
}

function normalizeSortOrder(value: unknown): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > MAX_SORT_ORDER
  ) {
    throw new AdminContentStepError("invalid_sort_order");
  }

  return value as number;
}

function normalizeMediaUrl(
  value: unknown,
  code: "invalid_hero_media_url" | "invalid_video_url",
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new AdminContentStepError(code);
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > MAX_URL_LENGTH) {
    throw new AdminContentStepError(code);
  }

  try {
    const parsed = new URL(normalized);

    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.toString() !== normalized
    ) {
      throw new AdminContentStepError(code);
    }
  } catch (error) {
    if (error instanceof AdminContentStepError) {
      throw error;
    }

    throw new AdminContentStepError(code);
  }

  return normalized;
}

function normalizeEquipment(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_EQUIPMENT_ITEMS) {
    throw new AdminContentStepError("invalid_equipment");
  }

  const equipment: string[] = [];
  const normalizedValues = new Set<string>();

  for (const item of value) {
    const normalized = normalizeSingleLine(
      item,
      "invalid_equipment",
      MAX_EQUIPMENT_ITEM_LENGTH,
    );
    const duplicateKey = normalized.toLocaleLowerCase("da-DK");

    if (normalizedValues.has(duplicateKey)) {
      throw new AdminContentStepError("invalid_equipment");
    }

    normalizedValues.add(duplicateKey);
    equipment.push(normalized);
  }

  return equipment;
}

function normalizeDifficulty(value: unknown): AdminContentDifficulty {
  if (
    typeof value !== "string" ||
    !DIFFICULTIES.has(value as AdminContentDifficulty)
  ) {
    throw new AdminContentStepError("invalid_difficulty");
  }

  return value as AdminContentDifficulty;
}

function normalizeEstimatedMinutes(value: unknown): number | null {
  if (value === null) {
    return null;
  }

  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 180
  ) {
    throw new AdminContentStepError("invalid_estimated_minutes");
  }

  return value as number;
}

function normalizeMeasurement(value: unknown): AdminExerciseMeasurement {
  if (
    typeof value !== "string" ||
    !MEASUREMENTS.has(value as AdminExerciseMeasurement)
  ) {
    throw new AdminContentStepError("invalid_measurement");
  }

  return value as AdminExerciseMeasurement;
}

function normalizeTargetValue(
  value: unknown,
  measurement: AdminExerciseMeasurement,
): number | null {
  if (measurement === "completion") {
    if (value !== null) {
      throw new AdminContentStepError("invalid_target_value");
    }

    return null;
  }

  const maximum =
    measurement === "repetitions"
      ? MAX_REPETITION_TARGET
      : MAX_DURATION_TARGET_SECONDS;

  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > maximum
  ) {
    throw new AdminContentStepError("invalid_target_value");
  }

  return value as number;
}

function normalizeGoalDraft(
  input: CreateAdminGoalDraftInput,
): NormalizedGoalDraft {
  return {
    authenticatedUserId: normalizeUuid(
      input.authenticatedUserId,
      "invalid_authenticated_user_id",
    ),
    difficulty: normalizeDifficulty(input.difficulty),
    equipment: normalizeEquipment(input.equipment),
    estimatedMinutes: normalizeEstimatedMinutes(input.estimatedMinutes),
    heroMediaUrl: normalizeMediaUrl(
      input.heroMediaUrl,
      "invalid_hero_media_url",
    ),
    requestId: normalizeUuid(input.requestId, "invalid_request_id"),
    slug: normalizeSlug(input.slug),
    sortOrder: normalizeSortOrder(input.sortOrder),
    summary: normalizeMultiline(
      input.summary,
      "invalid_summary",
      MAX_SUMMARY_LENGTH,
    ),
    title: normalizeSingleLine(input.title, "invalid_title", MAX_TITLE_LENGTH),
    topicId: normalizeUuid(input.topicId, "invalid_topic_id"),
  };
}

function normalizeExerciseDraft(
  input: CreateAdminExerciseDraftInput,
): NormalizedExerciseDraft {
  const measurement = normalizeMeasurement(input.measurement);

  return {
    authenticatedUserId: normalizeUuid(
      input.authenticatedUserId,
      "invalid_authenticated_user_id",
    ),
    equipment: normalizeEquipment(input.equipment),
    estimatedMinutes: normalizeEstimatedMinutes(input.estimatedMinutes),
    goalId: normalizeUuid(input.goalId, "invalid_goal_id"),
    instructions: normalizeMultiline(
      input.instructions,
      "invalid_instructions",
      MAX_INSTRUCTIONS_LENGTH,
    ),
    measurement,
    requestId: normalizeUuid(input.requestId, "invalid_request_id"),
    safetyNotes: normalizeMultiline(
      input.safetyNotes,
      "invalid_safety_notes",
      MAX_SAFETY_NOTES_LENGTH,
    ),
    slug: normalizeSlug(input.slug),
    sortOrder: normalizeSortOrder(input.sortOrder),
    targetValue: normalizeTargetValue(input.targetValue, measurement),
    title: normalizeSingleLine(input.title, "invalid_title", MAX_TITLE_LENGTH),
    videoUrl: normalizeMediaUrl(input.videoUrl, "invalid_video_url"),
  };
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function normalizeExpectedUpdatedAt(value: unknown): string {
  if (
    !isTimestamp(value) ||
    value.length > 64 ||
    SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new AdminContentStepError("invalid_expected_updated_at");
  }

  return value;
}

function isReturnedSingleLine(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    codePointLength(value) <= maximumLength &&
    !SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isReturnedMultiline(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value === value.replace(/\r\n?/gu, "\n").trim() &&
    codePointLength(value) <= maximumLength &&
    !DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isReturnedMediaUrl(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  try {
    const parsed = new URL(value);
    return (
      value.length <= MAX_URL_LENGTH &&
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      parsed.toString() === value
    );
  } catch {
    return false;
  }
}

function isReturnedEquipment(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > MAX_EQUIPMENT_ITEMS) {
    return false;
  }

  const normalizedValues = new Set<string>();

  for (const item of value) {
    if (!isReturnedSingleLine(item, MAX_EQUIPMENT_ITEM_LENGTH)) {
      return false;
    }

    const duplicateKey = item.toLocaleLowerCase("da-DK");

    if (normalizedValues.has(duplicateKey)) {
      return false;
    }

    normalizedValues.add(duplicateKey);
  }

  return true;
}

function parseGoalDraft(value: unknown): AdminGoalDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isUuid(value.id) ||
    !isUuid(value.topic_id) ||
    typeof value.slug !== "string" ||
    value.slug.length > MAX_SLUG_LENGTH ||
    !SLUG_PATTERN.test(value.slug) ||
    !isReturnedSingleLine(value.title, MAX_TITLE_LENGTH) ||
    !isReturnedMultiline(value.summary, MAX_SUMMARY_LENGTH) ||
    typeof value.difficulty !== "string" ||
    !DIFFICULTIES.has(value.difficulty as AdminContentDifficulty) ||
    (value.estimated_minutes !== null &&
      (!Number.isInteger(value.estimated_minutes) ||
        (value.estimated_minutes as number) < 1 ||
        (value.estimated_minutes as number) > 180)) ||
    !isReturnedEquipment(value.equipment) ||
    !isReturnedMediaUrl(value.hero_media_url) ||
    !Number.isInteger(value.sort_order) ||
    (value.sort_order as number) < 0 ||
    (value.sort_order as number) > MAX_SORT_ORDER ||
    value.content_version !== 1 ||
    value.is_published !== false ||
    value.published_at !== null ||
    !isUuid(value.created_by) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  return {
    contentVersion: 1,
    createdAt: value.created_at,
    createdBy: value.created_by.toLowerCase(),
    difficulty: value.difficulty as AdminContentDifficulty,
    equipment: [...value.equipment],
    estimatedMinutes: value.estimated_minutes as number | null,
    heroMediaUrl: value.hero_media_url,
    id: value.id.toLowerCase(),
    publishedAt: null,
    slug: value.slug,
    sortOrder: value.sort_order as number,
    status: "draft",
    summary: value.summary,
    title: value.title,
    topicId: value.topic_id.toLowerCase(),
    updatedAt: value.updated_at,
  };
}

function parseExerciseDraft(value: unknown): AdminExerciseDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isUuid(value.id) ||
    !isUuid(value.goal_id) ||
    typeof value.slug !== "string" ||
    value.slug.length > MAX_SLUG_LENGTH ||
    !SLUG_PATTERN.test(value.slug) ||
    !isReturnedSingleLine(value.title, MAX_TITLE_LENGTH) ||
    !isReturnedMultiline(value.instructions, MAX_INSTRUCTIONS_LENGTH) ||
    !isReturnedEquipment(value.equipment) ||
    (value.estimated_minutes !== null &&
      (!Number.isInteger(value.estimated_minutes) ||
        (value.estimated_minutes as number) < 1 ||
        (value.estimated_minutes as number) > 180)) ||
    !isReturnedMultiline(value.safety_notes, MAX_SAFETY_NOTES_LENGTH) ||
    typeof value.measurement !== "string" ||
    !MEASUREMENTS.has(value.measurement as AdminExerciseMeasurement) ||
    !isValidReturnedTarget(value.target_value, value.measurement) ||
    !isReturnedMediaUrl(value.video_url) ||
    !Number.isInteger(value.sort_order) ||
    (value.sort_order as number) < 0 ||
    (value.sort_order as number) > MAX_SORT_ORDER ||
    value.content_version !== 1 ||
    value.is_published !== false ||
    value.published_at !== null ||
    !isUuid(value.created_by) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  return {
    contentVersion: 1,
    createdAt: value.created_at,
    createdBy: value.created_by.toLowerCase(),
    equipment: [...value.equipment],
    estimatedMinutes: value.estimated_minutes as number | null,
    goalId: value.goal_id.toLowerCase(),
    id: value.id.toLowerCase(),
    instructions: value.instructions,
    measurement: value.measurement as AdminExerciseMeasurement,
    publishedAt: null,
    safetyNotes: value.safety_notes,
    slug: value.slug,
    sortOrder: value.sort_order as number,
    status: "draft",
    targetValue: value.target_value as number | null,
    title: value.title,
    updatedAt: value.updated_at,
    videoUrl: value.video_url,
  };
}

function isValidReturnedTarget(value: unknown, measurement: unknown): boolean {
  if (measurement === "completion") {
    return value === null;
  }

  if (!Number.isInteger(value) || (value as number) < 1) {
    return false;
  }

  return measurement === "repetitions"
    ? (value as number) <= MAX_REPETITION_TARGET
    : measurement === "duration" &&
        (value as number) <= MAX_DURATION_TARGET_SECONDS;
}

function databaseErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function databaseConstraintName(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }

  if (typeof error.constraint === "string") {
    return error.constraint;
  }

  if (typeof error.message !== "string") {
    return null;
  }

  return (
    /^duplicate key value violates unique constraint "([a-z0-9_]+)"$/u.exec(
      error.message.trim(),
    )?.[1] ?? null
  );
}

function mapDatabaseFailure(
  error: unknown,
  fallback:
    | "exercise_creation_failed"
    | "exercise_update_failed"
    | "goal_creation_failed"
    | "goal_update_failed",
): AdminContentStepError {
  return new AdminContentStepError(
    databaseErrorCode(error) === "42501" ? "admin_access_denied" : fallback,
  );
}

async function insertGoalDraft(
  client: BareTraenClient,
  input: NormalizedGoalDraft,
) {
  return client
    .from("goals")
    .insert({
      created_by: input.authenticatedUserId,
      difficulty: input.difficulty,
      equipment: input.equipment,
      estimated_minutes: input.estimatedMinutes,
      hero_media_url: input.heroMediaUrl,
      id: input.requestId,
      is_published: false,
      slug: input.slug,
      sort_order: input.sortOrder,
      summary: input.summary,
      title: input.title,
      topic_id: input.topicId,
    })
    .select(GOAL_COLUMNS)
    .maybeSingle();
}

async function findGoalByRequestId(client: BareTraenClient, requestId: string) {
  return client
    .from("goals")
    .select(GOAL_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
}

async function insertExerciseDraft(
  client: BareTraenClient,
  input: NormalizedExerciseDraft,
) {
  return client
    .from("exercises")
    .insert({
      created_by: input.authenticatedUserId,
      equipment: input.equipment,
      estimated_minutes: input.estimatedMinutes,
      goal_id: input.goalId,
      id: input.requestId,
      instructions: input.instructions,
      is_published: false,
      measurement: input.measurement,
      safety_notes: input.safetyNotes,
      slug: input.slug,
      sort_order: input.sortOrder,
      target_value: input.targetValue,
      title: input.title,
      video_url: input.videoUrl,
    })
    .select(EXERCISE_COLUMNS)
    .maybeSingle();
}

async function findExerciseByRequestId(
  client: BareTraenClient,
  requestId: string,
) {
  return client
    .from("exercises")
    .select(EXERCISE_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
}

async function updateGoalDraft(
  client: BareTraenClient,
  input: NormalizedGoalDraft,
  expectedUpdatedAt: string,
) {
  return client
    .from("goals")
    .update({
      difficulty: input.difficulty,
      equipment: input.equipment,
      estimated_minutes: input.estimatedMinutes,
      hero_media_url: input.heroMediaUrl,
      slug: input.slug,
      sort_order: input.sortOrder,
      summary: input.summary,
      title: input.title,
    })
    .eq("id", input.requestId)
    .eq("topic_id", input.topicId)
    .eq("is_published", false)
    .eq("updated_at", expectedUpdatedAt)
    .select(GOAL_COLUMNS)
    .maybeSingle();
}

async function updateExerciseDraft(
  client: BareTraenClient,
  input: NormalizedExerciseDraft,
  expectedUpdatedAt: string,
) {
  return client
    .from("exercises")
    .update({
      equipment: input.equipment,
      estimated_minutes: input.estimatedMinutes,
      instructions: input.instructions,
      measurement: input.measurement,
      safety_notes: input.safetyNotes,
      slug: input.slug,
      sort_order: input.sortOrder,
      target_value: input.targetValue,
      title: input.title,
      video_url: input.videoUrl,
    })
    .eq("id", input.requestId)
    .eq("goal_id", input.goalId)
    .eq("is_published", false)
    .eq("updated_at", expectedUpdatedAt)
    .select(EXERCISE_COLUMNS)
    .maybeSingle();
}

function matchesGoalDraft(
  goal: AdminGoalDraft,
  input: NormalizedGoalDraft,
): boolean {
  return (
    goal.id === input.requestId &&
    goal.topicId === input.topicId &&
    goal.slug === input.slug &&
    goal.title === input.title &&
    goal.summary === input.summary &&
    goal.difficulty === input.difficulty &&
    goal.estimatedMinutes === input.estimatedMinutes &&
    goal.equipment.length === input.equipment.length &&
    goal.equipment.every((item, index) => item === input.equipment[index]) &&
    goal.heroMediaUrl === input.heroMediaUrl &&
    goal.sortOrder === input.sortOrder &&
    goal.contentVersion === 1 &&
    goal.status === "draft" &&
    goal.publishedAt === null &&
    goal.createdBy === input.authenticatedUserId
  );
}

function matchesExerciseDraft(
  exercise: AdminExerciseDraft,
  input: NormalizedExerciseDraft,
): boolean {
  return (
    exercise.id === input.requestId &&
    exercise.goalId === input.goalId &&
    exercise.slug === input.slug &&
    exercise.title === input.title &&
    exercise.instructions === input.instructions &&
    exercise.equipment.length === input.equipment.length &&
    exercise.equipment.every(
      (item, index) => item === input.equipment[index],
    ) &&
    exercise.estimatedMinutes === input.estimatedMinutes &&
    exercise.measurement === input.measurement &&
    exercise.targetValue === input.targetValue &&
    exercise.videoUrl === input.videoUrl &&
    exercise.sortOrder === input.sortOrder &&
    exercise.contentVersion === 1 &&
    exercise.status === "draft" &&
    exercise.publishedAt === null &&
    exercise.safetyNotes === input.safetyNotes &&
    exercise.createdBy === input.authenticatedUserId
  );
}

function matchesUpdatedGoalDraft(
  goal: AdminGoalDraft,
  input: NormalizedGoalDraft,
): boolean {
  return (
    goal.id === input.requestId &&
    goal.topicId === input.topicId &&
    goal.slug === input.slug &&
    goal.title === input.title &&
    goal.summary === input.summary &&
    goal.difficulty === input.difficulty &&
    goal.estimatedMinutes === input.estimatedMinutes &&
    goal.equipment.length === input.equipment.length &&
    goal.equipment.every((item, index) => item === input.equipment[index]) &&
    goal.heroMediaUrl === input.heroMediaUrl &&
    goal.sortOrder === input.sortOrder &&
    goal.status === "draft" &&
    goal.publishedAt === null
  );
}

function matchesUpdatedExerciseDraft(
  exercise: AdminExerciseDraft,
  input: NormalizedExerciseDraft,
): boolean {
  return (
    exercise.id === input.requestId &&
    exercise.goalId === input.goalId &&
    exercise.slug === input.slug &&
    exercise.title === input.title &&
    exercise.instructions === input.instructions &&
    exercise.equipment.length === input.equipment.length &&
    exercise.equipment.every(
      (item, index) => item === input.equipment[index],
    ) &&
    exercise.estimatedMinutes === input.estimatedMinutes &&
    exercise.measurement === input.measurement &&
    exercise.targetValue === input.targetValue &&
    exercise.videoUrl === input.videoUrl &&
    exercise.sortOrder === input.sortOrder &&
    exercise.status === "draft" &&
    exercise.publishedAt === null &&
    exercise.safetyNotes === input.safetyNotes
  );
}

async function recoverUpdatedGoalDraft(
  client: BareTraenClient,
  input: NormalizedGoalDraft,
): Promise<UpdateAdminGoalDraftResult> {
  let response: Awaited<ReturnType<typeof findGoalByRequestId>>;

  try {
    response = await findGoalByRequestId(client, input.requestId);
  } catch {
    throw new AdminContentStepError("goal_update_failed");
  }

  if (response.error) {
    throw mapDatabaseFailure(response.error, "goal_update_failed");
  }

  const goal = parseGoalDraft(response.data);

  if (!goal) {
    throw new AdminContentStepError("goal_draft_not_editable");
  }

  if (matchesUpdatedGoalDraft(goal, input)) {
    return { goal };
  }

  throw new AdminContentStepError("goal_draft_conflict");
}

async function recoverUpdatedExerciseDraft(
  client: BareTraenClient,
  input: NormalizedExerciseDraft,
): Promise<UpdateAdminExerciseDraftResult> {
  let response: Awaited<ReturnType<typeof findExerciseByRequestId>>;

  try {
    response = await findExerciseByRequestId(client, input.requestId);
  } catch {
    throw new AdminContentStepError("exercise_update_failed");
  }

  if (response.error) {
    throw mapDatabaseFailure(response.error, "exercise_update_failed");
  }

  const exercise = parseExerciseDraft(response.data);

  if (!exercise) {
    throw new AdminContentStepError("exercise_draft_not_editable");
  }

  if (matchesUpdatedExerciseDraft(exercise, input)) {
    return { exercise };
  }

  throw new AdminContentStepError("exercise_draft_conflict");
}

async function recoverGoalDraft(
  client: BareTraenClient,
  input: NormalizedGoalDraft,
  missingDraftCode:
    "goal_creation_conflict" | "goal_slug_conflict" = "goal_creation_conflict",
): Promise<CreateAdminGoalDraftResult> {
  let response: Awaited<ReturnType<typeof findGoalByRequestId>>;

  try {
    response = await findGoalByRequestId(client, input.requestId);
  } catch {
    throw new AdminContentStepError("goal_creation_failed");
  }

  if (response.error) {
    throw mapDatabaseFailure(response.error, "goal_creation_failed");
  }

  const goal = parseGoalDraft(response.data);

  if (!goal) {
    throw new AdminContentStepError(missingDraftCode);
  }

  if (!matchesGoalDraft(goal, input)) {
    throw new AdminContentStepError("goal_creation_conflict");
  }

  return { created: false, goal };
}

async function recoverExerciseDraft(
  client: BareTraenClient,
  input: NormalizedExerciseDraft,
  missingDraftCode:
    | "exercise_creation_conflict"
    | "exercise_slug_conflict" = "exercise_creation_conflict",
): Promise<CreateAdminExerciseDraftResult> {
  let response: Awaited<ReturnType<typeof findExerciseByRequestId>>;

  try {
    response = await findExerciseByRequestId(client, input.requestId);
  } catch {
    throw new AdminContentStepError("exercise_creation_failed");
  }

  if (response.error) {
    throw mapDatabaseFailure(response.error, "exercise_creation_failed");
  }

  const exercise = parseExerciseDraft(response.data);

  if (!exercise) {
    throw new AdminContentStepError(missingDraftCode);
  }

  if (!matchesExerciseDraft(exercise, input)) {
    throw new AdminContentStepError("exercise_creation_conflict");
  }

  return { created: false, exercise };
}

/**
 * Creates one unpublished training-goal draft below an existing topic. An exact
 * retry with the same request UUID returns the existing draft without a write.
 */
export async function createAdminGoalDraft(
  client: BareTraenClient,
  input: CreateAdminGoalDraftInput,
): Promise<CreateAdminGoalDraftResult> {
  const normalized = normalizeGoalDraft(input);
  let response: Awaited<ReturnType<typeof insertGoalDraft>>;

  try {
    response = await insertGoalDraft(client, normalized);
  } catch {
    throw new AdminContentStepError("goal_creation_failed");
  }

  if (response.error) {
    if (databaseErrorCode(response.error) === "23505") {
      return recoverGoalDraft(
        client,
        normalized,
        databaseConstraintName(response.error) === GOAL_SLUG_UNIQUE_CONSTRAINT
          ? "goal_slug_conflict"
          : "goal_creation_conflict",
      );
    }

    throw mapDatabaseFailure(response.error, "goal_creation_failed");
  }

  const goal = parseGoalDraft(response.data);

  if (!goal || !matchesGoalDraft(goal, normalized)) {
    throw new AdminContentStepError("invalid_goal_creation_result");
  }

  return { created: true, goal };
}

/**
 * Creates one unpublished exercise draft below an existing training goal. An
 * exact retry with the same request UUID returns the existing draft safely.
 */
export async function createAdminExerciseDraft(
  client: BareTraenClient,
  input: CreateAdminExerciseDraftInput,
): Promise<CreateAdminExerciseDraftResult> {
  const normalized = normalizeExerciseDraft(input);
  let response: Awaited<ReturnType<typeof insertExerciseDraft>>;

  try {
    response = await insertExerciseDraft(client, normalized);
  } catch {
    throw new AdminContentStepError("exercise_creation_failed");
  }

  if (response.error) {
    if (databaseErrorCode(response.error) === "23505") {
      return recoverExerciseDraft(
        client,
        normalized,
        databaseConstraintName(response.error) ===
          EXERCISE_SLUG_UNIQUE_CONSTRAINT
          ? "exercise_slug_conflict"
          : "exercise_creation_conflict",
      );
    }

    throw mapDatabaseFailure(response.error, "exercise_creation_failed");
  }

  const exercise = parseExerciseDraft(response.data);

  if (!exercise || !matchesExerciseDraft(exercise, normalized)) {
    throw new AdminContentStepError("invalid_exercise_creation_result");
  }

  return { created: true, exercise };
}

/** Updates one existing unpublished goal without changing its parent or author. */
export async function updateAdminGoalDraft(
  client: BareTraenClient,
  input: UpdateAdminGoalDraftInput,
): Promise<UpdateAdminGoalDraftResult> {
  const normalized = normalizeGoalDraft(input);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(input.expectedUpdatedAt);
  let response: Awaited<ReturnType<typeof updateGoalDraft>>;

  try {
    response = await updateGoalDraft(client, normalized, expectedUpdatedAt);
  } catch {
    throw new AdminContentStepError("goal_update_failed");
  }

  if (response.error) {
    if (
      databaseErrorCode(response.error) === "23505" &&
      databaseConstraintName(response.error) === GOAL_SLUG_UNIQUE_CONSTRAINT
    ) {
      throw new AdminContentStepError("goal_slug_conflict");
    }

    throw mapDatabaseFailure(response.error, "goal_update_failed");
  }

  if (response.data === null) {
    return recoverUpdatedGoalDraft(client, normalized);
  }

  const goal = parseGoalDraft(response.data);

  if (!goal || !matchesUpdatedGoalDraft(goal, normalized)) {
    throw new AdminContentStepError("invalid_goal_update_result");
  }

  return { goal };
}

/**
 * Updates one existing unpublished exercise without changing its parent or
 * author.
 */
export async function updateAdminExerciseDraft(
  client: BareTraenClient,
  input: UpdateAdminExerciseDraftInput,
): Promise<UpdateAdminExerciseDraftResult> {
  const normalized = normalizeExerciseDraft(input);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(input.expectedUpdatedAt);
  let response: Awaited<ReturnType<typeof updateExerciseDraft>>;

  try {
    response = await updateExerciseDraft(client, normalized, expectedUpdatedAt);
  } catch {
    throw new AdminContentStepError("exercise_update_failed");
  }

  if (response.error) {
    if (
      databaseErrorCode(response.error) === "23505" &&
      databaseConstraintName(response.error) === EXERCISE_SLUG_UNIQUE_CONSTRAINT
    ) {
      throw new AdminContentStepError("exercise_slug_conflict");
    }

    throw mapDatabaseFailure(response.error, "exercise_update_failed");
  }

  if (response.data === null) {
    return recoverUpdatedExerciseDraft(client, normalized);
  }

  const exercise = parseExerciseDraft(response.data);

  if (!exercise || !matchesUpdatedExerciseDraft(exercise, normalized)) {
    throw new AdminContentStepError("invalid_exercise_update_result");
  }

  return { exercise };
}
