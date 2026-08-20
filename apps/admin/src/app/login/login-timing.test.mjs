import assert from "node:assert/strict";
import test from "node:test";

import { getResendSeconds } from "./login-timing.ts";

test("starts the resend countdown at sixty seconds without an epoch flash", () => {
  assert.equal(getResendSeconds(null, Date.now()), 0);
  assert.equal(getResendSeconds(1_000, 1_000), 60);
  assert.equal(getResendSeconds(1_000, 1_001), 60);
  assert.equal(getResendSeconds(1_000, 61_000), 0);
  assert.equal(getResendSeconds(1_000, 62_000), 0);
});
