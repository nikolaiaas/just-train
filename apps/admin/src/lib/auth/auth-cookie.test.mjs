import assert from "node:assert/strict";
import test from "node:test";

import { isCurrentAuthCookie } from "./auth-cookie.ts";

test("matches only the selected backend's auth cookie namespace", () => {
  const key = "bt-auth-v1-admin-development-local";

  assert.equal(isCurrentAuthCookie(key, key), true);
  assert.equal(isCurrentAuthCookie(key + ".0", key), true);
  assert.equal(isCurrentAuthCookie(key + "-code-verifier", key), true);
  assert.equal(
    isCurrentAuthCookie("bt-auth-v1-admin-development-development", key),
    false,
  );
  assert.equal(isCurrentAuthCookie("prefix-" + key, key), false);
});
