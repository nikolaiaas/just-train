import assert from "node:assert/strict";
import test from "node:test";

import {
  countDraftTopics,
  topicStatusCopy,
  topicStatusFilterOptions,
} from "./content-overview-state.ts";

test("the overview exposes only the statuses returned by the topic library", () => {
  assert.deepEqual(
    topicStatusFilterOptions.map(({ value }) => value),
    ["all", "published", "draft"],
  );
  assert.deepEqual(Object.keys(topicStatusCopy), ["published", "draft"]);
  assert.equal(topicStatusCopy.draft.label, "Kladde");
});

test("the draft total counts drafts explicitly", () => {
  assert.equal(
    countDraftTopics([
      { status: "published" },
      { status: "draft" },
      { status: "draft" },
    ]),
    2,
  );
});
