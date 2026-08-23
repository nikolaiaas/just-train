import type { BareTraenClient } from "./index.ts";

export type UnpublishAdminTopicInput = {
  /** The revision returned by the last successful topic load or save. */
  expectedUpdatedAt: string;
  topicId: string;
};

export type PublishAdminTopicInput = UnpublishAdminTopicInput;

export type PublishAdminTopicResult = {
  changed: boolean;
  publishedAt: string;
  publishedExerciseCount: number;
  publishedGoalCount: number;
  publishedWardrobeItemCount: number;
  status: "published";
  topicId: string;
  updatedAt: string;
};

export type UnpublishAdminTopicResult = {
  changed: boolean;
  publishedAt: null;
  status: "draft";
  topicId: string;
  updatedAt: string;
};

export type DeleteAdminTopicInput = {
  /** The revision returned after the topic was unpublished or last saved. */
  expectedUpdatedAt: string;
  topicId: string;
};

export type DeleteAdminTopicResult = {
  deletedExerciseCount: number;
  deletedGoalCount: number;
  deletedWardrobeItemCount: number;
  topicId: string;
};

export type AdminTopicLifecycleErrorCode =
  | "admin_access_denied"
  | "invalid_expected_updated_at"
  | "invalid_topic_deletion_result"
  | "invalid_topic_id"
  | "invalid_topic_publish_result"
  | "invalid_topic_unpublish_result"
  | "topic_conflict"
  | "topic_delete_failed"
  | "topic_in_use"
  | "topic_must_be_unpublished"
  | "topic_not_found"
  | "topic_not_ready"
  | "topic_publish_failed"
  | "topic_unpublish_failed";

const ERROR_MESSAGES: Record<AdminTopicLifecycleErrorCode, string> = {
  admin_access_denied: "The account cannot administer training content.",
  invalid_expected_updated_at: "The expected topic revision is invalid.",
  invalid_topic_deletion_result: "Topic deletion returned an invalid result.",
  invalid_topic_id: "The topic id is invalid.",
  invalid_topic_publish_result: "Topic publication returned an invalid result.",
  invalid_topic_unpublish_result:
    "Topic unpublishing returned an invalid result.",
  topic_conflict: "The topic was changed by another editor.",
  topic_delete_failed: "The topic could not be deleted.",
  topic_in_use:
    "The topic has child activity and must remain as an unpublished topic.",
  topic_must_be_unpublished:
    "The topic must be unpublished before it can be deleted.",
  topic_not_found: "The topic no longer exists.",
  topic_not_ready:
    "Every topic goal needs at least one exercise before publication.",
  topic_publish_failed: "The topic could not be published.",
  topic_unpublish_failed: "The topic could not be unpublished.",
};

export class AdminTopicLifecycleError extends Error {
  readonly code: AdminTopicLifecycleErrorCode;

  constructor(code: AdminTopicLifecycleErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "AdminTopicLifecycleError";
    this.code = code;
  }
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTopicId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value) ||
    value.toLowerCase() === NIL_UUID
  ) {
    throw new AdminTopicLifecycleError("invalid_topic_id");
  }

  return value.toLowerCase();
}

function normalizeExpectedUpdatedAt(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 64 ||
    CONTROL_CHARACTER_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new AdminTopicLifecycleError("invalid_expected_updated_at");
  }

  return value;
}

function databaseErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function mapDatabaseFailure(
  error: unknown,
  fallback:
    "topic_delete_failed" | "topic_publish_failed" | "topic_unpublish_failed",
): AdminTopicLifecycleError {
  const code = databaseErrorCode(error);

  if (code === "42501") {
    return new AdminTopicLifecycleError("admin_access_denied");
  }

  if (code === "P0002") {
    return new AdminTopicLifecycleError("topic_not_found");
  }

  if (code === "40001") {
    return new AdminTopicLifecycleError("topic_conflict");
  }

  if (fallback === "topic_delete_failed" && code === "55000") {
    return new AdminTopicLifecycleError("topic_must_be_unpublished");
  }

  if (fallback === "topic_delete_failed" && code === "23503") {
    return new AdminTopicLifecycleError("topic_in_use");
  }

  if (fallback === "topic_publish_failed" && code === "23514") {
    return new AdminTopicLifecycleError("topic_not_ready");
  }

  return new AdminTopicLifecycleError(fallback);
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    !CONTROL_CHARACTER_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

async function requestTopicUnpublish(
  client: BareTraenClient,
  topicId: string,
  expectedUpdatedAt: string,
) {
  return client.rpc("unpublish_admin_topic", {
    p_expected_updated_at: expectedUpdatedAt,
    p_topic_id: topicId,
  });
}

async function requestTopicPublication(
  client: BareTraenClient,
  topicId: string,
  expectedUpdatedAt: string,
) {
  return client.rpc("publish_admin_topic", {
    p_expected_updated_at: expectedUpdatedAt,
    p_topic_id: topicId,
  });
}

async function requestTopicDeletion(
  client: BareTraenClient,
  topicId: string,
  expectedUpdatedAt: string,
) {
  return client.rpc("delete_admin_topic", {
    p_expected_updated_at: expectedUpdatedAt,
    p_topic_id: topicId,
  });
}

/**
 * Publishes the current mutable training tree in one transaction. Every goal
 * and exercise is included; wardrobe drafts are included only when approved.
 */
export async function publishAdminTopic(
  client: BareTraenClient,
  input: PublishAdminTopicInput,
): Promise<PublishAdminTopicResult> {
  const topicId = normalizeTopicId(input.topicId);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(input.expectedUpdatedAt);
  let response: Awaited<ReturnType<typeof requestTopicPublication>>;

  try {
    response = await requestTopicPublication(
      client,
      topicId,
      expectedUpdatedAt,
    );
  } catch {
    throw new AdminTopicLifecycleError("topic_publish_failed");
  }

  if (response.error) {
    throw mapDatabaseFailure(response.error, "topic_publish_failed");
  }

  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new AdminTopicLifecycleError("invalid_topic_publish_result");
  }

  const row: unknown = response.data[0];

  if (
    !isRecord(row) ||
    normalizeReturnedTopicId(row.id) !== topicId ||
    typeof row.changed !== "boolean" ||
    row.is_published !== true ||
    !isTimestamp(row.published_at) ||
    !isTimestamp(row.updated_at) ||
    !isNonNegativeInteger(row.published_goal_count) ||
    !isNonNegativeInteger(row.published_exercise_count) ||
    !isNonNegativeInteger(row.published_wardrobe_item_count)
  ) {
    throw new AdminTopicLifecycleError("invalid_topic_publish_result");
  }

  return {
    changed: row.changed,
    publishedAt: row.published_at,
    publishedExerciseCount: row.published_exercise_count,
    publishedGoalCount: row.published_goal_count,
    publishedWardrobeItemCount: row.published_wardrobe_item_count,
    status: "published",
    topicId,
    updatedAt: row.updated_at,
  };
}

/**
 * Hides one topic from public/mobile content discovery. Child goal, exercise,
 * and wardrobe publication states are intentionally left unchanged.
 */
export async function unpublishAdminTopic(
  client: BareTraenClient,
  input: UnpublishAdminTopicInput,
): Promise<UnpublishAdminTopicResult> {
  const topicId = normalizeTopicId(input.topicId);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(input.expectedUpdatedAt);
  let response: Awaited<ReturnType<typeof requestTopicUnpublish>>;

  try {
    response = await requestTopicUnpublish(client, topicId, expectedUpdatedAt);
  } catch {
    throw new AdminTopicLifecycleError("topic_unpublish_failed");
  }

  if (response.error) {
    throw mapDatabaseFailure(response.error, "topic_unpublish_failed");
  }

  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new AdminTopicLifecycleError("invalid_topic_unpublish_result");
  }

  const row: unknown = response.data[0];

  if (
    !isRecord(row) ||
    normalizeReturnedTopicId(row.id) !== topicId ||
    typeof row.changed !== "boolean" ||
    row.is_published !== false ||
    row.published_at !== null ||
    !isTimestamp(row.updated_at)
  ) {
    throw new AdminTopicLifecycleError("invalid_topic_unpublish_result");
  }

  return {
    changed: row.changed,
    publishedAt: null,
    status: "draft",
    topicId,
    updatedAt: row.updated_at,
  };
}

/**
 * Permanently deletes an unpublished topic and its topic-owned editorial tree.
 * The database refuses the operation when any child activity depends on it.
 */
export async function deleteAdminTopic(
  client: BareTraenClient,
  input: DeleteAdminTopicInput,
): Promise<DeleteAdminTopicResult> {
  const topicId = normalizeTopicId(input.topicId);
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(input.expectedUpdatedAt);
  let response: Awaited<ReturnType<typeof requestTopicDeletion>>;

  try {
    response = await requestTopicDeletion(client, topicId, expectedUpdatedAt);
  } catch {
    throw new AdminTopicLifecycleError("topic_delete_failed");
  }

  if (response.error) {
    throw mapDatabaseFailure(response.error, "topic_delete_failed");
  }

  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new AdminTopicLifecycleError("invalid_topic_deletion_result");
  }

  const row: unknown = response.data[0];

  if (
    !isRecord(row) ||
    normalizeReturnedTopicId(row.id) !== topicId ||
    !isNonNegativeInteger(row.deleted_goal_count) ||
    !isNonNegativeInteger(row.deleted_exercise_count) ||
    !isNonNegativeInteger(row.deleted_wardrobe_item_count)
  ) {
    throw new AdminTopicLifecycleError("invalid_topic_deletion_result");
  }

  return {
    deletedExerciseCount: row.deleted_exercise_count,
    deletedGoalCount: row.deleted_goal_count,
    deletedWardrobeItemCount: row.deleted_wardrobe_item_count,
    topicId,
  };
}

function normalizeReturnedTopicId(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}
