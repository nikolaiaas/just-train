import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminContentStepError,
  createAdminExerciseDraft,
  createAdminGoalDraft,
  createAdminWardrobeItemDraft,
  decideAdminWardrobeItemDraft,
  updateAdminExerciseDraft,
  updateAdminGoalDraft,
  updateAdminWardrobeItemDraft,
} from "../src/content-steps.ts";

const adminId = "10000000-0000-4000-8000-000000000003";
const topicId = "40000000-0000-4000-8000-000000000001";
const goalId = "50000000-0000-4000-8000-000000000001";
const exerciseId = "60000000-0000-4000-8000-000000000001";
const wardrobeItemId = "70000000-0000-4000-8000-000000000001";

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

const wardrobeItemRow = Object.freeze({
  category: "clothing",
  content_version: 1,
  created_at: "2026-08-21T21:02:00.000Z",
  created_by: adminId,
  editorial_note: "Et roligt, brandfrit valg.",
  editorial_status: "draft",
  icon: "🧢",
  id: wardrobeItemId,
  is_published: false,
  name: "Stjernetrøje",
  points: 120,
  published_at: null,
  rarity: "rare",
  sort_order: 30,
  topic_id: topicId,
  unlock_rule: null,
  updated_at: "2026-08-21T21:02:00.000Z",
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

const validWardrobeInput = Object.freeze({
  authenticatedUserId: adminId,
  category: "clothing",
  editorialNote: "Et roligt, brandfrit valg.",
  icon: "🧢",
  name: "Stjernetrøje",
  points: 120,
  rarity: "rare",
  requestId: wardrobeItemId,
  sortOrder: 30,
  topicId,
  unlockRule: "",
});

const validGoalUpdateInput = Object.freeze({
  ...validGoalInput,
  expectedUpdatedAt: goalRow.updated_at,
});

const validExerciseUpdateInput = Object.freeze({
  ...validExerciseInput,
  expectedUpdatedAt: exerciseRow.updated_at,
});

const validWardrobeUpdateInput = Object.freeze({
  ...validWardrobeInput,
  expectedUpdatedAt: wardrobeItemRow.updated_at,
});

const validWardrobeDecisionInput = Object.freeze({
  authenticatedUserId: adminId,
  decision: "approved",
  expectedUpdatedAt: wardrobeItemRow.updated_at,
  topicId,
  wardrobeItemId,
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
    update(value) {
      calls.push({ operation: "update", value });
      return query;
    },
  };

  return query;
}

function clientForResponses(responses, calls = []) {
  let request = 0;

  function nextResponse() {
    const response = responses[Math.min(request, responses.length - 1)];
    request += 1;
    return response;
  }

  return {
    calls,
    from(table) {
      calls.push({ operation: "from", table });
      return queryFor(nextResponse(), calls);
    },
    async rpc(name, args) {
      calls.push({ operation: "rpc", name, args });
      return nextResponse();
    },
  };
}

function assertStepError(error, code) {
  assert.ok(error instanceof AdminContentStepError);
  assert.equal(error.code, code);
  return true;
}

function assertWardrobeRpcCall(
  calls,
  itemId = wardrobeItemId,
  parentTopicId = topicId,
) {
  assert.deepEqual(
    calls.find((call) => call.operation === "rpc"),
    {
      operation: "rpc",
      name: "list_admin_wardrobe_item_drafts",
      args: {
        p_topic_id: parentTopicId,
        p_wardrobe_item_id: itemId,
      },
    },
  );
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

function expectedWardrobeItem(overrides = {}) {
  return {
    category: "clothing",
    contentVersion: 1,
    createdAt: wardrobeItemRow.created_at,
    createdBy: adminId,
    editorialNote: wardrobeItemRow.editorial_note,
    editorialStatus: "draft",
    icon: "🧢",
    id: wardrobeItemId,
    name: "Stjernetrøje",
    points: 120,
    publishedAt: null,
    rarity: "rare",
    sortOrder: 30,
    status: "draft",
    topicId,
    unlockRule: "",
    updatedAt: wardrobeItemRow.updated_at,
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

test("creates a normalized unpublished wardrobe item below its topic", async () => {
  const { calls, ...client } = clientForResponses([
    { data: { id: wardrobeItemId }, error: null },
    { data: [wardrobeItemRow], error: null },
  ]);

  const result = await createAdminWardrobeItemDraft(client, {
    ...validWardrobeInput,
    authenticatedUserId: adminId.toUpperCase(),
    editorialNote: "  Et roligt, brandfrit valg.  ",
    icon: "  🧢  ",
    name: "  Stjernetrøje  ",
    requestId: wardrobeItemId.toUpperCase(),
    topicId: topicId.toUpperCase(),
    unlockRule: "  ",
  });

  assert.deepEqual(result, {
    created: true,
    item: expectedWardrobeItem(),
  });
  assert.deepEqual(calls[0], {
    operation: "from",
    table: "wardrobe_items",
  });
  assert.deepEqual(calls[1], {
    operation: "insert",
    value: {
      category: "clothing",
      created_by: adminId,
      editorial_note: wardrobeItemRow.editorial_note,
      icon: "🧢",
      id: wardrobeItemId,
      name: "Stjernetrøje",
      points: 120,
      rarity: "rare",
      sort_order: 30,
      topic_id: topicId,
      unlock_rule: null,
    },
  });
  assert.deepEqual(calls[2], { operation: "select", columns: "id" });
  assertWardrobeRpcCall(calls);
});

test("maps an unlock-only wardrobe item to nullable database fields", async () => {
  const unlockRow = {
    ...wardrobeItemRow,
    editorial_note: null,
    points: null,
    unlock_rule: "Gennemfør tre træninger",
  };
  const { calls, ...client } = clientForResponses([
    { data: { id: wardrobeItemId }, error: null },
    { data: [unlockRow], error: null },
  ]);

  const result = await createAdminWardrobeItemDraft(client, {
    ...validWardrobeInput,
    editorialNote: "",
    points: 0,
    unlockRule: " Gennemfør tre træninger ",
  });

  assert.equal(result.item.points, 0);
  assert.equal(result.item.unlockRule, "Gennemfør tre træninger");
  assert.equal(result.item.editorialNote, "");
  assert.deepEqual(calls[1].value.points, null);
  assert.deepEqual(calls[1].value.unlock_rule, "Gennemfør tre træninger");
  assert.deepEqual(calls[1].value.editorial_note, null);
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

test("rejects invalid wardrobe content before accessing Supabase", async () => {
  let calls = 0;
  const client = {
    from() {
      calls += 1;
      throw new Error("must not query");
    },
  };
  const cases = [
    [{ authenticatedUserId: "not-a-uuid" }, "invalid_authenticated_user_id"],
    [{ requestId: "not-a-uuid" }, "invalid_request_id"],
    [{ topicId: "not-a-uuid" }, "invalid_topic_id"],
    [{ name: "  " }, "invalid_wardrobe_name"],
    [{ name: "x".repeat(81) }, "invalid_wardrobe_name"],
    [{ icon: "x".repeat(17) }, "invalid_wardrobe_icon"],
    [{ category: "hat" }, "invalid_wardrobe_category"],
    [{ rarity: "legendary" }, "invalid_wardrobe_rarity"],
    [{ points: -1 }, "invalid_wardrobe_points"],
    [{ points: 1_001 }, "invalid_wardrobe_points"],
    [{ points: 0, unlockRule: "" }, "invalid_wardrobe_unlock_rule"],
    [
      { points: 20, unlockRule: "Gennemfør en træning" },
      "invalid_wardrobe_unlock_rule",
    ],
    [
      { points: 0, unlockRule: "x".repeat(201) },
      "invalid_wardrobe_unlock_rule",
    ],
    [{ editorialNote: "x".repeat(501) }, "invalid_wardrobe_editorial_note"],
    [{ sortOrder: -1 }, "invalid_sort_order"],
  ];

  for (const [patch, code] of cases) {
    await assert.rejects(
      createAdminWardrobeItemDraft(client, {
        ...validWardrobeInput,
        ...patch,
      }),
      (error) => assertStepError(error, code),
    );
  }

  assert.equal(calls, 0);
});

test("rejects invalid wardrobe decisions before accessing Supabase", async () => {
  let calls = 0;
  const client = {
    from() {
      calls += 1;
      throw new Error("must not query");
    },
  };
  const cases = [
    [{ authenticatedUserId: "not-a-uuid" }, "invalid_authenticated_user_id"],
    [{ wardrobeItemId: "not-a-uuid" }, "invalid_wardrobe_item_id"],
    [{ topicId: "not-a-uuid" }, "invalid_topic_id"],
    [{ decision: "draft" }, "invalid_wardrobe_decision"],
    [{ expectedUpdatedAt: "not-a-timestamp" }, "invalid_expected_updated_at"],
  ];

  for (const [patch, code] of cases) {
    await assert.rejects(
      decideAdminWardrobeItemDraft(client, {
        ...validWardrobeDecisionInput,
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
  for (const [create, input, row, resultKey, constraint] of [
    [
      createAdminGoalDraft,
      validGoalInput,
      goalRow,
      "goal",
      "goals_topic_slug_key",
    ],
    [
      createAdminExerciseDraft,
      validExerciseInput,
      exerciseRow,
      "exercise",
      "exercises_goal_slug_key",
    ],
  ]) {
    const { calls, ...client } = clientForResponses([
      {
        data: null,
        error: {
          code: "23505",
          message: `duplicate key value violates unique constraint "${constraint}"`,
        },
      },
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

test("recovers an exact wardrobe request-id retry without overwriting it", async () => {
  const { calls, ...client } = clientForResponses([
    { data: null, error: { code: "23505" } },
    { data: [wardrobeItemRow], error: null },
  ]);

  const result = await createAdminWardrobeItemDraft(client, validWardrobeInput);

  assert.deepEqual(result, {
    created: false,
    item: expectedWardrobeItem(),
  });
  assert.equal(calls.filter((call) => call.operation === "insert").length, 1);
  assert.equal(calls.filter((call) => call.operation === "update").length, 0);
  assert.equal(calls.filter((call) => call.operation === "eq").length, 0);
  assertWardrobeRpcCall(calls);
});

test("rejects wardrobe request-id reuse with different content", async () => {
  const { calls: _calls, ...client } = clientForResponses([
    { data: null, error: { code: "23505" } },
    {
      data: [{ ...wardrobeItemRow, name: "Et andet navn" }],
      error: null,
    },
  ]);

  await assert.rejects(
    createAdminWardrobeItemDraft(client, validWardrobeInput),
    (error) => assertStepError(error, "wardrobe_creation_conflict"),
  );
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

test("classifies the scoped goal and exercise slug constraints", async () => {
  for (const [create, input, constraint, code] of [
    [
      createAdminGoalDraft,
      validGoalInput,
      "goals_topic_slug_key",
      "goal_slug_conflict",
    ],
    [
      createAdminExerciseDraft,
      validExerciseInput,
      "exercises_goal_slug_key",
      "exercise_slug_conflict",
    ],
  ]) {
    const { calls: _calls, ...client } = clientForResponses([
      {
        data: null,
        error: {
          code: "23505",
          message: `duplicate key value violates unique constraint "${constraint}"`,
        },
      },
      { data: null, error: null },
    ]);

    await assert.rejects(create(client, input), (error) => {
      assertStepError(error, code);
      assert.doesNotMatch(error.message, new RegExp(constraint, "i"));
      return true;
    });
  }
});

test("updates goal fields without changing its parent, author, or publication state", async () => {
  const updatedRow = {
    ...goalRow,
    difficulty: "intermediate",
    equipment: ["Bold"],
    estimated_minutes: 20,
    hero_media_url: null,
    slug: "rolig-boldkontrol",
    sort_order: 30,
    summary: "En rolig opdatering.",
    title: "Rolig boldkontrol",
  };
  const { calls, ...client } = clientForResponses([
    { data: updatedRow, error: null },
  ]);

  const result = await updateAdminGoalDraft(client, {
    ...validGoalUpdateInput,
    difficulty: "intermediate",
    equipment: ["Bold"],
    estimatedMinutes: 20,
    heroMediaUrl: null,
    slug: updatedRow.slug,
    sortOrder: 30,
    summary: updatedRow.summary,
    title: updatedRow.title,
  });

  assert.equal(result.goal.title, updatedRow.title);
  const updateCall = calls.find((call) => call.operation === "update");
  assert.ok(updateCall);
  assert.equal("topic_id" in updateCall.value, false);
  assert.equal("created_by" in updateCall.value, false);
  assert.equal("is_published" in updateCall.value, false);
  assert.deepEqual(
    calls.filter((call) => call.operation === "eq"),
    [
      { operation: "eq", column: "id", value: goalId },
      { operation: "eq", column: "topic_id", value: topicId },
      { operation: "eq", column: "is_published", value: false },
      {
        operation: "eq",
        column: "updated_at",
        value: goalRow.updated_at,
      },
    ],
  );
});

test("updates exercise fields without changing its parent, author, or publication state", async () => {
  const updatedRow = {
    ...exerciseRow,
    equipment: ["Bold"],
    estimated_minutes: 12,
    instructions: "Før bolden roligt mellem keglerne.",
    measurement: "duration",
    safety_notes: "Hold god afstand.",
    slug: "rolig-slalom",
    sort_order: 40,
    target_value: 30,
    title: "Rolig slalom",
    video_url: null,
  };
  const { calls, ...client } = clientForResponses([
    { data: updatedRow, error: null },
  ]);

  const result = await updateAdminExerciseDraft(client, {
    ...validExerciseUpdateInput,
    equipment: ["Bold"],
    estimatedMinutes: 12,
    instructions: updatedRow.instructions,
    measurement: "duration",
    safetyNotes: updatedRow.safety_notes,
    slug: updatedRow.slug,
    sortOrder: 40,
    targetValue: 30,
    title: updatedRow.title,
    videoUrl: null,
  });

  assert.equal(result.exercise.title, updatedRow.title);
  const updateCall = calls.find((call) => call.operation === "update");
  assert.ok(updateCall);
  assert.equal("goal_id" in updateCall.value, false);
  assert.equal("created_by" in updateCall.value, false);
  assert.equal("is_published" in updateCall.value, false);
  assert.deepEqual(
    calls.filter((call) => call.operation === "eq"),
    [
      { operation: "eq", column: "id", value: exerciseId },
      { operation: "eq", column: "goal_id", value: goalId },
      { operation: "eq", column: "is_published", value: false },
      {
        operation: "eq",
        column: "updated_at",
        value: exerciseRow.updated_at,
      },
    ],
  );
});

test("updates wardrobe content and resets its editorial status to draft", async () => {
  const updatedRow = {
    ...wardrobeItemRow,
    category: "effect",
    editorial_note: null,
    editorial_status: "draft",
    icon: "✨",
    name: "Stjernestøv",
    points: null,
    rarity: "special",
    sort_order: 40,
    unlock_rule: "Gennemfør fem træninger",
  };
  const { calls, ...client } = clientForResponses([
    { data: { id: wardrobeItemId }, error: null },
    { data: [updatedRow], error: null },
  ]);

  const result = await updateAdminWardrobeItemDraft(client, {
    ...validWardrobeUpdateInput,
    category: "effect",
    editorialNote: "",
    icon: "✨",
    name: "Stjernestøv",
    points: 0,
    rarity: "special",
    sortOrder: 40,
    unlockRule: "Gennemfør fem træninger",
  });

  assert.deepEqual(
    result.item,
    expectedWardrobeItem({
      category: "effect",
      editorialNote: "",
      icon: "✨",
      name: "Stjernestøv",
      points: 0,
      rarity: "special",
      sortOrder: 40,
      unlockRule: "Gennemfør fem træninger",
    }),
  );
  const updateCall = calls.find((call) => call.operation === "update");
  assert.deepEqual(updateCall.value, {
    category: "effect",
    editorial_note: null,
    icon: "✨",
    name: "Stjernestøv",
    points: null,
    rarity: "special",
    sort_order: 40,
    unlock_rule: "Gennemfør fem træninger",
  });
  assert.equal("topic_id" in updateCall.value, false);
  assert.equal("created_by" in updateCall.value, false);
  assert.equal("is_published" in updateCall.value, false);
  assert.deepEqual(
    calls.filter((call) => call.operation === "eq"),
    [
      { operation: "eq", column: "id", value: wardrobeItemId },
      { operation: "eq", column: "topic_id", value: topicId },
      { operation: "eq", column: "is_published", value: false },
      {
        operation: "eq",
        column: "updated_at",
        value: wardrobeItemRow.updated_at,
      },
    ],
  );
  assert.deepEqual(
    calls.filter((call) => call.operation === "select"),
    [{ operation: "select", columns: "id" }],
  );
  assertWardrobeRpcCall(calls);
});

test("approves or rejects an unpublished wardrobe item optimistically", async () => {
  for (const decision of ["approved", "rejected"]) {
    const decidedRow = {
      ...wardrobeItemRow,
      editorial_status: decision,
      updated_at: "2026-08-21T21:03:00.000Z",
    };
    const { calls, ...client } = clientForResponses([
      { data: { id: wardrobeItemId }, error: null },
      { data: [decidedRow], error: null },
    ]);

    const result = await decideAdminWardrobeItemDraft(client, {
      ...validWardrobeDecisionInput,
      decision,
    });

    assert.equal(result.item.editorialStatus, decision);
    assert.deepEqual(calls.find((call) => call.operation === "update").value, {
      editorial_status: decision,
    });
    assert.deepEqual(
      calls.filter((call) => call.operation === "eq"),
      [
        { operation: "eq", column: "id", value: wardrobeItemId },
        { operation: "eq", column: "topic_id", value: topicId },
        { operation: "eq", column: "is_published", value: false },
        {
          operation: "eq",
          column: "updated_at",
          value: wardrobeItemRow.updated_at,
        },
      ],
    );
    assert.deepEqual(
      calls.filter((call) => call.operation === "select"),
      [{ operation: "select", columns: "id" }],
    );
    assertWardrobeRpcCall(calls);
  }
});

test("preserves nullable wardrobe provenance after create, update, and review", async () => {
  for (const [mutate, input, row] of [
    [
      createAdminWardrobeItemDraft,
      validWardrobeInput,
      { ...wardrobeItemRow, created_by: null },
    ],
    [
      updateAdminWardrobeItemDraft,
      validWardrobeUpdateInput,
      { ...wardrobeItemRow, created_by: null },
    ],
    [
      decideAdminWardrobeItemDraft,
      validWardrobeDecisionInput,
      {
        ...wardrobeItemRow,
        created_by: null,
        editorial_status: "approved",
      },
    ],
  ]) {
    const { calls: _calls, ...client } = clientForResponses([
      { data: { id: wardrobeItemId }, error: null },
      { data: [row], error: null },
    ]);

    const result = await mutate(client, input);
    assert.equal(result.item.createdBy, null);
  }
});

test("rejects updates that collide or no longer target editable drafts", async () => {
  for (const [update, input, response, code] of [
    [
      updateAdminGoalDraft,
      validGoalUpdateInput,
      {
        data: null,
        error: {
          code: "23505",
          constraint: "goals_topic_slug_key",
          message: "private details",
        },
      },
      "goal_slug_conflict",
    ],
    [
      updateAdminExerciseDraft,
      validExerciseUpdateInput,
      { data: null, error: null },
      "exercise_draft_not_editable",
    ],
  ]) {
    const { calls: _calls, ...client } = clientForResponses([response]);

    await assert.rejects(update(client, input), (error) => {
      assertStepError(error, code);
      assert.doesNotMatch(error.message, /private|goals_topic_slug_key/i);
      return true;
    });
  }
});

test("recovers exact update retries and rejects genuinely stale drafts", async () => {
  for (const [update, input, persistedRow, expectedCode] of [
    [updateAdminGoalDraft, validGoalUpdateInput, goalRow, null],
    [
      updateAdminGoalDraft,
      validGoalUpdateInput,
      { ...goalRow, title: "Ændret i en anden fane" },
      "goal_draft_conflict",
    ],
    [updateAdminExerciseDraft, validExerciseUpdateInput, exerciseRow, null],
    [
      updateAdminExerciseDraft,
      validExerciseUpdateInput,
      { ...exerciseRow, title: "Ændret i en anden fane" },
      "exercise_draft_conflict",
    ],
  ]) {
    const { calls: _calls, ...client } = clientForResponses([
      { data: null, error: null },
      { data: persistedRow, error: null },
    ]);

    if (expectedCode) {
      await assert.rejects(update(client, input), (error) =>
        assertStepError(error, expectedCode),
      );
    } else {
      const result = await update(client, input);
      assert.equal(
        result.goal?.updatedAt ?? result.exercise?.updatedAt,
        persistedRow.updated_at,
      );
    }
  }
});

test("recovers exact wardrobe update retries and rejects stale content", async () => {
  for (const [persistedRow, expectedCode] of [
    [wardrobeItemRow, null],
    [
      { ...wardrobeItemRow, name: "Ændret i en anden fane" },
      "wardrobe_draft_conflict",
    ],
  ]) {
    const { calls: _calls, ...client } = clientForResponses([
      { data: null, error: null },
      { data: [persistedRow], error: null },
    ]);

    if (expectedCode) {
      await assert.rejects(
        updateAdminWardrobeItemDraft(client, validWardrobeUpdateInput),
        (error) => assertStepError(error, expectedCode),
      );
    } else {
      const result = await updateAdminWardrobeItemDraft(
        client,
        validWardrobeUpdateInput,
      );
      assert.equal(result.item.updatedAt, persistedRow.updated_at);
    }
  }
});

test("recovers exact wardrobe decision retries and rejects stale reviews", async () => {
  for (const [persistedStatus, expectedCode] of [
    ["approved", null],
    ["rejected", "wardrobe_draft_conflict"],
  ]) {
    const persistedRow = {
      ...wardrobeItemRow,
      editorial_status: persistedStatus,
      updated_at: "2026-08-21T21:03:00.000Z",
    };
    const { calls: _calls, ...client } = clientForResponses([
      { data: null, error: null },
      { data: [persistedRow], error: null },
    ]);

    if (expectedCode) {
      await assert.rejects(
        decideAdminWardrobeItemDraft(client, validWardrobeDecisionInput),
        (error) => assertStepError(error, expectedCode),
      );
    } else {
      const result = await decideAdminWardrobeItemDraft(
        client,
        validWardrobeDecisionInput,
      );
      assert.equal(result.item.editorialStatus, "approved");
    }
  }
});

test("reports missing wardrobe rows as no longer editable", async () => {
  for (const [mutate, input] of [
    [updateAdminWardrobeItemDraft, validWardrobeUpdateInput],
    [decideAdminWardrobeItemDraft, validWardrobeDecisionInput],
  ]) {
    const { calls: _calls, ...client } = clientForResponses([
      { data: null, error: null },
      { data: [], error: null },
    ]);

    await assert.rejects(mutate(client, input), (error) =>
      assertStepError(error, "wardrobe_draft_not_editable"),
    );
  }
});

test("rejects updates without a valid expected revision before querying", async () => {
  let calls = 0;
  const client = {
    from() {
      calls += 1;
      throw new Error("must not query");
    },
  };

  for (const [update, input] of [
    [updateAdminGoalDraft, validGoalInput],
    [updateAdminExerciseDraft, validExerciseInput],
    [updateAdminWardrobeItemDraft, validWardrobeInput],
  ]) {
    for (const expectedUpdatedAt of [undefined, "", "not-a-timestamp"]) {
      await assert.rejects(
        update(client, { ...input, expectedUpdatedAt }),
        (error) => assertStepError(error, "invalid_expected_updated_at"),
      );
    }
  }

  assert.equal(calls, 0);
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
    [
      createAdminWardrobeItemDraft,
      validWardrobeInput,
      { ...wardrobeItemRow, points: 0 },
      "invalid_wardrobe_creation_result",
    ],
    [
      createAdminWardrobeItemDraft,
      validWardrobeInput,
      { ...wardrobeItemRow, editorial_status: "pending" },
      "invalid_wardrobe_creation_result",
    ],
  ]) {
    const responses =
      create === createAdminWardrobeItemDraft
        ? [
            { data: { id: wardrobeItemId }, error: null },
            { data: [invalidRow], error: null },
          ]
        : [{ data: invalidRow, error: null }];
    const { calls: _calls, ...client } = clientForResponses(responses);

    await assert.rejects(create(client, input), (error) =>
      assertStepError(error, code),
    );
  }
});

test("validates wardrobe mutation results instead of trusting them", async () => {
  for (const [mutate, input, row, code] of [
    [
      updateAdminWardrobeItemDraft,
      validWardrobeUpdateInput,
      { ...wardrobeItemRow, editorial_status: "approved" },
      "invalid_wardrobe_update_result",
    ],
    [
      decideAdminWardrobeItemDraft,
      validWardrobeDecisionInput,
      { ...wardrobeItemRow, is_published: true },
      "invalid_wardrobe_decision_result",
    ],
  ]) {
    const { calls: _calls, ...client } = clientForResponses([
      { data: { id: wardrobeItemId }, error: null },
      { data: [row], error: null },
    ]);

    await assert.rejects(mutate(client, input), (error) =>
      assertStepError(error, code),
    );
  }
});

test("sanitizes database and transport failures", async () => {
  for (const [create, input, fallback] of [
    [createAdminGoalDraft, validGoalInput, "goal_creation_failed"],
    [createAdminExerciseDraft, validExerciseInput, "exercise_creation_failed"],
    [
      createAdminWardrobeItemDraft,
      validWardrobeInput,
      "wardrobe_creation_failed",
    ],
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
