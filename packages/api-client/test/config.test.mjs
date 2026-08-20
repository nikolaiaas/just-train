import assert from "node:assert/strict";
import test from "node:test";

import {
  createBareTraenClient,
  parsePublicSupabaseConfig,
} from "../src/index.ts";

function syntheticJwt(role) {
  return [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify({ role })).toString("base64url"),
    "synthetic-signature",
  ].join(".");
}

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

  assert.equal(
    parsePublicSupabaseConfig({
      url: "http://localhost:54321/",
      publishableKey: "local-anon-key",
    }).url,
    "http://localhost:54321",
  );
});

test("rejects malformed, credentialed, and non-standard Supabase base URLs", () => {
  for (const url of [
    "ftp://127.0.0.1:54321",
    "http://127.0.0.1:9999",
    "http://127.0.0.1:54321/rest/v1",
    "http://127.0.0.1:54321?target=other",
    "https://user:pass@demo.supabase.co",
    "https://demo.supabase.co/rest/v1",
    "https://demo.supabase.co?target=other",
    "https://demo.supabase.co#fragment",
  ]) {
    assert.throws(
      () =>
        parsePublicSupabaseConfig({
          url,
          publishableKey: "sb_publishable_demo",
        }),
      /clean HTTPS base URL/,
      url,
    );
  }
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

  for (const role of ["service_role", "supabase_admin"]) {
    assert.throws(
      () =>
        parsePublicSupabaseConfig({
          url: "https://demo.supabase.co",
          publishableKey: syntheticJwt(role),
        }),
      /secret key/,
    );
  }

  assert.equal(
    parsePublicSupabaseConfig({
      url: "https://demo.supabase.co",
      publishableKey: syntheticJwt("anon"),
    }).publishableKey,
    syntheticJwt("anon"),
  );

  assert.throws(
    () =>
      parsePublicSupabaseConfig({
        url: "https://demo.supabase.co",
        publishableKey: "x".repeat(8_193),
      }),
    /publishable key is invalid/,
  );
});

test("creates clients with the explicit manual PKCE contract", async () => {
  const client = createBareTraenClient(
    {
      url: "https://demo.supabase.co",
      publishableKey: "sb_publishable_demo",
    },
    {
      auth: {
        autoRefreshToken: false,
        debug: true,
        detectSessionInUrl: true,
        flowType: "implicit",
        persistSession: false,
        storageKey: "bt-auth-v1-admin-development-development",
      },
    },
  );

  assert.equal(client.auth.flowType, "pkce");
  assert.equal(client.auth.detectSessionInUrl, false);
  assert.equal(client.auth.persistSession, true);
  assert.equal(client.auth.autoRefreshToken, true);
  assert.equal(client.auth.logDebugMessages, false);
  assert.equal(
    client.auth.storageKey,
    "bt-auth-v1-admin-development-development",
  );

  await client.auth.dispose();
});
