export type { Database, Json as DatabaseJson } from "./database.generated";

export type FamilyId = string;
export type ChildId = string;
export type TopicId = string;
export type GoalId = string;
export type ExerciseId = string;

export interface Family {
  id: FamilyId;
  displayName: string;
  childIds: readonly ChildId[];
  createdAt: string;
}

export interface Child {
  id: ChildId;
  familyId: FamilyId;
  name: string;
  age: number;
  points: number;
  avatarAlt: string;
}

export type ContentStatus = "draft" | "inReview" | "published";

export interface Topic {
  id: TopicId;
  slug: string;
  name: string;
  icon: string;
  summary: string;
  goalCount: number;
  goalIds: readonly GoalId[];
  featured: boolean;
  status: ContentStatus;
}

export type GoalDifficulty = "beginner" | "allLevels" | "intermediate";

export interface TrainingGoal {
  id: GoalId;
  topicId: TopicId;
  slug: string;
  title: string;
  summary: string;
  outcome: string;
  difficulty: GoalDifficulty;
  recommendedSessionMinutes: number;
  equipment: readonly string[];
  exerciseIds: readonly ExerciseId[];
  status: ContentStatus;
}

export type ExerciseMeasurement =
  | {
      kind: "repetitions";
      target: number;
      unit: "repetitions" | "consecutiveRepetitions";
    }
  | { kind: "duration"; targetSeconds: number }
  | { kind: "completion" };

export interface Exercise {
  id: ExerciseId;
  goalId: GoalId;
  order: number;
  title: string;
  instruction: string;
  measurement: ExerciseMeasurement;
  recommendedMinutes: number;
  equipment: readonly string[];
  safetyNote?: string;
}

export type GoalProgressState = "notStarted" | "active" | "completed";

export interface GoalProgress {
  childId: ChildId;
  goalId: GoalId;
  state: GoalProgressState;
  completedExerciseIds: readonly ExerciseId[];
  currentExerciseId?: ExerciseId;
  /** A value from 0 to 1 for progress through the current exercise. */
  currentExerciseCompletion: number;
  lastTrainedAt?: string;
}

export interface GoalProgressSummary {
  completedExercises: number;
  totalExercises: number;
  currentExerciseNumber: number | null;
  fraction: number;
  percentage: number;
  state: GoalProgressState;
}

export const demoFamily: Family = {
  id: "family-demo",
  displayName: "Familien Demo",
  childIds: ["child-agnes"],
  createdAt: "2026-08-01T09:00:00.000Z",
};

export const demoChild: Child = {
  id: "child-agnes",
  familyId: demoFamily.id,
  name: "Agnes",
  age: 9,
  points: 340,
  avatarAlt: "Agnes' farverige træningsavatar",
};

export const demoTopics: readonly Topic[] = [
  {
    id: "topic-football",
    slug: "fodbold",
    name: "Fodbold",
    icon: "⚽",
    summary: "Boldkontrol, fart og præcision.",
    goalCount: 4,
    goalIds: ["goal-juggling"],
    featured: true,
    status: "published",
  },
  {
    id: "topic-gymnastics",
    slug: "gymnastik",
    name: "Gymnastik",
    icon: "🤸",
    summary: "Balance, styrke og kropskontrol.",
    goalCount: 3,
    goalIds: [],
    featured: false,
    status: "published",
  },
  {
    id: "topic-speed",
    slug: "loeb-og-fart",
    name: "Løb og fart",
    icon: "🏃",
    summary: "Hurtige fødder og god løbeteknik.",
    goalCount: 3,
    goalIds: [],
    featured: false,
    status: "published",
  },
  {
    id: "topic-skipping",
    slug: "sjipning",
    name: "Sjipning",
    icon: "〰️",
    summary: "Rytme, timing og kondition.",
    goalCount: 2,
    goalIds: [],
    featured: false,
    status: "published",
  },
] as const;

export const demoExercises: readonly Exercise[] = [
  {
    id: "exercise-drop-kick-catch",
    goalId: "goal-juggling",
    order: 1,
    title: "Slip, spark og grib",
    instruction:
      "Slip bolden fra hænderne, spark den én gang med vristen, og grib den igen.",
    measurement: { kind: "repetitions", target: 5, unit: "repetitions" },
    recommendedMinutes: 10,
    equipment: ["1 fodbold"],
    safetyNote:
      "Find et sted med god plads og uden ting, der kan gå i stykker.",
  },
  {
    id: "exercise-alternate-feet",
    goalId: "goal-juggling",
    order: 2,
    title: "Skift mellem fødderne",
    instruction: "Spark og grib skiftevis med højre og venstre fod.",
    measurement: { kind: "repetitions", target: 5, unit: "repetitions" },
    recommendedMinutes: 10,
    equipment: ["1 fodbold"],
  },
  {
    id: "exercise-two-kicks",
    goalId: "goal-juggling",
    order: 3,
    title: "To spark og grib",
    instruction: "Spark bolden to gange, før du griber den igen.",
    measurement: {
      kind: "repetitions",
      target: 2,
      unit: "consecutiveRepetitions",
    },
    recommendedMinutes: 10,
    equipment: ["1 fodbold"],
  },
  {
    id: "exercise-three-juggles",
    goalId: "goal-juggling",
    order: 4,
    title: "Tre jongleringer",
    instruction: "Hold bolden i luften med tre rolige spark i træk.",
    measurement: {
      kind: "repetitions",
      target: 3,
      unit: "consecutiveRepetitions",
    },
    recommendedMinutes: 10,
    equipment: ["1 fodbold"],
  },
  {
    id: "exercise-five-juggles",
    goalId: "goal-juggling",
    order: 5,
    title: "Fem jongleringer",
    instruction: "Hold bolden i luften med fem spark i træk.",
    measurement: {
      kind: "repetitions",
      target: 5,
      unit: "consecutiveRepetitions",
    },
    recommendedMinutes: 10,
    equipment: ["1 fodbold"],
  },
  {
    id: "exercise-ten-juggles",
    goalId: "goal-juggling",
    order: 6,
    title: "Ti jongleringer",
    instruction: "Saml det hele og jonglér ti gange uden at gribe bolden.",
    measurement: {
      kind: "repetitions",
      target: 10,
      unit: "consecutiveRepetitions",
    },
    recommendedMinutes: 10,
    equipment: ["1 fodbold"],
  },
] as const;

export const demoGoal: TrainingGoal = {
  id: "goal-juggling",
  topicId: "topic-football",
  slug: "laer-at-jonglere",
  title: "Lær at jonglere",
  summary: "Lær boldkontrol gennem seks små fremskridt.",
  outcome: "10 jongleringer i træk",
  difficulty: "beginner",
  recommendedSessionMinutes: 10,
  equipment: ["1 fodbold"],
  exerciseIds: demoExercises.map((exercise) => exercise.id),
  status: "published",
};

export const demoProgress: GoalProgress = {
  childId: demoChild.id,
  goalId: demoGoal.id,
  state: "active",
  completedExerciseIds: ["exercise-drop-kick-catch", "exercise-alternate-feet"],
  currentExerciseId: "exercise-two-kicks",
  currentExerciseCompletion: 0.88,
  lastTrainedAt: "2026-08-18T15:20:00.000Z",
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Builds a display-ready progress summary and safely ignores stale exercise IDs.
 */
export function getGoalProgress(
  goal: TrainingGoal,
  progress: GoalProgress,
): GoalProgressSummary {
  const exerciseIds = new Set(goal.exerciseIds);
  const completedExercises = new Set(
    progress.completedExerciseIds.filter((id) => exerciseIds.has(id)),
  ).size;
  const totalExercises = goal.exerciseIds.length;
  const currentExerciseIndex = progress.currentExerciseId
    ? goal.exerciseIds.indexOf(progress.currentExerciseId)
    : -1;
  const currentExerciseNumber =
    currentExerciseIndex >= 0 ? currentExerciseIndex + 1 : null;
  const currentExerciseCredit =
    currentExerciseIndex >= 0 &&
    !progress.completedExerciseIds.includes(progress.currentExerciseId!)
      ? clampUnit(progress.currentExerciseCompletion)
      : 0;
  const fraction =
    totalExercises === 0
      ? progress.state === "completed"
        ? 1
        : 0
      : clampUnit(
          (completedExercises + currentExerciseCredit) / totalExercises,
        );

  return {
    completedExercises,
    totalExercises,
    currentExerciseNumber,
    fraction,
    percentage: Math.round(fraction * 100),
    state: progress.state,
  };
}

export function getCurrentExercise(
  exercises: readonly Exercise[],
  progress: GoalProgress,
): Exercise | undefined {
  return progress.currentExerciseId
    ? exercises.find((exercise) => exercise.id === progress.currentExerciseId)
    : undefined;
}

export function getExercisesForGoal(
  exercises: readonly Exercise[],
  goalId: GoalId,
): Exercise[] {
  return exercises
    .filter((exercise) => exercise.goalId === goalId)
    .sort((left, right) => left.order - right.order);
}
