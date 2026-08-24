import assert from "node:assert/strict";
import test from "node:test";

import {
  ChildTopicPortraitError,
  loadChildTopicPortrait,
  prepareChildTopicBasePortrait,
  prepareChildTopicWardrobeRender,
  setChildTopicWardrobeItemEquippedAndPrepareRender,
} from "../src/child-topic-portrait.ts";

const expectedUserId = "10000000-0000-4000-8000-000000000001";
const familyId = "20000000-0000-4000-8000-000000000001";
const childProfileId = "30000000-0000-4000-8000-000000000001";
const topicId = "40000000-0000-4000-8000-000000000001";
const wardrobeItemId = "50000000-0000-4000-8000-000000000001";
const secondWardrobeItemId = "50000000-0000-4000-8000-000000000002";
const clientRequestId = "60000000-0000-4000-8000-000000000001";
const baseJobId = "70000000-0000-4000-8000-000000000001";
const wardrobeJobId = "70000000-0000-4000-8000-000000000002";
const sourceMediaAssetId = "80000000-0000-4000-8000-000000000001";
const baseMediaAssetId = "80000000-0000-4000-8000-000000000002";
const wardrobeMediaAssetId = "80000000-0000-4000-8000-000000000003";
const emptyFingerprint =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const equipmentFingerprint = "1".repeat(64);
const updatedAt = "2026-08-24T12:00:00.000Z";
const acquiredAt = "2026-08-24T10:00:00.000Z";
const equippedAt = "2026-08-24T11:00:00.000Z";

const portraitPath = (jobId) =>
  `${familyId}/children/${childProfileId}/topics/${topicId}/portraits/${jobId}/output.png`;

function assertPortraitError(error, code) {
  assert.ok(error instanceof ChildTopicPortraitError);
  assert.equal(error.code, code);
  return true;
}

function baseInput(patch = {}) {
  return {
    childProfileId,
    clientRequestId,
    expectedUserId,
    familyId,
    topicId,
    ...patch,
  };
}

function aiWardrobeRow(patch = {}) {
  return {
    base_media_asset_id: baseMediaAssetId,
    created: true,
    equipment_fingerprint: equipmentFingerprint,
    equipped_wardrobe_item_ids: [wardrobeItemId, secondWardrobeItemId],
    job_id: wardrobeJobId,
    job_status: "awaiting_upload",
    output_media_asset_id: wardrobeMediaAssetId,
    render_error_code: null,
    render_mode: "ai_job",
    ...patch,
  };
}

test("prepares an immutable base from server-owned topic-photo lineage", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ args, name });
      return {
        data: [
          {
            created: true,
            job_id: baseJobId,
            job_status: "awaiting_upload",
            output_media_asset_id: baseMediaAssetId,
            source_reference_media_asset_id: sourceMediaAssetId,
          },
        ],
        error: null,
      };
    },
  };

  assert.deepEqual(
    await prepareChildTopicBasePortrait(client, {
      ...baseInput(),
      childProfileId: childProfileId.toUpperCase(),
      familyId: familyId.toUpperCase(),
    }),
    {
      created: true,
      jobId: baseJobId,
      jobStatus: "awaiting_upload",
      outputMediaAssetId: baseMediaAssetId,
      sourceReferenceMediaAssetId: sourceMediaAssetId,
    },
  );
  assert.deepEqual(calls, [
    {
      args: {
        p_child_profile_id: childProfileId,
        p_client_request_id: clientRequestId,
        p_expected_user_id: expectedUserId,
        p_family_id: familyId,
        p_topic_id: topicId,
      },
      name: "prepare_child_topic_base_portrait",
    },
  ]);
  assert.equal("prompt" in calls[0].args, false);
  assert.equal("model" in calls[0].args, false);
  assert.equal("storage_path" in calls[0].args, false);
});

test("equips one owned item and returns the complete captured wardrobe render", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ args, name });
      return {
        data: [
          {
            ...aiWardrobeRow(),
            acquired_at: acquiredAt,
            child_profile_id: childProfileId,
            equip_slot: "head",
            equipped_at: equippedAt,
            is_equipped: true,
            wardrobe_item_id: wardrobeItemId,
          },
        ],
        error: null,
      };
    },
  };

  assert.deepEqual(
    await setChildTopicWardrobeItemEquippedAndPrepareRender(client, {
      ...baseInput(),
      equipped: true,
      wardrobeItemId,
    }),
    {
      equipment: {
        acquiredAt,
        childProfileId,
        equipSlot: "head",
        equippedAt,
        isEquipped: true,
        wardrobeItemId,
      },
      render: {
        baseMediaAssetId,
        created: true,
        equipmentFingerprint,
        equippedWardrobeItemIds: [wardrobeItemId, secondWardrobeItemId],
        errorCode: null,
        jobId: wardrobeJobId,
        jobStatus: "awaiting_upload",
        mode: "ai_job",
        outputMediaAssetId: wardrobeMediaAssetId,
      },
    },
  );
  assert.deepEqual(calls[0], {
    args: {
      p_child_profile_id: childProfileId,
      p_client_request_id: clientRequestId,
      p_equipped: true,
      p_expected_user_id: expectedUserId,
      p_family_id: familyId,
      p_topic_id: topicId,
      p_wardrobe_item_id: wardrobeItemId,
    },
    name: "set_child_topic_wardrobe_item_equipped_and_prepare_render",
  });
});

test("keeps the equipment choice explicit when a catalogue image is unavailable", async () => {
  const client = {
    async rpc() {
      return {
        data: [
          {
            ...aiWardrobeRow({
              job_id: null,
              job_status: null,
              output_media_asset_id: null,
              render_error_code: "catalogue_image_missing",
              render_mode: "stale",
            }),
            acquired_at: acquiredAt,
            child_profile_id: childProfileId,
            equip_slot: "head",
            equipped_at: equippedAt,
            is_equipped: true,
            wardrobe_item_id: wardrobeItemId,
          },
        ],
        error: null,
      };
    },
  };

  const result = await setChildTopicWardrobeItemEquippedAndPrepareRender(
    client,
    { ...baseInput(), equipped: true, wardrobeItemId },
  );
  assert.equal(result.equipment.isEquipped, true);
  assert.equal(result.render.mode, "stale");
  assert.equal(result.render.errorCode, "catalogue_image_missing");
  assert.equal(result.render.jobId, null);
});

test("prepares the current equipped set independently without a fake item mutation", async () => {
  const calls = [];
  const client = {
    async rpc(name, args) {
      calls.push({ args, name });
      return { data: [aiWardrobeRow()], error: null };
    },
  };

  assert.equal(
    (await prepareChildTopicWardrobeRender(client, baseInput())).jobId,
    wardrobeJobId,
  );
  assert.deepEqual(calls, [
    {
      args: {
        p_child_profile_id: childProfileId,
        p_client_request_id: clientRequestId,
        p_expected_user_id: expectedUserId,
        p_family_id: familyId,
        p_topic_id: topicId,
      },
      name: "prepare_child_topic_wardrobe_render",
    },
  ]);
});

test("loads and signs the immutable base and latest derived look separately", async () => {
  const signCalls = [];
  const row = {
    base_job_id: baseJobId,
    base_media_asset_id: baseMediaAssetId,
    base_source_media_asset_id: sourceMediaAssetId,
    base_storage_bucket: "ai-media-private",
    base_storage_object_path: portraitPath(baseJobId),
    child_profile_id: childProfileId,
    current_reference_media_asset_id: sourceMediaAssetId,
    display_equipment_fingerprint: equipmentFingerprint,
    display_job_id: wardrobeJobId,
    display_kind: "wardrobe",
    display_media_asset_id: wardrobeMediaAssetId,
    display_storage_bucket: "ai-media-private",
    display_storage_object_path: portraitPath(wardrobeJobId),
    display_wardrobe_item_ids: [wardrobeItemId],
    family_id: familyId,
    has_live_equipment_render_attempt: true,
    is_base_stale: false,
    is_look_stale: true,
    live_equipment_fingerprint: "2".repeat(64),
    live_wardrobe_item_ids: [wardrobeItemId, secondWardrobeItemId],
    pending_job_id: wardrobeJobId,
    pending_job_status: "processing",
    pending_public_error_code: null,
    topic_id: topicId,
    updated_at: updatedAt,
  };
  const client = {
    async rpc() {
      return { data: [row], error: null };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "ai-media-private");
        return {
          async createSignedUrl(path, expiresInSeconds) {
            signCalls.push({ expiresInSeconds, path });
            return {
              data: {
                signedUrl: `https://example.invalid/${signCalls.length}`,
              },
              error: null,
            };
          },
        };
      },
    },
  };

  const state = await loadChildTopicPortrait(client, {
    childProfileId,
    expectedUserId,
    familyId,
    signedUrlExpiresInSeconds: 180,
    topicId,
  });
  assert.equal(state.base.mediaAssetId, baseMediaAssetId);
  assert.equal(state.currentLook.mediaAssetId, wardrobeMediaAssetId);
  assert.equal(state.hasLiveEquipmentRenderAttempt, true);
  assert.equal(state.isBaseStale, false);
  assert.equal(state.isLookStale, true);
  assert.deepEqual(state.liveWardrobeItemIds, [
    wardrobeItemId,
    secondWardrobeItemId,
  ]);
  assert.deepEqual(state.pendingJob, {
    id: wardrobeJobId,
    publicErrorCode: null,
    status: "processing",
  });
  assert.deepEqual(signCalls, [
    { expiresInSeconds: 180, path: portraitPath(baseJobId) },
    { expiresInSeconds: 180, path: portraitPath(wardrobeJobId) },
  ]);
});

test("reuses one signed base URL when the zero-item base is the current look", async () => {
  let signed = 0;
  const client = {
    async rpc() {
      return {
        data: [
          {
            base_job_id: baseJobId,
            base_media_asset_id: baseMediaAssetId,
            base_source_media_asset_id: sourceMediaAssetId,
            base_storage_bucket: "ai-media-private",
            base_storage_object_path: portraitPath(baseJobId),
            child_profile_id: childProfileId,
            current_reference_media_asset_id: null,
            display_equipment_fingerprint: emptyFingerprint,
            display_job_id: baseJobId,
            display_kind: "base",
            display_media_asset_id: baseMediaAssetId,
            display_storage_bucket: "ai-media-private",
            display_storage_object_path: portraitPath(baseJobId),
            display_wardrobe_item_ids: [],
            family_id: familyId,
            has_live_equipment_render_attempt: false,
            is_base_stale: false,
            is_look_stale: false,
            live_equipment_fingerprint: emptyFingerprint,
            live_wardrobe_item_ids: [],
            pending_job_id: null,
            pending_job_status: null,
            pending_public_error_code: null,
            topic_id: topicId,
            updated_at: updatedAt,
          },
        ],
        error: null,
      };
    },
    storage: {
      from() {
        return {
          async createSignedUrl() {
            signed += 1;
            return {
              data: { signedUrl: "https://example.invalid/base" },
              error: null,
            };
          },
        };
      },
    },
  };

  const state = await loadChildTopicPortrait(client, {
    childProfileId,
    expectedUserId,
    familyId,
    topicId,
  });
  assert.equal(signed, 1);
  assert.equal(state.currentLook, state.base);
  assert.equal(state.currentReferenceMediaAssetId, null);
  assert.equal(state.isBaseStale, false);
});

test("fails closed on malformed render modes, lineage, paths, and identifiers", async () => {
  for (const row of [
    aiWardrobeRow({ render_mode: "base" }),
    aiWardrobeRow({ equipped_wardrobe_item_ids: [] }),
    aiWardrobeRow({ equipment_fingerprint: "unsafe" }),
    aiWardrobeRow({ render_error_code: "catalogue_image_missing" }),
  ]) {
    await assert.rejects(
      prepareChildTopicWardrobeRender(
        {
          async rpc() {
            return { data: [row], error: null };
          },
        },
        baseInput(),
      ),
      (error) => assertPortraitError(error, "invalid_portrait_result"),
    );
  }

  await assert.rejects(
    loadChildTopicPortrait(
      {
        async rpc() {
          return {
            data: [
              {
                base_job_id: baseJobId,
                base_media_asset_id: baseMediaAssetId,
                base_source_media_asset_id: sourceMediaAssetId,
                base_storage_bucket: "ai-media-private",
                base_storage_object_path: `${familyId}/wrong.png`,
                child_profile_id: childProfileId,
                current_reference_media_asset_id: sourceMediaAssetId,
                display_equipment_fingerprint: emptyFingerprint,
                display_job_id: baseJobId,
                display_kind: "base",
                display_media_asset_id: baseMediaAssetId,
                display_storage_bucket: "ai-media-private",
                display_storage_object_path: `${familyId}/wrong.png`,
                display_wardrobe_item_ids: [],
                family_id: familyId,
                has_live_equipment_render_attempt: false,
                is_base_stale: false,
                is_look_stale: false,
                live_equipment_fingerprint: emptyFingerprint,
                live_wardrobe_item_ids: [],
                pending_job_id: null,
                pending_job_status: null,
                pending_public_error_code: null,
                topic_id: topicId,
                updated_at: updatedAt,
              },
            ],
            error: null,
          };
        },
        storage: {
          from() {
            throw new Error("invalid path must not sign");
          },
        },
      },
      { childProfileId, expectedUserId, familyId, topicId },
    ),
    (error) => assertPortraitError(error, "invalid_portrait_result"),
  );
});

test("validates inputs and maps guarded database failures without leaking details", async () => {
  let calls = 0;
  const client = {
    async rpc() {
      calls += 1;
      return { data: [], error: null };
    },
  };
  for (const [patch, code] of [
    [{ childProfileId: "invalid" }, "invalid_child_profile_id"],
    [{ clientRequestId: "invalid" }, "invalid_client_request_id"],
    [{ expectedUserId: "invalid" }, "invalid_expected_user_id"],
    [{ familyId: "invalid" }, "invalid_family_id"],
    [{ topicId: "invalid" }, "invalid_topic_id"],
  ]) {
    await assert.rejects(
      prepareChildTopicBasePortrait(client, baseInput(patch)),
      (error) => assertPortraitError(error, code),
    );
  }
  assert.equal(calls, 0);

  for (const [databaseCode, expectedCode] of [
    ["28000", "session_changed"],
    ["42501", "family_access_denied"],
    ["P0002", "portrait_unavailable"],
    ["54000", "daily_limit_reached"],
    ["XX000", "portrait_preparation_failed"],
  ]) {
    await assert.rejects(
      prepareChildTopicBasePortrait(
        {
          async rpc() {
            return {
              data: null,
              error: { code: databaseCode, message: "private database detail" },
            };
          },
        },
        baseInput(),
      ),
      (error) => {
        assertPortraitError(error, expectedCode);
        assert.doesNotMatch(error.message, /database detail/i);
        return true;
      },
    );
  }
});
