import type {
  AdminContentDifficulty,
  AdminExerciseMeasurement,
  AdminWardrobeItemDraft,
  BareTraenClient,
} from "@bare-traen/api-client";

export type ResumableTopicDraft = {
  topic: {
    accentColor: string | null;
    description: string;
    icon: string | null;
    id: string;
    title: string;
    updatedAt: string;
  };
  goal: {
    difficulty: AdminContentDifficulty;
    equipment: string[];
    estimatedMinutes: number | null;
    heroMediaUrl: string | null;
    id: string;
    sortOrder: number;
    summary: string;
    title: string;
    updatedAt: string;
  } | null;
  exercise: {
    equipment: string[];
    estimatedMinutes: number | null;
    id: string;
    instructions: string;
    measurement: AdminExerciseMeasurement;
    safetyNotes: string;
    targetValue: number | null;
    title: string;
    updatedAt: string;
    videoUrl: string | null;
    sortOrder: number;
  } | null;
  wardrobeItems: AdminWardrobeItemDraft[];
  nextExerciseSortOrder: number;
  nextGoalSortOrder: number;
};

export type ResumableEditorStep = "topic" | "goal" | "exercise" | "wardrobe";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const MAX_SORT_ORDER = 2_147_483_647;

function getNextSortOrder(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;

  if (!Number.isInteger(value) || value < 0 || value >= MAX_SORT_ORDER) {
    throw new Error("The next content position could not be determined.");
  }

  return value + 1;
}

export function parseResumeTopicId(
  value: string | string[] | undefined,
): string | null {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value) ||
    value.toLowerCase() === NIL_UUID
  ) {
    return null;
  }

  return value.toLowerCase();
}

export function getResumeStartingStep(
  draft: ResumableTopicDraft | null,
): ResumableEditorStep {
  if (!draft) return "topic";
  if (!draft.goal) return "goal";
  if (!draft.exercise) return "exercise";
  return "wardrobe";
}

export function isMissingWardrobeStorageError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "42P01" ||
      error.code === "PGRST202" ||
      error.code === "PGRST205")
  );
}

export async function loadResumableTopicDraft(
  client: BareTraenClient,
  topicId: string,
): Promise<ResumableTopicDraft | null> {
  const topicResponse = await client
    .from("topics")
    .select("id, title, description, icon, accent_color, updated_at")
    .eq("id", topicId)
    .eq("is_published", false)
    .maybeSingle();

  if (topicResponse.error) {
    throw new Error("The topic draft could not be loaded.");
  }

  if (!topicResponse.data) return null;

  const [goalResponse, latestGoalOrderResponse, wardrobeResponse] =
    await Promise.all([
      client
        .from("goals")
        .select(
          "id, title, summary, difficulty, estimated_minutes, equipment, hero_media_url, sort_order, updated_at",
        )
        .eq("topic_id", topicId)
        .eq("is_published", false)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      client
        .from("goals")
        .select("sort_order")
        .eq("topic_id", topicId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client.rpc("list_admin_wardrobe_item_drafts", {
        p_topic_id: topicId,
      }),
    ]);

  if (
    goalResponse.error ||
    latestGoalOrderResponse.error ||
    (wardrobeResponse.error &&
      !isMissingWardrobeStorageError(wardrobeResponse.error))
  ) {
    throw new Error("The topic draft content could not be loaded.");
  }

  const wardrobeRows = wardrobeResponse.error ? [] : wardrobeResponse.data;

  let exercise: ResumableTopicDraft["exercise"] = null;
  let nextExerciseSortOrder = 0;

  if (goalResponse.data) {
    const [exerciseResponse, latestExerciseOrderResponse] = await Promise.all([
      client
        .from("exercises")
        .select(
          "id, title, instructions, measurement, target_value, estimated_minutes, equipment, safety_notes, video_url, sort_order, updated_at",
        )
        .eq("goal_id", goalResponse.data.id)
        .eq("is_published", false)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      client
        .from("exercises")
        .select("sort_order")
        .eq("goal_id", goalResponse.data.id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (exerciseResponse.error || latestExerciseOrderResponse.error) {
      throw new Error("The topic exercise draft could not be loaded.");
    }

    nextExerciseSortOrder = getNextSortOrder(
      latestExerciseOrderResponse.data?.sort_order,
    );

    if (exerciseResponse.data) {
      exercise = {
        equipment: exerciseResponse.data.equipment,
        estimatedMinutes: exerciseResponse.data.estimated_minutes,
        id: exerciseResponse.data.id,
        instructions: exerciseResponse.data.instructions,
        measurement: exerciseResponse.data.measurement,
        safetyNotes: exerciseResponse.data.safety_notes,
        targetValue: exerciseResponse.data.target_value,
        title: exerciseResponse.data.title,
        updatedAt: exerciseResponse.data.updated_at,
        videoUrl: exerciseResponse.data.video_url,
        sortOrder: exerciseResponse.data.sort_order,
      };
    }
  }

  return {
    topic: {
      accentColor: topicResponse.data.accent_color,
      description: topicResponse.data.description,
      icon: topicResponse.data.icon,
      id: topicResponse.data.id,
      title: topicResponse.data.title,
      updatedAt: topicResponse.data.updated_at,
    },
    goal: goalResponse.data
      ? {
          difficulty: goalResponse.data.difficulty,
          equipment: goalResponse.data.equipment,
          estimatedMinutes: goalResponse.data.estimated_minutes,
          heroMediaUrl: goalResponse.data.hero_media_url,
          id: goalResponse.data.id,
          sortOrder: goalResponse.data.sort_order,
          summary: goalResponse.data.summary,
          title: goalResponse.data.title,
          updatedAt: goalResponse.data.updated_at,
        }
      : null,
    exercise,
    wardrobeItems: wardrobeRows.map((item) => ({
      category: item.category,
      contentVersion: item.content_version,
      createdAt: item.created_at,
      createdBy: item.created_by,
      editorialNote: item.editorial_note ?? "",
      editorialStatus: item.editorial_status,
      icon: item.icon,
      id: item.id,
      name: item.name,
      points: item.points ?? 0,
      publishedAt: null,
      rarity: item.rarity,
      sortOrder: item.sort_order,
      status: "draft",
      topicId: item.topic_id,
      unlockRule: item.unlock_rule ?? "",
      updatedAt: item.updated_at,
    })),
    nextExerciseSortOrder,
    nextGoalSortOrder: getNextSortOrder(
      latestGoalOrderResponse.data?.sort_order,
    ),
  };
}
