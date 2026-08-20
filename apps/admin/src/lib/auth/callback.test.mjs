import assert from "node:assert/strict";
import test from "node:test";

import { parseAdminCallback, parseLoginReason } from "./callback.ts";

test("parses one callback code and the optional bounded flow id", () => {
  assert.deepEqual(
    parseAdminCallback(
      "https://admin.example.test/auth/callback?code=synthetic-code",
      "https://admin.example.test",
    ),
    { code: "synthetic-code" },
  );
  assert.deepEqual(
    parseAdminCallback(
      "https://admin.example.test/auth/callback?code=synthetic-code&sb_flow_id=flow_123456",
      "https://admin.example.test",
    ),
    { code: "synthetic-code", flowId: "flow_123456" },
  );
});

test("rejects duplicate, secret-bearing, unknown, and mismatched callbacks", () => {
  for (const callback of [
    "https://admin.example.test/auth/callback?code=one&code=two",
    "https://admin.example.test/auth/callback?code=one&access_token=secret",
    "https://admin.example.test/auth/callback?code=one&next=https://evil.test",
    "https://evil.example.test/auth/callback?code=one",
    "https://admin.example.test/auth/callback?error=denied",
  ]) {
    assert.throws(() =>
      parseAdminCallback(callback, "https://admin.example.test"),
    );
  }
});

test("allows only non-sensitive login reason codes", () => {
  assert.equal(parseLoginReason("link-invalid"), "link-invalid");
  assert.equal(parseLoginReason("signed-out"), "signed-out");
  assert.equal(parseLoginReason("raw-provider-error"), null);
  assert.equal(parseLoginReason(["link-invalid"]), null);
});
