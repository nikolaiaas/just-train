import assert from "node:assert/strict";
import test from "node:test";

import {
  ChildTrainingError,
  completeChildTrainingExercise,
  listChildTrainingSubjects,
  loadChildTrainingSubject,
} from "../src/training.ts";

const expectedUserId = "10000000-0000-4000-8000-000000000001";
const familyId = "20000000-0000-4000-8000-000000000001";
const childProfileId = "30000000-0000-4000-8000-000000000001";
const subjectId = "40000000-0000-4000-8000-000000000001";
const emptySubjectId = "40000000-0000-4000-8000-000000000002";
const emptyGoalSubjectId = "40000000-0000-4000-8000-000000000003";
const goalId = "50000000-0000-4000-8000-000000000001";
const emptyGoalId = "50000000-0000-4000-8000-000000000002";
const firstExerciseId = "60000000-0000-4000-8000-000000000001";
const secondExerciseId = "60000000-0000-4000-8000-000000000002";
const requestId = "a1000000-0000-4000-8000-000000000001";
const attemptId = "a2000000-0000-4000-8000-000000000001";
const sessionId = "a3000000-0000-4000-8000-000000000001";
const completedAt = "2026-08-24T12:00:00.000Z";

const emptyProgress = Object.freeze({
  attempts_count: null,
  best_duration_ms: null,
  best_repetitions: null,
  completed_count: null,
  last_attempted_at: null,
  progress_state: null,
});

const topic = Object.freeze({
  topic_accent_color: "#53C987",
  topic_description: "Leg med bolden og lær nye færdigheder.",
  topic_icon: "⚽",
  topic_id: subjectId,
  topic_slug: "fodbold",
  topic_sort_order: 10,
  topic_title: "Fodbold",
});

const goal = Object.freeze({
  goal_difficulty: "beginner",
  goal_equipment: ["En fodbold"],
  goal_estimated_minutes: 10,
  goal_hero_media_url: null,
  goal_id: goalId,
  goal_slug: "laer-at-jonglere",
  goal_sort_order: 10,
  goal_summary: "Byg boldkontrol op med små, sjove trin.",
  goal_title: "Lær at jonglere",
});

function exerciseRow({ id, progress = emptyProgress, sortOrder, title }) {
  return {
    ...topic,
    ...goal,
    ...progress,
    exercise_equipment: ["En fodbold"],
    exercise_estimated_minutes: 5,
    exercise_id: id,
    exercise_instructions: `Syntetisk instruktion til ${title}.`,
    exercise_measurement: "repetitions",
    exercise_safety_notes: "Træn et sted med god plads.",
    exercise_slug: `trin-${sortOrder}`,
    exercise_sort_order: sortOrder,
    exercise_target_value: 5,
    exercise_title: title,
    exercise_video_url: null,
  };
}

function noGoalRow() {
  return {
    ...emptyProgress,
    exercise_equipment: null,
    exercise_estimated_minutes: null,
    exercise_id: null,
    exercise_instructions: null,
    exercise_measurement: null,
    exercise_safety_notes: null,
    exercise_slug: null,
    exercise_sort_order: null,
    exercise_target_value: null,
    exercise_title: null,
    exercise_video_url: null,
    goal_difficulty: null,
    goal_equipment: null,
    goal_estimated_minutes: null,
    goal_hero_media_url: null,
    goal_id: null,
    goal_slug: null,
    goal_sort_order: null,
    goal_summary: null,
    goal_title: null,
    topic_accent_color: null,
    topic_description: "Et syntetisk publiceret emne uden mål.",
    topic_icon: null,
    topic_id: emptySubjectId,
    topic_slug: "tomt-emne",
    topic_sort_order: 20,
    topic_title: "Tomt emne",
  };
}

function noExerciseRow() {
  return {
    ...noGoalRow(),
    goal_difficulty: "intermediate",
    goal_equipment: [],
    goal_estimated_minutes: null,
    goal_hero_media_url: null,
    goal_id: emptyGoalId,
    goal_slug: "tomt-maal",
    goal_sort_order: 10,
    goal_summary: "Et syntetisk publiceret mål uden deløvelser.",
    goal_title: "Tomt mål",
    topic_description: "Et syntetisk emne med et tomt mål.",
    topic_id: emptyGoalSubjectId,
    topic_slug: "tomt-maal-emne",
    topic_sort_order: 30,
    topic_title: "Emne med tomt mål",
  };
}

function rpcClient(response, calls = []) {
  return {
    calls,
    async rpc(name, args) {
      calls.push({ args, name });
      return response;
    },
  };
}

function assertTrainingError(error, code) {
  assert.ok(error instanceof ChildTrainingError);
  assert.equal(error.code, code);
  return true;
}

test("builds ordered subject trees and progress from the published flat rows", async () => {
  const completedProgress = {
    attempts_count: 2,
    best_duration_ms: null,
    best_repetitions: 8,
    completed_count: 1,
    last_attempted_at: completedAt,
    progress_state: "completed",
  };
  const rows = [
    noExerciseRow(),
    exerciseRow({
      id: secondExerciseId,
      sortOrder: 20,
      title: "Andet trin",
    }),
    noGoalRow(),
    exerciseRow({
      id: firstExerciseId,
      progress: completedProgress,
      sortOrder: 10,
      title: "Første trin",
    }),
  ];
  const { calls, ...client } = rpcClient({ data: rows, error: null });

  const catalog = await listChildTrainingSubjects(client, {
    childProfileId: childProfileId.toUpperCase(),
    expectedUserId: expectedUserId.toUpperCase(),
    familyId: familyId.toUpperCase(),
  });

  assert.deepEqual(
    catalog.subjects.map((subject) => subject.id),
    [subjectId, emptySubjectId, emptyGoalSubjectId],
  );
  assert.deepEqual(
    catalog.subjects[0].goals[0].exercises.map((exercise) => exercise.id),
    [firstExerciseId, secondExerciseId],
  );
  assert.deepEqual(catalog.subjects[0].progress, {
    completedExercises: 1,
    lastTrainedAt: completedAt,
    percentage: 50,
    state: "in_progress",
    totalExercises: 2,
  });
  assert.deepEqual(catalog.subjects[0].goals[0].progress, {
    completedExercises: 1,
    lastTrainedAt: completedAt,
    percentage: 50,
    state: "in_progress",
    totalExercises: 2,
  });
  assert.equal(
    catalog.subjects[0].goals[0].exercises[0].progress.attemptsCount,
    2,
  );
  assert.equal(catalog.subjects[1].goals.length, 0);
  assert.equal(catalog.subjects[1].progress.state, "not_started");
  assert.equal(catalog.subjects[2].goals.length, 1);
  assert.equal(catalog.subjects[2].goals[0].exercises.length, 0);
  assert.deepEqual(catalog.overallProgress, {
    completedExercises: 1,
    lastTrainedAt: completedAt,
    percentage: 50,
    state: "in_progress",
    totalExercises: 2,
  });
  assert.deepEqual(calls, [
    {
      args: {
        p_child_profile_id: childProfileId,
        p_expected_user_id: expectedUserId,
        p_family_id: familyId,
      },
      name: "list_child_training_content",
    },
  ]);
});

test("loads one dynamic subject and returns null after it is unpublished", async () => {
  const firstCalls = [];
  const first = await loadChildTrainingSubject(
    rpcClient(
      {
        data: [
          exerciseRow({
            id: firstExerciseId,
            sortOrder: 10,
            title: "Første trin",
          }),
        ],
        error: null,
      },
      firstCalls,
    ),
    { childProfileId, expectedUserId, familyId, subjectId },
  );
  assert.equal(first?.id, subjectId);
  assert.deepEqual(firstCalls[0], {
    args: {
      p_child_profile_id: childProfileId,
      p_expected_user_id: expectedUserId,
      p_family_id: familyId,
      p_topic_id: subjectId,
    },
    name: "list_child_training_content",
  });

  const unpublished = await loadChildTrainingSubject(
    rpcClient({ data: [], error: null }),
    { childProfileId, expectedUserId, familyId, subjectId },
  );
  assert.equal(unpublished, null);

  await assert.rejects(
    loadChildTrainingSubject(rpcClient({ data: [noGoalRow()], error: null }), {
      childProfileId,
      expectedUserId,
      familyId,
      subjectId,
    }),
    (error) => assertTrainingError(error, "invalid_training_content_result"),
  );
});

test("records one guarded completion and preserves aggregate best values", async () => {
  const { calls, ...client } = rpcClient({
    data: [
      {
        attempt_id: attemptId,
        attempts_count: 3,
        best_duration_ms: null,
        best_repetitions: 10,
        child_profile_id: childProfileId,
        completed_at: completedAt,
        completed_count: 2,
        created: true,
        duration_ms: null,
        exercise_id: firstExerciseId,
        goal_id: goalId,
        last_attempted_at: completedAt,
        perceived_difficulty: 3,
        progress_state: "completed",
        repetitions: 5,
        session_id: sessionId,
        topic_id: subjectId,
      },
    ],
    error: null,
  });

  const completion = await completeChildTrainingExercise(client, {
    childProfileId,
    clientRequestId: requestId,
    exerciseId: firstExerciseId,
    expectedUserId,
    familyId,
    goalId,
    measurement: "repetitions",
    perceivedDifficulty: 3,
    repetitions: 5,
    subjectId,
  });

  assert.equal(completion.attemptId, attemptId);
  assert.equal(completion.subjectId, subjectId);
  assert.equal(completion.progress.bestRepetitions, 10);
  assert.equal(completion.progress.attemptsCount, 3);
  assert.deepEqual(calls, [
    {
      args: {
        p_child_profile_id: childProfileId,
        p_client_request_id: requestId,
        p_exercise_id: firstExerciseId,
        p_expected_user_id: expectedUserId,
        p_family_id: familyId,
        p_goal_id: goalId,
        p_perceived_difficulty: 3,
        p_repetitions: 5,
        p_topic_id: subjectId,
      },
      name: "complete_child_training_exercise",
    },
  ]);
});

test("rejects completion results that disagree with the exact dynamic route", async () => {
  const validRow = {
    attempt_id: attemptId,
    attempts_count: 1,
    best_duration_ms: null,
    best_repetitions: 5,
    child_profile_id: childProfileId,
    completed_at: completedAt,
    completed_count: 1,
    created: true,
    duration_ms: null,
    exercise_id: firstExerciseId,
    goal_id: goalId,
    last_attempted_at: completedAt,
    perceived_difficulty: null,
    progress_state: "completed",
    repetitions: 5,
    session_id: sessionId,
    topic_id: subjectId,
  };
  for (const patch of [
    { child_profile_id: "30000000-0000-4000-8000-000000000002" },
    { topic_id: emptySubjectId },
    { goal_id: emptyGoalId },
    { exercise_id: secondExerciseId },
  ]) {
    await assert.rejects(
      completeChildTrainingExercise(
        rpcClient({ data: [{ ...validRow, ...patch }], error: null }),
        {
          childProfileId,
          clientRequestId: requestId,
          exerciseId: firstExerciseId,
          expectedUserId,
          familyId,
          goalId,
          measurement: "repetitions",
          repetitions: 5,
          subjectId,
        },
      ),
      (error) => assertTrainingError(error, "invalid_completion_result"),
    );
  }
});

test("rejects malformed contexts before making an RPC", async () => {
  const { calls, ...client } = rpcClient({ data: [], error: null });

  for (const [patch, code] of [
    [{ childProfileId: "invalid" }, "invalid_child_profile_id"],
    [{ expectedUserId: "invalid" }, "invalid_expected_user_id"],
    [{ familyId: "invalid" }, "invalid_family_id"],
    [{ subjectId: "invalid" }, "invalid_subject_id"],
  ]) {
    await assert.rejects(
      loadChildTrainingSubject(client, {
        childProfileId,
        expectedUserId,
        familyId,
        subjectId,
        ...patch,
      }),
      (error) => assertTrainingError(error, code),
    );
  }

  for (const [patch, code] of [
    [{ clientRequestId: NIL_UUID }, "invalid_client_request_id"],
    [{ exerciseId: "invalid" }, "invalid_exercise_id"],
    [{ goalId: "invalid" }, "invalid_goal_id"],
    [{ subjectId: "invalid" }, "invalid_subject_id"],
    [{ durationMs: -1 }, "invalid_duration_ms"],
    [{ repetitions: 1.5 }, "invalid_repetitions"],
    [{ perceivedDifficulty: 6 }, "invalid_perceived_difficulty"],
  ]) {
    await assert.rejects(
      completeChildTrainingExercise(client, {
        childProfileId,
        clientRequestId: requestId,
        exerciseId: firstExerciseId,
        expectedUserId,
        familyId,
        goalId,
        measurement: "completion",
        subjectId,
        ...patch,
      }),
      (error) => assertTrainingError(error, code),
    );
  }

  assert.deepEqual(calls, []);
});

test("requires exactly the result metric declared by the exercise", async () => {
  const { calls, ...client } = rpcClient({ data: [], error: null });
  const base = {
    childProfileId,
    clientRequestId: requestId,
    exerciseId: firstExerciseId,
    expectedUserId,
    familyId,
    goalId,
    subjectId,
  };

  for (const [input, code] of [
    [{ ...base, measurement: "repetitions" }, "invalid_repetitions"],
    [{ ...base, measurement: "duration" }, "invalid_duration_ms"],
    [
      { ...base, measurement: "completion", repetitions: 5 },
      "invalid_repetitions",
    ],
    [
      {
        ...base,
        durationMs: 5_000,
        measurement: "repetitions",
        repetitions: 5,
      },
      "invalid_duration_ms",
    ],
    [
      { ...base, durationMs: 5_000, measurement: "duration", repetitions: 5 },
      "invalid_repetitions",
    ],
    [{ ...base, measurement: "unknown" }, "invalid_measurement"],
  ]) {
    await assert.rejects(
      completeChildTrainingExercise(client, input),
      (error) => assertTrainingError(error, code),
    );
  }

  assert.deepEqual(calls, []);
});

test("sends no invented metric for completion and the measured duration for duration", async () => {
  const baseRow = {
    attempt_id: attemptId,
    attempts_count: 1,
    best_duration_ms: null,
    best_repetitions: null,
    child_profile_id: childProfileId,
    completed_at: completedAt,
    completed_count: 1,
    created: true,
    duration_ms: null,
    exercise_id: firstExerciseId,
    goal_id: goalId,
    last_attempted_at: completedAt,
    perceived_difficulty: null,
    progress_state: "completed",
    repetitions: null,
    session_id: sessionId,
    topic_id: subjectId,
  };
  const completionCalls = [];
  const completion = await completeChildTrainingExercise(
    rpcClient({ data: [baseRow], error: null }, completionCalls),
    {
      childProfileId,
      clientRequestId: requestId,
      exerciseId: firstExerciseId,
      expectedUserId,
      familyId,
      goalId,
      measurement: "completion",
      subjectId,
    },
  );
  assert.equal(completion.repetitions, null);
  assert.equal(completion.durationMs, null);
  assert.equal("p_repetitions" in completionCalls[0].args, false);
  assert.equal("p_duration_ms" in completionCalls[0].args, false);

  const durationCalls = [];
  const duration = await completeChildTrainingExercise(
    rpcClient(
      {
        data: [
          {
            ...baseRow,
            best_duration_ms: 75_000,
            duration_ms: 75_000,
          },
        ],
        error: null,
      },
      durationCalls,
    ),
    {
      childProfileId,
      clientRequestId: requestId,
      durationMs: 75_000,
      exerciseId: firstExerciseId,
      expectedUserId,
      familyId,
      goalId,
      measurement: "duration",
      subjectId,
    },
  );
  assert.equal(duration.durationMs, 75_000);
  assert.equal(durationCalls[0].args.p_duration_ms, 75_000);
  assert.equal("p_repetitions" in durationCalls[0].args, false);
});

test("rejects malformed empty-child rows instead of inventing progress", async () => {
  const malformed = {
    ...noGoalRow(),
    attempts_count: 1,
    completed_count: 1,
    last_attempted_at: completedAt,
    progress_state: "completed",
  };
  const missingNullableColumn = { ...noGoalRow() };
  delete missingNullableColumn.goal_slug;
  const mixedEmptyAndPopulated = {
    ...exerciseRow({
      id: firstExerciseId,
      sortOrder: 10,
      title: "Første trin",
    }),
    topic_accent_color: null,
    topic_description: noGoalRow().topic_description,
    topic_icon: null,
    topic_id: emptySubjectId,
    topic_slug: "tomt-emne",
    topic_sort_order: 20,
    topic_title: "Tomt emne",
  };

  for (const rows of [
    [malformed],
    [missingNullableColumn],
    [noGoalRow(), mixedEmptyAndPopulated],
  ]) {
    await assert.rejects(
      listChildTrainingSubjects(rpcClient({ data: rows, error: null }), {
        childProfileId,
        expectedUserId,
        familyId,
      }),
      (error) => assertTrainingError(error, "invalid_training_content_result"),
    );
  }
});

test("maps database failures to stable child training errors", async () => {
  for (const [databaseCode, expectedCode] of [
    ["28000", "child_training_session_changed"],
    ["42501", "child_training_access_denied"],
    ["P0002", "child_training_unavailable"],
    ["XX000", "child_training_content_failed"],
  ]) {
    await assert.rejects(
      listChildTrainingSubjects(
        rpcClient({ data: null, error: { code: databaseCode } }),
        { childProfileId, expectedUserId, familyId },
      ),
      (error) => assertTrainingError(error, expectedCode),
    );
  }
});

test("maps a changed measurement contract to unavailable training", async () => {
  await assert.rejects(
    completeChildTrainingExercise(
      rpcClient({ data: null, error: { code: "22023" } }),
      {
        childProfileId,
        clientRequestId: requestId,
        exerciseId: firstExerciseId,
        expectedUserId,
        familyId,
        goalId,
        measurement: "repetitions",
        repetitions: 5,
        subjectId,
      },
    ),
    (error) => assertTrainingError(error, "child_training_unavailable"),
  );
});

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
