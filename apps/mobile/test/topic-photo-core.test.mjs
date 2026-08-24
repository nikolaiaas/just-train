import assert from "node:assert/strict";
import test from "node:test";

import {
  canOpenFixtureTraining,
  findChildTopic,
  getTopicPhotoErrorMessage,
} from "../src/topics/core.ts";

const football = {
  accentColor: "#008378",
  description: "Leg med bolden.",
  icon: "⚽",
  id: "b1000000-0000-4000-8000-000000000001",
  photo: null,
  slug: "fodbold",
  sortOrder: 0,
  title: "Fodbold",
};

test("finds only an exact published topic id from the selected child list", () => {
  assert.equal(findChildTopic([football], football.id), football);
  assert.equal(findChildTopic([football], "not-a-topic"), null);
  assert.equal(
    findChildTopic([football], "b1000000-0000-4000-8000-000000000002"),
    null,
  );
});

test("opens fixture training only for the honest football preview", () => {
  assert.equal(canOpenFixtureTraining(football), true);
  assert.equal(canOpenFixtureTraining({ ...football, slug: "balance" }), false);
});

test("maps topic-photo failures to short child-safe messages", () => {
  assert.match(
    getTopicPhotoErrorMessage({ code: "session_changed" }),
    /Profilen skiftede/,
  );
  assert.match(
    getTopicPhotoErrorMessage({ code: "invalid_image_bytes" }),
    /andet billede/,
  );
  assert.match(
    getTopicPhotoErrorMessage({ code: "upload_limit_reached" }),
    /spørg en voksen/,
  );
  assert.doesNotMatch(
    getTopicPhotoErrorMessage({ code: "upload_limit_reached" }),
    /Prøv igen/,
  );
  assert.doesNotMatch(getTopicPhotoErrorMessage(new Error("secret")), /secret/);
});
