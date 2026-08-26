import assert from "node:assert/strict";
import test from "node:test";

import { buildTopicEditorHref } from "./ny/resume-topic-draft.ts";
import { buildNewSkillHref, buildSubjectDetailHref } from "./subject-routes.ts";

test("subject creation returns to the saved subject", () => {
  assert.equal(
    buildSubjectDetailHref("10000000-0000-4000-8000-000000000001"),
    "/emner/10000000-0000-4000-8000-000000000001",
  );
});

test("subject detail links to the manual and AI-assisted skill flows", () => {
  const topicId = "10000000-0000-4000-8000-000000000001";

  assert.equal(buildNewSkillHref(topicId), `/emner/${topicId}/faerdigheder/ny`);
  assert.equal(
    buildNewSkillHref(topicId, { suggestWithAi: true }),
    `/emner/${topicId}/faerdigheder/ny?mode=suggest`,
  );
});

test("route builders encode path segments without changing the query contract", () => {
  assert.equal(
    buildNewSkillHref("synthetic subject", { suggestWithAi: true }),
    "/emner/synthetic%20subject/faerdigheder/ny?mode=suggest",
  );
});

test("subject detail can open wardrobe management directly", () => {
  const topicId = "10000000-0000-4000-8000-000000000001";

  assert.equal(
    buildTopicEditorHref({ manageWardrobe: true, topicId }),
    `/emner/ny?topic=${topicId}&add=wardrobe`,
  );
});
