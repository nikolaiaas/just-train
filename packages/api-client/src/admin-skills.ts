import type { BareTraenClient } from "./index.ts";

export type AdminSkillDifficulty = "beginner" | "intermediate" | "advanced";
export type AdminSkillExerciseMeasurement =
  "completion" | "repetitions" | "duration";
export type AdminSkillWardrobeEquipSlot =
  "head" | "body" | "held" | "feet" | "accessory";

export type AdminTopicAiOperationKey =
  | "content.skill_suggestions"
  | "content.skill_package"
  | "content.wardrobe_grid_plan"
  | "content.wardrobe_grid_image";

export type AdminAiHistoryItem = {
  content: string;
  role: "user" | "assistant";
};

export type AdminAiTopicContext = {
  description: string;
  title: string;
};

export type AdminSkillSuggestionsInput = {
  existingSkills: Array<{ summary: string; title: string }>;
  history: AdminAiHistoryItem[];
  message: string;
  topic: AdminAiTopicContext;
};

export type AdminSkillPackageInput = {
  existingSkills: Array<{ slug: string; title: string }>;
  history: AdminAiHistoryItem[];
  message: string;
  skillSeed: {
    childDescription: string;
    difficulty: AdminSkillDifficulty;
    estimatedMinutes: number | null;
    title: string;
  };
  topic: AdminAiTopicContext;
};

export type AdminWardrobeGridPlanInput = {
  history: AdminAiHistoryItem[];
  message: string;
  topic: AdminAiTopicContext;
};

export type AdminWardrobeGridImageInput = {
  items: Array<{
    equipSlot: AdminSkillWardrobeEquipSlot;
    name: string;
    ordinal: number;
    visualDescription: string;
  }>;
  topic: AdminAiTopicContext;
};

export type AdminTopicAiInputData =
  | AdminSkillSuggestionsInput
  | AdminSkillPackageInput
  | AdminWardrobeGridPlanInput
  | AdminWardrobeGridImageInput;

export type PrepareAdminTopicAiJobInput = {
  clientRequestId: string;
  inputData: AdminTopicAiInputData;
  operationKey: AdminTopicAiOperationKey;
  topicId: string;
};

export type LoadAdminTopicAiJobInput = {
  expectedOperationKey: AdminTopicAiOperationKey;
  jobId: string;
};

export type AdminTopicAiJob = {
  jobId: string;
  operationKey: AdminTopicAiOperationKey;
  outputData: unknown | null;
  publicErrorCode: string | null;
  status:
    "awaiting_upload" | "processing" | "succeeded" | "failed" | "cancelled";
};

export type AdminSkillSuggestion = {
  childDescription: string;
  difficulty: AdminSkillDifficulty;
  editorialReason: string;
  estimatedMinutes: number;
  ordinal: number;
  slug: string;
  title: string;
};

export type AdminSkillSuggestionsOutput = {
  reply: string;
  skills: AdminSkillSuggestion[];
};

export type AdminSkillPackage = {
  childDescription: string;
  difficulty: AdminSkillDifficulty;
  editorialReason: string;
  equipment: string[];
  estimatedMinutes: number;
  slug: string;
  title: string;
};

export type AdminSkillPackageExercise = {
  childInstructions: string;
  childSafetyNote: string;
  editorialReason: string;
  equipment: string[];
  measurement: AdminSkillExerciseMeasurement;
  ordinal: number;
  recommendedMinutes: number;
  slug: string;
  targetValue: number | null;
  title: string;
};

export type AdminSkillPackageOutput = {
  exercises: AdminSkillPackageExercise[];
  reply: string;
  skill: AdminSkillPackage;
};

export type SaveAdminSkillPackageDraftInput = {
  clientRequestId: string;
  expectedUpdatedAt: string;
  skillJobId: string;
  topicId: string;
  wardrobeImageJobId: string;
  wardrobePlanJobId: string;
};

export type SaveAdminSkillPackageDraftResult = {
  changed: boolean;
  exerciseIds: string[];
  goalId: string;
  updatedAt: string;
  wardrobeItemIds: string[];
};

export type AdminSkillPackageErrorCode =
  | "admin_access_denied"
  | "invalid_request"
  | "invalid_result"
  | "job_unavailable"
  | "load_failed"
  | "operation_unavailable"
  | "prepare_failed"
  | "request_conflict"
  | "save_failed"
  | "topic_conflict";

const ERROR_MESSAGES: Record<AdminSkillPackageErrorCode, string> = {
  admin_access_denied: "The account cannot administer training content.",
  invalid_request: "The skill-package request is invalid.",
  invalid_result: "The skill-package service returned an invalid result.",
  job_unavailable: "The requested AI proposal is not available.",
  load_failed: "The AI proposal could not be loaded.",
  operation_unavailable: "The requested AI operation is unavailable.",
  prepare_failed: "The AI proposal could not be started.",
  request_conflict: "The request identity is already used for different work.",
  save_failed: "The skill package could not be saved.",
  topic_conflict: "The subject changed before the skill package was saved.",
};

export class AdminSkillPackageError extends Error {
  readonly code: AdminSkillPackageErrorCode;

  constructor(code: AdminSkillPackageErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "AdminSkillPackageError";
    this.code = code;
  }
}

type UnknownRecord = Record<string, unknown>;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const OPERATION_KEYS = new Set<AdminTopicAiOperationKey>([
  "content.skill_suggestions",
  "content.skill_package",
  "content.wardrobe_grid_plan",
  "content.wardrobe_grid_image",
]);
const JOB_STATUSES = new Set([
  "awaiting_upload",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
]);
const DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
const MEASUREMENTS = new Set(["completion", "repetitions", "duration"]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value) ||
    value.toLowerCase() === NIL_UUID
  ) {
    throw new AdminSkillPackageError("invalid_request");
  }
  return value.toLowerCase();
}

function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 64 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new AdminSkillPackageError("invalid_request");
  }
  return value;
}

function databaseCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

type UntypedRpcResult = { data: unknown; error: unknown };

async function callUntypedRpc(
  client: BareTraenClient,
  name: string,
  args: Record<string, unknown>,
): Promise<UntypedRpcResult> {
  const rpc = client.rpc as unknown as (
    rpcName: string,
    rpcArgs: Record<string, unknown>,
  ) => Promise<UntypedRpcResult>;
  return rpc.call(client, name, args);
}

function mappedError(
  error: unknown,
  fallback: "load_failed" | "prepare_failed" | "save_failed",
): AdminSkillPackageError {
  const code = databaseCode(error);
  if (code === "42501")
    return new AdminSkillPackageError("admin_access_denied");
  if (code === "42883" || code === "PGRST202") {
    return new AdminSkillPackageError("operation_unavailable");
  }
  if (code === "40001") return new AdminSkillPackageError("topic_conflict");
  if (code === "23505") return new AdminSkillPackageError("request_conflict");
  if (code === "55000" || code === "P0002") {
    return new AdminSkillPackageError("job_unavailable");
  }
  if (code === "22023" || code === "23514") {
    return new AdminSkillPackageError("invalid_request");
  }
  return new AdminSkillPackageError(fallback);
}

function boundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
  );
}

function validEquipment(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > 12) return false;
  const items = value.filter((item): item is string =>
    boundedString(item, 1, 80),
  );
  return (
    items.length === value.length &&
    new Set(items.map((item) => item.toLocaleLowerCase("da-DK"))).size ===
      items.length
  );
}

export function parseAdminSkillSuggestionsOutput(
  value: unknown,
): AdminSkillSuggestionsOutput | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["reply", "skills"]) ||
    !boundedString(value.reply, 1, 1500) ||
    !Array.isArray(value.skills) ||
    value.skills.length < 3 ||
    value.skills.length > 8
  )
    return null;

  const titles = new Set<string>();
  const slugs = new Set<string>();
  const skills: AdminSkillSuggestion[] = [];
  for (const [index, item] of value.skills.entries()) {
    if (
      !isRecord(item) ||
      !exactKeys(item, [
        "ordinal",
        "title",
        "slug",
        "childDescription",
        "difficulty",
        "estimatedMinutes",
        "editorialReason",
      ]) ||
      item.ordinal !== index + 1 ||
      !boundedString(item.title, 1, 120) ||
      !boundedString(item.slug, 1, 120) ||
      !SLUG_PATTERN.test(item.slug) ||
      !boundedString(item.childDescription, 1, 600) ||
      typeof item.difficulty !== "string" ||
      !DIFFICULTIES.has(item.difficulty) ||
      !boundedInteger(item.estimatedMinutes, 1, 180) ||
      !boundedString(item.editorialReason, 1, 500)
    )
      return null;
    const titleKey = item.title.toLocaleLowerCase("da-DK");
    const slugKey = item.slug.toLocaleLowerCase("en-US");
    if (titles.has(titleKey) || slugs.has(slugKey)) return null;
    titles.add(titleKey);
    slugs.add(slugKey);
    skills.push(item as AdminSkillSuggestion);
  }
  return { reply: value.reply, skills };
}

export function parseAdminSkillPackageOutput(
  value: unknown,
): AdminSkillPackageOutput | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["reply", "skill", "exercises"]) ||
    !boundedString(value.reply, 1, 1500) ||
    !isRecord(value.skill) ||
    !Array.isArray(value.exercises) ||
    value.exercises.length < 2 ||
    value.exercises.length > 8
  )
    return null;
  const skill = value.skill;
  if (
    !exactKeys(skill, [
      "title",
      "slug",
      "childDescription",
      "difficulty",
      "estimatedMinutes",
      "equipment",
      "editorialReason",
    ]) ||
    !boundedString(skill.title, 1, 120) ||
    !boundedString(skill.slug, 1, 120) ||
    !SLUG_PATTERN.test(skill.slug) ||
    !boundedString(skill.childDescription, 1, 600) ||
    typeof skill.difficulty !== "string" ||
    !DIFFICULTIES.has(skill.difficulty) ||
    !boundedInteger(skill.estimatedMinutes, 1, 180) ||
    !validEquipment(skill.equipment) ||
    !boundedString(skill.editorialReason, 1, 500)
  )
    return null;

  const titles = new Set<string>();
  const slugs = new Set<string>();
  const exercises: AdminSkillPackageExercise[] = [];
  for (const [index, item] of value.exercises.entries()) {
    if (
      !isRecord(item) ||
      !exactKeys(item, [
        "ordinal",
        "title",
        "slug",
        "childInstructions",
        "measurement",
        "targetValue",
        "recommendedMinutes",
        "equipment",
        "childSafetyNote",
        "editorialReason",
      ]) ||
      item.ordinal !== index + 1 ||
      !boundedString(item.title, 1, 120) ||
      !boundedString(item.slug, 1, 120) ||
      !SLUG_PATTERN.test(item.slug) ||
      !boundedString(item.childInstructions, 1, 1000) ||
      typeof item.measurement !== "string" ||
      !MEASUREMENTS.has(item.measurement) ||
      !boundedInteger(item.recommendedMinutes, 1, 180) ||
      !validEquipment(item.equipment) ||
      !boundedString(item.childSafetyNote, 1, 600) ||
      !boundedString(item.editorialReason, 1, 500)
    )
      return null;
    const targetValid =
      (item.measurement === "completion" && item.targetValue === null) ||
      (item.measurement === "repetitions" &&
        boundedInteger(item.targetValue, 1, 10_000)) ||
      (item.measurement === "duration" &&
        boundedInteger(item.targetValue, 1, 86_400));
    const titleKey = item.title.toLocaleLowerCase("da-DK");
    const slugKey = item.slug.toLocaleLowerCase("en-US");
    if (!targetValid || titles.has(titleKey) || slugs.has(slugKey)) return null;
    titles.add(titleKey);
    slugs.add(slugKey);
    exercises.push(item as AdminSkillPackageExercise);
  }
  return {
    exercises,
    reply: value.reply,
    skill: skill as AdminSkillPackage,
  };
}

export async function prepareAdminTopicAiJob(
  client: BareTraenClient,
  input: PrepareAdminTopicAiJobInput,
): Promise<AdminTopicAiJob> {
  const topicId = uuid(input.topicId);
  const clientRequestId = uuid(input.clientRequestId);
  if (!OPERATION_KEYS.has(input.operationKey) || !isRecord(input.inputData)) {
    throw new AdminSkillPackageError("invalid_request");
  }
  let response;
  try {
    response = await callUntypedRpc(client, "prepare_admin_topic_ai_job", {
      p_client_request_id: clientRequestId,
      p_input_data: input.inputData,
      p_operation_key: input.operationKey,
      p_topic_id: topicId,
    });
  } catch {
    throw new AdminSkillPackageError("prepare_failed");
  }
  if (response.error) throw mappedError(response.error, "prepare_failed");
  const row = Array.isArray(response.data) ? response.data[0] : null;
  if (
    !Array.isArray(response.data) ||
    response.data.length !== 1 ||
    !isRecord(row) ||
    typeof row.job_id !== "string" ||
    !UUID_PATTERN.test(row.job_id) ||
    typeof row.job_status !== "string" ||
    !JOB_STATUSES.has(row.job_status)
  )
    throw new AdminSkillPackageError("invalid_result");
  return {
    jobId: row.job_id,
    operationKey: input.operationKey,
    outputData: null,
    publicErrorCode: null,
    status: row.job_status as AdminTopicAiJob["status"],
  };
}

export async function loadAdminTopicAiJob(
  client: BareTraenClient,
  input: LoadAdminTopicAiJobInput,
): Promise<AdminTopicAiJob> {
  const jobId = uuid(input.jobId);
  if (!OPERATION_KEYS.has(input.expectedOperationKey)) {
    throw new AdminSkillPackageError("invalid_request");
  }
  let response;
  try {
    response = await callUntypedRpc(client, "read_admin_topic_ai_job", {
      p_job_id: jobId,
    });
  } catch {
    throw new AdminSkillPackageError("load_failed");
  }
  if (response.error) throw mappedError(response.error, "load_failed");
  const row = Array.isArray(response.data) ? response.data[0] : null;
  if (
    !Array.isArray(response.data) ||
    response.data.length !== 1 ||
    !isRecord(row) ||
    row.job_id !== jobId ||
    row.operation_key !== input.expectedOperationKey ||
    typeof row.job_status !== "string" ||
    !JOB_STATUSES.has(row.job_status) ||
    (row.public_error_code !== null &&
      typeof row.public_error_code !== "string") ||
    (row.output_data !== null && !isRecord(row.output_data))
  )
    throw new AdminSkillPackageError("invalid_result");
  return {
    jobId,
    operationKey: input.expectedOperationKey,
    outputData: row.output_data,
    publicErrorCode: row.public_error_code as string | null,
    status: row.job_status as AdminTopicAiJob["status"],
  };
}

export async function saveAdminSkillPackageDraft(
  client: BareTraenClient,
  input: SaveAdminSkillPackageDraftInput,
): Promise<SaveAdminSkillPackageDraftResult> {
  const topicId = uuid(input.topicId);
  const skillJobId = uuid(input.skillJobId);
  const wardrobePlanJobId = uuid(input.wardrobePlanJobId);
  const wardrobeImageJobId = uuid(input.wardrobeImageJobId);
  const clientRequestId = uuid(input.clientRequestId);
  const expectedUpdatedAt = timestamp(input.expectedUpdatedAt);
  let response;
  try {
    response = await callUntypedRpc(client, "save_admin_skill_package_draft", {
      p_client_request_id: clientRequestId,
      p_expected_updated_at: expectedUpdatedAt,
      p_skill_job_id: skillJobId,
      p_topic_id: topicId,
      p_wardrobe_image_job_id: wardrobeImageJobId,
      p_wardrobe_plan_job_id: wardrobePlanJobId,
    });
  } catch {
    throw new AdminSkillPackageError("save_failed");
  }
  if (response.error) throw mappedError(response.error, "save_failed");
  const row = Array.isArray(response.data) ? response.data[0] : null;
  if (
    !Array.isArray(response.data) ||
    response.data.length !== 1 ||
    !isRecord(row) ||
    typeof row.changed !== "boolean" ||
    typeof row.goal_id !== "string" ||
    !UUID_PATTERN.test(row.goal_id) ||
    !Array.isArray(row.exercise_ids) ||
    row.exercise_ids.length < 2 ||
    row.exercise_ids.length > 8 ||
    row.exercise_ids.some(
      (id) => typeof id !== "string" || !UUID_PATTERN.test(id),
    ) ||
    !Array.isArray(row.wardrobe_item_ids) ||
    row.wardrobe_item_ids.length !== 16 ||
    row.wardrobe_item_ids.some(
      (id) => typeof id !== "string" || !UUID_PATTERN.test(id),
    ) ||
    typeof row.updated_at !== "string" ||
    !Number.isFinite(Date.parse(row.updated_at))
  )
    throw new AdminSkillPackageError("invalid_result");
  return {
    changed: row.changed,
    exerciseIds: row.exercise_ids as string[],
    goalId: row.goal_id,
    updatedAt: row.updated_at,
    wardrobeItemIds: row.wardrobe_item_ids as string[],
  };
}
