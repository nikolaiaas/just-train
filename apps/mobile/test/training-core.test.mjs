import assert from "node:assert/strict";
import test from "node:test";

import { ChildTrainingError } from "@bare-traen/api-client";

import {
  buildTrainingCompletionPayload,
  classifyTrainingSaveFailure,
  clampRepetitions,
  findTrainingExercise,
  findTrainingGoal,
  formatExerciseTarget,
  formatProgressCopy,
  getNextTrainingStep,
  initialTrainingRepetitions,
  lockTrainingCompletionPayload,
  parseRouteUuid,
} from "../src/training/core.ts";

const subjectId = "10000000-0000-4000-8000-000000000001";
const goalId = "20000000-0000-4000-8000-000000000001";
const exerciseId = "30000000-0000-4000-8000-000000000001";

function progress(overrides = {}) {
  return {
    completedExercises: 0,
    percentage: 0,
    state: "not_started",
    totalExercises: 1,
    ...overrides,
  };
}

function exercise(overrides = {}) {
  return {
    id: exerciseId,
    measurement: "repetitions",
    progress: { state: "not_started" },
    targetValue: 5,
    title: "Fem gode forsøg",
    ...overrides,
  };
}

function goal(overrides = {}) {
  return {
    exercises: [exercise()],
    id: goalId,
    progress: progress(),
    title: "Et lille mål",
    ...overrides,
  };
}

function subject(overrides = {}) {
  return {
    goals: [goal()],
    id: subjectId,
    progress: progress(),
    title: "Balance",
    ...overrides,
  };
}

test("accepts only one valid route UUID", () => {
  assert.equal(parseRouteUuid(subjectId.toUpperCase()), subjectId);
  assert.equal(parseRouteUuid([subjectId]), null);
  assert.equal(parseRouteUuid("fodbold"), null);
  assert.equal(parseRouteUuid(undefined), null);
});

test("finds goals and exercises only by their validated identity", () => {
  const selectedGoal = goal();
  const selectedExercise = selectedGoal.exercises[0];

  assert.equal(findTrainingGoal([selectedGoal], goalId), selectedGoal);
  assert.equal(findTrainingGoal([selectedGoal], null), null);
  assert.equal(
    findTrainingExercise(selectedGoal.exercises, exerciseId),
    selectedExercise,
  );
  assert.equal(findTrainingExercise(selectedGoal.exercises, null), null);
});

test("chooses the first unfinished exercise without a hardcoded subject", () => {
  const completedSubject = subject({
    id: "10000000-0000-4000-8000-000000000002",
    goals: [
      goal({
        id: "20000000-0000-4000-8000-000000000002",
        exercises: [
          exercise({
            id: "30000000-0000-4000-8000-000000000002",
            progress: { state: "completed" },
          }),
        ],
      }),
    ],
  });
  const openSubject = subject();

  assert.deepEqual(getNextTrainingStep([completedSubject, openSubject]), {
    exercise: openSubject.goals[0].exercises[0],
    goal: openSubject.goals[0],
    subject: openSubject,
  });
  assert.equal(getNextTrainingStep([completedSubject]), null);
});

test("formats child-friendly progress and measurement targets", () => {
  assert.equal(
    formatProgressCopy(progress({ completedExercises: 2, totalExercises: 5 })),
    "2 af 5 øvelser klaret",
  );
  assert.equal(
    formatProgressCopy(
      progress({
        completedExercises: 5,
        state: "completed",
        totalExercises: 5,
      }),
    ),
    "Alle 5 øvelser er klaret",
  );
  assert.equal(
    formatExerciseTarget({ measurement: "duration", targetValue: 75 }),
    "1 min. og 15 sek.",
  );
  assert.equal(
    formatExerciseTarget({ measurement: "completion", targetValue: null }),
    "Prøv øvelsen i dit eget tempo",
  );
});

test("keeps repetition input inside the supported child-facing range", () => {
  assert.equal(initialTrainingRepetitions(), 0);
  assert.equal(clampRepetitions(-4), 0);
  assert.equal(clampRepetitions(4.6), 5);
  assert.equal(clampRepetitions(Number.NaN), 0);
  assert.equal(clampRepetitions(50_000), 10_000);
});

test("preserves the full payload for every ambiguous save result", () => {
  for (const code of [
    "child_training_completion_failed",
    "invalid_completion_result",
  ]) {
    assert.deepEqual(
      classifyTrainingSaveFailure(new ChildTrainingError(code)),
      {
        action: "retry",
        message:
          "Træningen kunne ikke gemmes endnu. Prøv igen – vi bruger det samme forsøg.",
        preserveRequestId: true,
      },
    );
  }
});

test("reloads changed training with child-safe copy and a new request identity", () => {
  for (const code of [
    "child_training_unavailable",
    "invalid_duration_ms",
    "invalid_repetitions",
  ]) {
    const decision = classifyTrainingSaveFailure(new ChildTrainingError(code));
    assert.equal(decision.action, "reload");
    assert.equal(decision.preserveRequestId, false);
    assert.match(decision.message, /ændret af en voksen/);
  }
});

test("locks request id, metric, and difficulty across an ambiguous retry", () => {
  const firstPayload = buildTrainingCompletionPayload({
    clientRequestId: "40000000-0000-4000-8000-000000000001",
    difficulty: 3,
    durationMs: 12_000,
    exerciseId,
    goalId,
    measurement: "repetitions",
    repetitions: 7,
    subjectId,
  });
  const changedDraft = buildTrainingCompletionPayload({
    clientRequestId: "40000000-0000-4000-8000-000000000002",
    difficulty: 5,
    durationMs: 99_000,
    exerciseId,
    goalId,
    measurement: "repetitions",
    repetitions: 20,
    subjectId,
  });

  assert.deepEqual(firstPayload, {
    clientRequestId: "40000000-0000-4000-8000-000000000001",
    exerciseId,
    goalId,
    measurement: "repetitions",
    perceivedDifficulty: 3,
    repetitions: 7,
    subjectId,
  });
  assert.equal(
    lockTrainingCompletionPayload(firstPayload, changedDraft),
    firstPayload,
  );
});

test("leaves stale training when the child context changed", () => {
  for (const error of [
    new ChildTrainingError("child_training_access_denied"),
    new ChildTrainingError("child_training_session_changed"),
    new Error("synthetic unknown failure"),
  ]) {
    const decision = classifyTrainingSaveFailure(error);
    assert.equal(decision.action, "leave");
    assert.equal(decision.preserveRequestId, false);
  }
});
