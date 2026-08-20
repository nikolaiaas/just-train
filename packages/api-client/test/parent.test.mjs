import assert from "node:assert/strict";
import test from "node:test";

import {
  ParentOnboardingError,
  completeParentOnboarding,
} from "../src/index.ts";

const resultRow = Object.freeze({
  profile_id: "10000000-0000-4000-8000-000000000001",
  display_name: "Demo Voksen",
  family_id: "20000000-0000-4000-8000-000000000001",
  family_name: "Demo Familien",
  role: "owner",
  created: true,
});

function assertOnboardingError(error, code) {
  assert.ok(error instanceof ParentOnboardingError);
  assert.equal(error.code, code);
  return true;
}

test("normalizes names and maps the single typed onboarding result", async () => {
  const calls = [];
  const client = {
    async rpc(name, input) {
      calls.push({ name, input });
      return { data: [resultRow], error: null };
    },
  };

  const result = await completeParentOnboarding(client, {
    displayName: "  Demo Voksen  ",
    familyName: "  Demo Familien  ",
  });

  assert.deepEqual(calls, [
    {
      name: "complete_parent_onboarding",
      input: {
        p_display_name: "Demo Voksen",
        p_family_name: "Demo Familien",
      },
    },
  ]);
  assert.deepEqual(result, {
    profileId: resultRow.profile_id,
    displayName: resultRow.display_name,
    familyId: resultRow.family_id,
    familyName: resultRow.family_name,
    role: "owner",
    created: true,
  });
});

test("rejects invalid names without calling the database", async () => {
  let calls = 0;
  const client = {
    async rpc() {
      calls += 1;
      return { data: [resultRow], error: null };
    },
  };

  for (const [field, value, code] of [
    ["displayName", "   ", "invalid_display_name"],
    ["displayName", `Voksen\nNavn`, "invalid_display_name"],
    ["displayName", "x".repeat(81), "invalid_display_name"],
    ["familyName", "", "invalid_family_name"],
    ["familyName", `Familie\u0000`, "invalid_family_name"],
    ["familyName", "x".repeat(81), "invalid_family_name"],
  ]) {
    await assert.rejects(
      completeParentOnboarding(client, {
        displayName: "Demo Voksen",
        familyName: "Demo Familien",
        [field]: value,
      }),
      (error) => assertOnboardingError(error, code),
    );
  }

  assert.equal(calls, 0);
});

test("maps database failures to a stable non-sensitive error", async () => {
  for (const rpc of [
    async () => ({
      data: null,
      error: { message: "Synthetic database details must not escape." },
    }),
    async () => {
      throw new Error("Synthetic network details must not escape.");
    },
  ]) {
    await assert.rejects(
      completeParentOnboarding(
        { rpc },
        {
          displayName: "Demo Voksen",
          familyName: "Demo Familien",
        },
      ),
      (error) => {
        assertOnboardingError(error, "onboarding_failed");
        assert.doesNotMatch(error.message, /synthetic/i);
        return true;
      },
    );
  }
});

test("rejects missing, duplicate, or malformed RPC rows", async () => {
  const invalidData = [
    null,
    [],
    [resultRow, resultRow],
    [{ ...resultRow, profile_id: "not-a-uuid" }],
    [{ ...resultRow, family_id: "not-a-uuid" }],
    [{ ...resultRow, display_name: " padded" }],
    [{ ...resultRow, display_name: "x".repeat(81) }],
    [{ ...resultRow, family_name: "" }],
    [{ ...resultRow, family_name: "Line\nBreak" }],
    [{ ...resultRow, role: "admin" }],
    [{ ...resultRow, created: "yes" }],
  ];

  for (const data of invalidData) {
    const client = {
      async rpc() {
        return { data, error: null };
      },
    };

    await assert.rejects(
      completeParentOnboarding(client, {
        displayName: "Demo Voksen",
        familyName: "Demo Familien",
      }),
      (error) => assertOnboardingError(error, "invalid_onboarding_result"),
    );
  }
});
