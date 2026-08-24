import assert from "node:assert/strict";
import test from "node:test";

import {
  createSelectedChildStorageKey,
  parseSelectedChildId,
  resolveSelectedChildId,
  serializeSelectedChildId,
} from "../src/children/child-selection.ts";

const childA = "30000000-0000-4000-8000-000000000001";
const childB = "30000000-0000-4000-8000-000000000002";
const unavailableChild = "30000000-0000-4000-8000-000000000003";
const familyA = "20000000-0000-4000-8000-000000000001";
const familyB = "20000000-0000-4000-8000-000000000002";
const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";

test("restores a remembered active child", () => {
  assert.equal(
    resolveSelectedChildId({
      availableChildIds: [childA, childB],
      currentChildId: null,
      storedChildId: childB,
    }),
    childB,
  );
});

test("keeps the current child during a family refresh", () => {
  assert.equal(
    resolveSelectedChildId({
      availableChildIds: [childA, childB],
      currentChildId: childB,
      storedChildId: childA,
    }),
    childB,
  );
});

test("requires an explicit choice when several children have no valid selection", () => {
  assert.equal(
    resolveSelectedChildId({
      availableChildIds: [childA, childB],
      currentChildId: null,
      storedChildId: unavailableChild,
    }),
    null,
  );
});

test("opens the only active child without an extra choice", () => {
  assert.equal(
    resolveSelectedChildId({
      availableChildIds: [childA],
      currentChildId: null,
      storedChildId: unavailableChild,
    }),
    childA,
  );
  assert.equal(
    resolveSelectedChildId({
      availableChildIds: [],
      currentChildId: childA,
      storedChildId: childA,
    }),
    null,
  );
});

test("stores only a normalized child UUID", () => {
  assert.equal(
    parseSelectedChildId(" 30000000-0000-4000-8000-00000000000A "),
    "30000000-0000-4000-8000-00000000000a",
  );
  assert.equal(serializeSelectedChildId(childA), childA);

  for (const value of [
    null,
    "child-a",
    "30000000-0000-0000-8000-000000000001",
    "30000000-0000-4000-0000-000000000001",
    `${childA}.other-family`,
  ]) {
    assert.throws(() => parseSelectedChildId(value));
  }
});

test("scopes the remembered child to one adult, family, app, and backend", () => {
  const base = {
    familyId: familyA,
    namespace: "bt-auth-v1-mobile-preview-development",
    userId: userA,
  };
  const key = createSelectedChildStorageKey(base);

  assert.equal(
    key,
    `bt-auth-v1-mobile-preview-development.child-selection.${userA}.${familyA}`,
  );
  assert.notEqual(
    createSelectedChildStorageKey({ ...base, userId: userB }),
    key,
  );
  assert.notEqual(
    createSelectedChildStorageKey({ ...base, familyId: familyB }),
    key,
  );
  assert.notEqual(
    createSelectedChildStorageKey({
      ...base,
      namespace: "bt-auth-v1-mobile-development-development",
    }),
    key,
  );
  assert.throws(() =>
    createSelectedChildStorageKey({ ...base, namespace: "unsafe namespace" }),
  );
});
