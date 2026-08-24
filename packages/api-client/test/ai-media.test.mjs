import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_CARTOON_OPERATION_KEY,
  AI_MEDIA_MAX_INPUT_BYTES,
  AiMediaError,
  createAiMediaOutputUrl,
  detectAiMediaMimeType,
  getAiMediaJob,
  loadChildProfileAvatar,
  prepareAiMediaJob,
  setChildProfileAvatarFromAiJob,
  startAiMediaJob,
  uploadAiMediaInput,
} from "../src/index.ts";

const familyId = "20000000-0000-4000-8000-000000000001";
const expectedUserId = "10000000-0000-4000-8000-000000000001";
const childProfileId = "30000000-0000-4000-8000-000000000001";
const clientRequestId = "d1000000-0000-4000-8000-000000000001";
const jobId = "a3000000-0000-4000-8000-000000000001";
const inputAssetId = "a4000000-0000-4000-8000-000000000001";
const outputAssetId = "a4000000-0000-4000-8000-000000000002";
const previousOutputAssetId = "a4000000-0000-4000-8000-000000000003";
const inputObjectPath = `${familyId}/${expectedUserId}/${jobId}/input.png`;
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

const validInput = Object.freeze({
  childProfileId,
  clientRequestId,
  expectedUserId,
  familyId,
  inputMimeType: "image/png",
  operationKey: AI_CARTOON_OPERATION_KEY,
  subjectKind: "child",
});

const preparedRow = Object.freeze({
  created: true,
  input_asset_id: inputAssetId,
  input_object_path: inputObjectPath,
  job_id: jobId,
  job_status: "awaiting_upload",
  output_asset_id: outputAssetId,
  storage_bucket: "ai-media-private",
});

const prepared = Object.freeze({
  created: true,
  inputAssetId,
  inputMimeType: "image/png",
  inputObjectPath,
  jobId,
  jobStatus: "awaiting_upload",
  outputAssetId,
  storageBucket: "ai-media-private",
});

function assertAiError(error, code) {
  assert.ok(error instanceof AiMediaError);
  assert.equal(error.code, code);
  return true;
}

function queryReturning(response) {
  const query = {
    eq() {
      return query;
    },
    maybeSingle: async () => response,
    select() {
      return query;
    },
  };
  return query;
}

test("prepares a child-linked job without sending prompt, model, or provider", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ name, input });
      return { data: [preparedRow], error: null };
    },
  };

  const result = await prepareAiMediaJob(client, {
    ...validInput,
    clientRequestId: clientRequestId.toUpperCase(),
    expectedUserId: expectedUserId.toUpperCase(),
    familyId: familyId.toUpperCase(),
  });

  assert.deepEqual(result, prepared);
  assert.deepEqual(calls, [
    {
      name: "prepare_ai_media_job",
      input: {
        p_child_profile_id: childProfileId,
        p_client_request_id: clientRequestId,
        p_expected_user_id: expectedUserId,
        p_family_id: familyId,
        p_input_mime_type: "image/png",
        p_operation_key: "portrait.cartoon_3d",
        p_subject_kind: "child",
      },
    },
  ]);
  assert.equal("prompt" in calls[0].input, false);
  assert.equal("model" in calls[0].input, false);
  assert.equal("provider" in calls[0].input, false);
});

test("keeps generalized non-child jobs available without child linkage", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ name, input });
      return { data: [preparedRow], error: null };
    },
  };

  assert.deepEqual(
    await prepareAiMediaJob(client, {
      ...validInput,
      childProfileId: null,
      subjectKind: "synthetic",
    }),
    prepared,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.p_child_profile_id, undefined);
  assert.equal(calls[0].input.p_subject_kind, "synthetic");
});

test("rejects invalid child linkage and preparation input before the RPC", async () => {
  let calls = 0;
  const client = {
    async rpc() {
      calls += 1;
      return { data: [preparedRow], error: null };
    },
  };

  for (const [patch, code] of [
    [{ childProfileId: null }, "invalid_child_profile_id"],
    [{ childProfileId: "not-a-uuid" }, "invalid_child_profile_id"],
    [{ subjectKind: "adult_test", childProfileId }, "invalid_child_profile_id"],
    [{ subjectKind: "unknown" }, "invalid_subject_kind"],
    [{ familyId: "not-a-uuid" }, "invalid_family_id"],
    [{ expectedUserId: "not-a-uuid" }, "invalid_expected_user_id"],
    [{ clientRequestId: "not-a-uuid" }, "invalid_client_request_id"],
    [{ inputMimeType: "image/heic" }, "invalid_mime_type"],
    [{ operationKey: "Unsafe Operation" }, "invalid_operation_key"],
  ]) {
    await assert.rejects(
      prepareAiMediaJob(client, { ...validInput, ...patch }),
      (error) => assertAiError(error, code),
    );
  }

  assert.equal(calls, 0);
});

test("maps preparation errors without leaking database details", async () => {
  for (const [databaseCode, expectedCode] of [
    ["P0002", "operation_unavailable"],
    ["28000", "session_changed"],
    ["42501", "family_access_denied"],
    ["XX000", "preparation_failed"],
  ]) {
    await assert.rejects(
      prepareAiMediaJob(
        {
          async rpc() {
            return {
              data: null,
              error: {
                code: databaseCode,
                message: "Synthetic private detail",
              },
            };
          },
        },
        validInput,
      ),
      (error) => {
        assertAiError(error, expectedCode);
        assert.doesNotMatch(error.message, /synthetic/i);
        return true;
      },
    );
  }
});

test("detects supported image signatures and uploads to the reserved private path", async () => {
  const calls = [];
  const client = {
    storage: {
      from(bucket) {
        return {
          async upload(path, bytes, options) {
            calls.push({ bucket, path, bytes, options });
            return { data: { path }, error: null };
          },
        };
      },
    },
  };

  assert.equal(detectAiMediaMimeType(PNG_BYTES), "image/png");
  await uploadAiMediaInput(client, prepared, PNG_BYTES);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].bucket, "ai-media-private");
  assert.equal(calls[0].path, inputObjectPath);
  assert.deepEqual(calls[0].bytes, PNG_BYTES);
  assert.deepEqual(calls[0].options, {
    cacheControl: "0",
    contentType: "image/png",
    upsert: false,
  });
});

test("rejects mismatched or oversized bytes and permits only an idempotent duplicate", async () => {
  const noUploadClient = {
    storage: {
      from() {
        return {
          async upload() {
            throw new Error("must not upload");
          },
        };
      },
    },
  };

  await assert.rejects(
    uploadAiMediaInput(noUploadClient, prepared, new Uint8Array([1, 2, 3])),
    (error) => assertAiError(error, "invalid_image_bytes"),
  );

  const oversized = new Uint8Array(AI_MEDIA_MAX_INPUT_BYTES + 1);
  oversized.set(PNG_BYTES);
  await assert.rejects(
    uploadAiMediaInput(noUploadClient, prepared, oversized),
    (error) => assertAiError(error, "input_too_large"),
  );

  const duplicateClient = {
    storage: {
      from() {
        return {
          async upload() {
            return { data: null, error: { statusCode: "409" } };
          },
        };
      },
    },
  };

  await uploadAiMediaInput(
    duplicateClient,
    { ...prepared, created: false },
    PNG_BYTES,
  );
  await assert.rejects(
    uploadAiMediaInput(duplicateClient, prepared, PNG_BYTES),
    (error) => assertAiError(error, "upload_failed"),
  );
});

test("starts only the reserved job and validates the acceptance response", async () => {
  const calls = [];
  const client = {
    functions: {
      async invoke(name, input) {
        calls.push({ name, input });
        return { data: { jobId, status: "accepted" }, error: null };
      },
    },
  };

  assert.equal(await startAiMediaJob(client, jobId), "accepted");
  assert.deepEqual(calls, [
    { name: "process-ai-job", input: { body: { jobId } } },
  ]);
});

test("loads a safe job status and preserves only the public error category", async () => {
  const client = {
    from(table) {
      assert.equal(table, "ai_jobs");
      return queryReturning({
        data: {
          completed_at: "2026-08-21T10:00:00.000Z",
          id: jobId,
          processing_started_at: "2026-08-21T09:58:00.000Z",
          public_error_code: "provider_unavailable",
          status: "failed",
        },
        error: null,
      });
    },
  };

  assert.deepEqual(await getAiMediaJob(client, jobId), {
    completedAt: "2026-08-21T10:00:00.000Z",
    id: jobId,
    processingStartedAt: "2026-08-21T09:58:00.000Z",
    publicErrorCode: "provider_unavailable",
    status: "failed",
  });
});

test("creates a short-lived URL for a ready private PNG without using a public URL", async () => {
  const calls = [];
  const client = {
    from(table) {
      if (table === "ai_job_media") {
        return queryReturning({
          data: { media_asset_id: outputAssetId },
          error: null,
        });
      }

      assert.equal(table, "media_assets");
      return queryReturning({
        data: {
          id: outputAssetId,
          mime_type: "image/png",
          status: "ready",
          storage_bucket: "ai-media-private",
          storage_object_path: `${familyId}/output/${outputAssetId}.png`,
        },
        error: null,
      });
    },
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(path, expiresInSeconds) {
            calls.push({ bucket, expiresInSeconds, path });
            return {
              data: { signedUrl: "https://example.invalid/signed-result" },
              error: null,
            };
          },
          getPublicUrl() {
            throw new Error("private AI media must never use a public URL");
          },
        };
      },
    },
  };

  assert.deepEqual(await createAiMediaOutputUrl(client, jobId), {
    expiresInSeconds: 120,
    mimeType: "image/png",
    signedUrl: "https://example.invalid/signed-result",
  });
  assert.deepEqual(calls, [
    {
      bucket: "ai-media-private",
      expiresInSeconds: 120,
      path: `${familyId}/output/${outputAssetId}.png`,
    },
  ]);
});

test("promotes only stable identities and validates the server-owned avatar result", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ name, input });
      return {
        data: [
          {
            avatar_media_asset_id: outputAssetId,
            changed: true,
            child_profile_id: childProfileId,
            previous_avatar_media_asset_id: previousOutputAssetId,
          },
        ],
        error: null,
      };
    },
  };

  assert.deepEqual(
    await setChildProfileAvatarFromAiJob(client, {
      childProfileId: childProfileId.toUpperCase(),
      expectedUserId: expectedUserId.toUpperCase(),
      jobId: jobId.toUpperCase(),
    }),
    {
      avatarMediaAssetId: outputAssetId,
      changed: true,
      childProfileId,
      previousAvatarMediaAssetId: previousOutputAssetId,
    },
  );
  assert.deepEqual(calls, [
    {
      name: "set_child_profile_avatar_from_ai_job",
      input: {
        p_child_profile_id: childProfileId,
        p_expected_user_id: expectedUserId,
        p_job_id: jobId,
      },
    },
  ]);
  assert.equal("storagePath" in calls[0].input, false);
  assert.equal("signedUrl" in calls[0].input, false);
  assert.equal("operationKey" in calls[0].input, false);
});

test("accepts an idempotent avatar promotion and rejects malformed identities before the RPC", async () => {
  let calls = 0;
  const client = {
    async rpc() {
      calls += 1;
      return {
        data: [
          {
            avatar_media_asset_id: outputAssetId,
            changed: false,
            child_profile_id: childProfileId,
            previous_avatar_media_asset_id: null,
          },
        ],
        error: null,
      };
    },
  };

  assert.deepEqual(
    await setChildProfileAvatarFromAiJob(client, {
      childProfileId,
      expectedUserId,
      jobId,
    }),
    {
      avatarMediaAssetId: outputAssetId,
      changed: false,
      childProfileId,
      previousAvatarMediaAssetId: null,
    },
  );

  for (const [patch, code] of [
    [{ childProfileId: "not-a-uuid" }, "invalid_child_profile_id"],
    [{ expectedUserId: "not-a-uuid" }, "invalid_expected_user_id"],
    [{ jobId: "not-a-uuid" }, "job_not_found"],
    [{ jobId: "00000000-0000-0000-0000-000000000000" }, "job_not_found"],
  ]) {
    await assert.rejects(
      setChildProfileAvatarFromAiJob(client, {
        childProfileId,
        expectedUserId,
        jobId,
        ...patch,
      }),
      (error) => assertAiError(error, code),
    );
  }

  assert.equal(calls, 1);
});

test("maps avatar promotion errors without exposing database details", async () => {
  for (const [databaseCode, expectedCode] of [
    ["28000", "session_changed"],
    ["42501", "family_access_denied"],
    ["P0002", "avatar_unavailable"],
    ["XX000", "avatar_update_failed"],
  ]) {
    await assert.rejects(
      setChildProfileAvatarFromAiJob(
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
        { childProfileId, expectedUserId, jobId },
      ),
      (error) => {
        assertAiError(error, expectedCode);
        assert.doesNotMatch(error.message, /database detail/i);
        return true;
      },
    );
  }
});

test("fails closed on a thrown RPC or malformed avatar promotion result", async () => {
  for (const rpc of [
    async () => {
      throw new Error("Synthetic transport detail");
    },
    async () => ({ data: [], error: null }),
    async () => ({
      data: [
        {
          avatar_media_asset_id: outputAssetId,
          changed: true,
          child_profile_id: childProfileId,
          previous_avatar_media_asset_id: outputAssetId,
        },
      ],
      error: null,
    }),
  ]) {
    await assert.rejects(
      setChildProfileAvatarFromAiJob(
        { rpc },
        { childProfileId, expectedUserId, jobId },
      ),
      (error) => assertAiError(error, "avatar_update_failed"),
    );
  }
});

test("returns null for a child that still uses its preset avatar", async () => {
  let storageCalls = 0;
  const client = {
    from(table) {
      assert.equal(table, "child_profiles");
      return queryReturning({
        data: {
          avatar_media_asset_id: null,
          family_id: familyId,
          id: childProfileId,
        },
        error: null,
      });
    },
    storage: {
      from() {
        storageCalls += 1;
        throw new Error("a preset avatar must not mint a Storage URL");
      },
    },
  };

  assert.equal(await loadChildProfileAvatar(client, { childProfileId }), null);
  assert.equal(storageCalls, 0);
});

test("rejects an unsafe avatar URL lifetime before reading private metadata", async () => {
  let tableCalls = 0;
  const client = {
    from() {
      tableCalls += 1;
      throw new Error("invalid expiry must not query private rows");
    },
  };

  for (const expiresInSeconds of [59, 301, 120.5, Number.NaN]) {
    await assert.rejects(
      loadChildProfileAvatar(client, { childProfileId, expiresInSeconds }),
      (error) => assertAiError(error, "avatar_unavailable"),
    );
  }

  assert.equal(tableCalls, 0);
});

test("loads the exact current avatar asset and mints only a private signed URL", async () => {
  const tableCalls = [];
  const signCalls = [];
  const objectPath = `${familyId}/${expectedUserId}/${jobId}/output.png`;
  const client = {
    from(table) {
      tableCalls.push(table);

      if (table === "child_profiles") {
        return queryReturning({
          data: {
            avatar_media_asset_id: outputAssetId,
            family_id: familyId,
            id: childProfileId,
          },
          error: null,
        });
      }

      assert.equal(table, "media_assets");
      return queryReturning({
        data: {
          asset_role: "generated_output",
          child_profile_id: childProfileId,
          deleted_at: null,
          family_id: familyId,
          id: outputAssetId,
          mime_type: "image/png",
          status: "ready",
          storage_bucket: "ai-media-private",
          storage_object_path: objectPath,
          subject_kind: "child",
        },
        error: null,
      });
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "ai-media-private");
        return {
          async createSignedUrl(path, expiresInSeconds) {
            signCalls.push({ expiresInSeconds, path });
            return {
              data: { signedUrl: "https://example.invalid/signed-avatar" },
              error: null,
            };
          },
          getPublicUrl() {
            throw new Error("a child avatar must never use a public URL");
          },
        };
      },
    },
  };

  assert.deepEqual(
    await loadChildProfileAvatar(client, {
      childProfileId,
      expiresInSeconds: 180,
    }),
    {
      childProfileId,
      expiresInSeconds: 180,
      mediaAssetId: outputAssetId,
      mimeType: "image/png",
      signedUrl: "https://example.invalid/signed-avatar",
    },
  );
  assert.deepEqual(tableCalls, ["child_profiles", "media_assets"]);
  assert.deepEqual(signCalls, [{ expiresInSeconds: 180, path: objectPath }]);
});

test("fails closed when current avatar metadata is not the exact ready child PNG", async () => {
  for (const assetPatch of [
    { child_profile_id: "30000000-0000-4000-8000-000000000002" },
    { family_id: "20000000-0000-4000-8000-000000000002" },
    { subject_kind: "adult_test" },
    { asset_role: "reference_input" },
    { status: "deleted", deleted_at: "2026-08-24T08:00:00.000Z" },
    { mime_type: "image/jpeg" },
    { storage_bucket: "wardrobe-images" },
  ]) {
    let signCalls = 0;
    const client = {
      from(table) {
        if (table === "child_profiles") {
          return queryReturning({
            data: {
              avatar_media_asset_id: outputAssetId,
              family_id: familyId,
              id: childProfileId,
            },
            error: null,
          });
        }

        return queryReturning({
          data: {
            asset_role: "generated_output",
            child_profile_id: childProfileId,
            deleted_at: null,
            family_id: familyId,
            id: outputAssetId,
            mime_type: "image/png",
            status: "ready",
            storage_bucket: "ai-media-private",
            storage_object_path: `${familyId}/output.png`,
            subject_kind: "child",
            ...assetPatch,
          },
          error: null,
        });
      },
      storage: {
        from() {
          signCalls += 1;
          throw new Error("invalid metadata must not reach Storage");
        },
      },
    };

    await assert.rejects(
      loadChildProfileAvatar(client, { childProfileId }),
      (error) => assertAiError(error, "avatar_unavailable"),
    );
    assert.equal(signCalls, 0);
  }
});
