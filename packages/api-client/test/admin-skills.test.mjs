import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminSkillPackageError,
  loadAdminTopicAiJob,
  parseAdminSkillPackageOutput,
  parseAdminSkillSuggestionsOutput,
  prepareAdminTopicAiJob,
  saveAdminSkillPackageDraft,
} from "../src/index.ts";

const topicId = "40000000-0000-4000-8000-000000000001";
const skillJobId = "40000000-0000-4000-8000-000000000002";
const planJobId = "40000000-0000-4000-8000-000000000003";
const imageJobId = "40000000-0000-4000-8000-000000000004";
const requestId = "40000000-0000-4000-8000-000000000005";
const savedRequestId = "40000000-0000-4000-8000-000000000006";
const updatedAt = "2026-08-26T12:00:00.000Z";

function suggestion(ordinal, overrides = {}) {
  return {
    ordinal,
    title: `Færdighed ${ordinal}`,
    slug: `faerdighed-${ordinal}`,
    childDescription: `Du lærer færdighed ${ordinal}.`,
    difficulty: "beginner",
    estimatedMinutes: 20,
    editorialReason: "En tydelig progression.",
    ...overrides,
  };
}

function exercise(ordinal, overrides = {}) {
  return {
    ordinal,
    title: `Øvelse ${ordinal}`,
    slug: `oevelse-${ordinal}`,
    childInstructions: "Du fører bolden roligt frem.",
    measurement: "completion",
    targetValue: null,
    recommendedMinutes: 10,
    equipment: ["Bold"],
    childSafetyNote: "Få hjælp af en voksen, hvis banen er glat.",
    editorialReason: "En enkel øvelse.",
    ...overrides,
  };
}

function packageOutput(overrides = {}) {
  return {
    reply: "Her er et komplet udkast.",
    skill: {
      title: "Dribling",
      slug: "dribling",
      childDescription: "Du lærer at holde bolden tæt på dig.",
      difficulty: "beginner",
      estimatedMinutes: 30,
      equipment: ["Bold", "Kegler"],
      editorialReason: "Et godt første trin.",
    },
    exercises: [exercise(1), exercise(2)],
    ...overrides,
  };
}

function assertPackageError(error, code) {
  assert.ok(error instanceof AdminSkillPackageError);
  assert.equal(error.code, code);
  return true;
}

test("parses strict, ordered skill suggestions", () => {
  const valid = {
    reply: "Tre muligheder.",
    skills: [suggestion(1), suggestion(2), suggestion(3)],
  };
  assert.deepEqual(parseAdminSkillSuggestionsOutput(valid), valid);
  assert.equal(
    parseAdminSkillSuggestionsOutput({
      ...valid,
      skills: valid.skills.map((item, index) =>
        index === 1 ? { ...item, ordinal: 3 } : item,
      ),
    }),
    null,
  );
  assert.equal(
    parseAdminSkillSuggestionsOutput({
      ...valid,
      skills: valid.skills.map((item, index) =>
        index === 1 ? { ...item, slug: "faerdighed-1" } : item,
      ),
    }),
    null,
  );
});

test("parses a complete package and rejects inconsistent exercise targets", () => {
  const valid = packageOutput();
  assert.deepEqual(parseAdminSkillPackageOutput(valid), valid);
  assert.equal(
    parseAdminSkillPackageOutput({
      ...valid,
      exercises: [exercise(1, { targetValue: 3 }), exercise(2)],
    }),
    null,
  );
  assert.equal(
    parseAdminSkillPackageOutput({
      ...valid,
      exercises: [
        exercise(1, {
          measurement: "repetitions",
          targetValue: 10,
        }),
        exercise(2),
      ],
    })?.exercises[0].targetValue,
    10,
  );
});

test("prepares a topic-bound job with canonical identifiers", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: [{ job_id: skillJobId, job_status: "awaiting_upload" }],
        error: null,
      };
    },
  };
  const inputData = {
    message: "Foreslå færdigheder.",
    topic: { title: "Fodbold", description: "Du leger med bolden." },
    existingSkills: [],
    history: [],
  };
  assert.deepEqual(
    await prepareAdminTopicAiJob(client, {
      operationKey: "content.skill_suggestions",
      clientRequestId: requestId.toUpperCase(),
      topicId: topicId.toUpperCase(),
      inputData,
    }),
    {
      jobId: skillJobId,
      operationKey: "content.skill_suggestions",
      outputData: null,
      publicErrorCode: null,
      status: "awaiting_upload",
    },
  );
  assert.deepEqual(calls, [
    {
      name: "prepare_admin_topic_ai_job",
      args: {
        p_client_request_id: requestId,
        p_input_data: inputData,
        p_operation_key: "content.skill_suggestions",
        p_topic_id: topicId,
      },
    },
  ]);
});

test("loads only the expected operation and maps private failures", async () => {
  const output = packageOutput();
  const client = {
    async rpc() {
      return {
        data: [
          {
            job_id: skillJobId,
            operation_key: "content.skill_package",
            job_status: "succeeded",
            output_data: output,
            public_error_code: null,
          },
        ],
        error: null,
      };
    },
  };
  assert.deepEqual(
    await loadAdminTopicAiJob(client, {
      jobId: skillJobId,
      expectedOperationKey: "content.skill_package",
    }),
    {
      jobId: skillJobId,
      operationKey: "content.skill_package",
      outputData: output,
      publicErrorCode: null,
      status: "succeeded",
    },
  );
  await assert.rejects(
    loadAdminTopicAiJob(client, {
      jobId: skillJobId,
      expectedOperationKey: "content.skill_suggestions",
    }),
    (error) => assertPackageError(error, "invalid_result"),
  );
  await assert.rejects(
    loadAdminTopicAiJob(
      {
        async rpc() {
          return { data: null, error: { code: "42501" } };
        },
      },
      { jobId: skillJobId, expectedOperationKey: "content.skill_package" },
    ),
    (error) => assertPackageError(error, "admin_access_denied"),
  );
});

test("saves one atomic package result and validates all returned identifiers", async () => {
  const exerciseIds = [
    "50000000-0000-4000-8000-000000000001",
    "50000000-0000-4000-8000-000000000002",
  ];
  const wardrobeItemIds = Array.from(
    { length: 16 },
    (_, index) =>
      `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ name, args });
      return {
        data: [
          {
            changed: true,
            goal_id: "50000000-0000-4000-8000-000000000003",
            exercise_ids: exerciseIds,
            wardrobe_item_ids: wardrobeItemIds,
            updated_at: updatedAt,
          },
        ],
        error: null,
      };
    },
  };
  const result = await saveAdminSkillPackageDraft(client, {
    topicId,
    skillJobId,
    wardrobePlanJobId: planJobId,
    wardrobeImageJobId: imageJobId,
    clientRequestId: savedRequestId,
    expectedUpdatedAt: updatedAt,
  });
  assert.equal(result.changed, true);
  assert.deepEqual(result.exerciseIds, exerciseIds);
  assert.deepEqual(result.wardrobeItemIds, wardrobeItemIds);
  assert.equal(calls[0].name, "save_admin_skill_package_draft");

  await assert.rejects(
    saveAdminSkillPackageDraft(
      {
        async rpc() {
          return { data: null, error: { code: "40001" } };
        },
      },
      {
        topicId,
        skillJobId,
        wardrobePlanJobId: planJobId,
        wardrobeImageJobId: imageJobId,
        clientRequestId: savedRequestId,
        expectedUpdatedAt: updatedAt,
      },
    ),
    (error) => assertPackageError(error, "topic_conflict"),
  );
});
