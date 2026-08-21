import type { BareTraenClient } from "./index.ts";

export type AdminTopicStatus = "draft" | "published";

export type AdminTopicLibraryItem = {
  accentColor: string | null;
  contentVersion: number;
  createdAt: string;
  createdBy: string | null;
  description: string;
  exerciseCount: number;
  goalCount: number;
  icon: string | null;
  id: string;
  publishedAt: string | null;
  slug: string;
  sortOrder: number;
  status: AdminTopicStatus;
  title: string;
  updatedAt: string;
};

export type CreateAdminTopicDraftInput = {
  /**
   * The authenticated administrator resolved by trusted server code. This is
   * stored as `created_by`; browser-provided identity must not be passed here.
   */
  authenticatedUserId: string;
  accentColor: string | null;
  description: string;
  icon: string | null;
  /**
   * A caller-persisted request UUID. It also becomes the topic id, making a
   * retry safe without adding a second idempotency column to the current schema.
   */
  requestId: string;
  slug: string;
  title: string;
};

export type CreateAdminTopicDraftResult = {
  created: boolean;
  topic: AdminTopicLibraryItem;
};

export type AdminContentErrorCode =
  | "admin_access_denied"
  | "invalid_accent_color"
  | "invalid_authenticated_user_id"
  | "invalid_description"
  | "invalid_icon"
  | "invalid_request_id"
  | "invalid_slug"
  | "invalid_title"
  | "invalid_topic_creation_result"
  | "invalid_topic_library_result"
  | "topic_creation_conflict"
  | "topic_creation_failed"
  | "topic_library_load_failed";

const ERROR_MESSAGES: Record<AdminContentErrorCode, string> = {
  admin_access_denied: "The account cannot administer training content.",
  invalid_accent_color: "The topic accent color is invalid.",
  invalid_authenticated_user_id:
    "The authenticated administrator id is invalid.",
  invalid_description: "The topic description is invalid.",
  invalid_icon: "The topic icon is invalid.",
  invalid_request_id: "The topic draft request id is invalid.",
  invalid_slug: "The topic slug is invalid.",
  invalid_title: "The topic title is invalid.",
  invalid_topic_creation_result: "Topic creation returned an invalid result.",
  invalid_topic_library_result: "The topic library returned an invalid result.",
  topic_creation_conflict:
    "The topic draft request conflicts with existing content.",
  topic_creation_failed: "The topic draft could not be created.",
  topic_library_load_failed: "The topic library could not be loaded.",
};

export class AdminContentError extends Error {
  readonly code: AdminContentErrorCode;

  constructor(code: AdminContentErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "AdminContentError";
    this.code = code;
  }
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const SINGLE_LINE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const MAX_TOPIC_TITLE_LENGTH = 100;
const MAX_TOPIC_DESCRIPTION_LENGTH = 500;
const MAX_TOPIC_ICON_LENGTH = 16;
const MAX_TOPIC_SLUG_LENGTH = 120;

const TOPIC_COLUMNS =
  "id, slug, title, description, icon, accent_color, sort_order, content_version, is_published, published_at, created_by, created_at, updated_at" as const;
const TOPIC_LIBRARY_COLUMNS =
  `${TOPIC_COLUMNS}, goals(id, exercises(id))` as const;

type UnknownRecord = Record<string, unknown>;

type NormalizedTopicDraft = {
  accentColor: string | null;
  authenticatedUserId: string;
  description: string;
  icon: string | null;
  requestId: string;
  slug: string;
  title: string;
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
  code: "invalid_authenticated_user_id" | "invalid_request_id",
): string {
  if (!isUuid(value)) {
    throw new AdminContentError(code);
  }

  return value.toLowerCase();
}

function normalizeTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new AdminContentError("invalid_title");
  }

  const title = value.trim();

  if (
    !title ||
    codePointLength(title) > MAX_TOPIC_TITLE_LENGTH ||
    SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new AdminContentError("invalid_title");
  }

  return title;
}

function normalizeDescription(value: unknown): string {
  if (typeof value !== "string") {
    throw new AdminContentError("invalid_description");
  }

  const description = value.replace(/\r\n?/gu, "\n").trim();

  if (
    codePointLength(description) > MAX_TOPIC_DESCRIPTION_LENGTH ||
    DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new AdminContentError("invalid_description");
  }

  return description;
}

function normalizeIcon(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new AdminContentError("invalid_icon");
  }

  const icon = value.trim();

  if (
    codePointLength(icon) > MAX_TOPIC_ICON_LENGTH ||
    SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new AdminContentError("invalid_icon");
  }

  return icon || null;
}

function normalizeAccentColor(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new AdminContentError("invalid_accent_color");
  }

  const accentColor = value.trim();

  if (!accentColor) {
    return null;
  }

  if (!ACCENT_COLOR_PATTERN.test(accentColor)) {
    throw new AdminContentError("invalid_accent_color");
  }

  return accentColor.toUpperCase();
}

function normalizeSlug(value: unknown): string {
  if (typeof value !== "string") {
    throw new AdminContentError("invalid_slug");
  }

  const slug = value.trim().toLowerCase();

  if (
    !slug ||
    slug.length > MAX_TOPIC_SLUG_LENGTH ||
    !SLUG_PATTERN.test(slug)
  ) {
    throw new AdminContentError("invalid_slug");
  }

  return slug;
}

function normalizeTopicDraft(
  input: CreateAdminTopicDraftInput,
): NormalizedTopicDraft {
  return {
    accentColor: normalizeAccentColor(input.accentColor),
    authenticatedUserId: normalizeUuid(
      input.authenticatedUserId,
      "invalid_authenticated_user_id",
    ),
    description: normalizeDescription(input.description),
    icon: normalizeIcon(input.icon),
    requestId: normalizeUuid(input.requestId, "invalid_request_id"),
    slug: normalizeSlug(input.slug),
    title: normalizeTitle(input.title),
  };
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isSafeReturnedTitle(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length > 0 &&
    codePointLength(value) <= MAX_TOPIC_TITLE_LENGTH &&
    !SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isSafeReturnedDescription(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.replace(/\r\n?/gu, "\n").trim() &&
    codePointLength(value) <= MAX_TOPIC_DESCRIPTION_LENGTH &&
    !DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isSafeReturnedIcon(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value === value.trim() &&
      value.length > 0 &&
      codePointLength(value) <= MAX_TOPIC_ICON_LENGTH &&
      !SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value))
  );
}

function isSafeReturnedAccentColor(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && ACCENT_COLOR_PATTERN.test(value))
  );
}

function parseTopicBase(
  value: unknown,
  goalCount: number,
  exerciseCount: number,
): AdminTopicLibraryItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const publishedAt = value.published_at;
  const createdBy = value.created_by;

  if (
    !isUuid(value.id) ||
    typeof value.slug !== "string" ||
    value.slug.length === 0 ||
    value.slug.length > MAX_TOPIC_SLUG_LENGTH ||
    !SLUG_PATTERN.test(value.slug) ||
    !isSafeReturnedTitle(value.title) ||
    !isSafeReturnedDescription(value.description) ||
    !isSafeReturnedIcon(value.icon) ||
    !isSafeReturnedAccentColor(value.accent_color) ||
    !Number.isInteger(value.sort_order) ||
    (value.sort_order as number) < 0 ||
    !Number.isInteger(value.content_version) ||
    (value.content_version as number) < 1 ||
    typeof value.is_published !== "boolean" ||
    (value.is_published ? !isTimestamp(publishedAt) : publishedAt !== null) ||
    (createdBy !== null && !isUuid(createdBy)) ||
    !isTimestamp(value.created_at) ||
    !isTimestamp(value.updated_at) ||
    !Number.isInteger(goalCount) ||
    goalCount < 0 ||
    !Number.isInteger(exerciseCount) ||
    exerciseCount < 0
  ) {
    return null;
  }

  return {
    accentColor: value.accent_color,
    contentVersion: value.content_version as number,
    createdAt: value.created_at,
    createdBy,
    description: value.description,
    exerciseCount,
    goalCount,
    icon: value.icon,
    id: value.id.toLowerCase(),
    publishedAt: publishedAt as string | null,
    slug: value.slug,
    sortOrder: value.sort_order as number,
    status: value.is_published ? "published" : "draft",
    title: value.title,
    updatedAt: value.updated_at,
  };
}

function parseLibraryRow(value: unknown): AdminTopicLibraryItem | null {
  if (!isRecord(value) || !Array.isArray(value.goals)) {
    return null;
  }

  const goalIds = new Set<string>();
  const exerciseIds = new Set<string>();

  for (const goal of value.goals) {
    if (!isRecord(goal) || !isUuid(goal.id) || !Array.isArray(goal.exercises)) {
      return null;
    }

    const normalizedGoalId = goal.id.toLowerCase();

    if (goalIds.has(normalizedGoalId)) {
      return null;
    }

    goalIds.add(normalizedGoalId);

    for (const exercise of goal.exercises) {
      if (!isRecord(exercise) || !isUuid(exercise.id)) {
        return null;
      }

      const normalizedExerciseId = exercise.id.toLowerCase();

      if (exerciseIds.has(normalizedExerciseId)) {
        return null;
      }

      exerciseIds.add(normalizedExerciseId);
    }
  }

  return parseTopicBase(value, goalIds.size, exerciseIds.size);
}

function databaseErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function mapDatabaseFailure(
  error: unknown,
  fallback: "topic_creation_failed" | "topic_library_load_failed",
): AdminContentError {
  return new AdminContentError(
    databaseErrorCode(error) === "42501" ? "admin_access_denied" : fallback,
  );
}

async function requestTopicLibrary(client: BareTraenClient) {
  return client
    .from("topics")
    .select(TOPIC_LIBRARY_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
}

/** Loads the real topic library visible to the authenticated administrator. */
export async function loadAdminTopicLibrary(
  client: BareTraenClient,
): Promise<AdminTopicLibraryItem[]> {
  let response: Awaited<ReturnType<typeof requestTopicLibrary>>;

  try {
    response = await requestTopicLibrary(client);
  } catch {
    throw new AdminContentError("topic_library_load_failed");
  }

  if (response.error) {
    throw mapDatabaseFailure(response.error, "topic_library_load_failed");
  }

  if (!Array.isArray(response.data)) {
    throw new AdminContentError("invalid_topic_library_result");
  }

  const items: AdminTopicLibraryItem[] = [];
  const topicIds = new Set<string>();

  for (const row of response.data) {
    const item = parseLibraryRow(row);

    if (!item || topicIds.has(item.id)) {
      throw new AdminContentError("invalid_topic_library_result");
    }

    topicIds.add(item.id);
    items.push(item);
  }

  return items;
}

async function insertTopicDraft(
  client: BareTraenClient,
  input: NormalizedTopicDraft,
) {
  return client
    .from("topics")
    .insert({
      accent_color: input.accentColor,
      created_by: input.authenticatedUserId,
      description: input.description,
      icon: input.icon,
      id: input.requestId,
      is_published: false,
      slug: input.slug,
      sort_order: 0,
      title: input.title,
    })
    .select(TOPIC_COLUMNS)
    .maybeSingle();
}

async function findTopicByRequestId(
  client: BareTraenClient,
  requestId: string,
) {
  return client
    .from("topics")
    .select(TOPIC_COLUMNS)
    .eq("id", requestId)
    .maybeSingle();
}

function matchesTopicDraft(
  topic: AdminTopicLibraryItem,
  input: NormalizedTopicDraft,
): boolean {
  return (
    topic.id === input.requestId &&
    topic.slug === input.slug &&
    topic.title === input.title &&
    topic.description === input.description &&
    topic.icon === input.icon &&
    (topic.accentColor === null ? null : topic.accentColor.toUpperCase()) ===
      input.accentColor &&
    topic.createdBy?.toLowerCase() === input.authenticatedUserId &&
    topic.sortOrder === 0 &&
    topic.contentVersion === 1 &&
    topic.status === "draft" &&
    topic.publishedAt === null
  );
}

async function recoverIdempotentTopicDraft(
  client: BareTraenClient,
  input: NormalizedTopicDraft,
): Promise<CreateAdminTopicDraftResult> {
  let response: Awaited<ReturnType<typeof findTopicByRequestId>>;

  try {
    response = await findTopicByRequestId(client, input.requestId);
  } catch {
    throw new AdminContentError("topic_creation_failed");
  }

  if (response.error) {
    throw mapDatabaseFailure(response.error, "topic_creation_failed");
  }

  const topic = parseTopicBase(response.data, 0, 0);

  if (!topic || !matchesTopicDraft(topic, input)) {
    throw new AdminContentError("topic_creation_conflict");
  }

  return { created: false, topic };
}

/**
 * Creates one unpublished topic draft. Reusing the same request UUID and exact
 * normalized payload returns the existing draft; a different payload fails as
 * a conflict instead of overwriting content.
 */
export async function createAdminTopicDraft(
  client: BareTraenClient,
  input: CreateAdminTopicDraftInput,
): Promise<CreateAdminTopicDraftResult> {
  const normalized = normalizeTopicDraft(input);
  let response: Awaited<ReturnType<typeof insertTopicDraft>>;

  try {
    response = await insertTopicDraft(client, normalized);
  } catch {
    throw new AdminContentError("topic_creation_failed");
  }

  if (response.error) {
    if (databaseErrorCode(response.error) === "23505") {
      return recoverIdempotentTopicDraft(client, normalized);
    }

    throw mapDatabaseFailure(response.error, "topic_creation_failed");
  }

  const topic = parseTopicBase(response.data, 0, 0);

  if (!topic || !matchesTopicDraft(topic, normalized)) {
    throw new AdminContentError("invalid_topic_creation_result");
  }

  return { created: true, topic };
}
