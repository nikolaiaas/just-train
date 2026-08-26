import assert from "node:assert/strict";
import test from "node:test";

import {
  addExerciseToTopicEditorOutline,
  buildTopicEditorHref,
  getResumeStartingStep,
  isMissingWardrobeStorageError,
  loadResumableTopicDraft,
  loadTopicEditorOutline,
  parseResumeTopicId,
  parseResumeTopicSelection,
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
  publishedAt: null,
  status: "draft",
  title: "Balance",
  updatedAt: "2026-08-22T07:00:00.000Z",
};

const goal = {
  difficulty: "beginner",
  equipment: [],
  estimatedMinutes: 10,
  heroMediaUrl: "https://media.example.test/goal.mp4",
  id: "20000000-0000-4000-8000-000000000001",
  publishedAt: null,
  sortOrder: 3,
  status: "draft",
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
  publishedAt: null,
  safetyNotes: "Brug en voksen ved behov.",
  targetValue: 10,
  title: "Flamingoen",
  updatedAt: "2026-08-22T07:02:00.000Z",
  videoUrl: "https://media.example.test/exercise.mp4",
  sortOrder: 4,
  status: "draft",
};

const wardrobeItem = {
  category: "effect",
  contentVersion: 1,
  createdAt: "2026-08-22T07:03:00.000Z",
  createdBy: "40000000-0000-4000-8000-000000000001",
  description: "Et glimtende stjernedrys, du kan have på.",
  editorialNote: "Et syntetisk eksempel.",
  editorialStatus: "draft",
  equipSlot: "accessory",
  hasPendingRevision: false,
  icon: "✨",
  id: "50000000-0000-4000-8000-000000000001",
  imagePath: "70000000-0000-4000-8000-000000000001/01.png",
  imageUrl:
    "https://cdn.example.test/70000000-0000-4000-8000-000000000001/01.png",
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

test("resume selection strictly validates topic, goal, and exercise IDs", () => {
  assert.deepEqual(parseResumeTopicSelection({}), {
    exerciseId: null,
    goalId: null,
    startingStep: null,
    topicId: null,
  });
  assert.deepEqual(parseResumeTopicSelection({ topic: topic.id }), {
    exerciseId: null,
    goalId: null,
    startingStep: null,
    topicId: topic.id,
  });
  assert.deepEqual(
    parseResumeTopicSelection({ goal: goal.id, topic: topic.id }),
    {
      exerciseId: null,
      goalId: goal.id,
      startingStep: "goal",
      topicId: topic.id,
    },
  );
  assert.deepEqual(
    parseResumeTopicSelection({
      exercise: exercise.id,
      goal: goal.id,
      topic: topic.id,
    }),
    {
      exerciseId: exercise.id,
      goalId: goal.id,
      startingStep: "exercise",
      topicId: topic.id,
    },
  );
  assert.deepEqual(
    parseResumeTopicSelection({
      add: "exercise",
      goal: goal.id,
      topic: topic.id,
    }),
    {
      exerciseId: null,
      goalId: goal.id,
      startingStep: "new-exercise",
      topicId: topic.id,
    },
  );
  assert.deepEqual(
    parseResumeTopicSelection({ add: "goal", topic: topic.id }),
    {
      exerciseId: null,
      goalId: null,
      startingStep: "new-goal",
      topicId: topic.id,
    },
  );
  assert.deepEqual(
    parseResumeTopicSelection({ add: "wardrobe", topic: topic.id }),
    {
      exerciseId: null,
      goalId: null,
      startingStep: "wardrobe",
      topicId: topic.id,
    },
  );

  assert.equal(parseResumeTopicSelection({ goal: goal.id }), null);
  assert.equal(
    parseResumeTopicSelection({ exercise: exercise.id, topic: topic.id }),
    null,
  );
  assert.equal(
    parseResumeTopicSelection({ goal: [goal.id], topic: topic.id }),
    null,
  );
  assert.equal(
    parseResumeTopicSelection({
      exercise: "not-an-exercise",
      goal: goal.id,
      topic: topic.id,
    }),
    null,
  );
  assert.equal(
    parseResumeTopicSelection({ add: "exercise", topic: topic.id }),
    null,
  );
  assert.equal(
    parseResumeTopicSelection({
      add: "wardrobe",
      goal: goal.id,
      topic: topic.id,
    }),
    null,
  );
  assert.equal(
    parseResumeTopicSelection({
      add: "exercise",
      exercise: exercise.id,
      goal: goal.id,
      topic: topic.id,
    }),
    null,
  );
  assert.equal(
    parseResumeTopicSelection({
      add: "goal",
      goal: goal.id,
      topic: topic.id,
    }),
    null,
  );
  assert.equal(
    parseResumeTopicSelection({
      add: "goal",
      exercise: exercise.id,
      topic: topic.id,
    }),
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
    getResumeStartingStep(
      {
        topic: { ...topic, status: "published" },
        goal,
        exercise: null,
        wardrobeItems: [],
        nextExerciseSortOrder: 5,
        nextGoalSortOrder: 4,
      },
      "new-exercise",
    ),
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
  assert.equal(
    getResumeStartingStep({
      topic: {
        ...topic,
        publishedAt: "2026-08-22T06:00:00.000Z",
        status: "published",
      },
      goal: {
        ...goal,
        publishedAt: "2026-08-22T06:00:00.000Z",
        status: "published",
      },
      exercise: {
        ...exercise,
        publishedAt: "2026-08-22T06:00:00.000Z",
        status: "published",
      },
      wardrobeItems: [],
      nextExerciseSortOrder: 5,
      nextGoalSortOrder: 4,
    }),
    "topic",
  );
  assert.equal(
    getResumeStartingStep(
      {
        topic: { ...topic, status: "published" },
        goal,
        exercise,
        wardrobeItems: [],
        nextExerciseSortOrder: 5,
        nextGoalSortOrder: 4,
      },
      "goal",
    ),
    "goal",
  );
  assert.equal(
    getResumeStartingStep(
      {
        topic: { ...topic, status: "published" },
        goal: null,
        exercise: null,
        wardrobeItems: [],
        nextExerciseSortOrder: 0,
        nextGoalSortOrder: 4,
      },
      "new-goal",
    ),
    "goal",
  );
  assert.equal(
    getResumeStartingStep(
      {
        topic: { ...topic, status: "published" },
        goal,
        exercise,
        wardrobeItems: [],
        nextExerciseSortOrder: 5,
        nextGoalSortOrder: 4,
      },
      "exercise",
    ),
    "exercise",
  );
  assert.equal(
    getResumeStartingStep(
      {
        topic: { ...topic, status: "published" },
        goal: null,
        exercise: null,
        wardrobeItems: [],
        nextExerciseSortOrder: 0,
        nextGoalSortOrder: 4,
      },
      "wardrobe",
    ),
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
        is_published: false,
        published_at: null,
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
        is_published: false,
        published_at: null,
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
          description: wardrobeItem.description,
          editorial_note: wardrobeItem.editorialNote,
          editorial_status: wardrobeItem.editorialStatus,
          equip_slot: wardrobeItem.equipSlot,
          has_pending_revision: wardrobeItem.hasPendingRevision,
          icon: wardrobeItem.icon,
          id: wardrobeItem.id,
          image_path: wardrobeItem.imagePath,
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
        is_published: false,
        published_at: null,
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
    storage: {
      from(bucket) {
        assert.equal(bucket, "wardrobe-images");
        return {
          getPublicUrl(path) {
            return {
              data: { publicUrl: `https://cdn.example.test/${path}` },
            };
          },
        };
      },
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
    [],
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

test("resume derives topic, goal, and exercise statuses independently", async () => {
  const publishedAt = "2026-08-22T06:00:00.000Z";
  const calls = [];
  const responses = [
    {
      data: {
        accent_color: topic.accentColor,
        description: topic.description,
        icon: topic.icon,
        id: topic.id,
        is_published: true,
        published_at: publishedAt,
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
        is_published: false,
        published_at: null,
        sort_order: goal.sortOrder,
        summary: goal.summary,
        title: goal.title,
        updated_at: goal.updatedAt,
      },
      error: null,
    },
    { data: { sort_order: goal.sortOrder }, error: null },
    { data: [], error: null },
    {
      data: {
        equipment: exercise.equipment,
        estimated_minutes: exercise.estimatedMinutes,
        id: exercise.id,
        instructions: exercise.instructions,
        is_published: true,
        measurement: exercise.measurement,
        published_at: publishedAt,
        safety_notes: exercise.safetyNotes,
        sort_order: exercise.sortOrder,
        target_value: exercise.targetValue,
        title: exercise.title,
        updated_at: exercise.updatedAt,
        video_url: exercise.videoUrl,
      },
      error: null,
    },
    { data: { sort_order: exercise.sortOrder }, error: null },
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
        then(onFulfilled, onRejected) {
          return Promise.resolve(response).then(onFulfilled, onRejected);
        },
      };

      return query;
    },
    rpc() {
      return Promise.resolve(responses[responseIndex++]);
    },
  };

  const result = await loadResumableTopicDraft(client, topic.id);

  assert.equal(result.topic.status, "published");
  assert.equal(result.topic.publishedAt, publishedAt);
  assert.equal(result.goal.status, "draft");
  assert.equal(result.goal.publishedAt, null);
  assert.equal(result.exercise.status, "published");
  assert.equal(result.exercise.publishedAt, publishedAt);
  assert.deepEqual(
    calls.filter(
      (call) => call.operation === "eq" && call.column === "is_published",
    ),
    [],
  );
});

test("resume selects the requested goal and exercise within their parents", async () => {
  const requestedGoalId = "20000000-0000-4000-8000-000000000002";
  const requestedExerciseId = "30000000-0000-4000-8000-000000000002";
  const calls = [];
  const responses = [
    {
      data: {
        accent_color: topic.accentColor,
        description: topic.description,
        icon: topic.icon,
        id: topic.id,
        is_published: true,
        published_at: "2026-08-22T06:00:00.000Z",
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
        id: requestedGoalId,
        is_published: false,
        published_at: null,
        sort_order: 7,
        summary: goal.summary,
        title: "Det valgte mål",
        updated_at: goal.updatedAt,
      },
      error: null,
    },
    { data: { sort_order: 7 }, error: null },
    { data: [], error: null },
    {
      data: {
        equipment: exercise.equipment,
        estimated_minutes: exercise.estimatedMinutes,
        id: requestedExerciseId,
        instructions: exercise.instructions,
        is_published: true,
        measurement: exercise.measurement,
        published_at: "2026-08-22T06:00:00.000Z",
        safety_notes: exercise.safetyNotes,
        sort_order: 8,
        target_value: exercise.targetValue,
        title: "Den valgte deløvelse",
        updated_at: exercise.updatedAt,
        video_url: exercise.videoUrl,
      },
      error: null,
    },
    { data: { sort_order: 8 }, error: null },
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
    rpc() {
      return Promise.resolve(responses[responseIndex++]);
    },
  };

  const result = await loadResumableTopicDraft(client, topic.id, {
    exerciseId: requestedExerciseId,
    goalId: requestedGoalId,
  });

  assert.equal(result.goal.id, requestedGoalId);
  assert.equal(result.goal.status, "draft");
  assert.equal(result.exercise.id, requestedExerciseId);
  assert.equal(result.exercise.status, "published");
  assert.deepEqual(
    calls.filter((call) => call.operation === "eq"),
    [
      { column: "id", operation: "eq", table: "topics", value: topic.id },
      {
        column: "topic_id",
        operation: "eq",
        table: "goals",
        value: topic.id,
      },
      {
        column: "id",
        operation: "eq",
        table: "goals",
        value: requestedGoalId,
      },
      {
        column: "topic_id",
        operation: "eq",
        table: "goals",
        value: topic.id,
      },
      {
        column: "goal_id",
        operation: "eq",
        table: "exercises",
        value: requestedGoalId,
      },
      {
        column: "id",
        operation: "eq",
        table: "exercises",
        value: requestedExerciseId,
      },
      {
        column: "goal_id",
        operation: "eq",
        table: "exercises",
        value: requestedGoalId,
      },
    ],
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
        is_published: false,
        published_at: null,
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

test("editor links preserve the selected topic hierarchy and explicit add mode", () => {
  assert.equal(
    buildTopicEditorHref({ topicId: topic.id }),
    `/emner/ny?topic=${topic.id}`,
  );
  assert.equal(
    buildTopicEditorHref({ goalId: goal.id, topicId: topic.id }),
    `/emner/ny?topic=${topic.id}&goal=${goal.id}`,
  );
  assert.equal(
    buildTopicEditorHref({
      exerciseId: exercise.id,
      goalId: goal.id,
      topicId: topic.id,
    }),
    `/emner/ny?topic=${topic.id}&goal=${goal.id}&exercise=${exercise.id}`,
  );
  assert.equal(
    buildTopicEditorHref({
      createExercise: true,
      goalId: goal.id,
      topicId: topic.id,
    }),
    `/emner/ny?topic=${topic.id}&goal=${goal.id}&add=exercise`,
  );
  assert.equal(
    buildTopicEditorHref({ createGoal: true, topicId: topic.id }),
    `/emner/ny?topic=${topic.id}&add=goal`,
  );
});

test("a newly saved exercise appears once in its goal outline as a draft", () => {
  const outline = [
    {
      exercises: [
        {
          id: exercise.id,
          sortOrder: 4,
          status: "published",
          title: exercise.title,
        },
      ],
      id: goal.id,
      sortOrder: 3,
      status: "published",
      title: goal.title,
    },
  ];
  const newExercise = {
    goalId: goal.id,
    id: "30000000-0000-4000-8000-000000000002",
    sortOrder: 5,
    title: "Gå på linen",
  };

  const updated = addExerciseToTopicEditorOutline(outline, newExercise);

  assert.deepEqual(updated[0].exercises, [
    outline[0].exercises[0],
    {
      id: newExercise.id,
      sortOrder: 5,
      status: "draft",
      title: "Gå på linen",
    },
  ]);
  assert.deepEqual(
    addExerciseToTopicEditorOutline(updated, newExercise),
    updated,
  );
  assert.equal(outline[0].exercises.length, 1);
});

test("resume prepares a blank next exercise without replacing an existing one", async () => {
  const calls = [];
  const responses = [
    {
      data: {
        accent_color: topic.accentColor,
        description: topic.description,
        icon: topic.icon,
        id: topic.id,
        is_published: true,
        published_at: "2026-08-22T06:00:00.000Z",
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
        is_published: true,
        published_at: "2026-08-22T06:00:00.000Z",
        sort_order: goal.sortOrder,
        summary: goal.summary,
        title: goal.title,
        updated_at: goal.updatedAt,
      },
      error: null,
    },
    { data: { sort_order: goal.sortOrder }, error: null },
    { data: [], error: null },
    { data: { sort_order: 8 }, error: null },
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
        limit() {
          return query;
        },
        maybeSingle: async () => response,
        order() {
          return query;
        },
        select(columns) {
          calls.push({ columns, operation: "select", table });
          return query;
        },
      };
      return query;
    },
    rpc() {
      return Promise.resolve(responses[responseIndex++]);
    },
  };

  const result = await loadResumableTopicDraft(client, topic.id, {
    createExercise: true,
    goalId: goal.id,
  });

  assert.equal(result.exercise, null);
  assert.equal(result.nextExerciseSortOrder, 9);
  assert.equal(
    calls.filter(
      (call) =>
        call.table === "exercises" &&
        call.operation === "select" &&
        call.columns !== "sort_order",
    ).length,
    0,
  );
});

test("resume prepares a blank next goal without loading an existing one", async () => {
  const calls = [];
  const responses = [
    {
      data: {
        accent_color: topic.accentColor,
        description: topic.description,
        icon: topic.icon,
        id: topic.id,
        is_published: true,
        published_at: "2026-08-22T06:00:00.000Z",
        title: topic.title,
        updated_at: topic.updatedAt,
      },
      error: null,
    },
    { data: { sort_order: 8 }, error: null },
    { data: [], error: null },
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
        limit() {
          return query;
        },
        maybeSingle: async () => response,
        order() {
          return query;
        },
        select(columns) {
          calls.push({ columns, operation: "select", table });
          return query;
        },
      };
      return query;
    },
    rpc() {
      return Promise.resolve(responses[responseIndex++]);
    },
  };

  const result = await loadResumableTopicDraft(client, topic.id, {
    createGoal: true,
  });

  assert.equal(result.goal, null);
  assert.equal(result.exercise, null);
  assert.equal(result.nextGoalSortOrder, 9);
  assert.equal(result.nextExerciseSortOrder, 0);
  assert.deepEqual(
    calls.filter(
      (call) => call.table === "goals" && call.operation === "select",
    ),
    [{ columns: "sort_order", operation: "select", table: "goals" }],
  );
});

test("editor outline loads every goal and exercise with independent statuses", async () => {
  const secondGoalId = "20000000-0000-4000-8000-000000000002";
  const secondExerciseId = "30000000-0000-4000-8000-000000000002";
  const calls = [];
  const responses = {
    exercises: {
      data: [
        {
          goal_id: goal.id,
          id: exercise.id,
          is_published: true,
          sort_order: 4,
          title: exercise.title,
        },
        {
          goal_id: secondGoalId,
          id: secondExerciseId,
          is_published: false,
          sort_order: 1,
          title: "Anden deløvelse",
        },
      ],
      error: null,
    },
    goals: {
      data: [
        {
          id: goal.id,
          is_published: true,
          sort_order: 3,
          title: goal.title,
        },
        {
          id: secondGoalId,
          is_published: false,
          sort_order: 5,
          title: "Andet mål",
        },
      ],
      error: null,
    },
  };
  const client = {
    from(table) {
      const response = responses[table];
      const query = {
        eq(column, value) {
          calls.push({ column, operation: "eq", table, value });
          return query;
        },
        in(column, values) {
          calls.push({ column, operation: "in", table, values });
          return query;
        },
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
  };

  assert.deepEqual(await loadTopicEditorOutline(client, topic.id), [
    {
      exercises: [
        {
          id: exercise.id,
          sortOrder: 4,
          status: "published",
          title: exercise.title,
        },
      ],
      id: goal.id,
      sortOrder: 3,
      status: "published",
      title: goal.title,
    },
    {
      exercises: [
        {
          id: secondExerciseId,
          sortOrder: 1,
          status: "draft",
          title: "Anden deløvelse",
        },
      ],
      id: secondGoalId,
      sortOrder: 5,
      status: "draft",
      title: "Andet mål",
    },
  ]);
  assert.deepEqual(
    calls.find((call) => call.operation === "in"),
    {
      column: "goal_id",
      operation: "in",
      table: "exercises",
      values: [goal.id, secondGoalId],
    },
  );
});
