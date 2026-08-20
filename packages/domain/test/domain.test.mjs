import assert from "node:assert/strict";
import test from "node:test";

import {
  demoExercises,
  demoGoal,
  demoProgress,
  getCurrentExercise,
  getExercisesForGoal,
  getGoalProgress,
} from "../src/index.ts";

test("demo progress resolves to the third exercise at 48 percent", () => {
  const summary = getGoalProgress(demoGoal, demoProgress);

  assert.equal(summary.completedExercises, 2);
  assert.equal(summary.totalExercises, 6);
  assert.equal(summary.currentExerciseNumber, 3);
  assert.equal(summary.percentage, 48);
});

test("current exercise resolves from the progress fixture", () => {
  assert.equal(
    getCurrentExercise(demoExercises, demoProgress)?.title,
    "To spark og grib",
  );
});

test("goal exercises are returned in their learning order", () => {
  const exercises = getExercisesForGoal(demoExercises, demoGoal.id);

  assert.deepEqual(
    exercises.map((exercise) => exercise.order),
    [1, 2, 3, 4, 5, 6],
  );
});
