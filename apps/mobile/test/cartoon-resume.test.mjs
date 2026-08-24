import assert from "node:assert/strict";
import test from "node:test";

import {
  createAiCartoonResumeStorageKey,
  parseAiCartoonResume,
  serializeAiCartoonResume,
  shouldProtectAiCartoonNavigation,
} from "../src/ai/cartoon-resume.ts";

const childA = "30000000-0000-4000-8000-000000000001";
const childB = "30000000-0000-4000-8000-000000000002";
const familyA = "20000000-0000-4000-8000-000000000001";
const familyB = "20000000-0000-4000-8000-000000000002";
const jobA = "40000000-0000-4000-8000-000000000001";
const requestA = "50000000-0000-4000-8000-000000000001";
const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";
const scope = { childProfileId: childA, familyId: familyA, userId: userA };
const resume = {
  ...scope,
  jobId: jobA,
  requestId: requestA,
  version: 1,
};

test("round-trips the active portrait job without storing image data", () => {
  const serialized = serializeAiCartoonResume(resume);

  assert.deepEqual(parseAiCartoonResume(serialized, scope), resume);
  assert.deepEqual(Object.keys(JSON.parse(serialized)).sort(), [
    "childProfileId",
    "familyId",
    "jobId",
    "requestId",
    "userId",
    "version",
  ]);
});

test("rejects malformed, unsupported, and cross-profile resume records", () => {
  for (const serialized of [
    "",
    "not-json",
    JSON.stringify({ ...resume, version: 2 }),
    JSON.stringify({ ...resume, jobId: "job-a" }),
  ]) {
    assert.throws(() => parseAiCartoonResume(serialized, scope));
  }

  assert.throws(() =>
    parseAiCartoonResume(JSON.stringify(resume), {
      ...scope,
      childProfileId: childB,
    }),
  );
  assert.throws(() =>
    parseAiCartoonResume(JSON.stringify(resume), {
      ...scope,
      familyId: familyB,
    }),
  );
  assert.throws(() =>
    parseAiCartoonResume(JSON.stringify(resume), {
      ...scope,
      userId: userB,
    }),
  );
});

test("scopes the active portrait job to one adult, family, child, and app", () => {
  const base = {
    ...scope,
    namespace: "bt-auth-v1-mobile-preview-development",
  };
  const key = createAiCartoonResumeStorageKey(base);

  assert.equal(
    key,
    `bt-auth-v1-mobile-preview-development.cartoon-resume.${userA}.${familyA}.${childA}`,
  );
  assert.notEqual(
    createAiCartoonResumeStorageKey({ ...base, userId: userB }),
    key,
  );
  assert.notEqual(
    createAiCartoonResumeStorageKey({ ...base, familyId: familyB }),
    key,
  );
  assert.notEqual(
    createAiCartoonResumeStorageKey({ ...base, childProfileId: childB }),
    key,
  );
  assert.notEqual(
    createAiCartoonResumeStorageKey({
      ...base,
      namespace: "bt-auth-v1-mobile-development-development",
    }),
    key,
  );
  assert.throws(() =>
    createAiCartoonResumeStorageKey({ ...base, namespace: "unsafe namespace" }),
  );
});

test("protects navigation only while portrait work can be interrupted", () => {
  const idle = {
    phase: "idle",
    picking: false,
    restoring: false,
    savingProfile: false,
  };

  assert.equal(shouldProtectAiCartoonNavigation(idle), false);
  assert.equal(
    shouldProtectAiCartoonNavigation({ ...idle, restoring: true }),
    true,
  );
  assert.equal(
    shouldProtectAiCartoonNavigation({ ...idle, picking: true }),
    true,
  );
  assert.equal(
    shouldProtectAiCartoonNavigation({ ...idle, phase: "submitting" }),
    true,
  );
  assert.equal(
    shouldProtectAiCartoonNavigation({ ...idle, phase: "processing" }),
    true,
  );
  assert.equal(
    shouldProtectAiCartoonNavigation({ ...idle, savingProfile: true }),
    true,
  );
  assert.equal(
    shouldProtectAiCartoonNavigation({ ...idle, phase: "succeeded" }),
    false,
  );
  assert.equal(
    shouldProtectAiCartoonNavigation({ ...idle, phase: "failed" }),
    false,
  );
});
