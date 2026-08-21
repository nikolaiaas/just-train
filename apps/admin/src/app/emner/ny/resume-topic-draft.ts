import type {
  AdminContentDifficulty,
  AdminExerciseMeasurement,
  BareTraenClient,
} from "@bare-traen/api-client";

export type ResumableTopicDraft = {
  topic: {
    accentColor: string | null;
    description: string;
    icon: string | null;
    id: string;
    title: string;
  };
  goal: {
    difficulty: AdminContentDifficulty;
    equipment: string[];
    estimatedMinutes: number | null;
    id: string;
    summary: string;
    title: string;
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
  } | null;
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

export async function loadResumableTopicDraft(
  client: BareTraenClient,
  topicId: string,
): Promise<ResumableTopicDraft | null> {
  const topicResponse = await client
    .from("topics")
    .select("id, title, description, icon, accent_color")
    .eq("id", topicId)
    .eq("is_published", false)
    .maybeSingle();

  if (topicResponse.error) {
    throw new Error("The topic draft could not be loaded.");
  }

  if (!topicResponse.data) return null;

  const [goalResponse, latestGoalOrderResponse] = await Promise.all([
    client
      .from("goals")
      .select("id, title, summary, difficulty, estimated_minutes, equipment")
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
  ]);

  if (goalResponse.error || latestGoalOrderResponse.error) {
    throw new Error("The topic goal draft could not be loaded.");
  }

  let exercise: ResumableTopicDraft["exercise"] = null;
  let nextExerciseSortOrder = 0;

  if (goalResponse.data) {
    const [exerciseResponse, latestExerciseOrderResponse] = await Promise.all([
      client
        .from("exercises")
        .select(
          "id, title, instructions, measurement, target_value, estimated_minutes, equipment, safety_notes",
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
    },
    goal: goalResponse.data
      ? {
          difficulty: goalResponse.data.difficulty,
          equipment: goalResponse.data.equipment,
          estimatedMinutes: goalResponse.data.estimated_minutes,
          id: goalResponse.data.id,
          summary: goalResponse.data.summary,
          title: goalResponse.data.title,
        }
      : null,
    exercise,
    nextExerciseSortOrder,
    nextGoalSortOrder: getNextSortOrder(
      latestGoalOrderResponse.data?.sort_order,
    ),
  };
}
