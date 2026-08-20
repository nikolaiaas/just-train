import assert from "node:assert/strict";
import test from "node:test";

import { decideAdminAccess } from "./access.ts";

const profile = {
  id: "00000000-0000-4000-8000-000000000001",
  display_name: "Syntetisk Admin",
  avatar_url: null,
  is_admin: true,
};

test("authorizes only the caller's own admin profile", () => {
  assert.deepEqual(
    decideAdminAccess({
      userId: profile.id,
      profile,
      profileQueryFailed: false,
    }),
    {
      kind: "authorized",
      profile: {
        id: profile.id,
        displayName: profile.display_name,
        avatarUrl: null,
        isAdmin: true,
      },
    },
  );

  assert.deepEqual(
    decideAdminAccess({
      userId: profile.id,
      profile: { ...profile, id: "00000000-0000-4000-8000-000000000002" },
      profileQueryFailed: false,
    }),
    { kind: "denied" },
  );
  assert.deepEqual(
    decideAdminAccess({
      userId: profile.id,
      profile: { ...profile, is_admin: false },
      profileQueryFailed: false,
    }),
    { kind: "denied" },
  );
});

test("separates unauthenticated, denied, and unavailable decisions", () => {
  assert.deepEqual(
    decideAdminAccess({
      userId: null,
      profile: null,
      profileQueryFailed: false,
    }),
    { kind: "unauthenticated" },
  );
  assert.deepEqual(
    decideAdminAccess({
      userId: profile.id,
      profile: null,
      profileQueryFailed: false,
    }),
    { kind: "denied" },
  );
  assert.deepEqual(
    decideAdminAccess({
      userId: profile.id,
      profile: null,
      profileQueryFailed: true,
    }),
    { kind: "unavailable" },
  );
});
