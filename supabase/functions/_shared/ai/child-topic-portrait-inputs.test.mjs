import assert from "node:assert/strict";
import test from "node:test";

import {
  isMissingChildTopicPortraitClaimRpcError,
  parseChildTopicPortraitJobReconciliation,
  parseChildTopicPortraitClaimInputs,
  planChildTopicPortraitClaim,
} from "./child-topic-portrait-inputs.ts";
import { OpenRouterImageError } from "./openrouter-image.ts";

const BASE_PATH =
  "20000000-0000-4000-8000-000000000001/children/30000000-0000-4000-8000-000000000001/topics/40000000-0000-4000-8000-000000000001/portraits/50000000-0000-4000-8000-000000000001/output.png";

test("preserves trusted base-first and catalogue order from the worker claim", () => {
  assert.deepEqual(
    parseChildTopicPortraitClaimInputs([
      {
        bucket: "ai-media-private",
        mime_type: "image/png",
        object_path: BASE_PATH,
        role: "immutable_base_person",
      },
      {
        bucket: "wardrobe-images",
        mime_type: "image/png",
        object_path: "60000000-0000-4000-8000-000000000001/01.png",
        role: "wardrobe_item",
      },
    ]),
    [
      {
        bucket: "ai-media-private",
        mimeType: "image/png",
        objectPath: BASE_PATH,
      },
      {
        bucket: "wardrobe-images",
        mimeType: "image/png",
        objectPath: "60000000-0000-4000-8000-000000000001/01.png",
      },
    ],
  );
});

test("rejects client-like buckets, traversal, catalogue JPEGs, and too many inputs", () => {
  for (const value of [
    [],
    Array.from({ length: 7 }, () => ({
      bucket: "ai-media-private",
      mime_type: "image/png",
      object_path: BASE_PATH,
    })),
    [{ bucket: "avatars", mime_type: "image/png", object_path: BASE_PATH }],
    [
      {
        bucket: "wardrobe-images",
        mime_type: "image/jpeg",
        object_path: "60000000-0000-4000-8000-000000000001/01.png",
      },
    ],
    [
      {
        bucket: "ai-media-private",
        mime_type: "image/png",
        object_path: "family/../another/output.png",
      },
    ],
  ]) {
    assert.throws(
      () => parseChildTopicPortraitClaimInputs(value),
      (error) => {
        assert.ok(error instanceof OpenRouterImageError);
        assert.equal(error.attemptCode, "invalid_claimed_inputs");
        assert.equal(error.publicCode, "server_configuration");
        return true;
      },
    );
  }
});

test("allows rollout fallback only while the additive portrait claim RPC is absent", () => {
  assert.equal(
    isMissingChildTopicPortraitClaimRpcError({ code: "42883" }),
    true,
  );
  assert.equal(
    isMissingChildTopicPortraitClaimRpcError({ code: "PGRST202" }),
    true,
  );
  assert.equal(
    isMissingChildTopicPortraitClaimRpcError({ code: "42501" }),
    false,
  );
  assert.equal(
    isMissingChildTopicPortraitClaimRpcError(new Error("missing")),
    false,
  );
  assert.equal(
    planChildTopicPortraitClaim({
      error: { code: "42883" },
      hasClaimRow: false,
    }),
    "fallback_legacy",
  );
  assert.equal(
    planChildTopicPortraitClaim({
      error: { code: "PGRST202" },
      hasClaimRow: false,
    }),
    "fallback_legacy",
  );
  assert.equal(
    planChildTopicPortraitClaim({
      error: { code: "42501" },
      hasClaimRow: false,
    }),
    "fail_closed",
  );
  assert.equal(
    planChildTopicPortraitClaim({ error: null, hasClaimRow: true }),
    "use_portrait_claim",
  );
  assert.equal(
    planChildTopicPortraitClaim({ error: null, hasClaimRow: false }),
    "inspect_portrait_table",
  );
});

test("accepts only one exact family portrait reconciliation result", () => {
  const jobId = "50000000-0000-4000-8000-000000000001";
  assert.deepEqual(
    parseChildTopicPortraitJobReconciliation(
      [
        {
          job_id: jobId.toUpperCase(),
          job_status: "awaiting_upload",
          may_process: true,
        },
      ],
      jobId,
    ),
    { mayProcess: true, status: "awaiting_upload" },
  );
  assert.deepEqual(
    parseChildTopicPortraitJobReconciliation(
      [{ job_id: jobId, job_status: "cancelled", may_process: false }],
      jobId,
    ),
    { mayProcess: false, status: "cancelled" },
  );
  assert.deepEqual(
    parseChildTopicPortraitJobReconciliation(
      [{ job_id: jobId, job_status: "processing", may_process: true }],
      jobId,
    ),
    { mayProcess: true, status: "processing" },
  );

  for (const value of [
    [],
    [
      { job_id: jobId, job_status: "awaiting_upload", may_process: true },
      { job_id: jobId, job_status: "awaiting_upload", may_process: true },
    ],
    [{ job_id: "invalid", job_status: "awaiting_upload", may_process: true }],
    [{ job_id: jobId, job_status: "unknown", may_process: false }],
    [{ job_id: jobId, job_status: "succeeded", may_process: true }],
  ]) {
    assert.equal(parseChildTopicPortraitJobReconciliation(value, jobId), null);
  }
});
