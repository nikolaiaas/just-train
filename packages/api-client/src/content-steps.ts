import {
  WARDROBE_EQUIP_SLOTS,
  type Database,
  type WardrobeEquipSlot,
} from "@bare-traen/domain";

import type { BareTraenClient } from "./index.ts";

export type AdminContentDifficulty = "beginner" | "intermediate" | "advanced";

export type AdminExerciseMeasurement =
  "completion" | "repetitions" | "duration";

export type AdminContentStatus = "draft" | "published";

export type AdminWardrobeCategory = "clothing" | "equipment" | "effect";

export type AdminWardrobeEquipSlot = WardrobeEquipSlot;

export type AdminWardrobeRarity = "common" | "rare" | "special";

export type AdminWardrobeEditorialStatus = "draft" | "approved" | "rejected";

export type AdminWardrobeDecision = Exclude<
  AdminWardrobeEditorialStatus,
  "draft"
>;

export type AdminGoalDraft = {
  contentVersion: number;
  createdAt: string;
  createdBy: string | null;
  difficulty: AdminContentDifficulty;
  equipment: string[];
  estimatedMinutes: number | null;
  heroMediaUrl: string | null;
  id: string;
  publishedAt: string | null;
  slug: string;
  sortOrder: number;
  status: AdminContentStatus;
  summary: string;
  title: string;
  topicId: string;
  updatedAt: string;
};

export type AdminExerciseDraft = {
  contentVersion: number;
  createdAt: string;
  createdBy: string | null;
  equipment: string[];
  estimatedMinutes: number | null;
  goalId: string;
  id: string;
  instructions: string;
  measurement: AdminExerciseMeasurement;
  publishedAt: string | null;
  safetyNotes: string;
  slug: string;
  sortOrder: number;
  status: AdminContentStatus;
  targetValue: number | null;
  title: string;
  updatedAt: string;
  videoUrl: string | null;
};

export type AdminWardrobeItemDraft = {
  category: AdminWardrobeCategory;
  contentVersion: number;
  createdAt: string;
  createdBy: string | null;
  editorialNote: string;
  editorialStatus: AdminWardrobeEditorialStatus;
  equipSlot: AdminWardrobeEquipSlot;
  /** True when the editable values are staged over an unchanged live item. */
  hasPendingRevision: boolean;
  icon: string;
  id: string;
  name: string;
  points: number;
  publishedAt: string | null;
  rarity: AdminWardrobeRarity;
  sortOrder: number;
  status: AdminContentStatus;
  topicId: string;
  unlockRule: string;
  updatedAt: string;
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

export type CreateAdminWardrobeItemDraftInput = {
  /** Resolved from the authenticated admin session by trusted server code. */
  authenticatedUserId: string;
  category: AdminWardrobeCategory;
  editorialNote: string;
  /**
   * The exclusive avatar position occupied by the item. Omission is accepted
   * temporarily for older installed clients and maps to `accessory`.
   */
  equipSlot?: AdminWardrobeEquipSlot;
  icon: string;
  name: string;
  /** `0` means the item uses `unlockRule` instead of a point price. */
  points: number;
  rarity: AdminWardrobeRarity;
  /** A stable request UUID that also becomes the new wardrobe-item id. */
  requestId: string;
  sortOrder: number;
  topicId: string;
  /** Empty when the item has a positive point price. */
  unlockRule: string;
};

/** Uses `requestId` as the id of the existing goal. */
export type UpdateAdminGoalDraftInput = CreateAdminGoalDraftInput & {
  /** The publication state returned by the last successful load or save. */
  expectedStatus: AdminContentStatus;
  /** The revision returned by the last successful load or save. */
  expectedUpdatedAt: string;
};

/** Uses `requestId` as the id of the existing exercise. */
export type UpdateAdminExerciseDraftInput = CreateAdminExerciseDraftInput & {
  /** The publication state returned by the last successful load or save. */
  expectedStatus: AdminContentStatus;
  /** The revision returned by the last successful load or save. */
  expectedUpdatedAt: string;
};

/** Uses `requestId` as the id of an existing wardrobe item. */
export type UpdateAdminWardrobeItemDraftInput =
  CreateAdminWardrobeItemDraftInput & {
    /** The revision returned by the last successful load or save. */
    expectedUpdatedAt: string;
  };

export type DecideAdminWardrobeItemDraftInput = {
  /** Resolved from the authenticated admin session by trusted server code. */
  authenticatedUserId: string;
  decision: AdminWardrobeDecision;
  /** The revision returned by the last successful load or save. */
  expectedUpdatedAt: string;
  topicId: string;
  wardrobeItemId: string;
};

export type CreateAdminGoalDraftResult = {
  created: boolean;
  goal: AdminGoalDraft;
};

export type CreateAdminExerciseDraftResult = {
  created: boolean;
  exercise: AdminExerciseDraft;
};

export type CreateAdminWardrobeItemDraftResult = {
  created: boolean;
  item: AdminWardrobeItemDraft;
};

export type UpdateAdminGoalDraftResult = {
  goal: AdminGoalDraft;
};

export type UpdateAdminExerciseDraftResult = {
  exercise: AdminExerciseDraft;
};

export type UpdateAdminWardrobeItemDraftResult = {
  item: AdminWardrobeItemDraft;
};

export type DecideAdminWardrobeItemDraftResult = {
  item: AdminWardrobeItemDraft;
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
  | "invalid_expected_status"
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
  | "invalid_video_url"
  | "invalid_wardrobe_category"
  | "invalid_wardrobe_creation_result"
  | "invalid_wardrobe_decision"
  | "invalid_wardrobe_decision_result"
  | "invalid_wardrobe_editorial_note"
  | "invalid_wardrobe_equip_slot"
  | "invalid_wardrobe_icon"
  | "invalid_wardrobe_item_id"
  | "invalid_wardrobe_name"
  | "invalid_wardrobe_points"
  | "invalid_wardrobe_rarity"
  | "invalid_wardrobe_unlock_rule"
  | "invalid_wardrobe_update_result"
  | "wardrobe_creation_conflict"
  | "wardrobe_creation_failed"
  | "wardrobe_draft_conflict"
  | "wardrobe_draft_not_editable"
  | "wardrobe_review_failed"
  | "wardrobe_update_failed";

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
  invalid_expected_status: "The expected content publication state is invalid.",
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
  invalid_wardrobe_category: "The wardrobe item category is invalid.",
  invalid_wardrobe_creation_result:
    "Wardrobe item creation returned an invalid result.",
  invalid_wardrobe_decision: "The wardrobe review decision is invalid.",
  invalid_wardrobe_decision_result:
    "Wardrobe review returned an invalid result.",
  invalid_wardrobe_editorial_note: "The wardrobe editorial note is invalid.",
  invalid_wardrobe_equip_slot: "The wardrobe equipment position is invalid.",
  invalid_wardrobe_icon: "The wardrobe item icon is invalid.",
  invalid_wardrobe_item_id: "The wardrobe item id is invalid.",
  invalid_wardrobe_name: "The wardrobe item name is invalid.",
  invalid_wardrobe_points: "The wardrobe item point price is invalid.",
  invalid_wardrobe_rarity: "The wardrobe item rarity is invalid.",
  invalid_wardrobe_unlock_rule: "The wardrobe unlock rule is invalid.",
  invalid_wardrobe_update_result:
    "Wardrobe item update returned an invalid result.",
  wardrobe_creation_conflict:
    "The wardrobe item request conflicts with existing content.",
  wardrobe_creation_failed: "The wardrobe item could not be created.",
  wardrobe_draft_conflict: "The wardrobe item was changed by another editor.",
  wardrobe_draft_not_editable: "The wardrobe item is no longer editable.",
  wardrobe_review_failed: "The wardrobe review decision could not be saved.",
  wardrobe_update_failed: "The wardrobe item could not be updated.",
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
const WARDROBE_CATEGORIES = new Set<AdminWardrobeCategory>([
  "clothing",
  "equipment",
  "effect",
]);
const WARDROBE_RARITIES = new Set<AdminWardrobeRarity>([
  "common",
  "rare",
  "special",
]);
const WARDROBE_EQUIP_SLOT_VALUES = new Set<AdminWardrobeEquipSlot>(
  WARDROBE_EQUIP_SLOTS,
);
const WARDROBE_EDITORIAL_STATUSES = new Set<AdminWardrobeEditorialStatus>([
  "draft",
  "approved",
  "rejected",
]);
const WARDROBE_DECISIONS = new Set<AdminWardrobeDecision>([
  "approved",
  "rejected",
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
const MAX_WARDROBE_NAME_LENGTH = 80;
const MAX_WARDROBE_ICON_LENGTH = 16;
const MAX_WARDROBE_POINTS = 1_000;
const MAX_WARDROBE_UNLOCK_RULE_LENGTH = 200;
const MAX_WARDROBE_EDITORIAL_NOTE_LENGTH = 500;

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

type NormalizedWardrobeItemDraft = Omit<
  CreateAdminWardrobeItemDraftInput,
  | "category"
  | "editorialNote"
  | "equipSlot"
  | "points"
  | "rarity"
  | "unlockRule"
> & {
  category: AdminWardrobeCategory;
  editorialNote: string | null;
  equipSlot: AdminWardrobeEquipSlot;
  points: number | null;
  rarity: AdminWardrobeRarity;
  unlockRule: string | null;
};

type NormalizedWardrobeDecision = Omit<
  DecideAdminWardrobeItemDraftInput,
  "decision"
> & {
  decision: AdminWardrobeDecision;
};

type SaveWardrobeItemDraftRpcArgs =
  Database["public"]["Functions"]["save_admin_wardrobe_item_draft"]["Args"];

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
    | "invalid_topic_id"
    | "invalid_wardrobe_item_id",
): string {
  if (!isUuid(value)) {
    throw new AdminContentStepError(code);
  }

  return value.toLowerCase();
}

function normalizeSingleLine(
  value: unknown,
  code:
    | "invalid_equipment"
    | "invalid_slug"
    | "invalid_title"
    | "invalid_wardrobe_icon"
    | "invalid_wardrobe_name",
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
  code:
    | "invalid_instructions"
    | "invalid_safety_notes"
    | "invalid_summary"
    | "invalid_wardrobe_editorial_note"
    | "invalid_wardrobe_unlock_rule",
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

function normalizeWardrobeCategory(value: unknown): AdminWardrobeCategory {
  if (
    typeof value !== "string" ||
    !WARDROBE_CATEGORIES.has(value as AdminWardrobeCategory)
  ) {
    throw new AdminContentStepError("invalid_wardrobe_category");
  }

  return value as AdminWardrobeCategory;
}

function normalizeWardrobeRarity(value: unknown): AdminWardrobeRarity {
  if (
    typeof value !== "string" ||
    !WARDROBE_RARITIES.has(value as AdminWardrobeRarity)
  ) {
    throw new AdminContentStepError("invalid_wardrobe_rarity");
  }

  return value as AdminWardrobeRarity;
}

function normalizeWardrobeEquipSlot(value: unknown): AdminWardrobeEquipSlot {
  const slot = value ?? "accessory";

  if (
    typeof slot !== "string" ||
    !WARDROBE_EQUIP_SLOT_VALUES.has(slot as AdminWardrobeEquipSlot)
  ) {
    throw new AdminContentStepError("invalid_wardrobe_equip_slot");
  }

  return slot as AdminWardrobeEquipSlot;
}

function normalizeWardrobeItemDraft(
  input: CreateAdminWardrobeItemDraftInput,
): NormalizedWardrobeItemDraft {
  if (
    !Number.isInteger(input.points) ||
    input.points < 0 ||
    input.points > MAX_WARDROBE_POINTS
  ) {
    throw new AdminContentStepError("invalid_wardrobe_points");
  }

  const unlockRule = normalizeMultiline(
    input.unlockRule,
    "invalid_wardrobe_unlock_rule",
    MAX_WARDROBE_UNLOCK_RULE_LENGTH,
  );

  if ((input.points === 0 && !unlockRule) || (input.points > 0 && unlockRule)) {
    throw new AdminContentStepError("invalid_wardrobe_unlock_rule");
  }

  const editorialNote = normalizeMultiline(
    input.editorialNote,
    "invalid_wardrobe_editorial_note",
    MAX_WARDROBE_EDITORIAL_NOTE_LENGTH,
  );

  return {
    authenticatedUserId: normalizeUuid(
      input.authenticatedUserId,
      "invalid_authenticated_user_id",
    ),
    category: normalizeWardrobeCategory(input.category),
    editorialNote: editorialNote || null,
    equipSlot: normalizeWardrobeEquipSlot(input.equipSlot),
    icon: normalizeSingleLine(
      input.icon,
      "invalid_wardrobe_icon",
      MAX_WARDROBE_ICON_LENGTH,
    ),
    name: normalizeSingleLine(
      input.name,
      "invalid_wardrobe_name",
      MAX_WARDROBE_NAME_LENGTH,
    ),
    points: input.points || null,
    rarity: normalizeWardrobeRarity(input.rarity),
    requestId: normalizeUuid(input.requestId, "invalid_request_id"),
    sortOrder: normalizeSortOrder(input.sortOrder),
    topicId: normalizeUuid(input.topicId, "invalid_topic_id"),
    unlockRule: unlockRule || null,
  };
}

function normalizeWardrobeDecision(
  input: DecideAdminWardrobeItemDraftInput,
): NormalizedWardrobeDecision {
  if (
    typeof input.decision !== "string" ||
    !WARDROBE_DECISIONS.has(input.decision as AdminWardrobeDecision)
  ) {
    throw new AdminContentStepError("invalid_wardrobe_decision");
  }

  return {
    authenticatedUserId: normalizeUuid(
      input.authenticatedUserId,
      "invalid_authenticated_user_id",
    ),
    decision: input.decision as AdminWardrobeDecision,
    expectedUpdatedAt: normalizeExpectedUpdatedAt(input.expectedUpdatedAt),
    topicId: normalizeUuid(input.topicId, "invalid_topic_id"),
    wardrobeItemId: normalizeUuid(
      input.wardrobeItemId,
      "invalid_wardrobe_item_id",
    ),
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

function normalizeExpectedStatus(value: unknown): AdminContentStatus {
  if (value !== "draft" && value !== "published") {
    throw new AdminContentStepError("invalid_expected_status");
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

  const publishedAt = value.published_at;

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
    !Number.isInteger(value.content_version) ||
    (value.content_version as number) < 1 ||
    typeof value.is_published !== "boolean" ||
    (value.is_published ? !isTimestamp(publishedAt) : publishedAt !== null) ||
    (value.created_by !== null && !isUuid(value.created_by)) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  return {
    contentVersion: value.content_version as number,
    createdAt: value.created_at,
    createdBy: value.created_by?.toLowerCase() ?? null,
    difficulty: value.difficulty as AdminContentDifficulty,
    equipment: [...value.equipment],
    estimatedMinutes: value.estimated_minutes as number | null,
    heroMediaUrl: value.hero_media_url,
    id: value.id.toLowerCase(),
    publishedAt: publishedAt as string | null,
    slug: value.slug,
    sortOrder: value.sort_order as number,
    status: value.is_published ? "published" : "draft",
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

  const publishedAt = value.published_at;

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
    !Number.isInteger(value.content_version) ||
    (value.content_version as number) < 1 ||
    typeof value.is_published !== "boolean" ||
    (value.is_published ? !isTimestamp(publishedAt) : publishedAt !== null) ||
    (value.created_by !== null && !isUuid(value.created_by)) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  return {
    contentVersion: value.content_version as number,
    createdAt: value.created_at,
    createdBy: value.created_by?.toLowerCase() ?? null,
    equipment: [...value.equipment],
    estimatedMinutes: value.estimated_minutes as number | null,
    goalId: value.goal_id.toLowerCase(),
    id: value.id.toLowerCase(),
    instructions: value.instructions,
    measurement: value.measurement as AdminExerciseMeasurement,
    publishedAt: publishedAt as string | null,
    safetyNotes: value.safety_notes,
    slug: value.slug,
    sortOrder: value.sort_order as number,
    status: value.is_published ? "published" : "draft",
    targetValue: value.target_value as number | null,
    title: value.title,
    updatedAt: value.updated_at,
    videoUrl: value.video_url,
  };
}

function parseWardrobeItemDraft(value: unknown): AdminWardrobeItemDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const pointsAreValid =
    value.points === null ||
    (Number.isInteger(value.points) &&
      (value.points as number) >= 1 &&
      (value.points as number) <= MAX_WARDROBE_POINTS);
  const unlockRuleIsValid =
    value.unlock_rule === null ||
    (isReturnedMultiline(value.unlock_rule, MAX_WARDROBE_UNLOCK_RULE_LENGTH) &&
      value.unlock_rule.length > 0);
  const rewardRuleIsValid =
    pointsAreValid &&
    unlockRuleIsValid &&
    ((value.points === null && value.unlock_rule !== null) ||
      (value.points !== null && value.unlock_rule === null));
  const editorialNoteIsValid =
    value.editorial_note === null ||
    (isReturnedMultiline(
      value.editorial_note,
      MAX_WARDROBE_EDITORIAL_NOTE_LENGTH,
    ) &&
      value.editorial_note.length > 0);

  if (
    !isUuid(value.id) ||
    !isUuid(value.topic_id) ||
    !isReturnedSingleLine(value.name, MAX_WARDROBE_NAME_LENGTH) ||
    !isReturnedSingleLine(value.icon, MAX_WARDROBE_ICON_LENGTH) ||
    typeof value.category !== "string" ||
    !WARDROBE_CATEGORIES.has(value.category as AdminWardrobeCategory) ||
    typeof value.equip_slot !== "string" ||
    !WARDROBE_EQUIP_SLOT_VALUES.has(
      value.equip_slot as AdminWardrobeEquipSlot,
    ) ||
    typeof value.rarity !== "string" ||
    !WARDROBE_RARITIES.has(value.rarity as AdminWardrobeRarity) ||
    !rewardRuleIsValid ||
    !editorialNoteIsValid ||
    typeof value.editorial_status !== "string" ||
    !WARDROBE_EDITORIAL_STATUSES.has(
      value.editorial_status as AdminWardrobeEditorialStatus,
    ) ||
    !Number.isInteger(value.sort_order) ||
    (value.sort_order as number) < 0 ||
    (value.sort_order as number) > MAX_SORT_ORDER ||
    !Number.isInteger(value.content_version) ||
    (value.content_version as number) < 1 ||
    typeof value.is_published !== "boolean" ||
    (value.is_published
      ? !isTimestamp(value.published_at)
      : value.published_at !== null) ||
    typeof value.has_pending_revision !== "boolean" ||
    (value.has_pending_revision && !value.is_published) ||
    (value.is_published &&
      !value.has_pending_revision &&
      value.editorial_status !== "approved") ||
    (value.created_by !== null && !isUuid(value.created_by)) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  return {
    category: value.category as AdminWardrobeCategory,
    contentVersion: value.content_version as number,
    createdAt: value.created_at,
    createdBy: value.created_by?.toLowerCase() ?? null,
    editorialNote: (value.editorial_note as string | null) ?? "",
    editorialStatus: value.editorial_status as AdminWardrobeEditorialStatus,
    equipSlot: value.equip_slot as AdminWardrobeEquipSlot,
    hasPendingRevision: value.has_pending_revision,
    icon: value.icon,
    id: value.id.toLowerCase(),
    name: value.name,
    points: (value.points as number | null) ?? 0,
    publishedAt: value.published_at as string | null,
    rarity: value.rarity as AdminWardrobeRarity,
    sortOrder: value.sort_order as number,
    status: value.is_published ? "published" : "draft",
    topicId: value.topic_id.toLowerCase(),
    unlockRule: (value.unlock_rule as string | null) ?? "",
    updatedAt: value.updated_at,
  };
}

type WardrobeItemLookup =
  | { kind: "found"; item: AdminWardrobeItemDraft }
  | { kind: "invalid" }
  | { kind: "missing" };

function parseWardrobeItemLookup(value: unknown): WardrobeItemLookup {
  if (!Array.isArray(value) || value.length > 1) {
    return { kind: "invalid" };
  }

  if (value.length === 0) {
    return { kind: "missing" };
  }

  const item = parseWardrobeItemDraft(value[0]);
  return item ? { kind: "found", item } : { kind: "invalid" };
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
    | "goal_update_failed"
    | "wardrobe_creation_failed"
    | "wardrobe_review_failed"
    | "wardrobe_update_failed",
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

async function insertWardrobeItemDraft(
  client: BareTraenClient,
  input: NormalizedWardrobeItemDraft,
) {
  return client
    .from("wardrobe_items")
    .insert({
      category: input.category,
      created_by: input.authenticatedUserId,
      editorial_note: input.editorialNote,
      equip_slot: input.equipSlot,
      icon: input.icon,
      id: input.requestId,
      name: input.name,
      points: input.points,
      rarity: input.rarity,
      sort_order: input.sortOrder,
      topic_id: input.topicId,
      unlock_rule: input.unlockRule,
    })
    .select("id")
    .maybeSingle();
}

async function findWardrobeItemByRequestId(
  client: BareTraenClient,
  topicId: string,
  requestId: string,
) {
  return client.rpc("list_admin_wardrobe_item_drafts", {
    p_topic_id: topicId,
    p_wardrobe_item_id: requestId,
  });
}

async function loadWardrobeItemDraft(
  client: BareTraenClient,
  topicId: string,
  requestId: string,
  fallback:
    | "wardrobe_creation_failed"
    | "wardrobe_review_failed"
    | "wardrobe_update_failed",
): Promise<WardrobeItemLookup> {
  let response: Awaited<ReturnType<typeof findWardrobeItemByRequestId>>;

  try {
    response = await findWardrobeItemByRequestId(client, topicId, requestId);
  } catch {
    throw new AdminContentStepError(fallback);
  }

  if (response.error) {
    throw mapDatabaseFailure(response.error, fallback);
  }

  return parseWardrobeItemLookup(response.data);
}

async function updateGoalDraft(
  client: BareTraenClient,
  input: NormalizedGoalDraft,
  expectedStatus: AdminContentStatus,
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
    .eq("is_published", expectedStatus === "published")
    .eq("updated_at", expectedUpdatedAt)
    .select(GOAL_COLUMNS)
    .maybeSingle();
}

async function updateExerciseDraft(
  client: BareTraenClient,
  input: NormalizedExerciseDraft,
  expectedStatus: AdminContentStatus,
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
    .eq("is_published", expectedStatus === "published")
    .eq("updated_at", expectedUpdatedAt)
    .select(EXERCISE_COLUMNS)
    .maybeSingle();
}

async function updateWardrobeItemDraft(
  client: BareTraenClient,
  input: NormalizedWardrobeItemDraft,
  expectedUpdatedAt: string,
) {
  // PostgreSQL does not expose function-parameter nullability, so generated
  // Supabase Args mark these three nullable SQL inputs as non-null. These
  // field-level assertions affect only TypeScript; null still reaches the
  // guarded RPC for the database's exclusive points/unlock representation.
  const args: SaveWardrobeItemDraftRpcArgs = {
    p_category: input.category,
    p_editorial_note:
      input.editorialNote as SaveWardrobeItemDraftRpcArgs["p_editorial_note"],
    p_equip_slot: input.equipSlot,
    p_expected_updated_at: expectedUpdatedAt,
    p_icon: input.icon,
    p_name: input.name,
    p_points: input.points as SaveWardrobeItemDraftRpcArgs["p_points"],
    p_rarity: input.rarity,
    p_sort_order: input.sortOrder,
    p_topic_id: input.topicId,
    p_unlock_rule:
      input.unlockRule as SaveWardrobeItemDraftRpcArgs["p_unlock_rule"],
    p_wardrobe_item_id: input.requestId,
  };

  return client.rpc("save_admin_wardrobe_item_draft", args).maybeSingle();
}

async function decideWardrobeItemDraft(
  client: BareTraenClient,
  input: NormalizedWardrobeDecision,
) {
  return client
    .rpc("decide_admin_wardrobe_item_draft", {
      p_decision: input.decision,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_topic_id: input.topicId,
      p_wardrobe_item_id: input.wardrobeItemId,
    })
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

function matchesWardrobeItemDraft(
  item: AdminWardrobeItemDraft,
  input: NormalizedWardrobeItemDraft,
): boolean {
  return (
    item.id === input.requestId &&
    item.topicId === input.topicId &&
    item.name === input.name &&
    item.icon === input.icon &&
    item.category === input.category &&
    item.rarity === input.rarity &&
    item.points === (input.points ?? 0) &&
    item.unlockRule === (input.unlockRule ?? "") &&
    item.editorialNote === (input.editorialNote ?? "") &&
    item.equipSlot === input.equipSlot &&
    !item.hasPendingRevision &&
    item.editorialStatus === "draft" &&
    item.sortOrder === input.sortOrder &&
    item.contentVersion === 1 &&
    item.status === "draft" &&
    item.publishedAt === null &&
    (item.createdBy === null || item.createdBy === input.authenticatedUserId)
  );
}

function matchesUpdatedGoalDraft(
  goal: AdminGoalDraft,
  input: NormalizedGoalDraft,
  expectedStatus: AdminContentStatus,
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
    goal.status === expectedStatus
  );
}

function matchesUpdatedExerciseDraft(
  exercise: AdminExerciseDraft,
  input: NormalizedExerciseDraft,
  expectedStatus: AdminContentStatus,
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
    exercise.status === expectedStatus &&
    exercise.safetyNotes === input.safetyNotes
  );
}

function matchesUpdatedWardrobeItemDraft(
  item: AdminWardrobeItemDraft,
  input: NormalizedWardrobeItemDraft,
): boolean {
  return (
    item.id === input.requestId &&
    item.topicId === input.topicId &&
    item.name === input.name &&
    item.icon === input.icon &&
    item.category === input.category &&
    item.rarity === input.rarity &&
    item.points === (input.points ?? 0) &&
    item.unlockRule === (input.unlockRule ?? "") &&
    item.editorialNote === (input.editorialNote ?? "") &&
    item.equipSlot === input.equipSlot &&
    item.editorialStatus === "draft" &&
    item.sortOrder === input.sortOrder &&
    (item.status === "draft"
      ? !item.hasPendingRevision && item.publishedAt === null
      : item.hasPendingRevision && item.publishedAt !== null)
  );
}

function matchesWardrobeDecision(
  item: AdminWardrobeItemDraft,
  input: NormalizedWardrobeDecision,
): boolean {
  return (
    item.id === input.wardrobeItemId &&
    item.topicId === input.topicId &&
    item.editorialStatus === input.decision &&
    (item.status === "draft"
      ? !item.hasPendingRevision && item.publishedAt === null
      : item.hasPendingRevision && item.publishedAt !== null)
  );
}

async function recoverUpdatedGoalDraft(
  client: BareTraenClient,
  input: NormalizedGoalDraft,
  expectedStatus: AdminContentStatus,
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

  if (!goal || goal.status !== expectedStatus) {
    throw new AdminContentStepError("goal_draft_not_editable");
  }

  if (matchesUpdatedGoalDraft(goal, input, expectedStatus)) {
    return { goal };
  }

  throw new AdminContentStepError("goal_draft_conflict");
}

async function recoverUpdatedExerciseDraft(
  client: BareTraenClient,
  input: NormalizedExerciseDraft,
  expectedStatus: AdminContentStatus,
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

  if (!exercise || exercise.status !== expectedStatus) {
    throw new AdminContentStepError("exercise_draft_not_editable");
  }

  if (matchesUpdatedExerciseDraft(exercise, input, expectedStatus)) {
    return { exercise };
  }

  throw new AdminContentStepError("exercise_draft_conflict");
}

async function recoverUpdatedWardrobeItemDraft(
  client: BareTraenClient,
  input: NormalizedWardrobeItemDraft,
): Promise<UpdateAdminWardrobeItemDraftResult> {
  const lookup = await loadWardrobeItemDraft(
    client,
    input.topicId,
    input.requestId,
    "wardrobe_update_failed",
  );

  if (lookup.kind !== "found") {
    throw new AdminContentStepError("wardrobe_draft_not_editable");
  }

  if (matchesUpdatedWardrobeItemDraft(lookup.item, input)) {
    return { item: lookup.item };
  }

  throw new AdminContentStepError("wardrobe_draft_conflict");
}

async function recoverWardrobeDecision(
  client: BareTraenClient,
  input: NormalizedWardrobeDecision,
): Promise<DecideAdminWardrobeItemDraftResult> {
  const lookup = await loadWardrobeItemDraft(
    client,
    input.topicId,
    input.wardrobeItemId,
    "wardrobe_review_failed",
  );

  if (lookup.kind !== "found") {
    throw new AdminContentStepError("wardrobe_draft_not_editable");
  }

  if (matchesWardrobeDecision(lookup.item, input)) {
    return { item: lookup.item };
  }

  throw new AdminContentStepError("wardrobe_draft_conflict");
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

async function recoverWardrobeItemDraft(
  client: BareTraenClient,
  input: NormalizedWardrobeItemDraft,
): Promise<CreateAdminWardrobeItemDraftResult> {
  const lookup = await loadWardrobeItemDraft(
    client,
    input.topicId,
    input.requestId,
    "wardrobe_creation_failed",
  );

  if (
    lookup.kind !== "found" ||
    !matchesWardrobeItemDraft(lookup.item, input)
  ) {
    throw new AdminContentStepError("wardrobe_creation_conflict");
  }

  return { created: false, item: lookup.item };
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

/**
 * Creates one unpublished wardrobe item below a topic. An exact retry with the
 * same request UUID returns the existing item without overwriting it.
 */
export async function createAdminWardrobeItemDraft(
  client: BareTraenClient,
  input: CreateAdminWardrobeItemDraftInput,
): Promise<CreateAdminWardrobeItemDraftResult> {
  const normalized = normalizeWardrobeItemDraft(input);
  let response: Awaited<ReturnType<typeof insertWardrobeItemDraft>>;

  try {
    response = await insertWardrobeItemDraft(client, normalized);
  } catch {
    throw new AdminContentStepError("wardrobe_creation_failed");
  }

  if (response.error) {
    if (databaseErrorCode(response.error) === "23505") {
      return recoverWardrobeItemDraft(client, normalized);
    }

    throw mapDatabaseFailure(response.error, "wardrobe_creation_failed");
  }

  if (!isRecord(response.data) || response.data.id !== normalized.requestId) {
    throw new AdminContentStepError("invalid_wardrobe_creation_result");
  }

  const lookup = await loadWardrobeItemDraft(
    client,
    normalized.topicId,
    normalized.requestId,
    "wardrobe_creation_failed",
  );

  if (
    lookup.kind !== "found" ||
    !matchesWardrobeItemDraft(lookup.item, normalized)
  ) {
    throw new AdminContentStepError("invalid_wardrobe_creation_result");
  }

  return { created: true, item: lookup.item };
}

/**
 * Updates one existing goal without changing its parent, author, publication
 * state, publication timestamp, or content version.
 */
export async function updateAdminGoalDraft(
  client: BareTraenClient,
  input: UpdateAdminGoalDraftInput,
): Promise<UpdateAdminGoalDraftResult> {
  const normalized = normalizeGoalDraft(input);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(input.expectedUpdatedAt);
  const expectedStatus = normalizeExpectedStatus(input.expectedStatus);
  let response: Awaited<ReturnType<typeof updateGoalDraft>>;

  try {
    response = await updateGoalDraft(
      client,
      normalized,
      expectedStatus,
      expectedUpdatedAt,
    );
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
    return recoverUpdatedGoalDraft(client, normalized, expectedStatus);
  }

  const goal = parseGoalDraft(response.data);

  if (!goal || !matchesUpdatedGoalDraft(goal, normalized, expectedStatus)) {
    throw new AdminContentStepError("invalid_goal_update_result");
  }

  return { goal };
}

/**
 * Updates one existing exercise without changing its parent, author,
 * publication state, publication timestamp, or content version.
 */
export async function updateAdminExerciseDraft(
  client: BareTraenClient,
  input: UpdateAdminExerciseDraftInput,
): Promise<UpdateAdminExerciseDraftResult> {
  const normalized = normalizeExerciseDraft(input);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(input.expectedUpdatedAt);
  const expectedStatus = normalizeExpectedStatus(input.expectedStatus);
  let response: Awaited<ReturnType<typeof updateExerciseDraft>>;

  try {
    response = await updateExerciseDraft(
      client,
      normalized,
      expectedStatus,
      expectedUpdatedAt,
    );
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
    return recoverUpdatedExerciseDraft(client, normalized, expectedStatus);
  }

  const exercise = parseExerciseDraft(response.data);

  if (
    !exercise ||
    !matchesUpdatedExerciseDraft(exercise, normalized, expectedStatus)
  ) {
    throw new AdminContentStepError("invalid_exercise_update_result");
  }

  return { exercise };
}

/**
 * Updates one existing wardrobe item and returns the editable version to
 * editorial draft state. A published item is staged without changing its live
 * catalog version until the topic is published again.
 */
export async function updateAdminWardrobeItemDraft(
  client: BareTraenClient,
  input: UpdateAdminWardrobeItemDraftInput,
): Promise<UpdateAdminWardrobeItemDraftResult> {
  const normalized = normalizeWardrobeItemDraft(input);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(input.expectedUpdatedAt);
  let response: Awaited<ReturnType<typeof updateWardrobeItemDraft>>;

  try {
    response = await updateWardrobeItemDraft(
      client,
      normalized,
      expectedUpdatedAt,
    );
  } catch {
    throw new AdminContentStepError("wardrobe_update_failed");
  }

  if (response.error) {
    if (databaseErrorCode(response.error) === "40001") {
      throw new AdminContentStepError("wardrobe_draft_conflict");
    }

    throw mapDatabaseFailure(response.error, "wardrobe_update_failed");
  }

  if (response.data === null) {
    return recoverUpdatedWardrobeItemDraft(client, normalized);
  }

  if (!isRecord(response.data) || response.data.id !== normalized.requestId) {
    throw new AdminContentStepError("invalid_wardrobe_update_result");
  }

  const lookup = await loadWardrobeItemDraft(
    client,
    normalized.topicId,
    normalized.requestId,
    "wardrobe_update_failed",
  );

  if (
    lookup.kind !== "found" ||
    !matchesUpdatedWardrobeItemDraft(lookup.item, normalized)
  ) {
    throw new AdminContentStepError("invalid_wardrobe_update_result");
  }

  return { item: lookup.item };
}

/**
 * Records an explicit approve/reject decision for an unpublished item or a
 * published item's staged revision. The revision precondition prevents one
 * editor from overwriting another review.
 */
export async function decideAdminWardrobeItemDraft(
  client: BareTraenClient,
  input: DecideAdminWardrobeItemDraftInput,
): Promise<DecideAdminWardrobeItemDraftResult> {
  const normalized = normalizeWardrobeDecision(input);
  let response: Awaited<ReturnType<typeof decideWardrobeItemDraft>>;

  try {
    response = await decideWardrobeItemDraft(client, normalized);
  } catch {
    throw new AdminContentStepError("wardrobe_review_failed");
  }

  if (response.error) {
    if (databaseErrorCode(response.error) === "40001") {
      throw new AdminContentStepError("wardrobe_draft_conflict");
    }

    throw mapDatabaseFailure(response.error, "wardrobe_review_failed");
  }

  if (response.data === null) {
    return recoverWardrobeDecision(client, normalized);
  }

  if (
    !isRecord(response.data) ||
    response.data.id !== normalized.wardrobeItemId
  ) {
    throw new AdminContentStepError("invalid_wardrobe_decision_result");
  }

  const lookup = await loadWardrobeItemDraft(
    client,
    normalized.topicId,
    normalized.wardrobeItemId,
    "wardrobe_review_failed",
  );

  if (
    lookup.kind !== "found" ||
    !matchesWardrobeDecision(lookup.item, normalized)
  ) {
    throw new AdminContentStepError("invalid_wardrobe_decision_result");
  }

  return { item: lookup.item };
}
