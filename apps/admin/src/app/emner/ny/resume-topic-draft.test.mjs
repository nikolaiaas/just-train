import assert from "node:assert/strict";
import test from "node:test";

import {
  getResumeStartingStep,
  isMissingWardrobeStorageError,
  loadResumableTopicDraft,
  parseResumeTopicId,
} from "./resume-topic-draft.ts";

test("only the additive wardrobe-table deployment gap is tolerated", () => {
  assert.equal(isMissingWardrobeStorageError({ code: "42P01" }), true);
  assert.equal(isMissingWardrobeStorageError({ code: "PGRST202" }), true);
  assert.equal(isMissingWardrobeStorageError({ code: "PGRST205" }), true);
  assert.equal(isMissingWardrobeStorageError({ code: "PGRST204" }), false);
  assert.equal(isMissingWardrobeStorageError({ code: "42501" }), false);
  assert.equal(isMissingWardrobeStorageError(new Error("missing")), false);
  assert.equal(isMissingWardrobeStorageError(null), false);
});

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

const wardrobeItem = {
  category: "effect",
  contentVersion: 1,
  createdAt: "2026-08-22T07:03:00.000Z",
  createdBy: "40000000-0000-4000-8000-000000000001",
  editorialNote: "Et syntetisk eksempel.",
  editorialStatus: "draft",
  icon: "✨",
  id: "50000000-0000-4000-8000-000000000001",
  name: "Stjernestøv",
  points: 0,
  publishedAt: null,
  rarity: "special",
  sortOrder: 1,
  status: "draft",
  topicId: topic.id,
  unlockRule: "Gennemfør tre deløvelser",
  updatedAt: "2026-08-22T07:03:00.000Z",
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
      wardrobeItems: [],
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
      wardrobeItems: [],
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
      wardrobeItems: [],
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
      data: [
        {
          category: wardrobeItem.category,
          content_version: wardrobeItem.contentVersion,
          created_at: wardrobeItem.createdAt,
          created_by: wardrobeItem.createdBy,
          editorial_note: wardrobeItem.editorialNote,
          editorial_status: wardrobeItem.editorialStatus,
          icon: wardrobeItem.icon,
          id: wardrobeItem.id,
          is_published: false,
          name: wardrobeItem.name,
          points: null,
          published_at: null,
          rarity: wardrobeItem.rarity,
          sort_order: wardrobeItem.sortOrder,
          topic_id: wardrobeItem.topicId,
          unlock_rule: wardrobeItem.unlockRule,
          updated_at: wardrobeItem.updatedAt,
        },
      ],
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
        then(onFulfilled, onRejected) {
          return Promise.resolve(response).then(onFulfilled, onRejected);
        },
      };

      return query;
    },
    rpc(name, args) {
      const response = responses[responseIndex++];
      calls.push({ args, name, operation: "rpc" });
      return Promise.resolve(response);
    },
  };

  const result = await loadResumableTopicDraft(client, topic.id);

  assert.deepEqual(result, {
    topic,
    goal,
    exercise,
    wardrobeItems: [wardrobeItem],
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
  assert.deepEqual(
    calls.find((call) => call.operation === "rpc"),
    {
      args: { p_topic_id: topic.id },
      name: "list_admin_wardrobe_item_drafts",
      operation: "rpc",
    },
  );
});

test("resume tolerates the exact missing admin wardrobe RPC during deployment", async () => {
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
    { data: null, error: null },
    { data: null, error: null },
  ];
  let responseIndex = 0;
  const client = {
    from() {
      const response = responses[responseIndex++];
      const query = {
        eq() {
          return query;
        },
        limit() {
          return query;
        },
        maybeSingle: async () => response,
        order() {
          return query;
        },
        select() {
          return query;
        },
      };
      return query;
    },
    rpc: async () => ({
      data: null,
      error: { code: "PGRST202" },
    }),
  };

  assert.deepEqual(await loadResumableTopicDraft(client, topic.id), {
    topic,
    goal: null,
    exercise: null,
    wardrobeItems: [],
    nextExerciseSortOrder: 0,
    nextGoalSortOrder: 0,
  });
});
