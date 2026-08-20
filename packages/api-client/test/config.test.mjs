import assert from "node:assert/strict";
import test from "node:test";

import { parsePublicSupabaseConfig } from "../src/index.ts";

test("accepts hosted publishable client configuration", () => {
  assert.deepEqual(
    parsePublicSupabaseConfig({
      url: "https://demo.supabase.co/",
      publishableKey: "sb_publishable_demo",
    }),
    {
      url: "https://demo.supabase.co",
      publishableKey: "sb_publishable_demo",
    },
  );
});

test("accepts the local CLI endpoint", () => {
  assert.equal(
    parsePublicSupabaseConfig({
      url: "http://127.0.0.1:54321",
      publishableKey: "local-anon-key",
    }).url,
    "http://127.0.0.1:54321",
  );
});

test("rejects elevated keys", () => {
  assert.throws(
    () =>
      parsePublicSupabaseConfig({
        url: "https://demo.supabase.co",
        publishableKey: "sb_secret_never-in-a-client",
      }),
    /secret key/,
  );
});
