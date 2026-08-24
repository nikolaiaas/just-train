import {
  ChildTrainingError,
  type CompleteChildTrainingExerciseInput,
  type ChildTrainingErrorCode,
  type ChildTrainingExercise,
  type ChildTrainingGoal,
  type ChildTrainingPerceivedDifficulty,
  type ChildTrainingSubject,
} from "@bare-traen/api-client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TrainingProgressLike = {
  completedExercises: number;
  percentage: number;
  state: "not_started" | "in_progress" | "completed";
  totalExercises: number;
};

export type TrainingExerciseLike = {
  id: string;
  measurement: "completion" | "duration" | "repetitions";
  progress: { state: "not_started" | "in_progress" | "completed" };
  targetValue: number | null;
  title: string;
};

export type TrainingGoalLike<
  Exercise extends TrainingExerciseLike = TrainingExerciseLike,
> = {
  exercises: Exercise[];
  id: string;
  isSelected: boolean;
  progress: TrainingProgressLike;
  title: string;
};

export type TrainingSubjectLike<
  Goal extends TrainingGoalLike = TrainingGoalLike,
> = {
  goals: Goal[];
  id: string;
  isEnrolled: boolean;
  progress: TrainingProgressLike;
  title: string;
};

export type TrainingSubjectGroups<Subject> = {
  available: Subject[];
  enrolled: Subject[];
};

export type NextTrainingStep = {
  exercise: ChildTrainingExercise;
  goal: ChildTrainingGoal;
  subject: ChildTrainingSubject;
};

export type TrainingSaveFailureDecision = {
  action: "leave" | "reload" | "retry";
  message: string;
  preserveRequestId: boolean;
};

type WithoutTrainingContext<Input> = Input extends unknown
  ? Omit<Input, "childProfileId" | "expectedUserId" | "familyId">
  : never;

export type TrainingCompletionPayload =
  WithoutTrainingContext<CompleteChildTrainingExerciseInput>;

export type TrainingCompletionPayloadDraft = {
  clientRequestId: string;
  difficulty: ChildTrainingPerceivedDifficulty;
  durationMs: number;
  exerciseId: string;
  goalId: string;
  measurement: ChildTrainingExercise["measurement"];
  repetitions: number;
  subjectId: string;
};

const CHANGED_CONTENT_ERROR_CODES = new Set<ChildTrainingErrorCode>([
  "child_training_content_failed",
  "child_training_unavailable",
  "invalid_child_profile_id",
  "invalid_client_request_id",
  "invalid_duration_ms",
  "invalid_exercise_id",
  "invalid_expected_user_id",
  "invalid_family_id",
  "invalid_goal_id",
  "invalid_measurement",
  "invalid_perceived_difficulty",
  "invalid_repetitions",
  "invalid_subject_id",
  "invalid_training_content_result",
]);

export function classifyTrainingSaveFailure(
  error: unknown,
): TrainingSaveFailureDecision {
  if (
    error instanceof ChildTrainingError &&
    (error.code === "child_training_completion_failed" ||
      error.code === "invalid_completion_result")
  ) {
    return {
      action: "retry",
      message:
        "Træningen kunne ikke gemmes endnu. Prøv igen – vi bruger det samme forsøg.",
      preserveRequestId: true,
    };
  }

  if (
    error instanceof ChildTrainingError &&
    CHANGED_CONTENT_ERROR_CODES.has(error.code)
  ) {
    return {
      action: "reload",
      message:
        "Øvelsen er blevet opdateret. Vi henter den nyeste version, så du kan fortsætte.",
      preserveRequestId: false,
    };
  }

  return {
    action: "leave",
    message:
      "Din profil blev ændret. Gå tilbage til emnerne, og vælg øvelsen igen.",
    preserveRequestId: false,
  };
}

export function buildTrainingCompletionPayload(
  draft: TrainingCompletionPayloadDraft,
): TrainingCompletionPayload {
  const common = {
    clientRequestId: draft.clientRequestId,
    exerciseId: draft.exerciseId,
    goalId: draft.goalId,
    perceivedDifficulty: draft.difficulty,
    subjectId: draft.subjectId,
  };

  if (draft.measurement === "completion") {
    return { ...common, measurement: "completion" };
  }

  if (draft.measurement === "repetitions") {
    return {
      ...common,
      measurement: "repetitions",
      repetitions: clampRepetitions(draft.repetitions),
    };
  }

  return {
    ...common,
    durationMs: draft.durationMs,
    measurement: "duration",
  };
}

export function lockTrainingCompletionPayload(
  locked: TrainingCompletionPayload | null,
  draft: TrainingCompletionPayload,
): TrainingCompletionPayload {
  return locked ?? draft;
}

export function initialTrainingRepetitions(): number {
  return 0;
}

export function parseRouteUuid(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    return null;
  }

  return value.toLowerCase();
}

export function findTrainingGoal<Goal extends { id: string }>(
  goals: readonly Goal[],
  goalId: string | null,
): Goal | null {
  if (!goalId) return null;
  return goals.find((goal) => goal.id === goalId) ?? null;
}

export function findTrainingExercise<Exercise extends { id: string }>(
  exercises: readonly Exercise[],
  exerciseId: string | null,
): Exercise | null {
  if (!exerciseId) return null;
  return exercises.find((exercise) => exercise.id === exerciseId) ?? null;
}

export function getNextTrainingStep(
  subjects: readonly ChildTrainingSubject[],
): NextTrainingStep | null {
  for (const subject of subjects) {
    if (!subject.isEnrolled) continue;

    for (const goal of subject.goals) {
      if (!goal.isSelected) continue;

      const exercise = goal.exercises.find(
        (candidate) => candidate.progress.state !== "completed",
      );

      if (exercise) {
        return { exercise, goal, subject };
      }
    }
  }

  return null;
}

export function groupTrainingSubjects<Subject extends { isEnrolled: boolean }>(
  subjects: readonly Subject[],
): TrainingSubjectGroups<Subject> {
  return subjects.reduce<TrainingSubjectGroups<Subject>>(
    (groups, subject) => {
      groups[subject.isEnrolled ? "enrolled" : "available"].push(subject);
      return groups;
    },
    { available: [], enrolled: [] },
  );
}

export function formatProgressCopy(progress: TrainingProgressLike): string {
  if (progress.totalExercises === 0) {
    return "Ingen øvelser endnu";
  }

  if (progress.state === "completed") {
    return `Alle ${progress.totalExercises} øvelser er klaret`;
  }

  return `${progress.completedExercises} af ${progress.totalExercises} øvelser klaret`;
}

export function formatExerciseTarget(
  exercise: Pick<TrainingExerciseLike, "measurement" | "targetValue">,
): string {
  if (exercise.measurement === "completion") {
    return "Prøv øvelsen i dit eget tempo";
  }

  if (exercise.measurement === "duration") {
    const seconds = exercise.targetValue ?? 0;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0 && remainingSeconds > 0) {
      return `${minutes} min. og ${remainingSeconds} sek.`;
    }

    return minutes > 0 ? `${minutes} min.` : `${seconds} sek.`;
  }

  const repetitions = exercise.targetValue ?? 0;
  return `${repetitions} ${repetitions === 1 ? "gentagelse" : "gentagelser"}`;
}

export function clampRepetitions(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(10_000, Math.max(0, Math.round(value)));
}
