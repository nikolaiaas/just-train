import type { BareTraenClient } from "./index.ts";

export type ChildTrainingProgressState =
  "not_started" | "in_progress" | "completed";

export type ChildTrainingProgress = {
  completedExercises: number;
  lastTrainedAt: string | null;
  percentage: number;
  state: ChildTrainingProgressState;
  totalExercises: number;
};

export type ChildTrainingExerciseProgress = ChildTrainingProgress & {
  attemptsCount: number;
  bestDurationMs: number | null;
  bestRepetitions: number | null;
  completedCount: number;
};

export type ChildTrainingExerciseMeasurement =
  "completion" | "repetitions" | "duration";

export type ChildTrainingExercise = {
  equipment: string[];
  estimatedMinutes: number | null;
  goalId: string;
  id: string;
  instructions: string;
  measurement: ChildTrainingExerciseMeasurement;
  progress: ChildTrainingExerciseProgress;
  safetyNotes: string;
  slug: string;
  sortOrder: number;
  targetValue: number | null;
  title: string;
  videoUrl: string | null;
};

export type ChildTrainingGoalDifficulty =
  "beginner" | "intermediate" | "advanced";

export type ChildTrainingGoal = {
  difficulty: ChildTrainingGoalDifficulty;
  equipment: string[];
  estimatedMinutes: number | null;
  exercises: ChildTrainingExercise[];
  heroMediaUrl: string | null;
  id: string;
  isSelected: boolean;
  progress: ChildTrainingProgress;
  selectedAt: string | null;
  slug: string;
  sortOrder: number;
  subjectId: string;
  summary: string;
  title: string;
};

export type ChildTrainingSubject = {
  accentColor: string | null;
  description: string;
  goals: ChildTrainingGoal[];
  icon: string | null;
  id: string;
  isEnrolled: boolean;
  enrolledAt: string | null;
  progress: ChildTrainingProgress;
  slug: string;
  sortOrder: number;
  title: string;
};

export type ChildTrainingCatalog = {
  overallProgress: ChildTrainingProgress;
  subjects: ChildTrainingSubject[];
};

export type ChildTrainingContextInput = {
  childProfileId: string;
  expectedUserId: string;
  familyId: string;
};

export type LoadChildTrainingSubjectInput = ChildTrainingContextInput & {
  subjectId: string;
};

export type ChildTrainingSubjectChoiceInput = ChildTrainingContextInput & {
  subjectId: string;
};

export type ChildTrainingGoalChoiceInput = ChildTrainingSubjectChoiceInput & {
  goalId: string;
  selected: boolean;
};

export type ChildTrainingEnrollment = {
  changed: boolean;
  enrolledAt: string | null;
  goalId: string | null;
  isEnrolled: boolean;
  isSelected: boolean | null;
  selectedAt: string | null;
  subjectId: string;
};

export type ChildTrainingPerceivedDifficulty = 1 | 2 | 3 | 4 | 5;

type CompleteChildTrainingExerciseBaseInput = ChildTrainingContextInput & {
  clientRequestId: string;
  exerciseId: string;
  goalId: string;
  perceivedDifficulty?: ChildTrainingPerceivedDifficulty;
  subjectId: string;
};

export type CompleteChildTrainingExerciseInput =
  CompleteChildTrainingExerciseBaseInput &
    (
      | {
          durationMs?: never;
          measurement: "completion";
          repetitions?: never;
        }
      | {
          durationMs?: never;
          measurement: "repetitions";
          repetitions: number;
        }
      | {
          durationMs: number;
          measurement: "duration";
          repetitions?: never;
        }
    );

export type ChildTrainingCompletion = {
  attemptId: string;
  completedAt: string;
  created: boolean;
  durationMs: number | null;
  exerciseId: string;
  goalId: string;
  perceivedDifficulty: ChildTrainingPerceivedDifficulty | null;
  progress: ChildTrainingExerciseProgress;
  repetitions: number | null;
  sessionId: string;
  subjectId: string;
};

export type ChildTrainingErrorCode =
  | "child_training_access_denied"
  | "child_training_completion_failed"
  | "child_training_content_failed"
  | "child_training_enrollment_failed"
  | "child_training_enrollment_unavailable"
  | "child_training_session_changed"
  | "child_training_unavailable"
  | "invalid_child_profile_id"
  | "invalid_client_request_id"
  | "invalid_completion_result"
  | "invalid_duration_ms"
  | "invalid_enrollment_result"
  | "invalid_enrollment_state"
  | "invalid_exercise_id"
  | "invalid_expected_user_id"
  | "invalid_family_id"
  | "invalid_goal_id"
  | "invalid_measurement"
  | "invalid_perceived_difficulty"
  | "invalid_repetitions"
  | "invalid_subject_id"
  | "invalid_training_content_result";

const ERROR_MESSAGES: Record<ChildTrainingErrorCode, string> = {
  child_training_access_denied:
    "Training content is not available for this child and account.",
  child_training_completion_failed:
    "The exercise completion could not be saved.",
  child_training_content_failed: "Training content could not be loaded.",
  child_training_enrollment_failed: "The child choice could not be saved.",
  child_training_enrollment_unavailable:
    "Choosing subjects and goals is not available yet.",
  child_training_session_changed:
    "The signed-in account changed before training finished.",
  child_training_unavailable: "The published training is no longer available.",
  invalid_child_profile_id: "The child profile id is invalid.",
  invalid_client_request_id: "The training request id is invalid.",
  invalid_completion_result: "Saving training returned invalid data.",
  invalid_duration_ms: "The training duration is invalid.",
  invalid_enrollment_result: "Saving the child choice returned invalid data.",
  invalid_enrollment_state: "The child choice is invalid.",
  invalid_exercise_id: "The exercise id is invalid.",
  invalid_expected_user_id: "The expected adult account id is invalid.",
  invalid_family_id: "The family id is invalid.",
  invalid_goal_id: "The training goal id is invalid.",
  invalid_measurement: "The exercise measurement is invalid.",
  invalid_perceived_difficulty: "The perceived difficulty is invalid.",
  invalid_repetitions: "The repetition result is invalid.",
  invalid_subject_id: "The subject id is invalid.",
  invalid_training_content_result: "Training content returned invalid data.",
};

export class ChildTrainingError extends Error {
  readonly code: ChildTrainingErrorCode;

  constructor(code: ChildTrainingErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ChildTrainingError";
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
const MEASUREMENTS = new Set<ChildTrainingExerciseMeasurement>([
  "completion",
  "repetitions",
  "duration",
]);
const DIFFICULTIES = new Set<ChildTrainingGoalDifficulty>([
  "beginner",
  "intermediate",
  "advanced",
]);
const STORED_PROGRESS_STATES = new Set(["in_progress", "completed"]);

type UnknownRecord = Record<string, unknown>;

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

function normalizeUuid(
  value: unknown,
  code:
    | "invalid_child_profile_id"
    | "invalid_client_request_id"
    | "invalid_exercise_id"
    | "invalid_expected_user_id"
    | "invalid_family_id"
    | "invalid_goal_id"
    | "invalid_subject_id",
): string {
  if (!isUuid(value)) throw new ChildTrainingError(code);
  return value.toLowerCase();
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 20 &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value))
  );
}

function isBoundedSingleLineText(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string {
  const length = typeof value === "string" ? Array.from(value).length : 0;
  return (
    typeof value === "string" &&
    value === value.trim() &&
    length >= minimumLength &&
    length <= maximumLength &&
    !SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isBoundedMultilineText(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    Array.from(value).length <= maximumLength &&
    !DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isNullableBoundedUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      parsed.toString() === value
    );
  } catch {
    return false;
  }
}

function isNullableSafeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number | null {
  return (
    value === null ||
    (Number.isSafeInteger(value) &&
      Number(value) >= minimum &&
      Number(value) <= maximum)
  );
}

function parseEquipment(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 12) return null;
  const equipment: string[] = [];
  const normalized = new Set<string>();

  for (const item of value) {
    if (!isBoundedSingleLineText(item, 1, 80)) return null;
    const key = item.toLocaleLowerCase("da-DK");
    if (normalized.has(key)) return null;
    normalized.add(key);
    equipment.push(item);
  }

  return equipment;
}

function percentage(completedExercises: number, totalExercises: number) {
  return totalExercises === 0
    ? 0
    : Math.round((completedExercises / totalExercises) * 100);
}

function summarizeExerciseProgress(
  value: UnknownRecord,
): ChildTrainingExerciseProgress | null {
  const progressValues = [
    value.progress_state,
    value.attempts_count,
    value.completed_count,
    value.best_repetitions,
    value.best_duration_ms,
    value.last_attempted_at,
  ];

  if (progressValues.every((part) => part === null)) {
    return {
      attemptsCount: 0,
      bestDurationMs: null,
      bestRepetitions: null,
      completedCount: 0,
      completedExercises: 0,
      lastTrainedAt: null,
      percentage: 0,
      state: "not_started",
      totalExercises: 1,
    };
  }

  if (
    typeof value.progress_state !== "string" ||
    !STORED_PROGRESS_STATES.has(value.progress_state) ||
    !Number.isSafeInteger(value.attempts_count) ||
    Number(value.attempts_count) < 1 ||
    !Number.isSafeInteger(value.completed_count) ||
    Number(value.completed_count) < 0 ||
    Number(value.completed_count) > Number(value.attempts_count) ||
    (value.progress_state === "completed") !==
      Number(value.completed_count) > 0 ||
    !isNullableSafeInteger(value.best_repetitions, 0, 2_147_483_647) ||
    !isNullableSafeInteger(value.best_duration_ms, 0, 2_147_483_647) ||
    !isTimestamp(value.last_attempted_at)
  ) {
    return null;
  }

  const completed = value.progress_state === "completed";
  return {
    attemptsCount: Number(value.attempts_count),
    bestDurationMs: value.best_duration_ms as number | null,
    bestRepetitions: value.best_repetitions as number | null,
    completedCount: Number(value.completed_count),
    completedExercises: completed ? 1 : 0,
    lastTrainedAt: value.last_attempted_at,
    percentage: completed ? 100 : 0,
    state: value.progress_state as "in_progress" | "completed",
    totalExercises: 1,
  };
}

type ParsedTrainingRow = {
  exercise: ChildTrainingExercise | null;
  goal: Omit<ChildTrainingGoal, "exercises" | "progress"> | null;
  subject: Omit<ChildTrainingSubject, "goals" | "progress">;
};

function parseTrainingRow(value: unknown): ParsedTrainingRow | null {
  if (
    !isRecord(value) ||
    !isUuid(value.topic_id) ||
    !isBoundedSingleLineText(value.topic_slug, 1, 120) ||
    !SLUG_PATTERN.test(value.topic_slug) ||
    !isBoundedSingleLineText(value.topic_title, 1, 100) ||
    !isBoundedMultilineText(value.topic_description, 500) ||
    !(
      value.topic_icon === null ||
      isBoundedSingleLineText(value.topic_icon, 1, 16)
    ) ||
    !(
      value.topic_accent_color === null ||
      (typeof value.topic_accent_color === "string" &&
        ACCENT_COLOR_PATTERN.test(value.topic_accent_color))
    ) ||
    !Number.isSafeInteger(value.topic_sort_order) ||
    Number(value.topic_sort_order) < 0
  ) {
    return null;
  }

  const subject: ParsedTrainingRow["subject"] = {
    accentColor: value.topic_accent_color as string | null,
    description: value.topic_description,
    enrolledAt: value.topic_enrolled_at as string | null,
    icon: value.topic_icon as string | null,
    id: value.topic_id.toLowerCase(),
    isEnrolled: value.topic_is_enrolled as boolean,
    slug: value.topic_slug,
    sortOrder: Number(value.topic_sort_order),
    title: value.topic_title,
  };

  if (
    typeof value.topic_is_enrolled !== "boolean" ||
    !(
      (value.topic_is_enrolled && isTimestamp(value.topic_enrolled_at)) ||
      (!value.topic_is_enrolled && value.topic_enrolled_at === null)
    )
  ) {
    return null;
  }

  if (value.goal_id === null) {
    const childColumns = [
      value.goal_id,
      value.goal_slug,
      value.goal_title,
      value.goal_summary,
      value.goal_difficulty,
      value.goal_estimated_minutes,
      value.goal_equipment,
      value.goal_hero_media_url,
      value.goal_sort_order,
      value.goal_is_enrolled,
      value.goal_enrolled_at,
      value.exercise_id,
      value.exercise_slug,
      value.exercise_title,
      value.exercise_instructions,
      value.exercise_measurement,
      value.exercise_target_value,
      value.exercise_estimated_minutes,
      value.exercise_equipment,
      value.exercise_safety_notes,
      value.exercise_video_url,
      value.exercise_sort_order,
      value.progress_state,
      value.attempts_count,
      value.completed_count,
      value.best_repetitions,
      value.best_duration_ms,
      value.last_attempted_at,
    ];
    return childColumns.every((part) => part === null)
      ? { exercise: null, goal: null, subject }
      : null;
  }

  const goalEquipment = parseEquipment(value.goal_equipment);
  if (
    !isUuid(value.goal_id) ||
    !isBoundedSingleLineText(value.goal_slug, 1, 120) ||
    !SLUG_PATTERN.test(value.goal_slug) ||
    !isBoundedSingleLineText(value.goal_title, 1, 120) ||
    !isBoundedMultilineText(value.goal_summary, 1_000) ||
    typeof value.goal_difficulty !== "string" ||
    !DIFFICULTIES.has(value.goal_difficulty as ChildTrainingGoalDifficulty) ||
    !isNullableSafeInteger(value.goal_estimated_minutes, 1, 180) ||
    !goalEquipment ||
    !isNullableBoundedUrl(value.goal_hero_media_url) ||
    !Number.isSafeInteger(value.goal_sort_order) ||
    Number(value.goal_sort_order) < 0 ||
    typeof value.goal_is_enrolled !== "boolean" ||
    !(
      (value.goal_is_enrolled && isTimestamp(value.goal_enrolled_at)) ||
      (!value.goal_is_enrolled && value.goal_enrolled_at === null)
    )
  ) {
    return null;
  }

  const goal: NonNullable<ParsedTrainingRow["goal"]> = {
    difficulty: value.goal_difficulty as ChildTrainingGoalDifficulty,
    equipment: goalEquipment,
    estimatedMinutes: value.goal_estimated_minutes as number | null,
    heroMediaUrl: value.goal_hero_media_url as string | null,
    id: value.goal_id.toLowerCase(),
    isSelected: value.goal_is_enrolled,
    selectedAt: value.goal_enrolled_at as string | null,
    slug: value.goal_slug,
    sortOrder: Number(value.goal_sort_order),
    subjectId: subject.id,
    summary: value.goal_summary,
    title: value.goal_title,
  };

  if (value.exercise_id === null) {
    const exerciseColumns = [
      value.exercise_id,
      value.exercise_slug,
      value.exercise_title,
      value.exercise_instructions,
      value.exercise_measurement,
      value.exercise_target_value,
      value.exercise_estimated_minutes,
      value.exercise_equipment,
      value.exercise_safety_notes,
      value.exercise_video_url,
      value.exercise_sort_order,
      value.progress_state,
      value.attempts_count,
      value.completed_count,
      value.best_repetitions,
      value.best_duration_ms,
      value.last_attempted_at,
    ];
    return exerciseColumns.every((part) => part === null)
      ? { exercise: null, goal, subject }
      : null;
  }

  const exerciseEquipment = parseEquipment(value.exercise_equipment);
  const progress = summarizeExerciseProgress(value);
  if (
    !isUuid(value.exercise_id) ||
    !isBoundedSingleLineText(value.exercise_slug, 1, 120) ||
    !SLUG_PATTERN.test(value.exercise_slug) ||
    !isBoundedSingleLineText(value.exercise_title, 1, 120) ||
    !isBoundedMultilineText(value.exercise_instructions, 1_500) ||
    typeof value.exercise_measurement !== "string" ||
    !MEASUREMENTS.has(
      value.exercise_measurement as ChildTrainingExerciseMeasurement,
    ) ||
    !isNullableSafeInteger(value.exercise_target_value, 1, 86_400) ||
    !isNullableSafeInteger(value.exercise_estimated_minutes, 1, 180) ||
    !exerciseEquipment ||
    !isBoundedMultilineText(value.exercise_safety_notes, 1_000) ||
    !isNullableBoundedUrl(value.exercise_video_url) ||
    !Number.isSafeInteger(value.exercise_sort_order) ||
    Number(value.exercise_sort_order) < 0 ||
    !progress
  ) {
    return null;
  }

  const measurement =
    value.exercise_measurement as ChildTrainingExerciseMeasurement;
  const targetValue = value.exercise_target_value as number | null;
  if (
    (measurement === "completion" && targetValue !== null) ||
    (measurement !== "completion" && targetValue === null) ||
    (measurement === "repetitions" &&
      targetValue !== null &&
      targetValue > 10_000)
  ) {
    return null;
  }

  return {
    exercise: {
      equipment: exerciseEquipment,
      estimatedMinutes: value.exercise_estimated_minutes as number | null,
      goalId: goal.id,
      id: value.exercise_id.toLowerCase(),
      instructions: value.exercise_instructions,
      measurement,
      progress,
      safetyNotes: value.exercise_safety_notes,
      slug: value.exercise_slug,
      sortOrder: Number(value.exercise_sort_order),
      targetValue,
      title: value.exercise_title,
      videoUrl: value.exercise_video_url as string | null,
    },
    goal,
    subject,
  };
}

function latestTimestamp(values: readonly (string | null)[]): string | null {
  return values.reduce<string | null>((latest, candidate) => {
    if (candidate === null) return latest;
    if (latest === null) return candidate;
    return Date.parse(candidate) > Date.parse(latest) ? candidate : latest;
  }, null);
}

function summarizeExercises(
  exercises: readonly ChildTrainingExercise[],
): ChildTrainingProgress {
  const completedExercises = exercises.filter(
    (exercise) => exercise.progress.state === "completed",
  ).length;
  const totalExercises = exercises.length;
  const hasStarted = exercises.some(
    (exercise) => exercise.progress.state !== "not_started",
  );
  return {
    completedExercises,
    lastTrainedAt: latestTimestamp(
      exercises.map((exercise) => exercise.progress.lastTrainedAt),
    ),
    percentage: percentage(completedExercises, totalExercises),
    state:
      totalExercises > 0 && completedExercises === totalExercises
        ? "completed"
        : hasStarted
          ? "in_progress"
          : "not_started",
    totalExercises,
  };
}

function parseTrainingCatalog(value: unknown): ChildTrainingCatalog | null {
  if (!Array.isArray(value)) return null;
  const parsedRows = value.map(parseTrainingRow);
  if (parsedRows.some((row) => row === null)) return null;

  const subjectsById = new Map<
    string,
    {
      hasEmptyGoalRow: boolean;
      goalsById: Map<
        string,
        {
          exercises: ChildTrainingExercise[];
          hasEmptyExerciseRow: boolean;
          value: NonNullable<ParsedTrainingRow["goal"]>;
        }
      >;
      value: ParsedTrainingRow["subject"];
    }
  >();
  const goalSubjectIds = new Map<string, string>();
  const exerciseIds = new Set<string>();

  for (const row of parsedRows as ParsedTrainingRow[]) {
    const existingSubject = subjectsById.get(row.subject.id);
    if (
      existingSubject &&
      JSON.stringify(existingSubject.value) !== JSON.stringify(row.subject)
    ) {
      return null;
    }
    const subject = existingSubject ?? {
      hasEmptyGoalRow: false,
      goalsById: new Map(),
      value: row.subject,
    };
    subjectsById.set(row.subject.id, subject);

    if (!row.goal) {
      if (
        row.exercise ||
        subject.hasEmptyGoalRow ||
        subject.goalsById.size > 0
      ) {
        return null;
      }
      subject.hasEmptyGoalRow = true;
      continue;
    }

    if (subject.hasEmptyGoalRow) return null;
    const knownGoalSubjectId = goalSubjectIds.get(row.goal.id);
    if (knownGoalSubjectId && knownGoalSubjectId !== row.subject.id) {
      return null;
    }
    goalSubjectIds.set(row.goal.id, row.subject.id);

    const existingGoal = subject.goalsById.get(row.goal.id);
    if (
      existingGoal &&
      JSON.stringify(existingGoal.value) !== JSON.stringify(row.goal)
    ) {
      return null;
    }
    const goal = existingGoal ?? {
      exercises: [],
      hasEmptyExerciseRow: false,
      value: row.goal,
    };
    subject.goalsById.set(row.goal.id, goal);

    if (!row.exercise) {
      if (goal.hasEmptyExerciseRow || goal.exercises.length > 0) return null;
      goal.hasEmptyExerciseRow = true;
      continue;
    }
    if (goal.hasEmptyExerciseRow) return null;
    if (exerciseIds.has(row.exercise.id)) return null;
    exerciseIds.add(row.exercise.id);
    goal.exercises.push(row.exercise);
  }

  const subjects: ChildTrainingSubject[] = [...subjectsById.values()]
    .map(({ goalsById, value: subject }) => {
      const goals: ChildTrainingGoal[] = [...goalsById.values()]
        .map(({ exercises, value: goal }) => {
          exercises.sort(
            (left, right) =>
              left.sortOrder - right.sortOrder ||
              left.id.localeCompare(right.id),
          );
          return {
            ...goal,
            exercises,
            progress: summarizeExercises(exercises),
          };
        })
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
        );
      const exercises = goals.flatMap((goal) => goal.exercises);
      return { ...subject, goals, progress: summarizeExercises(exercises) };
    })
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    );

  return {
    overallProgress: summarizeExercises(
      subjects
        .filter((subject) => subject.isEnrolled)
        .flatMap((subject) =>
          subject.goals
            .filter((goal) => goal.isSelected)
            .flatMap((goal) => goal.exercises),
        ),
    ),
    subjects,
  };
}

function normalizeContext(
  input: ChildTrainingContextInput,
): ChildTrainingContextInput {
  return {
    childProfileId: normalizeUuid(
      input.childProfileId,
      "invalid_child_profile_id",
    ),
    expectedUserId: normalizeUuid(
      input.expectedUserId,
      "invalid_expected_user_id",
    ),
    familyId: normalizeUuid(input.familyId, "invalid_family_id"),
  };
}

function databaseErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function isMissingRpcError(error: unknown): boolean {
  const code = databaseErrorCode(error);
  return code === "42883" || code === "PGRST202";
}

function mapDatabaseError(
  error: unknown,
  fallback:
    | "child_training_completion_failed"
    | "child_training_content_failed"
    | "child_training_enrollment_failed",
): ChildTrainingError {
  const code = databaseErrorCode(error);
  if (
    fallback === "child_training_enrollment_failed" &&
    isMissingRpcError(error)
  ) {
    return new ChildTrainingError("child_training_enrollment_unavailable");
  }
  if (code === "28000") {
    return new ChildTrainingError("child_training_session_changed");
  }
  if (code === "42501") {
    return new ChildTrainingError("child_training_access_denied");
  }
  if (
    code === "P0002" ||
    (fallback === "child_training_completion_failed" && code === "22023")
  ) {
    return new ChildTrainingError("child_training_unavailable");
  }
  return new ChildTrainingError(fallback);
}

function queryTrainingContent(
  client: BareTraenClient,
  input: ChildTrainingContextInput,
  topicId: string | null,
  version: "legacy" | "v2",
) {
  const context = {
    p_child_profile_id: input.childProfileId,
    p_expected_user_id: input.expectedUserId,
    p_family_id: input.familyId,
  };
  const args = topicId === null ? context : { ...context, p_topic_id: topicId };
  return version === "v2"
    ? client.rpc("list_child_training_content_v2", args)
    : client.rpc("list_child_training_content", args);
}

function addLegacyEnrollmentDefaults(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((row) =>
    isRecord(row)
      ? {
          ...row,
          goal_enrolled_at: null,
          goal_is_enrolled: row.goal_id === null ? null : false,
          topic_enrolled_at: null,
          topic_is_enrolled: false,
        }
      : row,
  );
}

async function loadTrainingCatalog(
  client: BareTraenClient,
  input: ChildTrainingContextInput,
  topicId: string | null,
): Promise<ChildTrainingCatalog> {
  let response: Awaited<ReturnType<typeof queryTrainingContent>>;
  try {
    response = await queryTrainingContent(client, input, topicId, "v2");
  } catch {
    throw new ChildTrainingError("child_training_content_failed");
  }
  let responseData: unknown = response.data;
  if (response.error && isMissingRpcError(response.error)) {
    try {
      response = await queryTrainingContent(client, input, topicId, "legacy");
    } catch {
      throw new ChildTrainingError("child_training_content_failed");
    }
    responseData = addLegacyEnrollmentDefaults(response.data);
  }
  if (response.error) {
    throw mapDatabaseError(response.error, "child_training_content_failed");
  }
  const catalog = parseTrainingCatalog(responseData);
  if (!catalog) {
    throw new ChildTrainingError("invalid_training_content_result");
  }
  return catalog;
}

/** Loads all currently published subjects with ordered goals and exercises. */
export async function listChildTrainingSubjects(
  client: BareTraenClient,
  input: ChildTrainingContextInput,
): Promise<ChildTrainingCatalog> {
  return loadTrainingCatalog(client, normalizeContext(input), null);
}

/** Loads one current subject tree, or null when it is absent/unpublished. */
export async function loadChildTrainingSubject(
  client: BareTraenClient,
  input: LoadChildTrainingSubjectInput,
): Promise<ChildTrainingSubject | null> {
  const context = normalizeContext(input);
  const subjectId = normalizeUuid(input.subjectId, "invalid_subject_id");
  const catalog = await loadTrainingCatalog(client, context, subjectId);
  if (catalog.subjects.length > 1) {
    throw new ChildTrainingError("invalid_training_content_result");
  }
  const subject = catalog.subjects[0] ?? null;
  if (subject !== null && subject.id !== subjectId) {
    throw new ChildTrainingError("invalid_training_content_result");
  }
  return subject;
}

async function setChildTrainingEnrollment(
  client: BareTraenClient,
  input: ChildTrainingSubjectChoiceInput,
  goalId: string | null,
  enrolled: boolean,
): Promise<ChildTrainingEnrollment> {
  const context = normalizeContext(input);
  const subjectId = normalizeUuid(input.subjectId, "invalid_subject_id");
  if (typeof enrolled !== "boolean") {
    throw new ChildTrainingError("invalid_enrollment_state");
  }

  let response: Awaited<
    ReturnType<typeof client.rpc<"set_child_training_enrollment">>
  >;
  try {
    response = await client.rpc("set_child_training_enrollment", {
      p_child_profile_id: context.childProfileId,
      p_enrolled: enrolled,
      p_expected_user_id: context.expectedUserId,
      p_family_id: context.familyId,
      p_topic_id: subjectId,
      ...(goalId === null ? {} : { p_goal_id: goalId }),
    });
  } catch {
    throw new ChildTrainingError("child_training_enrollment_failed");
  }
  if (response.error) {
    throw mapDatabaseError(response.error, "child_training_enrollment_failed");
  }
  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new ChildTrainingError("invalid_enrollment_result");
  }
  const row = response.data[0];
  const expectsGoal = goalId !== null;
  if (
    !row ||
    !isUuid(row.topic_id) ||
    row.topic_id.toLowerCase() !== subjectId ||
    typeof row.topic_is_enrolled !== "boolean" ||
    !(
      (row.topic_is_enrolled && isTimestamp(row.topic_enrolled_at)) ||
      (!row.topic_is_enrolled && row.topic_enrolled_at === null)
    ) ||
    typeof row.changed !== "boolean" ||
    (expectsGoal &&
      (!isUuid(row.goal_id) ||
        row.goal_id.toLowerCase() !== goalId ||
        typeof row.goal_is_enrolled !== "boolean" ||
        !(
          (row.goal_is_enrolled && isTimestamp(row.goal_enrolled_at)) ||
          (!row.goal_is_enrolled && row.goal_enrolled_at === null)
        ))) ||
    (!expectsGoal &&
      (row.goal_id !== null ||
        row.goal_is_enrolled !== null ||
        row.goal_enrolled_at !== null))
  ) {
    throw new ChildTrainingError("invalid_enrollment_result");
  }

  return {
    changed: row.changed,
    enrolledAt: row.topic_enrolled_at,
    goalId,
    isEnrolled: row.topic_is_enrolled,
    isSelected: row.goal_is_enrolled,
    selectedAt: row.goal_enrolled_at,
    subjectId,
  };
}

/** Joins any currently published subject for the selected child. */
export async function joinChildTrainingSubject(
  client: BareTraenClient,
  input: ChildTrainingSubjectChoiceInput,
): Promise<ChildTrainingEnrollment> {
  return setChildTrainingEnrollment(client, input, null, true);
}

/** Leaves a subject while retaining its prior goal choices and progress. */
export async function leaveChildTrainingSubject(
  client: BareTraenClient,
  input: ChildTrainingSubjectChoiceInput,
): Promise<ChildTrainingEnrollment> {
  return setChildTrainingEnrollment(client, input, null, false);
}

/** Selects or removes one current published goal for the selected child. */
export async function setChildTrainingGoalSelected(
  client: BareTraenClient,
  input: ChildTrainingGoalChoiceInput,
): Promise<ChildTrainingEnrollment> {
  const goalId = normalizeUuid(input.goalId, "invalid_goal_id");
  if (typeof input.selected !== "boolean") {
    throw new ChildTrainingError("invalid_enrollment_state");
  }
  return setChildTrainingEnrollment(client, input, goalId, input.selected);
}

function normalizeRequiredMetric(
  value: unknown,
  code: "invalid_duration_ms" | "invalid_repetitions",
): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) > 2_147_483_647
  ) {
    throw new ChildTrainingError(code);
  }
  return Number(value);
}

/**
 * Retry-safely records one exercise as complete and closes its server-owned
 * session in the same database transaction.
 */
export async function completeChildTrainingExercise(
  client: BareTraenClient,
  input: CompleteChildTrainingExerciseInput,
): Promise<ChildTrainingCompletion> {
  const context = normalizeContext(input);
  const clientRequestId = normalizeUuid(
    input.clientRequestId,
    "invalid_client_request_id",
  );
  const exerciseId = normalizeUuid(input.exerciseId, "invalid_exercise_id");
  const goalId = normalizeUuid(input.goalId, "invalid_goal_id");
  const subjectId = normalizeUuid(input.subjectId, "invalid_subject_id");
  const measurement = input.measurement;
  if (!MEASUREMENTS.has(measurement)) {
    throw new ChildTrainingError("invalid_measurement");
  }

  let durationMs: number | undefined;
  let repetitions: number | undefined;
  if (measurement === "completion") {
    if (input.durationMs !== undefined) {
      throw new ChildTrainingError("invalid_duration_ms");
    }
    if (input.repetitions !== undefined) {
      throw new ChildTrainingError("invalid_repetitions");
    }
  } else if (measurement === "repetitions") {
    if (input.durationMs !== undefined) {
      throw new ChildTrainingError("invalid_duration_ms");
    }
    repetitions = normalizeRequiredMetric(
      input.repetitions,
      "invalid_repetitions",
    );
  } else {
    if (input.repetitions !== undefined) {
      throw new ChildTrainingError("invalid_repetitions");
    }
    durationMs = normalizeRequiredMetric(
      input.durationMs,
      "invalid_duration_ms",
    );
  }
  const perceivedDifficulty = input.perceivedDifficulty;
  if (
    perceivedDifficulty !== undefined &&
    ![1, 2, 3, 4, 5].includes(perceivedDifficulty)
  ) {
    throw new ChildTrainingError("invalid_perceived_difficulty");
  }

  let response: Awaited<
    ReturnType<typeof client.rpc<"complete_child_training_exercise">>
  >;
  try {
    const args = {
      p_child_profile_id: context.childProfileId,
      p_client_request_id: clientRequestId,
      p_exercise_id: exerciseId,
      p_expected_user_id: context.expectedUserId,
      p_family_id: context.familyId,
      p_goal_id: goalId,
      p_topic_id: subjectId,
      ...(durationMs === undefined ? {} : { p_duration_ms: durationMs }),
      ...(perceivedDifficulty === undefined
        ? {}
        : { p_perceived_difficulty: perceivedDifficulty }),
      ...(repetitions === undefined ? {} : { p_repetitions: repetitions }),
    };
    response = await client.rpc("complete_child_training_exercise", args);
  } catch {
    throw new ChildTrainingError("child_training_completion_failed");
  }
  if (response.error) {
    throw mapDatabaseError(response.error, "child_training_completion_failed");
  }
  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new ChildTrainingError("invalid_completion_result");
  }
  const row = response.data[0];
  if (
    !row ||
    !isUuid(row.attempt_id) ||
    !isUuid(row.session_id) ||
    !isUuid(row.child_profile_id) ||
    row.child_profile_id.toLowerCase() !== context.childProfileId ||
    !isUuid(row.topic_id) ||
    row.topic_id.toLowerCase() !== subjectId ||
    !isUuid(row.goal_id) ||
    row.goal_id.toLowerCase() !== goalId ||
    !isUuid(row.exercise_id) ||
    row.exercise_id.toLowerCase() !== exerciseId ||
    typeof row.created !== "boolean" ||
    !isTimestamp(row.completed_at) ||
    !isNullableSafeInteger(row.repetitions, 0, 2_147_483_647) ||
    !isNullableSafeInteger(row.duration_ms, 0, 2_147_483_647) ||
    !isNullableSafeInteger(row.perceived_difficulty, 1, 5) ||
    !Number.isSafeInteger(row.attempts_count) ||
    Number(row.attempts_count) < 1 ||
    !Number.isSafeInteger(row.completed_count) ||
    Number(row.completed_count) < 1 ||
    Number(row.completed_count) > Number(row.attempts_count) ||
    !isNullableSafeInteger(row.best_repetitions, 0, 2_147_483_647) ||
    !isNullableSafeInteger(row.best_duration_ms, 0, 2_147_483_647) ||
    row.progress_state !== "completed" ||
    !isTimestamp(row.last_attempted_at) ||
    (measurement === "completion" &&
      (row.repetitions !== null || row.duration_ms !== null)) ||
    (measurement === "repetitions" &&
      (row.repetitions === null || row.duration_ms !== null)) ||
    (measurement === "duration" &&
      (row.duration_ms === null || row.repetitions !== null))
  ) {
    throw new ChildTrainingError("invalid_completion_result");
  }

  return {
    attemptId: row.attempt_id.toLowerCase(),
    completedAt: row.completed_at,
    created: row.created,
    durationMs: row.duration_ms,
    exerciseId,
    goalId: row.goal_id.toLowerCase(),
    perceivedDifficulty:
      row.perceived_difficulty as ChildTrainingPerceivedDifficulty | null,
    progress: {
      attemptsCount: Number(row.attempts_count),
      bestDurationMs: row.best_duration_ms,
      bestRepetitions: row.best_repetitions,
      completedCount: Number(row.completed_count),
      completedExercises: 1,
      lastTrainedAt: row.last_attempted_at,
      percentage: 100,
      state: "completed",
      totalExercises: 1,
    },
    repetitions: row.repetitions,
    sessionId: row.session_id.toLowerCase(),
    subjectId: row.topic_id.toLowerCase(),
  };
}
