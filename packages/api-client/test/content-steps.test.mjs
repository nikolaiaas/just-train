import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminContentStepError,
  createAdminExerciseDraft,
  createAdminGoalDraft,
} from "../src/content-steps.ts";

const adminId = "10000000-0000-4000-8000-000000000003";
const topicId = "40000000-0000-4000-8000-000000000001";
const goalId = "50000000-0000-4000-8000-000000000001";
const exerciseId = "60000000-0000-4000-8000-000000000001";

const goalRow = Object.freeze({
  content_version: 1,
  created_at: "2026-08-21T21:00:00.000Z",
  created_by: adminId,
  difficulty: "beginner",
  equipment: ["Bold", "4 kegler"],
  estimated_minutes: 15,
  hero_media_url: "https://media.example.test/goal.mp4",
  id: goalId,
  is_published: false,
  published_at: null,
  slug: "boldkontrol",
  sort_order: 10,
  summary: "Lær at holde bolden tæt.\nArbejd i korte runder.",
  title: "Boldkontrol",
  topic_id: topicId,
  updated_at: "2026-08-21T21:00:00.000Z",
});

const exerciseRow = Object.freeze({
  content_version: 1,
  created_at: "2026-08-21T21:01:00.000Z",
  created_by: adminId,
  equipment: ["Bold", "4 kegler"],
  estimated_minutes: 10,
  goal_id: goalId,
  id: exerciseId,
  instructions: "Før bolden mellem keglerne.\nBrug begge fødder.",
  is_published: false,
  measurement: "repetitions",
  published_at: null,
  safety_notes: "Find et sted med god plads.",
  slug: "slalom-med-bold",
  sort_order: 20,
  target_value: 6,
  title: "Slalom med bold",
  updated_at: "2026-08-21T21:01:00.000Z",
  video_url: "https://media.example.test/exercise.mp4",
});

const validGoalInput = Object.freeze({
  authenticatedUserId: adminId,
  difficulty: "beginner",
  equipment: ["Bold", "4 kegler"],
  estimatedMinutes: 15,
  heroMediaUrl: "https://media.example.test/goal.mp4",
  requestId: goalId,
  slug: "boldkontrol",
  sortOrder: 10,
  summary: goalRow.summary,
  title: "Boldkontrol",
  topicId,
});

const validExerciseInput = Object.freeze({
  authenticatedUserId: adminId,
  equipment: ["Bold", "4 kegler"],
  estimatedMinutes: 10,
  goalId,
  instructions: exerciseRow.instructions,
  measurement: "repetitions",
  requestId: exerciseId,
  safetyNotes: "Find et sted med god plads.",
  slug: "slalom-med-bold",
  sortOrder: 20,
  targetValue: 6,
  title: "Slalom med bold",
  videoUrl: "https://media.example.test/exercise.mp4",
});

function queryFor(response, calls) {
  const query = {
    eq(column, value) {
      calls.push({ operation: "eq", column, value });
      return query;
    },
    insert(value) {
      calls.push({ operation: "insert", value });
      return query;
    },
    maybeSingle: async () => response,
    select(columns) {
      calls.push({ operation: "select", columns });
      return query;
    },
  };

  return query;
}

function clientForResponses(responses, calls = []) {
  let request = 0;

  return {
    calls,
    from(table) {
      calls.push({ operation: "from", table });
      const response = responses[Math.min(request, responses.length - 1)];
      request += 1;
      return queryFor(response, calls);
    },
  };
}

function assertStepError(error, code) {
  assert.ok(error instanceof AdminContentStepError);
  assert.equal(error.code, code);
  return true;
}

function expectedGoal(overrides = {}) {
  return {
    contentVersion: 1,
    createdAt: goalRow.created_at,
    createdBy: adminId,
    difficulty: "beginner",
    equipment: ["Bold", "4 kegler"],
    estimatedMinutes: 15,
    heroMediaUrl: goalRow.hero_media_url,
    id: goalId,
    publishedAt: null,
    slug: "boldkontrol",
    sortOrder: 10,
    status: "draft",
    summary: goalRow.summary,
    title: "Boldkontrol",
    topicId,
    updatedAt: goalRow.updated_at,
    ...overrides,
  };
}

function expectedExercise(overrides = {}) {
  return {
    contentVersion: 1,
    createdAt: exerciseRow.created_at,
    createdBy: adminId,
    equipment: ["Bold", "4 kegler"],
    estimatedMinutes: 10,
    goalId,
    id: exerciseId,
    instructions: exerciseRow.instructions,
    measurement: "repetitions",
    publishedAt: null,
    safetyNotes: exerciseRow.safety_notes,
    slug: "slalom-med-bold",
    sortOrder: 20,
    status: "draft",
    targetValue: 6,
    title: "Slalom med bold",
    updatedAt: exerciseRow.updated_at,
    videoUrl: exerciseRow.video_url,
    ...overrides,
  };
}

test("creates a normalized unpublished training goal below its topic", async () => {
  const { calls, ...client } = clientForResponses([
    { data: goalRow, error: null },
  ]);

  const result = await createAdminGoalDraft(client, {
    ...validGoalInput,
    authenticatedUserId: adminId.toUpperCase(),
    equipment: ["  Bold ", " 4 kegler  "],
    requestId: goalId.toUpperCase(),
    slug: " BOLDKONTROL ",
    summary: "  Lær at holde bolden tæt.\r\nArbejd i korte runder.  ",
    title: "  Boldkontrol  ",
    topicId: topicId.toUpperCase(),
  });

  assert.deepEqual(result, { created: true, goal: expectedGoal() });
  assert.deepEqual(calls[0], { operation: "from", table: "goals" });
  assert.deepEqual(calls[1], {
    operation: "insert",
    value: {
      created_by: adminId,
      difficulty: "beginner",
      equipment: ["Bold", "4 kegler"],
      estimated_minutes: 15,
      hero_media_url: goalRow.hero_media_url,
      id: goalId,
      is_published: false,
      slug: "boldkontrol",
      sort_order: 10,
      summary: goalRow.summary,
      title: "Boldkontrol",
      topic_id: topicId,
    },
  });
  assert.match(calls[2].columns, /topic_id.*difficulty.*created_by/);
});

test("creates a normalized unpublished exercise below its training goal", async () => {
  const { calls, ...client } = clientForResponses([
    { data: exerciseRow, error: null },
  ]);

  const result = await createAdminExerciseDraft(client, {
    ...validExerciseInput,
    authenticatedUserId: adminId.toUpperCase(),
    goalId: goalId.toUpperCase(),
    equipment: [" Bold ", " 4 kegler "],
    instructions: "  Før bolden mellem keglerne.\r\nBrug begge fødder.  ",
    requestId: exerciseId.toUpperCase(),
    safetyNotes: "  Find et sted med god plads.  ",
    slug: " SLALOM-MED-BOLD ",
    title: "  Slalom med bold  ",
  });

  assert.deepEqual(result, {
    created: true,
    exercise: expectedExercise(),
  });
  assert.deepEqual(calls[0], { operation: "from", table: "exercises" });
  assert.deepEqual(calls[1], {
    operation: "insert",
    value: {
      created_by: adminId,
      equipment: ["Bold", "4 kegler"],
      estimated_minutes: 10,
      goal_id: goalId,
      id: exerciseId,
      instructions: exerciseRow.instructions,
      is_published: false,
      measurement: "repetitions",
      safety_notes: exerciseRow.safety_notes,
      slug: "slalom-med-bold",
      sort_order: 20,
      target_value: 6,
      title: "Slalom med bold",
      video_url: exerciseRow.video_url,
    },
  });
  assert.match(calls[2].columns, /goal_id.*measurement.*created_by/);
});

test("rejects invalid goal input before accessing Supabase", async () => {
  let calls = 0;
  const client = {
    from() {
      calls += 1;
      throw new Error("must not query");
    },
  };
  const cases = [
    [{ requestId: "not-a-uuid" }, "invalid_request_id"],
    [{ topicId: "not-a-uuid" }, "invalid_topic_id"],
    [{ authenticatedUserId: "not-a-uuid" }, "invalid_authenticated_user_id"],
    [{ title: "  " }, "invalid_title"],
    [{ slug: "not safe" }, "invalid_slug"],
    [{ slug: "a".repeat(121) }, "invalid_slug"],
    [{ summary: "x".repeat(1_001) }, "invalid_summary"],
    [{ difficulty: "expert" }, "invalid_difficulty"],
    [{ estimatedMinutes: 0 }, "invalid_estimated_minutes"],
    [{ equipment: ["Bold", "bold"] }, "invalid_equipment"],
    [
      { equipment: Array.from({ length: 13 }, (_, index) => `Ting ${index}`) },
      "invalid_equipment",
    ],
    [
      { heroMediaUrl: "http://media.example.test/a.mp4" },
      "invalid_hero_media_url",
    ],
    [{ sortOrder: -1 }, "invalid_sort_order"],
  ];

  for (const [patch, code] of cases) {
    await assert.rejects(
      createAdminGoalDraft(client, { ...validGoalInput, ...patch }),
      (error) => assertStepError(error, code),
    );
  }

  assert.equal(calls, 0);
});

test("rejects invalid exercise input and enforces measurement targets", async () => {
  let calls = 0;
  const client = {
    from() {
      calls += 1;
      throw new Error("must not query");
    },
  };
  const cases = [
    [{ requestId: "not-a-uuid" }, "invalid_request_id"],
    [{ goalId: "not-a-uuid" }, "invalid_goal_id"],
    [{ instructions: "x".repeat(1_501) }, "invalid_instructions"],
    [{ equipment: ["Bold", "bold"] }, "invalid_equipment"],
    [
      { equipment: Array.from({ length: 13 }, (_, index) => `Ting ${index}`) },
      "invalid_equipment",
    ],
    [{ estimatedMinutes: 0 }, "invalid_estimated_minutes"],
    [{ safetyNotes: "x".repeat(1_001) }, "invalid_safety_notes"],
    [{ measurement: "points" }, "invalid_measurement"],
    [{ targetValue: 0 }, "invalid_target_value"],
    [{ targetValue: 10_001 }, "invalid_target_value"],
    [{ measurement: "completion", targetValue: 1 }, "invalid_target_value"],
    [{ measurement: "duration", targetValue: null }, "invalid_target_value"],
    [{ measurement: "duration", targetValue: 86_401 }, "invalid_target_value"],
    [{ videoUrl: "javascript:alert(1)" }, "invalid_video_url"],
    [{ sortOrder: 1.5 }, "invalid_sort_order"],
  ];

  for (const [patch, code] of cases) {
    await assert.rejects(
      createAdminExerciseDraft(client, {
        ...validExerciseInput,
        ...patch,
      }),
      (error) => assertStepError(error, code),
    );
  }

  assert.equal(calls, 0);
});

test("allows completion exercises only with a null target", async () => {
  const completionRow = {
    ...exerciseRow,
    measurement: "completion",
    target_value: null,
  };
  const { calls: _calls, ...client } = clientForResponses([
    { data: completionRow, error: null },
  ]);

  const result = await createAdminExerciseDraft(client, {
    ...validExerciseInput,
    measurement: "completion",
    targetValue: null,
  });

  assert.deepEqual(
    result.exercise,
    expectedExercise({
      measurement: "completion",
      targetValue: null,
    }),
  );
});

test("recovers exact duplicate request ids without overwriting content", async () => {
  for (const [create, input, row, resultKey] of [
    [createAdminGoalDraft, validGoalInput, goalRow, "goal"],
    [createAdminExerciseDraft, validExerciseInput, exerciseRow, "exercise"],
  ]) {
    const { calls, ...client } = clientForResponses([
      { data: null, error: { code: "23505", message: "private details" } },
      { data: row, error: null },
    ]);

    const result = await create(client, input);

    assert.equal(result.created, false);
    assert.equal(result[resultKey].id, input.requestId);
    assert.equal(calls.filter((call) => call.operation === "insert").length, 1);
    assert.deepEqual(
      calls.find((call) => call.operation === "eq"),
      {
        operation: "eq",
        column: "id",
        value: input.requestId,
      },
    );
  }
});

test("rejects request-id reuse and unrelated unique collisions as conflicts", async () => {
  for (const [create, input, conflictingRow, code] of [
    [
      createAdminGoalDraft,
      validGoalInput,
      { ...goalRow, title: "Et andet mål" },
      "goal_creation_conflict",
    ],
    [
      createAdminExerciseDraft,
      validExerciseInput,
      { ...exerciseRow, target_value: 9 },
      "exercise_creation_conflict",
    ],
    [createAdminGoalDraft, validGoalInput, null, "goal_creation_conflict"],
    [
      createAdminExerciseDraft,
      validExerciseInput,
      null,
      "exercise_creation_conflict",
    ],
  ]) {
    const { calls: _calls, ...client } = clientForResponses([
      { data: null, error: { code: "23505" } },
      { data: conflictingRow, error: null },
    ]);

    await assert.rejects(create(client, input), (error) =>
      assertStepError(error, code),
    );
  }
});

test("validates returned rows instead of trusting Supabase output", async () => {
  for (const [create, input, invalidRow, code] of [
    [
      createAdminGoalDraft,
      validGoalInput,
      { ...goalRow, is_published: true },
      "invalid_goal_creation_result",
    ],
    [
      createAdminGoalDraft,
      validGoalInput,
      { ...goalRow, created_by: null },
      "invalid_goal_creation_result",
    ],
    [
      createAdminExerciseDraft,
      validExerciseInput,
      { ...exerciseRow, target_value: null },
      "invalid_exercise_creation_result",
    ],
    [
      createAdminExerciseDraft,
      validExerciseInput,
      { ...exerciseRow, video_url: "javascript:alert(1)" },
      "invalid_exercise_creation_result",
    ],
  ]) {
    const { calls: _calls, ...client } = clientForResponses([
      { data: invalidRow, error: null },
    ]);

    await assert.rejects(create(client, input), (error) =>
      assertStepError(error, code),
    );
  }
});

test("sanitizes database and transport failures", async () => {
  for (const [create, input, fallback] of [
    [createAdminGoalDraft, validGoalInput, "goal_creation_failed"],
    [createAdminExerciseDraft, validExerciseInput, "exercise_creation_failed"],
  ]) {
    for (const [response, code] of [
      [
        {
          data: null,
          error: { code: "42501", message: "synthetic permission details" },
        },
        "admin_access_denied",
      ],
      [
        {
          data: null,
          error: { code: "23503", message: "synthetic foreign key details" },
        },
        fallback,
      ],
    ]) {
      const { calls: _calls, ...client } = clientForResponses([response]);

      await assert.rejects(create(client, input), (error) => {
        assertStepError(error, code);
        assert.doesNotMatch(error.message, /synthetic|permission|foreign key/i);
        return true;
      });
    }

    await assert.rejects(
      create(
        {
          from() {
            throw new Error("synthetic network details");
          },
        },
        input,
      ),
      (error) => {
        assertStepError(error, fallback);
        assert.doesNotMatch(error.message, /synthetic|network/i);
        return true;
      },
    );
  }
});
