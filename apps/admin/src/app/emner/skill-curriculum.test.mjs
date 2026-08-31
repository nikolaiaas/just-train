import assert from "node:assert/strict";
import test from "node:test";

import {
  countCurriculumExercises,
  deriveCurriculumStageRequestId,
  formatCurriculumExerciseTarget,
  isCurrentCurriculumReview,
  isCurrentWardrobeReview,
  parseSkillCurriculumCounts,
} from "./skill-curriculum.ts";

test("planner counts require several skills, several exercises, and no more than 32 exercises", () => {
  assert.deepEqual(
    parseSkillCurriculumCounts({ exercisesPerSkill: "4", skillCount: "3" }),
    { exerciseCount: 12, exercisesPerSkill: 4, skillCount: 3 },
  );
  assert.equal(
    parseSkillCurriculumCounts({ exercisesPerSkill: "1", skillCount: "3" }),
    null,
  );
  assert.equal(
    parseSkillCurriculumCounts({ exercisesPerSkill: "8", skillCount: "6" }),
    null,
  );
});

test("curriculum totals include every exercise under every skill", () => {
  assert.equal(
    countCurriculumExercises({
      reply: "Her er planen.",
      skills: [{ exercises: [{}, {}, {}] }, { exercises: [{}, {}] }],
    }),
    5,
  );
});

test("curriculum stage ids are deterministic and domain separated", async () => {
  const root = "123e4567-e89b-42d3-a456-426614174000";
  const curriculum = await deriveCurriculumStageRequestId(root, "curriculum");
  const wardrobe = await deriveCurriculumStageRequestId(
    root,
    "curriculum-wardrobe-plan",
  );

  assert.match(curriculum, /^[0-9a-f-]{36}$/u);
  assert.notEqual(curriculum, wardrobe);
  assert.equal(
    curriculum,
    await deriveCurriculumStageRequestId(root, "curriculum"),
  );
});

test("edited or pending plans cannot expose an older review", () => {
  assert.equal(
    isCurrentCurriculumReview({
      inputsDirty: false,
      pending: false,
      succeeded: true,
    }),
    true,
  );
  assert.equal(
    isCurrentCurriculumReview({
      inputsDirty: true,
      pending: false,
      succeeded: true,
    }),
    false,
  );
  assert.equal(
    isCurrentCurriculumReview({
      inputsDirty: false,
      pending: true,
      succeeded: true,
    }),
    false,
  );
});

test("wardrobe review must belong to the currently reviewed curriculum job", () => {
  assert.equal(
    isCurrentWardrobeReview({
      curriculumJobId: "current-job",
      curriculumReady: true,
      succeeded: true,
      wardrobeCurriculumJobId: "current-job",
    }),
    true,
  );
  assert.equal(
    isCurrentWardrobeReview({
      curriculumJobId: "new-job",
      curriculumReady: true,
      succeeded: true,
      wardrobeCurriculumJobId: "old-job",
    }),
    false,
  );
  assert.equal(
    isCurrentWardrobeReview({
      curriculumJobId: "current-job",
      curriculumReady: false,
      succeeded: true,
      wardrobeCurriculumJobId: "current-job",
    }),
    false,
  );
});

test("exercise targets are readable in the review", () => {
  assert.equal(
    formatCurriculumExerciseTarget({
      measurement: "completion",
      targetValue: null,
    }),
    "Gennemfør øvelsen",
  );
  assert.equal(
    formatCurriculumExerciseTarget({
      measurement: "duration",
      targetValue: 95,
    }),
    "1 min. 35 sek.",
  );
});
