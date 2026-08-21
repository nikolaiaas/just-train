import assert from "node:assert/strict";
import test from "node:test";

import { createAuthStorageKey } from "@bare-traen/api-client";

import { parseMobileAuthCallbackUrl } from "../src/auth/callback.ts";
import {
  createAuthRedirect,
  normalizeParentOnboarding,
  parseEncryptedStorageEnvelope,
  resolveMobileAuthBackend,
  resolveMobileAppVariant,
  secondsUntilResend,
  serializeEncryptedStorageEnvelope,
} from "../src/auth/core.ts";
import { createEncryptedAuthStorage } from "../src/auth/encrypted-storage.ts";
import { attemptLogout } from "../src/auth/logout.ts";
import { resolveCreatedChildFromBootstrap } from "../src/auth/parent-data.ts";
import {
  canAcceptBootstrapResult,
  shouldApplyAuthSessionEvent,
  transitionSessionIdentity,
} from "../src/auth/session-transition.ts";
import { createMobileAuthStorage } from "../src/auth/storage.web.ts";
import { decodeUtf8, encodeUtf8 } from "../src/auth/utf8.ts";
import {
  CHILD_AVATAR_OPTIONS,
  ChildSetupValidationError,
  acquireChildCreationAttempt,
  childSetupErrorMessage,
  isCurrentChildCreationContext,
  isSamePendingChildCreation,
  normalizeChildSetup,
  normalizedSetupFromPending,
  parsePendingChildCreation,
  pendingChildCreationMatchesContext,
  resolveChildAvatar,
  serializePendingChildCreation,
  shouldRetainPendingChildCreation,
} from "../src/children/child-setup.ts";

test("derives the app variant from the native update channel", () => {
  assert.equal(
    resolveMobileAppVariant({
      updatesChannel: "preview",
      extraVariant: "development",
      allowExtraVariantFallback: false,
    }),
    "preview",
  );
  assert.equal(
    resolveMobileAppVariant({
      updatesChannel: null,
      extraVariant: "development",
      allowExtraVariantFallback: true,
    }),
    "development",
  );

  assert.throws(() =>
    resolveMobileAppVariant({
      updatesChannel: "unexpected-channel",
      extraVariant: "development",
      allowExtraVariantFallback: true,
    }),
  );
  assert.throws(() =>
    resolveMobileAppVariant({
      updatesChannel: null,
      extraVariant: "preview",
      allowExtraVariantFallback: false,
    }),
  );
});

test("allows a validated config fallback for exported web builds", () => {
  assert.equal(
    resolveMobileAppVariant({
      updatesChannel: "",
      extraVariant: "preview",
      allowExtraVariantFallback: true,
    }),
    "preview",
  );

  assert.throws(() =>
    resolveMobileAppVariant({
      updatesChannel: "",
      extraVariant: "unexpected",
      allowExtraVariantFallback: true,
    }),
  );
});

test("derives the auth namespace from variant, platform, and validated URL", () => {
  for (const variant of ["development", "preview"]) {
    assert.equal(
      resolveMobileAuthBackend({
        platform: "native",
        url: "https://demo.supabase.co",
        variant,
      }),
      "development",
    );
    assert.equal(
      resolveMobileAuthBackend({
        platform: "web",
        url: "http://127.0.0.1:54321",
        variant,
      }),
      "local",
    );
  }

  assert.equal(
    resolveMobileAuthBackend({
      platform: "web",
      url: "http://localhost:54321",
      variant: "development",
    }),
    "local",
  );
  assert.equal(
    resolveMobileAuthBackend({
      platform: "native",
      url: "https://production.example.test",
      variant: "production",
    }),
    "production",
  );
  assert.equal(
    createAuthStorageKey({
      appVariant: "preview",
      backend: resolveMobileAuthBackend({
        platform: "native",
        url: "https://preview.example.test",
        variant: "preview",
      }),
      surface: "mobile",
    }),
    "bt-auth-v1-mobile-preview-development",
  );
});

test("builds only the exact registered auth callback targets", () => {
  assert.equal(
    createAuthRedirect("development", "native"),
    "baretraen-dev://auth/callback",
  );
  assert.equal(
    createAuthRedirect("preview", "native"),
    "baretraen-preview://auth/callback",
  );
  assert.equal(
    createAuthRedirect("production", "native"),
    "baretraen://auth/callback",
  );
  assert.equal(
    createAuthRedirect("development", "web", "http://127.0.0.1:11001"),
    "http://127.0.0.1:11001/auth/callback",
  );
  assert.equal(
    createAuthRedirect("preview", "web", "https://preview.example.test"),
    "https://preview.example.test/auth/callback",
  );

  for (const origin of [
    "http://127.0.0.1:3000",
    "http://192.168.1.8:11001",
    "https://user:pass@example.test",
    "https://example.test/a/path",
  ]) {
    assert.throws(() => createAuthRedirect("development", "web", origin));
  }
});

test("rejects impossible backend and app-variant combinations", () => {
  for (const input of [
    {
      platform: "native",
      url: "http://127.0.0.1:54321",
      variant: "development",
    },
    {
      platform: "web",
      url: "http://localhost:54321",
      variant: "production",
    },
    {
      platform: "web",
      url: "http://192.168.1.8:54321",
      variant: "development",
    },
    {
      platform: "web",
      url: "http://127.0.0.1:54322",
      variant: "development",
    },
    {
      platform: "web",
      url: "https://demo.supabase.co/rest/v1",
      variant: "preview",
    },
    {
      platform: "web",
      url: "https://demo.supabase.co?other=true",
      variant: "preview",
    },
    {
      platform: "native",
      url: "https://127.0.0.1:54321",
      variant: "development",
    },
    {
      platform: "web",
      url: "https://localhost:54321",
      variant: "production",
    },
    {
      platform: "native",
      url: "https://[::1]:54321",
      variant: "development",
    },
  ]) {
    assert.throws(() => resolveMobileAuthBackend(input));
  }
});

test("mobile callback accepts only one code and one optional flow id", () => {
  assert.deepEqual(
    parseMobileAuthCallbackUrl({
      callbackUrl:
        "baretraen-dev://auth/callback?code=callback-code&sb_flow_id=flow-123456",
      expectedRedirectTo: "baretraen-dev://auth/callback",
    }),
    { code: "callback-code", flowId: "flow-123456" },
  );
  assert.deepEqual(
    parseMobileAuthCallbackUrl({
      callbackUrl: "http://127.0.0.1:11001/auth/callback?code=callback-code",
      expectedRedirectTo: "http://127.0.0.1:11001/auth/callback",
    }),
    { code: "callback-code" },
  );

  for (const callbackUrl of [
    "baretraen-dev://auth/callback",
    "baretraen-dev://auth/callback?code=one&code=two",
    "baretraen-dev://auth/callback?code=one&%63ode=two",
    "baretraen-dev://auth/callback?code=one&sb_flow_id=flow-123456&sb_flow_id=flow-654321",
    "baretraen-dev://auth/callback?code=one&next=/training",
    "baretraen-dev://auth/callback?code=one&error=access_denied",
  ]) {
    assert.throws(() =>
      parseMobileAuthCallbackUrl({
        callbackUrl,
        expectedRedirectTo: "baretraen-dev://auth/callback",
      }),
    );
  }
});

test("a deferred family response cannot cross an A to B account transition", () => {
  let identity = transitionSessionIdentity(
    { bootstrapRequestId: 0, userId: null },
    "user-a",
  );
  const requestA = identity.bootstrapRequestId + 1;
  identity = { ...identity, bootstrapRequestId: requestA };

  identity = transitionSessionIdentity(identity, "user-b");

  assert.equal(identity.userChanged, true);
  assert.equal(
    canAcceptBootstrapResult({
      activeRequestId: identity.bootstrapRequestId,
      currentUserId: identity.userId,
      profileId: "user-a",
      requestId: requestA,
      requestedUserId: "user-a",
    }),
    false,
  );

  const requestB = identity.bootstrapRequestId + 1;
  identity = { ...identity, bootstrapRequestId: requestB };
  assert.equal(
    canAcceptBootstrapResult({
      activeRequestId: identity.bootstrapRequestId,
      currentUserId: identity.userId,
      profileId: "user-b",
      requestId: requestB,
      requestedUserId: "user-b",
    }),
    true,
  );
  assert.equal(
    canAcceptBootstrapResult({
      activeRequestId: identity.bootstrapRequestId,
      currentUserId: identity.userId,
      profileId: "user-a",
      requestId: requestB,
      requestedUserId: "user-b",
    }),
    false,
  );
  assert.equal(
    transitionSessionIdentity(identity, "user-b").bootstrapRequestId,
    requestB,
  );
});

test("INITIAL_SESSION cannot mask restore failure while a later sign-in wins", () => {
  let authRevision = 0;
  const restoreRevision = authRevision;

  if (
    shouldApplyAuthSessionEvent({
      event: "INITIAL_SESSION",
      restorePending: true,
    })
  ) {
    authRevision += 1;
  }

  assert.equal(authRevision, restoreRevision);
  assert.equal(
    shouldApplyAuthSessionEvent({
      event: "SIGNED_IN",
      restorePending: true,
    }),
    true,
  );

  authRevision += 1;
  assert.notEqual(authRevision, restoreRevision);
  assert.equal(
    shouldApplyAuthSessionEvent({
      event: "INITIAL_SESSION",
      restorePending: false,
    }),
    true,
  );
});

test("logout fails closed when neither sign-out nor forced storage removal works", async () => {
  const calls = [];
  const result = await attemptLogout({
    async signOut() {
      calls.push("sign-out");
      throw new Error("synthetic remote failure");
    },
    async pausePersistence() {
      calls.push("pause");
    },
    async clearStoredSession() {
      calls.push("clear");
      throw new Error("synthetic storage failure");
    },
    async resumePersistence() {
      calls.push("resume");
    },
  });

  assert.equal(result, "failed");
  assert.deepEqual(calls, ["sign-out", "pause", "clear", "resume"]);
});

test("logout reports a forced local removal only after persisted state clears", async () => {
  const calls = [];
  const result = await attemptLogout({
    async signOut() {
      calls.push("sign-out");
      throw new Error("synthetic remote failure");
    },
    async pausePersistence() {
      calls.push("pause");
    },
    async clearStoredSession() {
      calls.push("clear");
    },
    async resumePersistence() {
      calls.push("unexpected-resume");
    },
  });

  assert.equal(result, "local-only");
  assert.deepEqual(calls, ["sign-out", "pause", "clear"]);
});

test("calculates the resend cooldown from timestamps", () => {
  assert.equal(secondsUntilResend(1_000, 1_000), 60);
  assert.equal(secondsUntilResend(1_000, 1_001), 60);
  assert.equal(secondsUntilResend(1_000, 31_000), 30);
  assert.equal(secondsUntilResend(1_000, 61_000), 0);
  assert.equal(secondsUntilResend(1_000, 70_000), 0);
});

test("normalizes safe first-family names and rejects unsafe input", () => {
  assert.deepEqual(
    normalizeParentOnboarding({
      displayName: "  Demo Voksen  ",
      familyName: "  Familien Demo  ",
    }),
    { displayName: "Demo Voksen", familyName: "Familien Demo" },
  );

  for (const input of [
    { displayName: "", familyName: "Familien Demo" },
    { displayName: "Demo\nVoksen", familyName: "Familien Demo" },
    { displayName: "Demo Voksen", familyName: "x".repeat(81) },
  ]) {
    assert.throws(() => normalizeParentOnboarding(input));
  }
});

test("normalizes only the minimal consented child setup", () => {
  assert.deepEqual(
    normalizeChildSetup({
      avatarSeed: "preset-rainbow",
      consentGranted: true,
      displayName: "  Demo Barn  ",
    }),
    {
      avatarSeed: "preset-rainbow",
      consentGranted: true,
      displayName: "Demo Barn",
    },
  );

  assert.equal(CHILD_AVATAR_OPTIONS.length, 4);
  assert.deepEqual(
    CHILD_AVATAR_OPTIONS.map((option) => option.id),
    ["preset-star", "preset-rocket", "preset-rainbow", "preset-sprout"],
  );

  assert.equal(
    normalizeChildSetup({
      avatarSeed: "preset-star",
      consentGranted: true,
      displayName: "🌱".repeat(60),
    }).displayName,
    "🌱".repeat(60),
  );
});

test("rejects invalid child names, presets, and missing acknowledgement", () => {
  for (const [field, input] of [
    [
      "displayName",
      { avatarSeed: "preset-star", consentGranted: true, displayName: "" },
    ],
    [
      "displayName",
      {
        avatarSeed: "preset-star",
        consentGranted: true,
        displayName: "x".repeat(61),
      },
    ],
    [
      "displayName",
      {
        avatarSeed: "preset-star",
        consentGranted: true,
        displayName: "Demo\nBarn",
      },
    ],
    [
      "displayName",
      {
        avatarSeed: "preset-star",
        consentGranted: true,
        displayName: "🌱".repeat(61),
      },
    ],
    [
      "displayName",
      {
        avatarSeed: "preset-star",
        consentGranted: true,
        displayName: "Demo\u0085Barn",
      },
    ],
    [
      "avatarSeed",
      {
        avatarSeed: "custom-photo",
        consentGranted: true,
        displayName: "Demo Barn",
      },
    ],
    [
      "consentGranted",
      {
        avatarSeed: "preset-star",
        consentGranted: false,
        displayName: "Demo Barn",
      },
    ],
  ]) {
    assert.throws(
      () => normalizeChildSetup(input),
      (error) => {
        assert.ok(error instanceof ChildSetupValidationError);
        assert.equal(error.field, field);
        return true;
      },
    );
  }
});

test("uses a safe preset fallback and redacts child-creation failures", () => {
  assert.deepEqual(resolveChildAvatar("preset-rocket"), {
    id: "preset-rocket",
    label: "Raket",
    symbol: "🚀",
  });
  assert.deepEqual(resolveChildAvatar("unknown-server-value"), {
    id: "preset-star",
    label: "Stjerne",
    symbol: "⭐",
  });
  assert.match(
    childSetupErrorMessage({ code: "child_limit_reached" }),
    /10 aktive børneprofiler/,
  );
  assert.doesNotMatch(
    childSetupErrorMessage(new Error("Synthetic database secret")),
    /synthetic|secret/i,
  );
});

test("selects a created child only from the expected parent and family", () => {
  const bootstrap = {
    children: [
      {
        avatarSeed: "preset-sprout",
        displayName: "Demo Barn",
        familyId: "family-a",
        id: "child-a",
      },
    ],
    family: { id: "family-a", name: "Demo Familien", role: "owner" },
    profile: { displayName: "Demo Voksen", id: "user-a" },
  };

  assert.equal(
    resolveCreatedChildFromBootstrap(bootstrap, {
      childId: "child-a",
      familyId: "family-a",
      profileId: "user-a",
    }).id,
    "child-a",
  );

  for (const expected of [
    { childId: "child-b", familyId: "family-a", profileId: "user-a" },
    { childId: "child-a", familyId: "family-b", profileId: "user-a" },
    { childId: "child-a", familyId: "family-a", profileId: "user-b" },
  ]) {
    assert.throws(() => resolveCreatedChildFromBootstrap(bootstrap, expected));
  }
});

test("rehydrates an ambiguous child request and keeps its logical identity", () => {
  const pending = {
    avatarSeed: "preset-rainbow",
    consentGranted: true,
    creationRequestId: "d1000000-0000-4000-8000-000000000001",
    displayName: "Demo Barn",
    familyId: "family-a",
    userId: "user-a",
  };

  assert.deepEqual(normalizedSetupFromPending(pending), {
    avatarSeed: "preset-rainbow",
    consentGranted: true,
    displayName: "Demo Barn",
  });
  assert.equal(normalizedSetupFromPending(null), null);
  assert.equal(
    shouldRetainPendingChildCreation({ code: "creation_failed" }),
    true,
  );
  assert.equal(
    shouldRetainPendingChildCreation({ code: "invalid_creation_result" }),
    true,
  );
  assert.equal(
    shouldRetainPendingChildCreation({ code: "child_limit_reached" }),
    false,
  );
  assert.equal(
    shouldRetainPendingChildCreation({ code: "session_changed" }),
    false,
  );
});

test("persists pending child creation only for its exact account and family", () => {
  const pending = {
    avatarSeed: "preset-rainbow",
    consentGranted: true,
    creationRequestId: "d1000000-0000-4000-8000-000000000001",
    displayName: "Demo Barn",
    familyId: "20000000-0000-4000-8000-000000000001",
    userId: "10000000-0000-4000-8000-000000000001",
  };
  const serialized = serializePendingChildCreation(pending);

  assert.deepEqual(
    parsePendingChildCreation(serialized, pending.userId),
    pending,
  );
  assert.equal(
    pendingChildCreationMatchesContext(pending, {
      familyId: pending.familyId,
      userId: pending.userId,
    }),
    true,
  );
  assert.equal(
    pendingChildCreationMatchesContext(pending, {
      familyId: "20000000-0000-4000-8000-000000000002",
      userId: pending.userId,
    }),
    false,
  );
  assert.equal(
    pendingChildCreationMatchesContext(pending, {
      familyId: pending.familyId,
      userId: "10000000-0000-4000-8000-000000000002",
    }),
    false,
  );
  assert.throws(() =>
    parsePendingChildCreation(
      serialized,
      "10000000-0000-4000-8000-000000000002",
    ),
  );
  assert.throws(() =>
    parsePendingChildCreation(
      JSON.stringify({ ...JSON.parse(serialized), unexpected: true }),
      pending.userId,
    ),
  );
  assert.throws(() =>
    parsePendingChildCreation(
      JSON.stringify({ ...JSON.parse(serialized), displayName: " Padded " }),
      pending.userId,
    ),
  );
  assert.throws(() => parsePendingChildCreation("", pending.userId));
});

test("binds child creation to one current account and one active attempt", () => {
  const context = {
    bootstrapFamilyId: "family-a",
    bootstrapProfileId: "user-a",
    currentSessionUserId: "user-a",
    requestedFamilyId: "family-a",
    requestedUserId: "user-a",
  };

  assert.equal(isCurrentChildCreationContext(context), true);
  assert.equal(
    isCurrentChildCreationContext({
      ...context,
      currentSessionUserId: "user-b",
    }),
    false,
  );
  assert.equal(
    isCurrentChildCreationContext({
      ...context,
      bootstrapProfileId: "user-b",
    }),
    false,
  );

  const lock = { current: false };
  const releaseFirst = acquireChildCreationAttempt(lock);
  assert.equal(typeof releaseFirst, "function");
  assert.equal(acquireChildCreationAttempt(lock), null);
  releaseFirst();
  assert.equal(lock.current, false);
  releaseFirst();
  assert.equal(lock.current, false);
  assert.equal(typeof acquireChildCreationAttempt(lock), "function");
});

test("an old child request cannot clear or publish a new account's state", () => {
  const original = {
    avatarSeed: "preset-star",
    consentGranted: true,
    creationRequestId: "d1000000-0000-4000-8000-000000000001",
    displayName: "Demo Barn",
    familyId: "20000000-0000-4000-8000-000000000001",
    userId: "10000000-0000-4000-8000-000000000001",
  };

  assert.equal(isSamePendingChildCreation(original, original), true);
  assert.equal(isSamePendingChildCreation(null, original), false);
  assert.equal(
    isSamePendingChildCreation(
      {
        ...original,
        userId: "10000000-0000-4000-8000-000000000002",
      },
      original,
    ),
    false,
  );
  assert.equal(
    isSamePendingChildCreation(
      {
        ...original,
        creationRequestId: "d1000000-0000-4000-8000-000000000002",
      },
      original,
    ),
    false,
  );
});

test("accepts only the versioned AES-GCM storage envelope", () => {
  const serialized = serializeEncryptedStorageEnvelope("AQIDBA==");

  assert.deepEqual(parseEncryptedStorageEnvelope(serialized), {
    algorithm: "A256GCM",
    combined: "AQIDBA==",
    version: 1,
  });

  for (const invalid of [
    "not-json",
    JSON.stringify({ version: 2, algorithm: "A256GCM", combined: "AQIDBA==" }),
    JSON.stringify({ version: 1, algorithm: "AES-CTR", combined: "AQIDBA==" }),
    JSON.stringify({
      version: 1,
      algorithm: "A256GCM",
      combined: "not base64",
    }),
  ]) {
    assert.throws(() => parseEncryptedStorageEnvelope(invalid));
  }
});

test("browser storage is scoped and has a safe in-memory fallback", async () => {
  const first = createMobileAuthStorage(
    "bt-auth-v1-mobile-development-development",
  );
  const second = createMobileAuthStorage(
    "bt-auth-v1-mobile-preview-development",
  );

  await first.setItem("session", "synthetic-session");
  await second.setItem("session", "other-session");

  assert.equal(await first.getItem("session"), "synthetic-session");
  assert.equal(await second.getItem("session"), "other-session");

  await first.removeItem("session");
  assert.equal(await first.getItem("session"), null);
  assert.equal(await second.getItem("session"), "other-session");
  await assert.rejects(second.setItem("unsafe key", "value"));
});

test("browser fallback overrides stale writes and removals after storage recovers", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map();
  let failWrites = false;
  const localStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      if (failWrites) throw new Error("synthetic remove failure");
      values.delete(key);
    },
    setItem(key, value) {
      if (failWrites) throw new Error("synthetic write failure");
      values.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });

  try {
    const namespace = "bt-auth-v1-mobile-development-development";
    const scopedKey = `bt.browser.v1:${namespace}:session`;
    const storage = createMobileAuthStorage(namespace);

    values.set(scopedKey, "stale-session");
    failWrites = true;
    await assert.rejects(storage.setItem("session", "new-session"));
    failWrites = false;
    assert.equal(await storage.getItem("session"), "new-session");
    assert.equal(
      await createMobileAuthStorage(namespace).getItem("session"),
      "new-session",
    );
    assert.equal(values.get(scopedKey), "stale-session");

    await storage.setItem("session", "new-session");
    assert.equal(values.get(scopedKey), "new-session");

    failWrites = true;
    await assert.rejects(storage.removeItem("session"));
    failWrites = false;
    assert.equal(await storage.getItem("session"), null);
    assert.equal(
      await createMobileAuthStorage(namespace).getItem("session"),
      null,
    );
    assert.equal(values.get(scopedKey), "new-session");

    await storage.removeItem("session");
    assert.equal(values.has(scopedKey), false);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete globalThis.window;
    }
  }
});

test("browser storage falls back safely when localStorage access is blocked", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.defineProperty({}, "localStorage", {
      get() {
        throw new Error("synthetic blocked storage");
      },
    }),
  });

  try {
    const storage = createMobileAuthStorage(
      "bt-auth-v1-mobile-preview-development",
    );

    await storage.setItem("session", "memory-only-session");
    assert.equal(await storage.getItem("session"), "memory-only-session");
    await storage.removeItem("session");
    assert.equal(await storage.getItem("session"), null);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete globalThis.window;
    }
  }
});

test("browser durable storage fails closed when persistence is unavailable", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: Object.defineProperty({}, "localStorage", {
      get() {
        throw new Error("synthetic blocked storage");
      },
    }),
  });

  try {
    const storage = createMobileAuthStorage(
      "bt-auth-v1-mobile-development-development",
    );

    await assert.rejects(storage.getDurableItem("pending"));
    await assert.rejects(storage.setDurableItem("pending", "request"));
    await assert.rejects(storage.removeDurableItem("pending"));

    // The ordinary Auth adapter deliberately keeps its existing in-memory
    // recovery behavior; only retry identities require durable persistence.
    await storage.setItem("session", "memory-only-session");
    assert.equal(await storage.getItem("session"), "memory-only-session");
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete globalThis.window;
    }
  }
});

test("browser durable storage propagates failed and unverifiable writes", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map();
  let mode = "normal";
  const localStorage = {
    getItem(key) {
      if (mode === "read-error") {
        throw new Error("synthetic read failure");
      }

      return values.get(key) ?? null;
    },
    removeItem(key) {
      if (mode === "remove-error") {
        throw new Error("synthetic remove failure");
      }

      if (mode !== "ignore-remove") {
        values.delete(key);
      }
    },
    setItem(key, value) {
      if (mode === "write-error") {
        throw new Error("synthetic write failure");
      }

      if (mode !== "ignore-write") {
        values.set(key, value);
      }
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });

  try {
    const storage = createMobileAuthStorage(
      "bt-auth-v1-mobile-development-development",
    );

    mode = "read-error";
    await assert.rejects(storage.getDurableItem("pending"));

    mode = "write-error";
    await assert.rejects(storage.setDurableItem("pending", "request"));

    mode = "ignore-write";
    await assert.rejects(storage.setDurableItem("pending", "request"));

    mode = "normal";
    await storage.setDurableItem("pending", "request");
    assert.equal(await storage.getDurableItem("pending"), "request");

    mode = "remove-error";
    await assert.rejects(storage.removeDurableItem("pending"));

    mode = "ignore-remove";
    await assert.rejects(storage.removeDurableItem("pending"));

    mode = "normal";
    await storage.removeDurableItem("pending");
    assert.equal(await storage.getDurableItem("pending"), null);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete globalThis.window;
    }
  }
});

function createEncryptedStorageFixture() {
  const ciphertext = new Map();
  const secureKeys = new Map();
  const ciphertextWrites = [];
  const ciphertextRemovals = [];
  const secureKeyDeletes = [];
  const sealedValues = new Map();
  let nonce = 0;
  let secureDeleteError = null;
  let secureGetError = null;

  function key(material, size = 256) {
    return {
      async exportBase64() {
        return material;
      },
      material,
      size,
    };
  }

  const dependencies = {
    ciphertextStore: {
      async getItem(storageKey) {
        return ciphertext.get(storageKey) ?? null;
      },
      async removeItem(storageKey) {
        ciphertextRemovals.push(storageKey);
        ciphertext.delete(storageKey);
      },
      async setItem(storageKey, value) {
        ciphertextWrites.push({ key: storageKey, value });
        ciphertext.set(storageKey, value);
      },
    },
    secureKeyStore: {
      async deleteItem(storageKey) {
        if (secureDeleteError) throw secureDeleteError;
        secureKeyDeletes.push(storageKey);
        secureKeys.delete(storageKey);
      },
      async getItem(storageKey) {
        if (secureGetError) throw secureGetError;
        return secureKeys.get(storageKey) ?? null;
      },
      async setItem(storageKey, value) {
        secureKeys.set(storageKey, value);
      },
    },
    crypto: {
      async decrypt(combined, encryptionKey, additionalData) {
        const sealed = sealedValues.get(combined);

        if (
          !sealed ||
          sealed.key !== encryptionKey.material ||
          sealed.additionalData !==
            Buffer.from(additionalData).toString("base64")
        ) {
          throw new Error("synthetic authentication failure");
        }

        return Uint8Array.from(Buffer.from(sealed.plaintext, "base64"));
      },
      async encrypt(plaintext, encryptionKey, additionalData) {
        nonce += 1;
        const combined = Buffer.from(`sealed-${nonce}`).toString("base64");
        sealedValues.set(combined, {
          additionalData: Buffer.from(additionalData).toString("base64"),
          key: encryptionKey.material,
          plaintext: Buffer.from(plaintext).toString("base64"),
        });
        return combined;
      },
      async generateKey() {
        return key("generated-key");
      },
      async importKey(encoded) {
        if (encoded === "malformed") {
          throw new Error("synthetic malformed key");
        }

        return key(encoded, encoded === "aes128" ? 128 : 256);
      },
    },
  };

  return {
    ciphertext,
    ciphertextRemovals,
    ciphertextWrites,
    dependencies,
    secureKeyDeletes,
    secureKeys,
    setSecureDeleteError(error) {
      secureDeleteError = error;
    },
    setSecureGetError(error) {
      secureGetError = error;
    },
  };
}

test("encrypted storage uses a fresh sealed value and versioned serialization", async () => {
  const fixture = createEncryptedStorageFixture();
  const storage = createEncryptedAuthStorage(
    "native-development",
    fixture.dependencies,
  );

  await storage.setItem("session", "første");
  await storage.setItem("session", "anden 👋");

  assert.equal(fixture.ciphertextWrites.length, 2);
  const first = parseEncryptedStorageEnvelope(
    fixture.ciphertextWrites[0].value,
  );
  const second = parseEncryptedStorageEnvelope(
    fixture.ciphertextWrites[1].value,
  );
  assert.notEqual(first.combined, second.combined);
  assert.equal(first.algorithm, "A256GCM");
  assert.equal(second.version, 1);
  assert.equal(await storage.getItem("session"), "anden 👋");
});

test("encrypted storage deletes missing, malformed, and non-AES256 key state", async () => {
  for (const secureValue of [null, "malformed", "aes128"]) {
    const fixture = createEncryptedStorageFixture();
    const namespace = "native-development";
    const secureKey = `bt.aes.v1.${namespace}`;
    const dataKey = `bt.encrypted.v1:${namespace}:session`;
    fixture.ciphertext.set(
      dataKey,
      serializeEncryptedStorageEnvelope("AQIDBA=="),
    );

    if (secureValue) fixture.secureKeys.set(secureKey, secureValue);

    const storage = createEncryptedAuthStorage(namespace, fixture.dependencies);
    assert.equal(await storage.getItem("session"), null);
    assert.equal(fixture.ciphertext.has(dataKey), false);
    assert.equal(
      fixture.secureKeyDeletes.includes(secureKey),
      secureValue !== null,
    );
  }
});

test("encrypted storage preserves keychain I/O failures", async () => {
  const fixture = createEncryptedStorageFixture();
  const namespace = "native-development";
  const dataKey = `bt.encrypted.v1:${namespace}:session`;
  const ioError = new Error("synthetic keychain unavailable");
  fixture.ciphertext.set(
    dataKey,
    serializeEncryptedStorageEnvelope("AQIDBA=="),
  );
  fixture.setSecureGetError(ioError);

  const storage = createEncryptedAuthStorage(namespace, fixture.dependencies);
  await assert.rejects(
    storage.getItem("session"),
    (error) => error === ioError,
  );
  assert.equal(fixture.ciphertext.has(dataKey), true);
  assert.equal(fixture.secureKeyDeletes.length, 0);
});

test("encrypted storage preserves keychain deletion failures for a corrupt key", async () => {
  const fixture = createEncryptedStorageFixture();
  const namespace = "native-development";
  const secureKey = `bt.aes.v1.${namespace}`;
  const dataKey = `bt.encrypted.v1:${namespace}:session`;
  const ioError = new Error("synthetic keychain delete unavailable");
  fixture.secureKeys.set(secureKey, "malformed");
  fixture.ciphertext.set(
    dataKey,
    serializeEncryptedStorageEnvelope("AQIDBA=="),
  );
  fixture.setSecureDeleteError(ioError);

  const storage = createEncryptedAuthStorage(namespace, fixture.dependencies);
  await assert.rejects(
    storage.getItem("session"),
    (error) => error === ioError,
  );
  assert.equal(fixture.ciphertext.has(dataKey), true);
  assert.equal(fixture.secureKeys.get(secureKey), "malformed");
});

test("encrypted storage rejects tampered ciphertext and clears it", async () => {
  const fixture = createEncryptedStorageFixture();
  const namespace = "native-development";
  const dataKey = `bt.encrypted.v1:${namespace}:session`;
  const storage = createEncryptedAuthStorage(namespace, fixture.dependencies);

  await storage.setItem("session", "synthetic-session");
  fixture.ciphertext.set(
    dataKey,
    serializeEncryptedStorageEnvelope(
      Buffer.from("tampered").toString("base64"),
    ),
  );

  assert.equal(await storage.getItem("session"), null);
  assert.equal(fixture.ciphertext.has(dataKey), false);
  assert.equal(fixture.ciphertextRemovals.includes(dataKey), true);
});

test("durable encrypted storage distinguishes absence from unreadable state", async () => {
  const namespace = "native-development";
  const secureKey = `bt.aes.v1.${namespace}`;
  const dataKey = `bt.encrypted.v1:${namespace}:pending`;

  {
    const fixture = createEncryptedStorageFixture();
    const storage = createEncryptedAuthStorage(namespace, fixture.dependencies);

    assert.equal(await storage.getDurableItem("pending"), null);
  }

  {
    const fixture = createEncryptedStorageFixture();
    fixture.ciphertext.set(
      dataKey,
      serializeEncryptedStorageEnvelope("AQIDBA=="),
    );
    const storage = createEncryptedAuthStorage(namespace, fixture.dependencies);

    await assert.rejects(storage.getDurableItem("pending"));
    assert.equal(fixture.ciphertext.has(dataKey), true);
    assert.equal(fixture.ciphertextRemovals.length, 0);
  }

  {
    const fixture = createEncryptedStorageFixture();
    fixture.ciphertext.set(dataKey, "");
    const storage = createEncryptedAuthStorage(namespace, fixture.dependencies);

    await assert.rejects(storage.getDurableItem("pending"));
    assert.equal(fixture.ciphertext.has(dataKey), true);
    assert.equal(fixture.ciphertextRemovals.length, 0);
  }

  {
    const fixture = createEncryptedStorageFixture();
    fixture.secureKeys.set(secureKey, "malformed");
    fixture.ciphertext.set(
      dataKey,
      serializeEncryptedStorageEnvelope("AQIDBA=="),
    );
    const storage = createEncryptedAuthStorage(namespace, fixture.dependencies);

    await assert.rejects(storage.getDurableItem("pending"));
    assert.equal(fixture.ciphertext.has(dataKey), true);
    assert.equal(fixture.ciphertextRemovals.length, 0);
    assert.equal(fixture.secureKeyDeletes.includes(secureKey), true);
  }
});

test("durable encrypted storage retains damaged ciphertext for safe recovery", async () => {
  const fixture = createEncryptedStorageFixture();
  const namespace = "native-development";
  const dataKey = `bt.encrypted.v1:${namespace}:pending`;
  const storage = createEncryptedAuthStorage(namespace, fixture.dependencies);

  await storage.setDurableItem("pending", "synthetic-request");
  assert.equal(await storage.getDurableItem("pending"), "synthetic-request");

  fixture.ciphertext.set(
    dataKey,
    serializeEncryptedStorageEnvelope(
      Buffer.from("tampered").toString("base64"),
    ),
  );

  await assert.rejects(storage.getDurableItem("pending"));
  assert.equal(fixture.ciphertext.has(dataKey), true);
  assert.equal(fixture.ciphertextRemovals.length, 0);

  await storage.removeDurableItem("pending");
  assert.equal(fixture.ciphertext.has(dataKey), false);
});

test("native storage's dependency-free UTF-8 codec round-trips Danish and emoji", () => {
  const value = "Bare Træn · Forælder 👨‍👧";

  assert.equal(decodeUtf8(encodeUtf8(value)), value);
  assert.throws(() => decodeUtf8(Uint8Array.from([0xc0, 0x80])));
  assert.throws(() => decodeUtf8(Uint8Array.from([0xf4, 0x90, 0x80, 0x80])));
});
