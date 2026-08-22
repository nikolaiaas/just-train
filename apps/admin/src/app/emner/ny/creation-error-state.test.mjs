import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminContentError,
  AdminContentStepError,
} from "@bare-traen/api-client";

import {
  mapExerciseCreationError,
  mapExerciseUpdateError,
  mapGoalCreationError,
  mapGoalUpdateError,
  mapTopicCreationError,
  mapTopicUpdateError,
} from "./creation-error-state.ts";

test("maps duplicate generated names to the visible title fields", () => {
  for (const [mapError, error, noun] of [
    [
      mapTopicCreationError,
      new AdminContentError("topic_slug_conflict"),
      "emne",
    ],
    [
      mapGoalCreationError,
      new AdminContentStepError("goal_slug_conflict"),
      "mål",
    ],
    [
      mapExerciseCreationError,
      new AdminContentStepError("exercise_slug_conflict"),
      "deløvelse",
    ],
  ]) {
    const result = mapError(error);

    assert.equal(result.status, "invalid");
    assert.match(result.message, new RegExp(noun, "i"));
    assert.match(result.fieldErrors.title, /findes allerede/i);
    assert.doesNotMatch(result.message, /slug|constraint|23505/i);
  }
});

test("uses the same field guidance when a saved draft is renamed to a duplicate", () => {
  for (const [mapError, error] of [
    [mapTopicUpdateError, new AdminContentError("topic_slug_conflict")],
    [mapGoalUpdateError, new AdminContentStepError("goal_slug_conflict")],
    [
      mapExerciseUpdateError,
      new AdminContentStepError("exercise_slug_conflict"),
    ],
  ]) {
    const result = mapError(error);

    assert.equal(result.status, "invalid");
    assert.match(result.fieldErrors.title, /vælg et andet navn/i);
  }
});

test("explains when content can no longer be edited without exposing why it was hidden", () => {
  for (const [mapError, error] of [
    [mapTopicUpdateError, new AdminContentError("topic_draft_not_editable")],
    [mapGoalUpdateError, new AdminContentStepError("goal_draft_not_editable")],
    [
      mapExerciseUpdateError,
      new AdminContentStepError("exercise_draft_not_editable"),
    ],
  ]) {
    const result = mapError(error);

    assert.equal(result.status, "unavailable");
    assert.match(result.message, /fjernet eller have ændret status/i);
  }
});

test("explains stale edit conflicts without discarding the administrator's work", () => {
  for (const [mapError, error] of [
    [mapTopicUpdateError, new AdminContentError("topic_draft_conflict")],
    [mapGoalUpdateError, new AdminContentStepError("goal_draft_conflict")],
    [
      mapExerciseUpdateError,
      new AdminContentStepError("exercise_draft_conflict"),
    ],
  ]) {
    const result = mapError(error);

    assert.equal(result.status, "unavailable");
    assert.match(result.message, /ændret et andet sted/i);
    assert.match(result.message, /ikke gemt/i);
    assert.match(result.message, /genindlæs/i);
  }
});

test("keeps unexpected database details out of administrator messages", () => {
  const rawError = new Error(
    'duplicate key value violates unique constraint "topics_slug_key"',
  );

  for (const mapError of [
    mapTopicCreationError,
    mapTopicUpdateError,
    mapGoalCreationError,
    mapGoalUpdateError,
    mapExerciseCreationError,
    mapExerciseUpdateError,
  ]) {
    const result = mapError(rawError);

    assert.equal(result.status, "unavailable");
    assert.doesNotMatch(
      result.message,
      /duplicate|constraint|topics_slug_key/i,
    );
  }
});
