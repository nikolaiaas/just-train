import assert from "node:assert/strict";
import test from "node:test";

import {
  getResumeStartingStep,
  loadResumableTopicDraft,
  parseResumeTopicId,
} from "./resume-topic-draft.ts";

const topic = {
  accentColor: "#53C987",
  description: "En syntetisk kladde",
  icon: "🌟",
  id: "10000000-0000-4000-8000-000000000001",
  title: "Balance",
  updatedAt: "2026-08-22T07:00:00.000Z",
};

const goal = {
  difficulty: "beginner",
  equipment: [],
  estimatedMinutes: 10,
  heroMediaUrl: "https://media.example.test/goal.mp4",
  id: "20000000-0000-4000-8000-000000000001",
  sortOrder: 3,
  summary: "Find balancen",
  title: "Stå sikkert",
  updatedAt: "2026-08-22T07:01:00.000Z",
};

const exercise = {
  equipment: [],
  estimatedMinutes: 5,
  id: "30000000-0000-4000-8000-000000000001",
  instructions: "Stå på et ben.",
  measurement: "duration",
  safetyNotes: "Brug en voksen ved behov.",
  targetValue: 10,
  title: "Flamingoen",
  updatedAt: "2026-08-22T07:02:00.000Z",
  videoUrl: "https://media.example.test/exercise.mp4",
  sortOrder: 4,
};

test("resume topic query accepts one non-nil UUID", () => {
  assert.equal(
    parseResumeTopicId("10000000-0000-4000-8000-000000000001"),
    "10000000-0000-4000-8000-000000000001",
  );
  assert.equal(parseResumeTopicId(undefined), null);
  assert.equal(parseResumeTopicId([topic.id]), null);
  assert.equal(parseResumeTopicId("not-a-topic"), null);
  assert.equal(
    parseResumeTopicId("00000000-0000-0000-0000-000000000000"),
    null,
  );
});

test("resume starts at the first unsaved authoring step", () => {
  assert.equal(getResumeStartingStep(null), "topic");
  assert.equal(
    getResumeStartingStep({
      topic,
      goal: null,
      exercise: null,
      nextExerciseSortOrder: 0,
      nextGoalSortOrder: 0,
    }),
    "goal",
  );
  assert.equal(
    getResumeStartingStep({
      topic,
      goal,
      exercise: null,
      nextExerciseSortOrder: 0,
      nextGoalSortOrder: 0,
    }),
    "exercise",
  );
  assert.equal(
    getResumeStartingStep({
      topic,
      goal,
      exercise,
      nextExerciseSortOrder: 0,
      nextGoalSortOrder: 0,
    }),
    "wardrobe",
  );
});

test("resume loads unpublished drafts and avoids occupied content positions", async () => {
  const calls = [];
  const responses = [
    {
      data: {
        accent_color: topic.accentColor,
        description: topic.description,
        icon: topic.icon,
        id: topic.id,
        title: topic.title,
        updated_at: topic.updatedAt,
      },
      error: null,
    },
    {
      data: {
        difficulty: goal.difficulty,
        equipment: goal.equipment,
        estimated_minutes: goal.estimatedMinutes,
        hero_media_url: goal.heroMediaUrl,
        id: goal.id,
        sort_order: goal.sortOrder,
        summary: goal.summary,
        title: goal.title,
        updated_at: goal.updatedAt,
      },
      error: null,
    },
    {
      data: { sort_order: 3 },
      error: null,
    },
    {
      data: {
        equipment: exercise.equipment,
        estimated_minutes: exercise.estimatedMinutes,
        id: exercise.id,
        instructions: exercise.instructions,
        measurement: exercise.measurement,
        safety_notes: exercise.safetyNotes,
        target_value: exercise.targetValue,
        title: exercise.title,
        updated_at: exercise.updatedAt,
        video_url: exercise.videoUrl,
        sort_order: exercise.sortOrder,
      },
      error: null,
    },
    {
      data: { sort_order: 4 },
      error: null,
    },
  ];
  let responseIndex = 0;
  const client = {
    from(table) {
      const response = responses[responseIndex++];
      const query = {
        eq(column, value) {
          calls.push({ column, operation: "eq", table, value });
          return query;
        },
        limit(value) {
          calls.push({ operation: "limit", table, value });
          return query;
        },
        maybeSingle: async () => response,
        order(column, options) {
          calls.push({ column, operation: "order", options, table });
          return query;
        },
        select(columns) {
          calls.push({ columns, operation: "select", table });
          return query;
        },
      };

      return query;
    },
  };

  const result = await loadResumableTopicDraft(client, topic.id);

  assert.deepEqual(result, {
    topic,
    goal,
    exercise,
    nextExerciseSortOrder: 5,
    nextGoalSortOrder: 4,
  });
  assert.deepEqual(
    calls.filter(
      (call) => call.operation === "eq" && call.column === "is_published",
    ),
    [
      {
        column: "is_published",
        operation: "eq",
        table: "topics",
        value: false,
      },
      { column: "is_published", operation: "eq", table: "goals", value: false },
      {
        column: "is_published",
        operation: "eq",
        table: "exercises",
        value: false,
      },
    ],
  );
});
