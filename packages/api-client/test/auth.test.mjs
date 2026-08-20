import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthFlowError,
  completeAuthCallback,
  createAuthStorageKey,
  logout,
  onAuthSessionChange,
  parseAuthCallbackUrl,
  requestEmailSignIn,
  restoreSession,
  verifyEmailOtp,
} from "../src/index.ts";

const syntheticSession = Object.freeze({
  user: { id: "00000000-0000-0000-0000-000000000001" },
});

function assertAuthFlowError(error, code) {
  assert.ok(error instanceof AuthFlowError);
  assert.equal(error.code, code);
  return true;
}

test("requests email sign-in for an existing account without creating a user", async () => {
  const calls = [];
  const client = {
    auth: {
      async signInWithOtp(input) {
        calls.push(input);
        return { data: { user: null, session: null }, error: null };
      },
    },
  };

  const result = await requestEmailSignIn(client, {
    email: "  admin@example.invalid  ",
    redirectTo: "  https://admin.example.invalid/auth/callback  ",
    accountPolicy: "existing-only",
  });

  assert.deepEqual(result, { email: "admin@example.invalid" });
  assert.deepEqual(calls, [
    {
      email: "admin@example.invalid",
      options: {
        emailRedirectTo: "https://admin.example.invalid/auth/callback",
        shouldCreateUser: false,
      },
    },
  ]);
});

test("requires an explicit create-if-needed policy for parent sign-up", async () => {
  const calls = [];
  const client = {
    auth: {
      async signInWithOtp(input) {
        calls.push(input);
        return { data: { user: null, session: null }, error: null };
      },
    },
  };

  await requestEmailSignIn(client, {
    email: "parent@example.invalid",
    redirectTo: "baretraen-dev://auth/callback",
    accountPolicy: "create-if-needed",
  });

  assert.equal(calls[0].options.shouldCreateUser, true);

  await assert.rejects(
    requestEmailSignIn(client, {
      email: "parent@example.invalid",
      redirectTo: "baretraen-dev://auth/callback",
      accountPolicy: undefined,
    }),
    (error) => assertAuthFlowError(error, "invalid_account_policy"),
  );
  assert.equal(calls.length, 1);
});

test("rejects malformed and overlong email input before making a request", async () => {
  let requestCount = 0;
  const client = {
    auth: {
      async signInWithOtp() {
        requestCount += 1;
        return { data: { user: null, session: null }, error: null };
      },
    },
  };
  const baseInput = {
    redirectTo: "https://admin.example.invalid/auth/callback",
    accountPolicy: "existing-only",
  };

  for (const email of [
    "   ",
    "not-an-email",
    "two@@example.invalid",
    "adult @example.invalid",
    "adult@\nexample.invalid",
    "a".repeat(255),
  ]) {
    await assert.rejects(
      requestEmailSignIn(client, { ...baseInput, email }),
      (error) => assertAuthFlowError(error, "invalid_email"),
    );
  }

  assert.equal(requestCount, 0);
});

test("passes an optional CAPTCHA token and validates it before requesting mail", async () => {
  const calls = [];
  const client = {
    auth: {
      async signInWithOtp(input) {
        calls.push(input);
        return { data: { user: null, session: null }, error: null };
      },
    },
  };
  const baseInput = {
    email: "parent@example.invalid",
    redirectTo: "baretraen-dev://auth/callback",
    accountPolicy: "create-if-needed",
  };

  await requestEmailSignIn(client, {
    ...baseInput,
    captchaToken: "synthetic-captcha-token",
  });
  assert.equal(calls[0].options.captchaToken, "synthetic-captcha-token");

  for (const captchaToken of ["contains space", "x".repeat(4_097)]) {
    await assert.rejects(
      requestEmailSignIn(client, { ...baseInput, captchaToken }),
      (error) => assertAuthFlowError(error, "invalid_captcha_token"),
    );
  }
  assert.equal(calls.length, 1);
});

test("accepts only configured callback shapes as email redirect targets", async () => {
  const redirects = [];
  const client = {
    auth: {
      async signInWithOtp({ options }) {
        redirects.push(options.emailRedirectTo);
        return { data: { user: null, session: null }, error: null };
      },
    },
  };

  for (const redirectTo of [
    "https://admin.example.invalid/auth/callback",
    "http://localhost:11000/auth/callback",
    "http://127.0.0.1:11001/auth/callback",
    "baretraen-dev://auth/callback",
    "baretraen-preview://auth/callback",
    "baretraen://auth/callback",
  ]) {
    await requestEmailSignIn(client, {
      email: "adult@example.invalid",
      redirectTo,
      accountPolicy: "existing-only",
    });
  }

  assert.deepEqual(redirects, [
    "https://admin.example.invalid/auth/callback",
    "http://localhost:11000/auth/callback",
    "http://127.0.0.1:11001/auth/callback",
    "baretraen-dev://auth/callback",
    "baretraen-preview://auth/callback",
    "baretraen://auth/callback",
  ]);

  for (const redirectTo of [
    "http://admin.example.invalid/auth/callback",
    "http://localhost:3000/auth/callback",
    "https://admin.example.invalid/other",
    "https://user:pass@admin.example.invalid/auth/callback",
    "https://admin.example.invalid/auth/callback?next=/",
    "https://admin.example.invalid/auth/callback#fragment",
    "unknown://auth/callback",
    "baretraen-dev://wrong/callback",
  ]) {
    await assert.rejects(
      requestEmailSignIn(client, {
        email: "adult@example.invalid",
        redirectTo,
        accountPolicy: "existing-only",
      }),
      (error) => assertAuthFlowError(error, "invalid_redirect_url"),
      redirectTo,
    );
  }
});

test("propagates the Supabase request error without wrapping it", async () => {
  const upstreamError = new Error("Synthetic upstream failure.");
  const client = {
    auth: {
      async signInWithOtp() {
        return {
          data: { user: null, session: null },
          error: upstreamError,
        };
      },
    },
  };

  await assert.rejects(
    requestEmailSignIn(client, {
      email: "adult@example.invalid",
      redirectTo: "baretraen-dev://auth/callback",
      accountPolicy: "existing-only",
    }),
    (error) => error === upstreamError,
  );
});

test("normalizes and verifies exactly six ASCII OTP digits", async () => {
  const calls = [];
  const client = {
    auth: {
      async verifyOtp(input) {
        calls.push(input);
        return {
          data: { user: syntheticSession.user, session: syntheticSession },
          error: null,
        };
      },
    },
  };

  const result = await verifyEmailOtp(client, {
    email: "  adult@example.invalid ",
    code: "12 34\n56",
  });

  assert.equal(result, syntheticSession);
  assert.deepEqual(calls, [
    {
      email: "adult@example.invalid",
      token: "123456",
      type: "email",
    },
  ]);

  for (const code of ["12345", "1234567", "12345a", "١٢٣٤٥٦", "12-34-56"]) {
    await assert.rejects(
      verifyEmailOtp(client, {
        email: "adult@example.invalid",
        code,
      }),
      (error) => assertAuthFlowError(error, "invalid_otp"),
      code,
    );
  }

  assert.equal(calls.length, 1);
});

test("requires a session after OTP verification and preserves upstream errors", async () => {
  const upstreamError = new Error("Synthetic verification failure.");
  const missingSessionClient = {
    auth: {
      async verifyOtp() {
        return { data: { user: null, session: null }, error: null };
      },
    },
  };
  const errorClient = {
    auth: {
      async verifyOtp() {
        return {
          data: { user: null, session: null },
          error: upstreamError,
        };
      },
    },
  };
  const input = { email: "adult@example.invalid", code: "123456" };

  await assert.rejects(verifyEmailOtp(missingSessionClient, input), (error) =>
    assertAuthFlowError(error, "missing_session"),
  );
  await assert.rejects(
    verifyEmailOtp(errorClient, input),
    (error) => error === upstreamError,
  );
});

test("parses exact HTTPS, loopback, and app-scheme PKCE callbacks", () => {
  assert.deepEqual(
    parseAuthCallbackUrl({
      callbackUrl:
        "https://admin.example.invalid/auth/callback?code=callback-code",
      expectedRedirectTo: "https://admin.example.invalid/auth/callback",
    }),
    { code: "callback-code" },
  );

  assert.deepEqual(
    parseAuthCallbackUrl({
      callbackUrl:
        "http://localhost:11000/auth/callback?code=callback-code&sb_flow_id=flow-123",
      expectedRedirectTo: "http://localhost:11000/auth/callback",
    }),
    { code: "callback-code", flowId: "flow-123" },
  );

  for (const scheme of ["baretraen-dev", "baretraen-preview", "baretraen"]) {
    assert.deepEqual(
      parseAuthCallbackUrl({
        callbackUrl: `${scheme}://auth/callback?code=callback-code&sb_flow_id=flow_123`,
        expectedRedirectTo: `${scheme}://auth/callback`,
      }),
      { code: "callback-code", flowId: "flow_123" },
    );
  }
});

test("rejects callback target mismatches exactly", () => {
  const expectedRedirectTo = "https://admin.example.invalid/auth/callback";

  for (const callbackUrl of [
    "https://other.example.invalid/auth/callback?code=callback-code",
    "https://admin.example.invalid:444/auth/callback?code=callback-code",
    "https://admin.example.invalid/auth/callback/?code=callback-code",
    "baretraen-dev://auth/callback?code=callback-code",
  ]) {
    assert.throws(
      () => parseAuthCallbackUrl({ callbackUrl, expectedRedirectTo }),
      (error) => assertAuthFlowError(error, "callback_target_mismatch"),
      callbackUrl,
    );
  }
});

test("rejects malformed, implicit-token, duplicate, and rejected callbacks", () => {
  const expectedRedirectTo = "https://admin.example.invalid/auth/callback";
  const cases = [
    ["https://admin.example.invalid/auth/callback", "missing_callback_code"],
    [
      "https://admin.example.invalid/auth/callback?code=one&code=two",
      "invalid_callback_code",
    ],
    [
      "https://admin.example.invalid/auth/callback?code=callback-code&sb_flow_id=one&sb_flow_id=two",
      "invalid_callback_code",
    ],
    [
      "https://admin.example.invalid/auth/callback?code=callback-code&sb_flow_id=not%20safe",
      "invalid_callback_code",
    ],
    [
      "https://admin.example.invalid/auth/callback?code=callback-code&access_token=synthetic",
      "invalid_callback_url",
    ],
    [
      "https://admin.example.invalid/auth/callback?code=callback-code#access_token=synthetic",
      "invalid_callback_url",
    ],
    [
      "https://admin.example.invalid/auth/callback?error=access_denied",
      "callback_rejected",
    ],
  ];

  for (const [callbackUrl, code] of cases) {
    assert.throws(
      () => parseAuthCallbackUrl({ callbackUrl, expectedRedirectTo }),
      (error) => assertAuthFlowError(error, code),
      callbackUrl,
    );
  }

  const marker = "do-not-reflect-this-value";
  assert.throws(
    () =>
      parseAuthCallbackUrl({
        callbackUrl: `${expectedRedirectTo}?error=denied&error_description=${marker}`,
        expectedRedirectTo,
      }),
    (error) => {
      assertAuthFlowError(error, "callback_rejected");
      assert.equal(error.message.includes(marker), false);
      return true;
    },
  );
});

test("bounds callback URLs, codes, and flow identifiers", () => {
  const expectedRedirectTo = "https://admin.example.invalid/auth/callback";

  assert.throws(
    () =>
      parseAuthCallbackUrl({
        callbackUrl: `${expectedRedirectTo}?code=${"a".repeat(2_049)}`,
        expectedRedirectTo,
      }),
    (error) => assertAuthFlowError(error, "invalid_callback_code"),
  );
  assert.throws(
    () =>
      parseAuthCallbackUrl({
        callbackUrl: `${expectedRedirectTo}?code=callback-code&sb_flow_id=${"a".repeat(7)}`,
        expectedRedirectTo,
      }),
    (error) => assertAuthFlowError(error, "invalid_callback_code"),
  );
  assert.deepEqual(
    parseAuthCallbackUrl({
      callbackUrl: `${expectedRedirectTo}?code=callback-code&sb_flow_id=${"a".repeat(64)}`,
      expectedRedirectTo,
    }),
    { code: "callback-code", flowId: "a".repeat(64) },
  );
  assert.throws(
    () =>
      parseAuthCallbackUrl({
        callbackUrl: `${expectedRedirectTo}?code=callback-code&sb_flow_id=${"a".repeat(65)}`,
        expectedRedirectTo,
      }),
    (error) => assertAuthFlowError(error, "invalid_callback_code"),
  );
  assert.throws(
    () =>
      parseAuthCallbackUrl({
        callbackUrl: "x".repeat(8_193),
        expectedRedirectTo,
      }),
    (error) => assertAuthFlowError(error, "invalid_callback_url"),
  );
});

test("exchanges callback codes with and without the reserved flow id", async () => {
  const calls = [];
  const client = {
    auth: {
      async exchangeCodeForSession(...args) {
        calls.push(args);
        return {
          data: { user: syntheticSession.user, session: syntheticSession },
          error: null,
        };
      },
    },
  };

  assert.equal(
    await completeAuthCallback(client, { code: "callback-code" }),
    syntheticSession,
  );
  assert.equal(
    await completeAuthCallback(client, {
      code: "callback-code",
      flowId: "flow-123",
    }),
    syntheticSession,
  );
  assert.deepEqual(calls, [
    ["callback-code"],
    ["callback-code", { flowId: "flow-123" }],
  ]);
});

test("validates callback exchange input and requires a resulting session", async () => {
  let exchangeCount = 0;
  const missingSessionClient = {
    auth: {
      async exchangeCodeForSession() {
        exchangeCount += 1;
        return { data: { user: null, session: null }, error: null };
      },
    },
  };

  await assert.rejects(
    completeAuthCallback(missingSessionClient, { code: "" }),
    (error) => assertAuthFlowError(error, "invalid_callback_code"),
  );
  await assert.rejects(
    completeAuthCallback(missingSessionClient, {
      code: "callback-code",
      flowId: "not safe",
    }),
    (error) => assertAuthFlowError(error, "invalid_callback_code"),
  );
  assert.equal(exchangeCount, 0);

  await assert.rejects(
    completeAuthCallback(missingSessionClient, { code: "callback-code" }),
    (error) => assertAuthFlowError(error, "missing_session"),
  );
  assert.equal(exchangeCount, 1);

  const upstreamError = new Error("Synthetic exchange failure.");
  await assert.rejects(
    completeAuthCallback(
      {
        auth: {
          async exchangeCodeForSession() {
            return {
              data: { user: null, session: null },
              error: upstreamError,
            };
          },
        },
      },
      { code: "callback-code" },
    ),
    (error) => error === upstreamError,
  );
});

test("restores a stored client session or null and preserves errors", async () => {
  for (const session of [syntheticSession, null]) {
    assert.equal(
      await restoreSession({
        auth: {
          async getSession() {
            return { data: { session }, error: null };
          },
        },
      }),
      session,
    );
  }

  const upstreamError = new Error("Synthetic restore failure.");
  await assert.rejects(
    restoreSession({
      auth: {
        async getSession() {
          return { data: { session: null }, error: upstreamError };
        },
      },
    }),
    (error) => error === upstreamError,
  );
});

test("subscribes synchronously and exposes an unsubscribe cleanup", () => {
  let callback;
  let unsubscribeCount = 0;
  const observed = [];
  const cleanup = onAuthSessionChange(
    {
      auth: {
        onAuthStateChange(nextCallback) {
          callback = nextCallback;
          return {
            data: {
              subscription: {
                unsubscribe() {
                  unsubscribeCount += 1;
                },
              },
            },
          };
        },
      },
    },
    (event, session) => {
      observed.push([event, session]);
    },
  );

  assert.equal(callback("SIGNED_IN", syntheticSession), undefined);
  assert.deepEqual(observed, [["SIGNED_IN", syntheticSession]]);
  cleanup();
  assert.equal(unsubscribeCount, 1);
});

test("logs out only the current client session and preserves errors", async () => {
  const calls = [];
  await logout({
    auth: {
      async signOut(options) {
        calls.push(options);
        return { error: null };
      },
    },
  });
  assert.deepEqual(calls, [{ scope: "local" }]);

  const upstreamError = new Error("Synthetic logout failure.");
  await assert.rejects(
    logout({
      auth: {
        async signOut() {
          return { error: upstreamError };
        },
      },
    }),
    (error) => error === upstreamError,
  );
});

test("builds deterministic, unique, cookie-safe storage namespaces", () => {
  const surfaces = ["admin", "mobile"];
  const variants = ["development", "preview", "production"];
  const backends = ["local", "development", "preview", "production"];
  const keys = [];

  for (const surface of surfaces) {
    for (const appVariant of variants) {
      for (const backend of backends) {
        const scope = { surface, appVariant, backend };
        const key = createAuthStorageKey(scope);
        keys.push(key);
        assert.equal(createAuthStorageKey(scope), key);
        assert.match(key, /^[a-z0-9-]+$/);
      }
    }
  }

  assert.equal(new Set(keys).size, keys.length);
  assert.equal(
    createAuthStorageKey({
      surface: "admin",
      appVariant: "development",
      backend: "local",
    }),
    "bt-auth-v1-admin-development-local",
  );
});

test("rejects values outside every closed storage-scope enum", () => {
  for (const scope of [
    { surface: "worker", appVariant: "development", backend: "local" },
    { surface: "admin", appVariant: "staging", backend: "local" },
    {
      surface: "admin",
      appVariant: "development",
      backend: "hosted-development",
    },
  ]) {
    assert.throws(
      () => createAuthStorageKey(scope),
      (error) => assertAuthFlowError(error, "invalid_storage_scope"),
    );
  }
});
