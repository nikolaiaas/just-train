import assert from "node:assert/strict";
import test from "node:test";

import {
  getAiJobErrorMessage,
  getAiPollDelay,
  normalizeAiMediaSubject,
  shouldReconcileAiJob,
} from "../src/ai/core.ts";

test("accepts only the two audited non-child subject labels", () => {
  assert.equal(normalizeAiMediaSubject("synthetic"), "synthetic");
  assert.equal(normalizeAiMediaSubject("adult_test"), "adult_test");
  assert.throws(
    () => normalizeAiMediaSubject("child"),
    /invalid_ai_media_subject/,
  );
});

test("backs polling off and explicitly reconciles a stale worker lease", () => {
  assert.equal(getAiPollDelay(0), 2_000);
  assert.equal(getAiPollDelay(3), 5_000);
  assert.equal(
    shouldReconcileAiJob(
      {
        processingStartedAt: "2026-08-21T09:50:00.000Z",
        status: "processing",
      },
      Date.parse("2026-08-21T09:58:00.000Z"),
    ),
    true,
  );
  assert.equal(
    shouldReconcileAiJob(
      {
        processingStartedAt: "2026-08-21T09:57:00.000Z",
        status: "processing",
      },
      Date.parse("2026-08-21T09:58:00.000Z"),
    ),
    false,
  );
});

test("explains outcome-unknown without promising an automatic retry", () => {
  assert.match(
    getAiJobErrorMessage("provider_outcome_unknown"),
    /uden automatisk genkørsel/,
  );
});
