import assert from "node:assert/strict";
import test from "node:test";

import {
  CHILD_AVATAR_PRESETS,
  CHILD_PROFILE_CONSENT_VERSION,
  CreateChildProfileError,
  createChildProfile,
} from "../src/index.ts";

const familyId = "20000000-0000-4000-8000-000000000001";
const creationRequestId = "d1000000-0000-4000-8000-000000000001";
const expectedUserId = "10000000-0000-4000-8000-000000000001";

const resultRow = Object.freeze({
  avatar_seed: "preset-star",
  child_profile_id: "d2000000-0000-4000-8000-000000000001",
  consent_version: "child-profile-pilot-v1",
  consented_at: "2026-08-21T10:00:00.000Z",
  created: true,
  display_name: "Demo Barn",
  family_id: familyId,
  is_active: true,
});

const validInput = Object.freeze({
  avatarSeed: "preset-star",
  consentGranted: true,
  consentVersion: CHILD_PROFILE_CONSENT_VERSION,
  creationRequestId,
  displayName: "Demo Barn",
  expectedUserId,
  familyId,
});

function assertCreationError(error, code) {
  assert.ok(error instanceof CreateChildProfileError);
  assert.equal(error.code, code);
  return true;
}

test("exports the exact pilot consent version and preset allowlist", () => {
  assert.equal(CHILD_PROFILE_CONSENT_VERSION, "child-profile-pilot-v1");
  assert.deepEqual(CHILD_AVATAR_PRESETS, [
    "preset-star",
    "preset-rocket",
    "preset-rainbow",
    "preset-sprout",
  ]);
});

test("normalizes input and maps the single typed child result", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ name, input });
      return { data: [resultRow], error: null };
    },
  };

  const result = await createChildProfile(client, {
    ...validInput,
    creationRequestId: creationRequestId.toUpperCase(),
    displayName: "  Demo Barn  ",
    familyId: familyId.toUpperCase(),
  });

  assert.deepEqual(calls, [
    {
      name: "create_child_profile",
      input: {
        p_avatar_seed: "preset-star",
        p_consent_granted: true,
        p_consent_version: "child-profile-pilot-v1",
        p_creation_request_id: creationRequestId,
        p_display_name: "Demo Barn",
        p_expected_user_id: expectedUserId,
        p_family_id: familyId,
      },
    },
  ]);
  assert.deepEqual(result, {
    avatarSeed: "preset-star",
    childProfileId: resultRow.child_profile_id,
    consentVersion: CHILD_PROFILE_CONSENT_VERSION,
    consentedAt: resultRow.consented_at,
    created: true,
    displayName: "Demo Barn",
    familyId,
    isActive: true,
  });
});

test("counts child-name length by Unicode code points like PostgreSQL", async () => {
  const displayName = "🌱".repeat(60);
  const client = {
    async rpc() {
      return {
        data: [{ ...resultRow, display_name: displayName }],
        error: null,
      };
    },
  };

  const result = await createChildProfile(client, {
    ...validInput,
    displayName,
  });

  assert.equal(result.displayName, displayName);
});

test("rejects invalid inputs without calling the database", async () => {
  let calls = 0;
  const client = {
    async rpc() {
      calls += 1;
      return { data: [resultRow], error: null };
    },
  };

  const cases = [
    [{ familyId: "not-a-uuid" }, "invalid_family_id"],
    [{ familyId: "00000000-0000-0000-0000-000000000000" }, "invalid_family_id"],
    [{ creationRequestId: "not-a-uuid" }, "invalid_creation_request_id"],
    [
      { creationRequestId: "00000000-0000-0000-0000-000000000000" },
      "invalid_creation_request_id",
    ],
    [{ expectedUserId: "not-a-uuid" }, "invalid_expected_user_id"],
    [
      { expectedUserId: "00000000-0000-0000-0000-000000000000" },
      "invalid_expected_user_id",
    ],
    [{ displayName: "   " }, "invalid_display_name"],
    [{ displayName: "Demo\nBarn" }, "invalid_display_name"],
    [{ displayName: "Demo\u0085Barn" }, "invalid_display_name"],
    [{ displayName: "x".repeat(61) }, "invalid_display_name"],
    [{ displayName: "🌱".repeat(61) }, "invalid_display_name"],
    [{ avatarSeed: "legacy-seed" }, "invalid_avatar_seed"],
    [{ consentGranted: false }, "consent_required"],
    [{ consentVersion: "child-profile-pilot-v0" }, "invalid_consent_version"],
  ];

  for (const [patch, code] of cases) {
    await assert.rejects(
      createChildProfile(client, { ...validInput, ...patch }),
      (error) => assertCreationError(error, code),
    );
  }

  assert.equal(calls, 0);
});

test("maps database failures to stable non-sensitive errors", async () => {
  for (const [rpc, code] of [
    [
      async () => ({
        data: null,
        error: { code: "54000", message: "Synthetic database details." },
      }),
      "child_limit_reached",
    ],
    [
      async () => ({
        data: null,
        error: { code: "28000", message: "Synthetic database details." },
      }),
      "session_changed",
    ],
    [
      async () => ({
        data: null,
        error: { code: "42501", message: "Synthetic database details." },
      }),
      "family_access_denied",
    ],
    [
      async () => ({
        data: null,
        error: { code: "22023", message: "Synthetic database details." },
      }),
      "creation_failed",
    ],
    [
      async () => {
        throw new Error("Synthetic network details.");
      },
      "creation_failed",
    ],
  ]) {
    await assert.rejects(createChildProfile({ rpc }, validInput), (error) => {
      assertCreationError(error, code);
      assert.doesNotMatch(error.message, /synthetic/i);
      return true;
    });
  }
});

test("rejects missing, duplicate, malformed, or mismatched RPC rows", async () => {
  const invalidData = [
    null,
    [],
    [resultRow, resultRow],
    [{ ...resultRow, child_profile_id: "not-a-uuid" }],
    [{ ...resultRow, family_id: "20000000-0000-4000-8000-000000000002" }],
    [{ ...resultRow, display_name: " padded" }],
    [{ ...resultRow, display_name: "x".repeat(61) }],
    [{ ...resultRow, avatar_seed: "legacy-seed" }],
    [{ ...resultRow, avatar_seed: "preset-rocket" }],
    [{ ...resultRow, is_active: "yes" }],
    [{ ...resultRow, consent_version: "child-profile-pilot-v0" }],
    [{ ...resultRow, consented_at: "not-a-date" }],
    [{ ...resultRow, created: "yes" }],
  ];

  for (const data of invalidData) {
    const client = {
      async rpc() {
        return { data, error: null };
      },
    };

    await assert.rejects(createChildProfile(client, validInput), (error) =>
      assertCreationError(error, "invalid_creation_result"),
    );
  }
});
