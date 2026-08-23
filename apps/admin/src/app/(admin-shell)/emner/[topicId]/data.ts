import type { BareTraenClient } from "@bare-traen/api-client";

export type AdminTopicDetailStatus = "draft" | "published";

export type AdminTopicDetailExercise = {
  contentVersion: number;
  equipment: string[];
  estimatedMinutes: number | null;
  goalId: string;
  id: string;
  instructions: string;
  measurement: "completion" | "repetitions" | "duration";
  publishedAt: string | null;
  safetyNotes: string;
  sortOrder: number;
  status: AdminTopicDetailStatus;
  targetValue: number | null;
  title: string;
  updatedAt: string;
};

export type AdminTopicDetailGoal = {
  contentVersion: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  equipment: string[];
  estimatedMinutes: number | null;
  exercises: AdminTopicDetailExercise[];
  id: string;
  publishedAt: string | null;
  sortOrder: number;
  status: AdminTopicDetailStatus;
  summary: string;
  title: string;
  topicId: string;
  updatedAt: string;
};

export type AdminTopicDetailWardrobeItem = {
  category: "clothing" | "equipment" | "effect";
  contentVersion: number;
  description: string;
  editorialStatus: "draft" | "approved" | "rejected";
  equipSlot: "head" | "body" | "held" | "feet" | "accessory";
  hasPendingRevision: boolean;
  icon: string;
  id: string;
  imagePath: string | null;
  imageUrl: string | null;
  name: string;
  points: number | null;
  publishedAt: string | null;
  rarity: "common" | "rare" | "special";
  sortOrder: number;
  status: AdminTopicDetailStatus;
  topicId: string;
  unlockRule: string | null;
  updatedAt: string;
};

export type AdminTopicDetail = {
  accentColor: string | null;
  contentVersion: number;
  description: string;
  goals: AdminTopicDetailGoal[];
  icon: string | null;
  id: string;
  publishedAt: string | null;
  slug: string;
  status: AdminTopicDetailStatus;
  title: string;
  updatedAt: string;
  wardrobeItems: AdminTopicDetailWardrobeItem[];
};

export class AdminTopicDetailLoadError extends Error {
  constructor() {
    super("Emnedetaljerne kunne ikke hentes.");
    this.name = "AdminTopicDetailLoadError";
  }
}

type TopicDetailRows = {
  exercises: unknown;
  goals: unknown;
  topic: unknown;
  wardrobeItems: unknown;
};

type UnknownRecord = Record<string, unknown>;

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
const MEASUREMENTS = new Set(["completion", "repetitions", "duration"]);
const WARDROBE_CATEGORIES = new Set(["clothing", "equipment", "effect"]);
const WARDROBE_RARITIES = new Set(["common", "rare", "special"]);
const WARDROBE_EDITORIAL_STATUSES = new Set(["draft", "approved", "rejected"]);
const WARDROBE_EQUIP_SLOTS = new Set([
  "head",
  "body",
  "held",
  "feet",
  "accessory",
]);
const WARDROBE_IMAGE_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:0[1-9]|1[0-6])\.png$/i;

const TOPIC_COLUMNS =
  "id, slug, title, description, icon, accent_color, content_version, is_published, published_at, updated_at" as const;
const GOAL_COLUMNS =
  "id, topic_id, title, summary, difficulty, estimated_minutes, equipment, sort_order, content_version, is_published, published_at, updated_at" as const;
const EXERCISE_COLUMNS =
  "id, goal_id, title, instructions, measurement, target_value, estimated_minutes, equipment, safety_notes, sort_order, content_version, is_published, published_at, updated_at" as const;
const WARDROBE_COLUMNS =
  "id, topic_id, name, icon, description, image_path, category, equip_slot, rarity, points, unlock_rule, sort_order, content_version, is_published, published_at, updated_at" as const;

function isMissingWardrobeStorageError(error: unknown): boolean {
  return (
    isRecord(error) &&
    typeof error.code === "string" &&
    (error.code === "42P01" ||
      error.code === "42703" ||
      error.code === "PGRST204" ||
      error.code === "PGRST202" ||
      error.code === "PGRST205")
  );
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    UUID_PATTERN.test(value) &&
    value.toLowerCase() !== NIL_UUID
  );
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function timestampMicroseconds(value: string): bigint {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/,
  );

  if (!match) return BigInt(Date.parse(value)) * BigInt(1_000);

  const [, second, fraction = "", offset] = match;
  return (
    BigInt(Date.parse(`${second}${offset}`)) * BigInt(1_000) +
    BigInt(fraction.padEnd(6, "0"))
  );
}

function isBoundedText(
  value: unknown,
  maximumLength: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    (allowEmpty || value.length > 0) &&
    Array.from(value).length <= maximumLength
  );
}

function isContentVersion(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function isSortOrder(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isNullableMinutes(value: unknown): value is number | null {
  return (
    value === null ||
    (Number.isInteger(value) &&
      (value as number) >= 1 &&
      (value as number) <= 180)
  );
}

function isEquipment(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 12 &&
    value.every((item) => isBoundedText(item, 80))
  );
}

function parsePublication(
  row: UnknownRecord,
): { publishedAt: string | null; status: AdminTopicDetailStatus } | null {
  if (typeof row.is_published !== "boolean") return null;

  if (row.is_published) {
    return isTimestamp(row.published_at)
      ? { publishedAt: row.published_at, status: "published" }
      : null;
  }

  return row.published_at === null
    ? { publishedAt: null, status: "draft" }
    : null;
}

export function normalizeAdminTopicDetailId(value: unknown): string | null {
  return isUuid(value) ? value.toLowerCase() : null;
}

function parseTopicRow(
  value: unknown,
): Omit<AdminTopicDetail, "goals" | "wardrobeItems"> | null {
  if (!isRecord(value)) return null;

  const publication = parsePublication(value);

  if (
    !publication ||
    !isUuid(value.id) ||
    typeof value.slug !== "string" ||
    !SLUG_PATTERN.test(value.slug) ||
    value.slug.length > 120 ||
    !isBoundedText(value.title, 100) ||
    !isBoundedText(value.description, 500, true) ||
    (value.icon !== null && !isBoundedText(value.icon, 16)) ||
    (value.accent_color !== null &&
      (typeof value.accent_color !== "string" ||
        !ACCENT_COLOR_PATTERN.test(value.accent_color))) ||
    !isContentVersion(value.content_version) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  return {
    accentColor: value.accent_color as string | null,
    contentVersion: value.content_version,
    description: value.description,
    icon: value.icon as string | null,
    id: value.id.toLowerCase(),
    publishedAt: publication.publishedAt,
    slug: value.slug,
    status: publication.status,
    title: value.title,
    updatedAt: value.updated_at,
  };
}

function parseGoalRow(
  value: unknown,
): Omit<AdminTopicDetailGoal, "exercises"> | null {
  if (!isRecord(value)) return null;

  const publication = parsePublication(value);

  if (
    !publication ||
    !isUuid(value.id) ||
    !isUuid(value.topic_id) ||
    !isBoundedText(value.title, 120) ||
    !isBoundedText(value.summary, 1_000, true) ||
    typeof value.difficulty !== "string" ||
    !DIFFICULTIES.has(value.difficulty) ||
    !isNullableMinutes(value.estimated_minutes) ||
    !isEquipment(value.equipment) ||
    !isSortOrder(value.sort_order) ||
    !isContentVersion(value.content_version) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  return {
    contentVersion: value.content_version,
    difficulty: value.difficulty as AdminTopicDetailGoal["difficulty"],
    equipment: [...value.equipment],
    estimatedMinutes: value.estimated_minutes,
    id: value.id.toLowerCase(),
    publishedAt: publication.publishedAt,
    sortOrder: value.sort_order,
    status: publication.status,
    summary: value.summary,
    title: value.title,
    topicId: value.topic_id.toLowerCase(),
    updatedAt: value.updated_at,
  };
}

function parseExerciseRow(value: unknown): AdminTopicDetailExercise | null {
  if (!isRecord(value)) return null;

  const publication = parsePublication(value);
  const measurement = value.measurement;
  const targetValue = value.target_value;
  const targetIsValid =
    (measurement === "completion" && targetValue === null) ||
    (measurement === "repetitions" &&
      Number.isInteger(targetValue) &&
      (targetValue as number) >= 1 &&
      (targetValue as number) <= 10_000) ||
    (measurement === "duration" &&
      Number.isInteger(targetValue) &&
      (targetValue as number) >= 1 &&
      (targetValue as number) <= 86_400);

  if (
    !publication ||
    !isUuid(value.id) ||
    !isUuid(value.goal_id) ||
    !isBoundedText(value.title, 120) ||
    !isBoundedText(value.instructions, 1_500, true) ||
    typeof measurement !== "string" ||
    !MEASUREMENTS.has(measurement) ||
    !targetIsValid ||
    !isNullableMinutes(value.estimated_minutes) ||
    !isEquipment(value.equipment) ||
    !isBoundedText(value.safety_notes, 1_000, true) ||
    !isSortOrder(value.sort_order) ||
    !isContentVersion(value.content_version) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  return {
    contentVersion: value.content_version,
    equipment: [...value.equipment],
    estimatedMinutes: value.estimated_minutes,
    goalId: value.goal_id.toLowerCase(),
    id: value.id.toLowerCase(),
    instructions: value.instructions,
    measurement: measurement as AdminTopicDetailExercise["measurement"],
    publishedAt: publication.publishedAt,
    safetyNotes: value.safety_notes,
    sortOrder: value.sort_order,
    status: publication.status,
    targetValue: targetValue as number | null,
    title: value.title,
    updatedAt: value.updated_at,
  };
}

function parseWardrobeItemRow(
  value: unknown,
): AdminTopicDetailWardrobeItem | null {
  if (!isRecord(value)) return null;

  const publication = parsePublication(value);
  const points = value.points;
  const unlockRule = value.unlock_rule;
  const equipSlot = value.equip_slot ?? "accessory";
  const hasPendingRevision = value.has_pending_revision ?? false;
  const description = value.description ?? "";
  const imagePath = value.image_path ?? null;
  const imageUrl = value.image_url ?? null;
  const rewardRuleIsValid =
    (Number.isInteger(points) &&
      (points as number) >= 1 &&
      (points as number) <= 1_000 &&
      unlockRule === null) ||
    (points === null && isBoundedText(unlockRule, 200));

  if (
    !publication ||
    !isUuid(value.id) ||
    !isUuid(value.topic_id) ||
    !isBoundedText(value.name, 80) ||
    !isBoundedText(value.icon, 16) ||
    !isBoundedText(description, 240, true) ||
    (imagePath !== null &&
      (typeof imagePath !== "string" ||
        !WARDROBE_IMAGE_PATH_PATTERN.test(imagePath))) ||
    (imageUrl !== null &&
      (typeof imageUrl !== "string" || !URL.canParse(imageUrl))) ||
    typeof value.category !== "string" ||
    !WARDROBE_CATEGORIES.has(value.category) ||
    typeof equipSlot !== "string" ||
    !WARDROBE_EQUIP_SLOTS.has(equipSlot) ||
    typeof hasPendingRevision !== "boolean" ||
    (hasPendingRevision && publication.status !== "published") ||
    typeof value.rarity !== "string" ||
    !WARDROBE_RARITIES.has(value.rarity) ||
    typeof value.editorial_status !== "string" ||
    !WARDROBE_EDITORIAL_STATUSES.has(value.editorial_status) ||
    (publication.status === "published" &&
      !hasPendingRevision &&
      value.editorial_status !== "approved") ||
    !rewardRuleIsValid ||
    !isSortOrder(value.sort_order) ||
    !isContentVersion(value.content_version) ||
    !isTimestamp(value.updated_at)
  ) {
    return null;
  }

  return {
    category: value.category as AdminTopicDetailWardrobeItem["category"],
    contentVersion: value.content_version,
    description,
    editorialStatus:
      value.editorial_status as AdminTopicDetailWardrobeItem["editorialStatus"],
    equipSlot: equipSlot as AdminTopicDetailWardrobeItem["equipSlot"],
    hasPendingRevision,
    icon: value.icon,
    id: value.id.toLowerCase(),
    imagePath: typeof imagePath === "string" ? imagePath.toLowerCase() : null,
    imageUrl,
    name: value.name,
    points: points as number | null,
    publishedAt: publication.publishedAt,
    rarity: value.rarity as AdminTopicDetailWardrobeItem["rarity"],
    sortOrder: value.sort_order,
    status: publication.status,
    topicId: value.topic_id.toLowerCase(),
    unlockRule: unlockRule as string | null,
    updatedAt: value.updated_at,
  };
}

function compareOrderedContent(
  left: { id: string; sortOrder: number; title?: string; name?: string },
  right: { id: string; sortOrder: number; title?: string; name?: string },
): number {
  return (
    left.sortOrder - right.sortOrder ||
    (left.title ?? left.name ?? "").localeCompare(
      right.title ?? right.name ?? "",
      "da-DK",
    ) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Validates database rows before they reach the page and assembles exercises
 * below their owning goal. Any duplicate or cross-topic relation is rejected.
 */
export function parseAdminTopicDetailRows(
  rows: TopicDetailRows,
): AdminTopicDetail | null {
  const topic = parseTopicRow(rows.topic);

  if (
    !topic ||
    !Array.isArray(rows.goals) ||
    !Array.isArray(rows.exercises) ||
    !Array.isArray(rows.wardrobeItems)
  ) {
    return null;
  }

  const goals: Array<Omit<AdminTopicDetailGoal, "exercises">> = [];
  const goalsById = new Map<string, Omit<AdminTopicDetailGoal, "exercises">>();

  for (const value of rows.goals) {
    const goal = parseGoalRow(value);

    if (!goal || goal.topicId !== topic.id || goalsById.has(goal.id)) {
      return null;
    }

    goals.push(goal);
    goalsById.set(goal.id, goal);
  }

  const exercisesByGoalId = new Map<string, AdminTopicDetailExercise[]>();
  const exerciseIds = new Set<string>();
  const exercises: AdminTopicDetailExercise[] = [];

  for (const value of rows.exercises) {
    const exercise = parseExerciseRow(value);

    if (
      !exercise ||
      !goalsById.has(exercise.goalId) ||
      exerciseIds.has(exercise.id)
    ) {
      return null;
    }

    exerciseIds.add(exercise.id);
    exercises.push(exercise);
    const siblings = exercisesByGoalId.get(exercise.goalId) ?? [];
    siblings.push(exercise);
    exercisesByGoalId.set(exercise.goalId, siblings);
  }

  const wardrobeItems: AdminTopicDetailWardrobeItem[] = [];
  const allWardrobeItems: AdminTopicDetailWardrobeItem[] = [];
  const wardrobeIds = new Set<string>();

  for (const value of rows.wardrobeItems) {
    const item = parseWardrobeItemRow(value);

    if (!item || item.topicId !== topic.id || wardrobeIds.has(item.id)) {
      return null;
    }

    wardrobeIds.add(item.id);
    allWardrobeItems.push(item);
    if (item.editorialStatus === "rejected") continue;
    wardrobeItems.push(item);
  }

  const updatedAt = [
    topic.updatedAt,
    ...goals.map((goal) => goal.updatedAt),
    ...exercises.map((exercise) => exercise.updatedAt),
    ...allWardrobeItems.map((item) => item.updatedAt),
  ].reduce((latest, candidate) =>
    timestampMicroseconds(candidate) > timestampMicroseconds(latest)
      ? candidate
      : latest,
  );

  return {
    ...topic,
    goals: goals.sort(compareOrderedContent).map((goal) => ({
      ...goal,
      exercises: (exercisesByGoalId.get(goal.id) ?? []).sort(
        compareOrderedContent,
      ),
    })),
    updatedAt,
    wardrobeItems: wardrobeItems.sort(compareOrderedContent),
  };
}

/** Loads one topic and all of its currently administrator-visible children. */
export async function loadAdminTopicDetail(
  client: BareTraenClient,
  topicId: unknown,
): Promise<AdminTopicDetail | null> {
  const normalizedTopicId = normalizeAdminTopicDetailId(topicId);

  if (!normalizedTopicId) return null;

  try {
    const topicResponse = await client
      .from("topics")
      .select(TOPIC_COLUMNS)
      .eq("id", normalizedTopicId)
      .maybeSingle();

    if (topicResponse.error) throw new AdminTopicDetailLoadError();
    if (!topicResponse.data) return null;

    const [goalsResponse, publishedWardrobeResponse, draftWardrobeResponse] =
      await Promise.all([
        client
          .from("goals")
          .select(GOAL_COLUMNS)
          .eq("topic_id", normalizedTopicId),
        client
          .from("wardrobe_items")
          .select(WARDROBE_COLUMNS)
          .eq("topic_id", normalizedTopicId)
          .eq("is_published", true),
        client.rpc("list_admin_wardrobe_item_drafts", {
          p_topic_id: normalizedTopicId,
        }),
      ]);

    if (
      goalsResponse.error ||
      (publishedWardrobeResponse.error &&
        !isMissingWardrobeStorageError(publishedWardrobeResponse.error)) ||
      (draftWardrobeResponse.error &&
        !isMissingWardrobeStorageError(draftWardrobeResponse.error)) ||
      !Array.isArray(goalsResponse.data) ||
      (!publishedWardrobeResponse.error &&
        !Array.isArray(publishedWardrobeResponse.data)) ||
      (!draftWardrobeResponse.error &&
        !Array.isArray(draftWardrobeResponse.data))
    ) {
      throw new AdminTopicDetailLoadError();
    }

    const wardrobeRows = draftWardrobeResponse.error
      ? publishedWardrobeResponse.error
        ? []
        : publishedWardrobeResponse.data.map((item: unknown) =>
            isRecord(item)
              ? {
                  ...item,
                  editorial_status: "approved",
                  has_pending_revision: false,
                }
              : item,
          )
      : draftWardrobeResponse.data;
    const wardrobeImageBucket = client.storage.from("wardrobe-images");
    const wardrobeRowsWithImages = wardrobeRows.map((item) => {
      if (!isRecord(item)) return item;

      if (typeof item.image_path !== "string") {
        return { ...item, image_url: null };
      }

      return {
        ...item,
        image_url: wardrobeImageBucket.getPublicUrl(item.image_path).data
          .publicUrl,
      };
    });

    const goalIds = goalsResponse.data.map((row) =>
      isRecord(row) && isUuid(row.id) ? row.id.toLowerCase() : null,
    );

    if (goalIds.some((goalId) => goalId === null)) {
      throw new AdminTopicDetailLoadError();
    }

    const exercisesResponse =
      goalIds.length === 0
        ? { data: [], error: null }
        : await client
            .from("exercises")
            .select(EXERCISE_COLUMNS)
            .in("goal_id", goalIds as string[]);

    if (exercisesResponse.error) throw new AdminTopicDetailLoadError();

    const detail = parseAdminTopicDetailRows({
      exercises: exercisesResponse.data,
      goals: goalsResponse.data,
      topic: topicResponse.data,
      wardrobeItems: wardrobeRowsWithImages,
    });

    if (!detail) throw new AdminTopicDetailLoadError();

    return detail;
  } catch (error) {
    if (error instanceof AdminTopicDetailLoadError) throw error;
    throw new AdminTopicDetailLoadError();
  }
}
