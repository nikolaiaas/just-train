import assert from "node:assert/strict";
import test from "node:test";

import {
  CHILD_TOPIC_PHOTO_MAX_INPUT_BYTES,
  ChildTopicPhotoError,
  finalizeChildTopicReferencePhoto,
  listChildPublishedTopicsWithPhoto,
  prepareChildTopicReferencePhoto,
  removeChildTopicReferencePhoto,
  uploadChildTopicReferencePhoto,
} from "../src/index.ts";

const expectedUserId = "10000000-0000-4000-8000-000000000001";
const familyId = "20000000-0000-4000-8000-000000000001";
const childProfileId = "30000000-0000-4000-8000-000000000001";
const topicId = "40000000-0000-4000-8000-000000000001";
const secondTopicId = "40000000-0000-4000-8000-000000000002";
const clientRequestId = "f1000000-0000-4000-8000-000000000001";
const requestId = "f2000000-0000-4000-8000-000000000001";
const mediaAssetId = "f3000000-0000-4000-8000-000000000001";
const previousMediaAssetId = "f3000000-0000-4000-8000-000000000002";
const storageObjectPath = `${familyId}/children/${childProfileId}/topics/${topicId}/${mediaAssetId}.png`;
const updatedAt = "2026-08-24T10:00:00.000Z";
const deleteAfter = "2026-08-24T10:01:00.000Z";
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

const validInput = Object.freeze({
  childProfileId,
  clientRequestId,
  expectedUserId,
  familyId,
  inputMimeType: "image/png",
  topicId,
});

const preparedRow = Object.freeze({
  created: true,
  input_mime_type: "image/png",
  media_asset_id: mediaAssetId,
  request_id: requestId,
  request_status: "awaiting_upload",
  storage_bucket: "ai-media-private",
  storage_object_path: storageObjectPath,
});

const prepared = Object.freeze({
  ...validInput,
  created: true,
  mediaAssetId,
  requestId,
  requestStatus: "awaiting_upload",
  storageBucket: "ai-media-private",
  storageObjectPath,
});

function assertPhotoError(error, code) {
  assert.ok(error instanceof ChildTopicPhotoError);
  assert.equal(error.code, code);
  return true;
}

test("prepares a child-topic upload without exposing wardrobe or AI controls", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ input, name });
      return { data: [preparedRow], error: null };
    },
  };

  assert.deepEqual(
    await prepareChildTopicReferencePhoto(client, {
      ...validInput,
      childProfileId: childProfileId.toUpperCase(),
      clientRequestId: clientRequestId.toUpperCase(),
      expectedUserId: expectedUserId.toUpperCase(),
      familyId: familyId.toUpperCase(),
      topicId: topicId.toUpperCase(),
    }),
    prepared,
  );
  assert.deepEqual(calls, [
    {
      input: {
        p_child_profile_id: childProfileId,
        p_client_request_id: clientRequestId,
        p_expected_user_id: expectedUserId,
        p_family_id: familyId,
        p_input_mime_type: "image/png",
        p_topic_id: topicId,
      },
      name: "prepare_child_topic_reference_photo",
    },
  ]);
  assert.equal("prompt" in calls[0].input, false);
  assert.equal("provider" in calls[0].input, false);
  assert.equal("wardrobe" in calls[0].input, false);
});

test("validates every upload context value before preparing", async () => {
  let calls = 0;
  const client = {
    async rpc() {
      calls += 1;
      return { data: [preparedRow], error: null };
    },
  };

  for (const [patch, code] of [
    [{ childProfileId: "invalid" }, "invalid_child_profile_id"],
    [{ clientRequestId: "invalid" }, "invalid_client_request_id"],
    [{ expectedUserId: "invalid" }, "invalid_expected_user_id"],
    [{ familyId: "invalid" }, "invalid_family_id"],
    [{ inputMimeType: "image/webp" }, "invalid_mime_type"],
    [{ topicId: "invalid" }, "invalid_topic_id"],
  ]) {
    await assert.rejects(
      prepareChildTopicReferencePhoto(client, { ...validInput, ...patch }),
      (error) => assertPhotoError(error, code),
    );
  }

  assert.equal(calls, 0);
});

test("maps preparation failures without leaking database details", async () => {
  for (const [databaseCode, expectedCode] of [
    ["28000", "session_changed"],
    ["42501", "child_access_denied"],
    ["P0002", "topic_unavailable"],
    ["54000", "upload_limit_reached"],
    ["XX000", "preparation_failed"],
  ]) {
    await assert.rejects(
      prepareChildTopicReferencePhoto(
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
        validInput,
      ),
      (error) => {
        assertPhotoError(error, expectedCode);
        assert.doesNotMatch(error.message, /database detail/i);
        return true;
      },
    );
  }
});

test("rejects server preparation rows that do not match the canonical reservation", async () => {
  for (const patch of [
    { request_id: "invalid" },
    { media_asset_id: "invalid" },
    { storage_bucket: "wardrobe-images" },
    { storage_object_path: `${familyId}/wrong.png` },
    { input_mime_type: "image/jpeg" },
    { request_status: "processing" },
    { created: "true" },
  ]) {
    await assert.rejects(
      prepareChildTopicReferencePhoto(
        {
          async rpc() {
            return { data: [{ ...preparedRow, ...patch }], error: null };
          },
        },
        validInput,
      ),
      (error) => assertPhotoError(error, "invalid_preparation_result"),
    );
  }
});

test("uploads the exact image bytes to the reserved private object", async () => {
  const calls = [];
  const client = {
    storage: {
      from(bucket) {
        return {
          async upload(path, bytes, options) {
            calls.push({ bucket, bytes, options, path });
            return { data: { path }, error: null };
          },
        };
      },
    },
  };

  await uploadChildTopicReferencePhoto(client, prepared, PNG_BYTES);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bucket, "ai-media-private");
  assert.equal(calls[0].path, storageObjectPath);
  assert.equal(calls[0].bytes, PNG_BYTES);
  assert.deepEqual(calls[0].options, {
    cacheControl: "0",
    contentType: "image/png",
    upsert: false,
  });
});

test("allows only an exact idempotent upload conflict", async () => {
  for (const [created, statusCode, succeeds] of [
    [false, "409", true],
    [true, "409", true],
    [false, "500", false],
  ]) {
    const operation = uploadChildTopicReferencePhoto(
      {
        storage: {
          from() {
            return {
              async upload() {
                return {
                  data: null,
                  error: { message: "Synthetic private detail", statusCode },
                };
              },
            };
          },
        },
      },
      { ...prepared, created },
      PNG_BYTES,
    );

    if (succeeds) {
      await operation;
    } else {
      await assert.rejects(operation, (error) =>
        assertPhotoError(error, "upload_failed"),
      );
    }
  }
});

test("rejects invalid, oversized, terminal, and forged uploads before Storage", async () => {
  let calls = 0;
  const client = {
    storage: {
      from() {
        calls += 1;
        throw new Error("invalid input must not reach Storage");
      },
    },
  };

  for (const [candidate, bytes, code] of [
    [prepared, new Uint8Array(), "invalid_image_bytes"],
    [prepared, new Uint8Array([0xff, 0xd8, 0xff]), "invalid_image_bytes"],
    [
      prepared,
      new Uint8Array(CHILD_TOPIC_PHOTO_MAX_INPUT_BYTES + 1).fill(0x89),
      "invalid_image_bytes",
    ],
    [{ ...prepared, requestStatus: "current" }, PNG_BYTES, "photo_unavailable"],
    [
      { ...prepared, storageObjectPath: `${familyId}/forged.png` },
      PNG_BYTES,
      "invalid_prepared_photo",
    ],
  ]) {
    await assert.rejects(
      uploadChildTopicReferencePhoto(client, candidate, bytes),
      (error) => assertPhotoError(error, code),
    );
  }

  const oversizedPng = new Uint8Array(CHILD_TOPIC_PHOTO_MAX_INPUT_BYTES + 1);
  oversizedPng.set(PNG_BYTES);
  await assert.rejects(
    uploadChildTopicReferencePhoto(client, prepared, oversizedPng),
    (error) => assertPhotoError(error, "input_too_large"),
  );
  assert.equal(calls, 0);
});

test("finalizes an atomic replacement and normalizes the result", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ input, name });
      return {
        data: [
          {
            changed: true,
            current_media_asset_id: mediaAssetId.toUpperCase(),
            photo_updated_at: updatedAt,
            previous_media_asset_id: previousMediaAssetId.toUpperCase(),
            request_media_asset_id: mediaAssetId.toUpperCase(),
            request_status: "current",
          },
        ],
        error: null,
      };
    },
  };

  assert.deepEqual(await finalizeChildTopicReferencePhoto(client, prepared), {
    changed: true,
    currentMediaAssetId: mediaAssetId,
    previousMediaAssetId,
    requestMediaAssetId: mediaAssetId,
    requestStatus: "current",
    updatedAt,
  });
  assert.deepEqual(calls, [
    {
      input: {
        p_child_profile_id: childProfileId,
        p_client_request_id: clientRequestId,
        p_expected_user_id: expectedUserId,
        p_family_id: familyId,
        p_topic_id: topicId,
      },
      name: "finalize_child_topic_reference_photo",
    },
  ]);
});

test("accepts safe finalize retries and rejects contradictory server results", async () => {
  const validRows = [
    {
      changed: false,
      current_media_asset_id: mediaAssetId,
      photo_updated_at: updatedAt,
      previous_media_asset_id: null,
      request_media_asset_id: mediaAssetId,
      request_status: "current",
    },
    {
      changed: false,
      current_media_asset_id: previousMediaAssetId,
      photo_updated_at: updatedAt,
      previous_media_asset_id: null,
      request_media_asset_id: mediaAssetId,
      request_status: "superseded",
    },
    {
      changed: false,
      current_media_asset_id: null,
      photo_updated_at: null,
      previous_media_asset_id: null,
      request_media_asset_id: mediaAssetId,
      request_status: "removed",
    },
  ];

  for (const row of validRows) {
    const result = await finalizeChildTopicReferencePhoto(
      {
        async rpc() {
          return { data: [row], error: null };
        },
      },
      prepared,
    );
    assert.equal(result.requestStatus, row.request_status);
    assert.equal(result.changed, false);
  }

  for (const patch of [
    { request_media_asset_id: previousMediaAssetId },
    { request_status: "awaiting_upload" },
    { changed: true, request_status: "superseded" },
    { current_media_asset_id: null, request_status: "current" },
    { photo_updated_at: null, request_status: "current" },
    { previous_media_asset_id: previousMediaAssetId, changed: false },
  ]) {
    await assert.rejects(
      finalizeChildTopicReferencePhoto(
        {
          async rpc() {
            return { data: [{ ...validRows[0], ...patch }], error: null };
          },
        },
        prepared,
      ),
      (error) => assertPhotoError(error, "invalid_finalization_result"),
    );
  }
});

test("lists real published topics and signs only their current private photos", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ input, name });
      return {
        data: [
          {
            accent_color: null,
            description: "A calm balance course.",
            icon: "🧭",
            photo_media_asset_id: null,
            photo_mime_type: null,
            photo_storage_bucket: null,
            photo_storage_object_path: null,
            photo_updated_at: null,
            slug: "balance",
            sort_order: 2,
            title: "Balance",
            topic_id: secondTopicId,
          },
          {
            accent_color: "#53C987",
            description: "Football with a ball and friends.",
            icon: "⚽️",
            photo_media_asset_id: mediaAssetId,
            photo_mime_type: "image/png",
            photo_storage_bucket: "ai-media-private",
            photo_storage_object_path: storageObjectPath,
            photo_updated_at: updatedAt,
            slug: "fodbold",
            sort_order: 1,
            title: "Fodbold",
            topic_id: topicId,
          },
        ],
        error: null,
      };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "ai-media-private");
        return {
          async createSignedUrl(path, expiresInSeconds) {
            calls.push({ expiresInSeconds, path });
            return {
              data: { signedUrl: "https://example.invalid/private-photo" },
              error: null,
            };
          },
          getPublicUrl() {
            throw new Error("family media must never use a public URL");
          },
        };
      },
    },
  };

  const topics = await listChildPublishedTopicsWithPhoto(client, {
    childProfileId,
    expectedUserId,
    familyId,
    signedUrlExpiresInSeconds: 180,
  });

  assert.deepEqual(topics, [
    {
      accentColor: "#53C987",
      description: "Football with a ball and friends.",
      icon: "⚽️",
      id: topicId,
      photo: {
        expiresInSeconds: 180,
        mediaAssetId,
        mimeType: "image/png",
        signedUrl: "https://example.invalid/private-photo",
        updatedAt,
      },
      slug: "fodbold",
      sortOrder: 1,
      title: "Fodbold",
    },
    {
      accentColor: null,
      description: "A calm balance course.",
      icon: "🧭",
      id: secondTopicId,
      photo: null,
      slug: "balance",
      sortOrder: 2,
      title: "Balance",
    },
  ]);
  assert.deepEqual(calls, [
    {
      input: {
        p_child_profile_id: childProfileId,
        p_expected_user_id: expectedUserId,
        p_family_id: familyId,
      },
      name: "list_child_published_topics_with_photo",
    },
    { expiresInSeconds: 180, path: storageObjectPath },
  ]);
  assert.equal("storageObjectPath" in topics[0].photo, false);
});

test("fails closed on malformed or duplicated published topic results", async () => {
  const baseRow = {
    accent_color: "#53C987",
    description: "Football.",
    icon: "⚽️",
    photo_media_asset_id: null,
    photo_mime_type: null,
    photo_storage_bucket: null,
    photo_storage_object_path: null,
    photo_updated_at: null,
    slug: "fodbold",
    sort_order: 1,
    title: "Fodbold",
    topic_id: topicId,
  };
  const invalidResponses = [
    null,
    [{ ...baseRow, topic_id: "invalid" }],
    [{ ...baseRow, slug: "Invalid Slug" }],
    [{ ...baseRow, accent_color: "red" }],
    [{ ...baseRow, photo_media_asset_id: mediaAssetId }],
    [baseRow, { ...baseRow, title: "Duplicate" }],
    [baseRow, { ...baseRow, topic_id: secondTopicId }],
  ];

  for (const data of invalidResponses) {
    await assert.rejects(
      listChildPublishedTopicsWithPhoto(
        {
          async rpc() {
            return { data, error: null };
          },
          storage: {
            from() {
              throw new Error("invalid rows must not sign");
            },
          },
        },
        { childProfileId, expectedUserId, familyId },
      ),
      (error) => assertPhotoError(error, "invalid_topic_list_result"),
    );
  }
});

test("maps guarded discovery failures", async () => {
  for (const [databaseCode, expectedCode] of [
    ["28000", "session_changed"],
    ["42501", "child_access_denied"],
    ["XX000", "topic_list_failed"],
  ]) {
    await assert.rejects(
      listChildPublishedTopicsWithPhoto(
        {
          async rpc() {
            return { data: null, error: { code: databaseCode } };
          },
        },
        { childProfileId, expectedUserId, familyId },
      ),
      (error) => assertPhotoError(error, expectedCode),
    );
  }
});

test("keeps every published topic when one optional photo cannot be signed", async () => {
  const topicRows = [
    {
      accent_color: null,
      description: "Football.",
      icon: null,
      photo_media_asset_id: mediaAssetId,
      photo_mime_type: "image/png",
      photo_storage_bucket: "ai-media-private",
      photo_storage_object_path: storageObjectPath,
      photo_updated_at: updatedAt,
      slug: "fodbold",
      sort_order: 1,
      title: "Fodbold",
      topic_id: topicId,
    },
    {
      accent_color: null,
      description: "A calm balance course.",
      icon: null,
      photo_media_asset_id: null,
      photo_mime_type: null,
      photo_storage_bucket: null,
      photo_storage_object_path: null,
      photo_updated_at: null,
      slug: "balance",
      sort_order: 2,
      title: "Balance",
      topic_id: secondTopicId,
    },
  ];

  for (const createSignedUrl of [
    async () => ({ data: null, error: { message: "private detail" } }),
    async () => {
      throw new Error("synthetic transport detail");
    },
  ]) {
    const topics = await listChildPublishedTopicsWithPhoto(
      {
        async rpc() {
          return { data: topicRows, error: null };
        },
        storage: {
          from() {
            return { createSignedUrl };
          },
        },
      },
      { childProfileId, expectedUserId, familyId },
    );

    assert.deepEqual(
      topics.map((topic) => ({ id: topic.id, photo: topic.photo })),
      [
        { id: topicId, photo: null },
        { id: secondTopicId, photo: null },
      ],
    );
  }
});

test("removes only the expected current photo and preserves the honest deadline", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ input, name });
      return {
        data: [
          {
            delete_after: deleteAfter,
            removed: true,
            removed_media_asset_id: mediaAssetId,
          },
        ],
        error: null,
      };
    },
  };

  assert.deepEqual(
    await removeChildTopicReferencePhoto(client, {
      childProfileId,
      expectedMediaAssetId: mediaAssetId,
      expectedUserId,
      familyId,
      topicId,
    }),
    { deleteAfter, mediaAssetId, removed: true },
  );
  assert.deepEqual(calls, [
    {
      input: {
        p_child_profile_id: childProfileId,
        p_expected_media_asset_id: mediaAssetId,
        p_expected_user_id: expectedUserId,
        p_family_id: familyId,
        p_topic_id: topicId,
      },
      name: "remove_child_topic_reference_photo",
    },
  ]);
});

test("maps removal conflicts, missing photos, access failures, and invalid results", async () => {
  for (const [databaseCode, expectedCode] of [
    ["40001", "photo_changed"],
    ["P0002", "photo_unavailable"],
    ["28000", "session_changed"],
    ["42501", "child_access_denied"],
    ["XX000", "removal_failed"],
  ]) {
    await assert.rejects(
      removeChildTopicReferencePhoto(
        {
          async rpc() {
            return { data: null, error: { code: databaseCode } };
          },
        },
        {
          childProfileId,
          expectedMediaAssetId: mediaAssetId,
          expectedUserId,
          familyId,
          topicId,
        },
      ),
      (error) => assertPhotoError(error, expectedCode),
    );
  }

  await assert.rejects(
    removeChildTopicReferencePhoto(
      {
        async rpc() {
          return {
            data: [
              {
                delete_after: null,
                removed: true,
                removed_media_asset_id: mediaAssetId,
              },
            ],
            error: null,
          };
        },
      },
      {
        childProfileId,
        expectedMediaAssetId: mediaAssetId,
        expectedUserId,
        familyId,
        topicId,
      },
    ),
    (error) => assertPhotoError(error, "invalid_removal_result"),
  );
});
