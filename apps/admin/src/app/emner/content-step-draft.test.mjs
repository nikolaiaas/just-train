import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CONTENT_SLUG_LENGTH,
  MAX_DURATION_TARGET_SECONDS,
  MAX_EQUIPMENT_ITEM_LENGTH,
  MAX_EQUIPMENT_ITEMS,
  MAX_REPETITION_TARGET,
  normalizeDanishContentSlug,
  validateExerciseDraftForm,
  validateGoalDraftForm,
} from "./content-step-draft.ts";

const REQUEST_ID = "D1000000-0000-4000-8000-000000000010";
const TOPIC_ID = "D2000000-0000-4000-8000-000000000010";
const GOAL_ID = "D3000000-0000-4000-8000-000000000010";

function makeForm(values) {
  const formData = new FormData();

  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) {
      formData.append(name, value);
    }
  }

  return formData;
}

function validGoalForm(overrides = {}) {
  return makeForm({
    requestId: REQUEST_ID,
    topicId: TOPIC_ID,
    title: "Lær at jonglere",
    summary: "Byg boldkontrol op med små, sjove trin.",
    difficulty: "beginner",
    estimatedMinutes: "10",
    equipment: " 1 fodbold, Kegler\n1 FODBOLD ",
    heroMediaUrl: "https://media.example.test/maalvideo.mp4",
    sortOrder: "20",
    ...overrides,
  });
}

function validExerciseForm(overrides = {}) {
  return makeForm({
    requestId: REQUEST_ID,
    goalId: GOAL_ID,
    title: "Slip, spark og grib",
    instructions:
      "Slip bolden fra hænderne, spark den én gang, og grib den igen.",
    measurement: "repetitions",
    targetValue: "5",
    recommendedMinutes: "10",
    equipment: "1 fodbold",
    safetyNote: "Find et sted med god plads.",
    videoUrl: "https://media.example.test/deloevelse.mp4",
    sortOrder: "10",
    ...overrides,
  });
}

test("normalizes a goal draft to the current goals schema", () => {
  const result = validateGoalDraftForm(
    validGoalForm({
      title: "  Stå på hænder  ",
      summary: "  Første trin.\r\nAndet trin.  ",
    }),
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      requestId: REQUEST_ID.toLowerCase(),
      topicId: TOPIC_ID.toLowerCase(),
      slug: "staa-paa-haender",
      title: "Stå på hænder",
      summary: "Første trin.\nAndet trin.",
      difficulty: "beginner",
      estimatedMinutes: 10,
      equipment: ["1 fodbold", "Kegler"],
      heroMediaUrl: "https://media.example.test/maalvideo.mp4",
      sortOrder: 20,
    },
  });
});

test("normalizes an exercise draft and preserves reference-only details", () => {
  const result = validateExerciseDraftForm(
    validExerciseForm({
      title: "  Ét spark og grib  ",
      safetyNote: "  Hold afstand.\r\nFå hjælp af en voksen.  ",
      equipment: " Bold ;  Kegler\n bold ",
    }),
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      requestId: REQUEST_ID.toLowerCase(),
      goalId: GOAL_ID.toLowerCase(),
      slug: "et-spark-og-grib",
      title: "Ét spark og grib",
      instructions:
        "Slip bolden fra hænderne, spark den én gang, og grib den igen.",
      measurement: "repetitions",
      targetValue: 5,
      videoUrl: "https://media.example.test/deloevelse.mp4",
      sortOrder: 10,
      recommendedMinutes: 10,
      equipment: ["Bold", "Kegler"],
      safetyNote: "Hold afstand.\nFå hjælp af en voksen.",
    },
  });
});

test("normalizes Danish slugs consistently", () => {
  assert.equal(
    normalizeDanishContentSlug("Ærlig øvelse på åben bane"),
    "aerlig-oevelse-paa-aaben-bane",
  );
  assert.equal(normalizeDanishContentSlug("Café & balance"), "cafe-balance");
});

test("rejects a title whose transliterated route exceeds the shared slug limit", () => {
  const result = validateGoalDraftForm(
    validGoalForm({
      title: "æ".repeat(MAX_CONTENT_SLUG_LENGTH / 2 + 1),
    }),
  );

  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.fieldErrors.title);
});

test("requires exactly one string for every goal field", () => {
  const formData = validGoalForm();
  formData.delete("summary");
  formData.append("difficulty", "advanced");
  formData.set("equipment", new Blob(["synthetic"]));

  const result = validateGoalDraftForm(formData);

  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.fieldErrors.summary);
  assert.ok(!result.ok && result.fieldErrors.difficulty);
  assert.ok(!result.ok && result.fieldErrors.equipment);
});

test("requires exactly one string for every exercise field", () => {
  const formData = validExerciseForm();
  formData.delete("safetyNote");
  formData.append("measurement", "duration");
  formData.set("videoUrl", new Blob(["synthetic"]));

  const result = validateExerciseDraftForm(formData);

  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.fieldErrors.safetyNote);
  assert.ok(!result.ok && result.fieldErrors.measurement);
  assert.ok(!result.ok && result.fieldErrors.videoUrl);
});

test("rejects invalid ids, enums, URLs, and ordering", () => {
  const goal = validateGoalDraftForm(
    validGoalForm({
      requestId: "not-a-uuid",
      topicId: "00000000-0000-0000-0000-000000000000",
      difficulty: "allLevels",
      heroMediaUrl: "javascript:alert(1)",
      sortOrder: "-1",
    }),
  );
  const exercise = validateExerciseDraftForm(
    validExerciseForm({
      goalId: "not-a-uuid",
      measurement: "score",
      videoUrl: "https://user:secret@example.test/video.mp4",
      sortOrder: "1.5",
    }),
  );

  assert.equal(goal.ok, false);
  assert.ok(!goal.ok && goal.fieldErrors.requestId);
  assert.ok(!goal.ok && goal.fieldErrors.topicId);
  assert.ok(!goal.ok && goal.fieldErrors.difficulty);
  assert.ok(!goal.ok && goal.fieldErrors.heroMediaUrl);
  assert.ok(!goal.ok && goal.fieldErrors.sortOrder);
  assert.equal(exercise.ok, false);
  assert.ok(!exercise.ok && exercise.fieldErrors.goalId);
  assert.ok(!exercise.ok && exercise.fieldErrors.measurement);
  assert.ok(!exercise.ok && exercise.fieldErrors.videoUrl);
  assert.ok(!exercise.ok && exercise.fieldErrors.sortOrder);
});

test("enforces measurement and target pairing", () => {
  const completion = validateExerciseDraftForm(
    validExerciseForm({ measurement: "completion", targetValue: "" }),
  );
  assert.equal(completion.ok, true);
  assert.equal(completion.ok ? completion.value.targetValue : undefined, null);

  for (const invalid of [
    { measurement: "completion", targetValue: "1" },
    { measurement: "repetitions", targetValue: "" },
    { measurement: "repetitions", targetValue: "0" },
    {
      measurement: "repetitions",
      targetValue: String(MAX_REPETITION_TARGET + 1),
    },
    { measurement: "duration", targetValue: "1.5" },
    {
      measurement: "duration",
      targetValue: String(MAX_DURATION_TARGET_SECONDS + 1),
    },
  ]) {
    const result = validateExerciseDraftForm(validExerciseForm(invalid));
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.fieldErrors.targetValue);
  }
});

test("allows blank optional time, media, equipment, and safety fields", () => {
  const goal = validateGoalDraftForm(
    validGoalForm({
      estimatedMinutes: " ",
      equipment: " ",
      heroMediaUrl: " ",
    }),
  );
  const exercise = validateExerciseDraftForm(
    validExerciseForm({
      recommendedMinutes: "",
      equipment: "",
      safetyNote: "",
      videoUrl: "",
    }),
  );

  assert.equal(goal.ok, true);
  assert.deepEqual(
    goal.ok
      ? {
          estimatedMinutes: goal.value.estimatedMinutes,
          equipment: goal.value.equipment,
          heroMediaUrl: goal.value.heroMediaUrl,
        }
      : null,
    { estimatedMinutes: null, equipment: [], heroMediaUrl: null },
  );
  assert.equal(exercise.ok, true);
  assert.deepEqual(
    exercise.ok
      ? {
          recommendedMinutes: exercise.value.recommendedMinutes,
          equipment: exercise.value.equipment,
          safetyNote: exercise.value.safetyNote,
          videoUrl: exercise.value.videoUrl,
        }
      : null,
    {
      recommendedMinutes: null,
      equipment: [],
      safetyNote: "",
      videoUrl: null,
    },
  );
});

test("requires child-visible goal and exercise copy to address the child", () => {
  const goal = validateGoalDraftForm(
    validGoalForm({ summary: "Barnet lærer at styre bolden." }),
  );
  const instructions = validateExerciseDraftForm(
    validExerciseForm({ instructions: "Hjælp dit barn gennem banen." }),
  );
  const safety = validateExerciseDraftForm(
    validExerciseForm({ safetyNote: "En voksen holder barnet i hånden." }),
  );

  assert.equal(goal.ok, false);
  assert.match(
    !goal.ok ? (goal.fieldErrors.summary ?? "") : "",
    /direkte til barnet/,
  );
  assert.equal(instructions.ok, false);
  assert.match(
    !instructions.ok ? (instructions.fieldErrors.instructions ?? "") : "",
    /direkte til barnet/,
  );
  assert.equal(safety.ok, false);
  assert.match(
    !safety.ok ? (safety.fieldErrors.safetyNote ?? "") : "",
    /direkte til barnet/,
  );

  const directSafety = validateExerciseDraftForm(
    validExerciseForm({
      safetyNote: "Få hjælp af en voksen, hvis du har brug for det.",
    }),
  );
  assert.equal(directSafety.ok, true);
});

test("bounds time and equipment while accepting database limits", () => {
  assert.equal(
    validateGoalDraftForm(validGoalForm({ estimatedMinutes: "180" })).ok,
    true,
  );
  assert.equal(
    validateGoalDraftForm(validGoalForm({ estimatedMinutes: "181" })).ok,
    false,
  );
  assert.equal(
    validateExerciseDraftForm(validExerciseForm({ recommendedMinutes: "0" }))
      .ok,
    false,
  );

  const tooManyItems = Array.from(
    { length: MAX_EQUIPMENT_ITEMS + 1 },
    (_, index) => "Ting " + (index + 1),
  ).join(",");
  const longItem = "x".repeat(MAX_EQUIPMENT_ITEM_LENGTH + 1);

  for (const equipment of [tooManyItems, longItem, "Bold\u0000bane"]) {
    const result = validateExerciseDraftForm(validExerciseForm({ equipment }));
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.fieldErrors.equipment);
  }
});

test("rejects unsafe or oversized Danish-facing copy", () => {
  const goal = validateGoalDraftForm(
    validGoalForm({ title: "⚽", summary: "Usikker\u0000tekst" }),
  );
  const exercise = validateExerciseDraftForm(
    validExerciseForm({
      instructions: "",
      safetyNote: "x".repeat(1_001),
    }),
  );

  assert.equal(goal.ok, false);
  assert.ok(!goal.ok && goal.fieldErrors.title);
  assert.ok(!goal.ok && goal.fieldErrors.summary);
  assert.equal(exercise.ok, false);
  assert.ok(!exercise.ok && exercise.fieldErrors.instructions);
  assert.ok(!exercise.ok && exercise.fieldErrors.safetyNote);
});
