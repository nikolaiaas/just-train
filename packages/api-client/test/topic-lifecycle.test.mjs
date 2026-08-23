import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminTopicLifecycleError,
  deleteAdminTopic,
  publishAdminTopic,
  unpublishAdminTopic,
} from "../src/index.ts";

const topicId = "40000000-0000-4000-8000-000000000001";
const expectedUpdatedAt = "2026-08-23T10:00:00.000Z";
const resultUpdatedAt = "2026-08-23T10:01:00.000Z";

function assertLifecycleError(error, code) {
  assert.ok(error instanceof AdminTopicLifecycleError);
  assert.equal(error.code, code);
  return true;
}

test("unpublishes a topic through the guarded RPC and maps the draft result", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ name, input });
      return {
        data: [
          {
            changed: true,
            id: topicId,
            is_published: false,
            published_at: null,
            updated_at: resultUpdatedAt,
          },
        ],
        error: null,
      };
    },
  };

  assert.deepEqual(
    await unpublishAdminTopic(client, {
      expectedUpdatedAt,
      topicId: topicId.toUpperCase(),
    }),
    {
      changed: true,
      publishedAt: null,
      status: "draft",
      topicId,
      updatedAt: resultUpdatedAt,
    },
  );
  assert.deepEqual(calls, [
    {
      name: "unpublish_admin_topic",
      input: {
        p_expected_updated_at: expectedUpdatedAt,
        p_topic_id: topicId,
      },
    },
  ]);
});

test("accepts an idempotent already-unpublished response", async () => {
  const client = {
    async rpc() {
      return {
        data: [
          {
            changed: false,
            id: topicId,
            is_published: false,
            published_at: null,
            updated_at: resultUpdatedAt,
          },
        ],
        error: null,
      };
    },
  };

  const result = await unpublishAdminTopic(client, {
    expectedUpdatedAt,
    topicId,
  });

  assert.equal(result.changed, false);
  assert.equal(result.status, "draft");
});

test("publishes the current topic tree and reports newly live children", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ name, input });
      return {
        data: [
          {
            changed: true,
            id: topicId,
            is_published: true,
            published_at: resultUpdatedAt,
            published_exercise_count: 3,
            published_goal_count: 1,
            published_wardrobe_item_count: 2,
            updated_at: resultUpdatedAt,
          },
        ],
        error: null,
      };
    },
  };

  assert.deepEqual(
    await publishAdminTopic(client, { expectedUpdatedAt, topicId }),
    {
      changed: true,
      publishedAt: resultUpdatedAt,
      publishedExerciseCount: 3,
      publishedGoalCount: 1,
      publishedWardrobeItemCount: 2,
      status: "published",
      topicId,
      updatedAt: resultUpdatedAt,
    },
  );
  assert.deepEqual(calls, [
    {
      name: "publish_admin_topic",
      input: {
        p_expected_updated_at: expectedUpdatedAt,
        p_topic_id: topicId,
      },
    },
  ]);
});

test("maps an incomplete topic to a stable publication error", async () => {
  await assert.rejects(
    publishAdminTopic(
      {
        async rpc() {
          return {
            data: null,
            error: { code: "23514", message: "Private database detail" },
          };
        },
      },
      { expectedUpdatedAt, topicId },
    ),
    (error) => assertLifecycleError(error, "topic_not_ready"),
  );
});

test("rejects malformed publication results and transport failures", async () => {
  await assert.rejects(
    publishAdminTopic(
      {
        async rpc() {
          throw new Error("Synthetic transport detail");
        },
      },
      { expectedUpdatedAt, topicId },
    ),
    (error) => assertLifecycleError(error, "topic_publish_failed"),
  );

  for (const row of [
    null,
    {
      changed: true,
      id: topicId,
      is_published: false,
      published_at: null,
      published_exercise_count: 1,
      published_goal_count: 1,
      published_wardrobe_item_count: 0,
      updated_at: resultUpdatedAt,
    },
    {
      changed: true,
      id: topicId,
      is_published: true,
      published_at: resultUpdatedAt,
      published_exercise_count: -1,
      published_goal_count: 1,
      published_wardrobe_item_count: 0,
      updated_at: resultUpdatedAt,
    },
  ]) {
    await assert.rejects(
      publishAdminTopic(
        {
          async rpc() {
            return { data: [row], error: null };
          },
        },
        { expectedUpdatedAt, topicId },
      ),
      (error) => assertLifecycleError(error, "invalid_topic_publish_result"),
    );
  }
});

test("deletes the complete topic-owned editorial tree through one RPC", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ name, input });
      return {
        data: [
          {
            deleted_exercise_count: 4,
            deleted_goal_count: 2,
            deleted_wardrobe_item_count: 3,
            id: topicId,
          },
        ],
        error: null,
      };
    },
  };

  assert.deepEqual(
    await deleteAdminTopic(client, { expectedUpdatedAt, topicId }),
    {
      deletedExerciseCount: 4,
      deletedGoalCount: 2,
      deletedWardrobeItemCount: 3,
      topicId,
    },
  );
  assert.deepEqual(calls, [
    {
      name: "delete_admin_topic",
      input: {
        p_expected_updated_at: expectedUpdatedAt,
        p_topic_id: topicId,
      },
    },
  ]);
});

test("rejects malformed lifecycle input without calling the database", async () => {
  let calls = 0;
  const client = {
    async rpc() {
      calls += 1;
      return { data: null, error: null };
    },
  };

  for (const operation of [
    publishAdminTopic,
    unpublishAdminTopic,
    deleteAdminTopic,
  ]) {
    for (const [input, code] of [
      [{ expectedUpdatedAt, topicId: "not-a-uuid" }, "invalid_topic_id"],
      [
        {
          expectedUpdatedAt,
          topicId: "00000000-0000-0000-0000-000000000000",
        },
        "invalid_topic_id",
      ],
      [
        { expectedUpdatedAt: "not-a-timestamp", topicId },
        "invalid_expected_updated_at",
      ],
      [
        { expectedUpdatedAt: `${expectedUpdatedAt}\n`, topicId },
        "invalid_expected_updated_at",
      ],
    ]) {
      await assert.rejects(operation(client, input), (error) =>
        assertLifecycleError(error, code),
      );
    }
  }

  assert.equal(calls, 0);
});

test("maps guarded database failures to stable lifecycle codes", async () => {
  const cases = [
    ["42501", "admin_access_denied"],
    ["P0002", "topic_not_found"],
    ["40001", "topic_conflict"],
  ];

  for (const operation of [
    publishAdminTopic,
    unpublishAdminTopic,
    deleteAdminTopic,
  ]) {
    for (const [databaseCode, expectedCode] of cases) {
      await assert.rejects(
        operation(
          {
            async rpc() {
              return {
                data: null,
                error: {
                  code: databaseCode,
                  message: "Synthetic private database detail",
                },
              };
            },
          },
          { expectedUpdatedAt, topicId },
        ),
        (error) => {
          assertLifecycleError(error, expectedCode);
          assert.doesNotMatch(error.message, /synthetic|database detail/iu);
          return true;
        },
      );
    }
  }

  for (const [databaseCode, expectedCode] of [
    ["55000", "topic_must_be_unpublished"],
    ["23503", "topic_in_use"],
    ["XX000", "topic_delete_failed"],
  ]) {
    await assert.rejects(
      deleteAdminTopic(
        {
          async rpc() {
            return {
              data: null,
              error: {
                code: databaseCode,
                message: "Synthetic private database detail",
              },
            };
          },
        },
        { expectedUpdatedAt, topicId },
      ),
      (error) => assertLifecycleError(error, expectedCode),
    );
  }
});

test("rejects thrown transports and malformed lifecycle results", async () => {
  const thrownClient = {
    async rpc() {
      throw new Error("Synthetic transport detail");
    },
  };

  await assert.rejects(
    unpublishAdminTopic(thrownClient, { expectedUpdatedAt, topicId }),
    (error) => assertLifecycleError(error, "topic_unpublish_failed"),
  );
  await assert.rejects(
    deleteAdminTopic(thrownClient, { expectedUpdatedAt, topicId }),
    (error) => assertLifecycleError(error, "topic_delete_failed"),
  );

  for (const row of [
    null,
    {
      changed: true,
      id: topicId,
      is_published: true,
      published_at: resultUpdatedAt,
      updated_at: resultUpdatedAt,
    },
    {
      changed: true,
      id: "40000000-0000-4000-8000-000000000002",
      is_published: false,
      published_at: null,
      updated_at: resultUpdatedAt,
    },
  ]) {
    await assert.rejects(
      unpublishAdminTopic(
        {
          async rpc() {
            return { data: [row], error: null };
          },
        },
        { expectedUpdatedAt, topicId },
      ),
      (error) => assertLifecycleError(error, "invalid_topic_unpublish_result"),
    );
  }

  for (const row of [
    null,
    {
      deleted_exercise_count: -1,
      deleted_goal_count: 2,
      deleted_wardrobe_item_count: 3,
      id: topicId,
    },
    {
      deleted_exercise_count: 1,
      deleted_goal_count: 1,
      deleted_wardrobe_item_count: 1,
      id: "40000000-0000-4000-8000-000000000002",
    },
  ]) {
    await assert.rejects(
      deleteAdminTopic(
        {
          async rpc() {
            return { data: [row], error: null };
          },
        },
        { expectedUpdatedAt, topicId },
      ),
      (error) => assertLifecycleError(error, "invalid_topic_deletion_result"),
    );
  }
});
