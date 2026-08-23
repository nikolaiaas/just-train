import type {
  AdminContentStatus,
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
    publishedAt: string | null;
    status: AdminContentStatus;
    title: string;
    updatedAt: string;
  };
  goal: {
    difficulty: AdminContentDifficulty;
    equipment: string[];
    estimatedMinutes: number | null;
    heroMediaUrl: string | null;
    id: string;
    publishedAt: string | null;
    sortOrder: number;
    status: AdminContentStatus;
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
    publishedAt: string | null;
    safetyNotes: string;
    targetValue: number | null;
    title: string;
    updatedAt: string;
    videoUrl: string | null;
    sortOrder: number;
    status: AdminContentStatus;
  } | null;
  wardrobeItems: AdminWardrobeItemDraft[];
  nextExerciseSortOrder: number;
  nextGoalSortOrder: number;
};

export type ResumableEditorStep = "topic" | "goal" | "exercise" | "wardrobe";

export type TopicEditorOutlineExercise = {
  id: string;
  sortOrder: number;
  status: AdminContentStatus;
  title: string;
};

export type TopicEditorOutlineGoal = {
  exercises: TopicEditorOutlineExercise[];
  id: string;
  sortOrder: number;
  status: AdminContentStatus;
  title: string;
};

export function buildTopicEditorHref({
  createExercise = false,
  exerciseId,
  goalId,
  topicId,
}: {
  createExercise?: boolean;
  exerciseId?: string;
  goalId?: string;
  topicId: string;
}): string {
  const search = new URLSearchParams({ topic: topicId });
  if (goalId) search.set("goal", goalId);
  if (exerciseId) search.set("exercise", exerciseId);
  if (createExercise) search.set("add", "exercise");
  return `/emner/ny?${search.toString()}`;
}

export function addExerciseToTopicEditorOutline(
  outline: TopicEditorOutlineGoal[],
  input: {
    goalId: string;
    id: string;
    sortOrder: number;
    title: string;
  },
): TopicEditorOutlineGoal[] {
  return outline.map((goal) => {
    if (goal.id !== input.goalId) return goal;
    if (goal.exercises.some((exercise) => exercise.id === input.id)) {
      return goal;
    }

    return {
      ...goal,
      exercises: [
        ...goal.exercises,
        {
          id: input.id,
          sortOrder: input.sortOrder,
          status: "draft" as const,
          title: input.title,
        },
      ].sort((left, right) => left.sortOrder - right.sortOrder),
    };
  });
}

export type ResumeTopicSelection =
  | {
      exerciseId: null;
      goalId: null;
      startingStep: null;
      topicId: null;
    }
  | {
      exerciseId: null;
      goalId: null;
      startingStep: null;
      topicId: string;
    }
  | {
      exerciseId: null;
      goalId: string;
      startingStep: "goal";
      topicId: string;
    }
  | {
      exerciseId: string;
      goalId: string;
      startingStep: "exercise";
      topicId: string;
    }
  | {
      exerciseId: null;
      goalId: string;
      startingStep: "new-exercise";
      topicId: string;
    };

type ResumeTopicQuery = {
  add?: string | string[];
  exercise?: string | string[];
  goal?: string | string[];
  topic?: string | string[];
};

type RequestedChildSelection = {
  createExercise?: boolean;
  exerciseId?: string | null;
  goalId?: string | null;
};

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

export function parseResumeTopicSelection(
  query: ResumeTopicQuery,
): ResumeTopicSelection | null {
  const hasAdd = query.add !== undefined;
  const hasTopic = query.topic !== undefined;
  const hasGoal = query.goal !== undefined;
  const hasExercise = query.exercise !== undefined;

  if (!hasTopic && !hasGoal && !hasExercise && !hasAdd) {
    return {
      exerciseId: null,
      goalId: null,
      startingStep: null,
      topicId: null,
    };
  }

  const topicId = parseResumeTopicId(query.topic);
  if (!topicId) return null;

  if (!hasGoal && !hasExercise && !hasAdd) {
    return {
      exerciseId: null,
      goalId: null,
      startingStep: null,
      topicId,
    };
  }

  const goalId = parseResumeTopicId(query.goal);
  if (!goalId || (!hasGoal && hasExercise)) return null;

  if (hasAdd) {
    if (query.add !== "exercise" || hasExercise) return null;

    return {
      exerciseId: null,
      goalId,
      startingStep: "new-exercise",
      topicId,
    };
  }

  if (!hasExercise) {
    return {
      exerciseId: null,
      goalId,
      startingStep: "goal",
      topicId,
    };
  }

  const exerciseId = parseResumeTopicId(query.exercise);
  if (!exerciseId) return null;

  return {
    exerciseId,
    goalId,
    startingStep: "exercise",
    topicId,
  };
}

export function getResumeStartingStep(
  draft: ResumableTopicDraft | null,
  requestedStep: "goal" | "exercise" | "new-exercise" | null = null,
): ResumableEditorStep {
  if (requestedStep === "new-exercise" && draft?.goal) return "exercise";

  if (requestedStep === "exercise" && draft?.goal && draft.exercise) {
    return "exercise";
  }

  if (requestedStep === "goal" && draft?.goal) return "goal";

  if (!draft) return "topic";
  if (draft.topic.status === "published") return "topic";
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
  requestedChild: RequestedChildSelection = {},
): Promise<ResumableTopicDraft | null> {
  const topicResponse = await client
    .from("topics")
    .select(
      "id, title, description, icon, accent_color, is_published, published_at, updated_at",
    )
    .eq("id", topicId)
    .maybeSingle();

  if (topicResponse.error) {
    throw new Error("The topic draft could not be loaded.");
  }

  if (!topicResponse.data) return null;

  const topicStatus: AdminContentStatus = topicResponse.data.is_published
    ? "published"
    : "draft";

  let goalQuery = client
    .from("goals")
    .select(
      "id, title, summary, difficulty, estimated_minutes, equipment, hero_media_url, sort_order, is_published, published_at, updated_at",
    )
    .eq("topic_id", topicId);

  if (requestedChild.goalId) {
    goalQuery = goalQuery.eq("id", requestedChild.goalId);
  } else {
    goalQuery = goalQuery
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);
  }

  const [goalResponse, latestGoalOrderResponse, wardrobeResponse] =
    await Promise.all([
      goalQuery.maybeSingle(),
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

  if (requestedChild.goalId && !goalResponse.data) return null;

  const wardrobeRows = wardrobeResponse.error ? [] : wardrobeResponse.data;

  let exercise: ResumableTopicDraft["exercise"] = null;
  let nextExerciseSortOrder = 0;

  if (goalResponse.data) {
    const exerciseResponse = requestedChild.createExercise
      ? { data: null, error: null }
      : await (() => {
          let exerciseQuery = client
            .from("exercises")
            .select(
              "id, title, instructions, measurement, target_value, estimated_minutes, equipment, safety_notes, video_url, sort_order, is_published, published_at, updated_at",
            )
            .eq("goal_id", goalResponse.data.id);

          if (requestedChild.exerciseId) {
            exerciseQuery = exerciseQuery.eq("id", requestedChild.exerciseId);
          } else {
            exerciseQuery = exerciseQuery
              .order("sort_order", { ascending: true })
              .order("created_at", { ascending: true })
              .limit(1);
          }

          return exerciseQuery.maybeSingle();
        })();
    const latestExerciseOrderResponse = await client
      .from("exercises")
      .select("sort_order")
      .eq("goal_id", goalResponse.data.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (exerciseResponse.error || latestExerciseOrderResponse.error) {
      throw new Error("The topic exercise draft could not be loaded.");
    }

    if (requestedChild.exerciseId && !exerciseResponse.data) return null;

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
        publishedAt: exerciseResponse.data.published_at,
        safetyNotes: exerciseResponse.data.safety_notes,
        targetValue: exerciseResponse.data.target_value,
        title: exerciseResponse.data.title,
        updatedAt: exerciseResponse.data.updated_at,
        videoUrl: exerciseResponse.data.video_url,
        sortOrder: exerciseResponse.data.sort_order,
        status: exerciseResponse.data.is_published ? "published" : "draft",
      };
    }
  } else if (requestedChild.exerciseId) {
    return null;
  }

  return {
    topic: {
      accentColor: topicResponse.data.accent_color,
      description: topicResponse.data.description,
      icon: topicResponse.data.icon,
      id: topicResponse.data.id,
      publishedAt: topicResponse.data.published_at,
      status: topicStatus,
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
          publishedAt: goalResponse.data.published_at,
          sortOrder: goalResponse.data.sort_order,
          status: goalResponse.data.is_published ? "published" : "draft",
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
      equipSlot: item.equip_slot,
      hasPendingRevision: item.has_pending_revision,
      icon: item.icon,
      id: item.id,
      name: item.name,
      points: item.points ?? 0,
      publishedAt: item.published_at,
      rarity: item.rarity,
      sortOrder: item.sort_order,
      status: item.is_published ? "published" : "draft",
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

export async function loadTopicEditorOutline(
  client: BareTraenClient,
  topicId: string,
): Promise<TopicEditorOutlineGoal[]> {
  const goalsResponse = await client
    .from("goals")
    .select("id, title, sort_order, is_published")
    .eq("topic_id", topicId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (goalsResponse.error) {
    throw new Error("The topic editor outline could not be loaded.");
  }

  if (goalsResponse.data.length === 0) return [];

  const exercisesResponse = await client
    .from("exercises")
    .select("id, goal_id, title, sort_order, is_published")
    .in(
      "goal_id",
      goalsResponse.data.map((goal) => goal.id),
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (exercisesResponse.error) {
    throw new Error("The topic exercise outline could not be loaded.");
  }

  return goalsResponse.data.map((goal) => ({
    exercises: exercisesResponse.data
      .filter((exercise) => exercise.goal_id === goal.id)
      .map((exercise) => ({
        id: exercise.id,
        sortOrder: exercise.sort_order,
        status: exercise.is_published ? "published" : "draft",
        title: exercise.title,
      })),
    id: goal.id,
    sortOrder: goal.sort_order,
    status: goal.is_published ? "published" : "draft",
    title: goal.title,
  }));
}
