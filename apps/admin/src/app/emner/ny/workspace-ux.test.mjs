import assert from "node:assert/strict";
import test from "node:test";

import {
  assistantResponseBelongsToContext,
  exerciseSnapshotHasChanges,
  getAssistantContextGreeting,
  goalSnapshotHasChanges,
  syncExerciseMeasurementResetDefault,
  topicSnapshotHasChanges,
} from "./workspace-ux.ts";

test("assistant responses are shown only in the context that submitted them", () => {
  const requestId = "10000000-0000-4000-8000-000000000001";

  assert.equal(
    assistantResponseBelongsToContext({
      currentRequestId: requestId,
      responseRequestId: requestId,
      submittedRequestId: requestId,
    }),
    true,
  );
  assert.equal(
    assistantResponseBelongsToContext({
      currentRequestId: "20000000-0000-4000-8000-000000000002",
      responseRequestId: requestId,
      submittedRequestId: requestId,
    }),
    false,
  );
  assert.equal(
    assistantResponseBelongsToContext({
      currentRequestId: requestId,
      responseRequestId: requestId,
      submittedRequestId: null,
    }),
    false,
  );
});

test("every authoring step gets fresh, non-mutating assistant context copy", () => {
  for (const step of ["topic", "goal", "exercise", "wardrobe", "review"]) {
    assert.ok(getAssistantContextGreeting(step).length > 20);
  }

  assert.match(getAssistantContextGreeting("review"), /Intet ændres/);
  assert.match(getAssistantContextGreeting("wardrobe"), /ikke gemt/i);
});

test("measurement selection survives a native form reset", () => {
  const options = [
    { value: "completion", defaultSelected: true },
    { value: "repetitions", defaultSelected: false },
    { value: "duration", defaultSelected: false },
  ];

  syncExerciseMeasurementResetDefault(options, "repetitions");
  assert.deepEqual(
    options.map((option) => option.defaultSelected),
    [false, true, false],
  );

  syncExerciseMeasurementResetDefault(options, "duration");
  assert.deepEqual(
    options.map((option) => option.defaultSelected),
    [false, false, true],
  );
});

test("dirty checks follow the latest successful local snapshot", () => {
  const firstSavedTopic = {
    accentColor: "#53C987",
    description: "Trygge balancelege.",
    icon: "⚖️",
    title: "Balance",
  };
  const updatedTopic = {
    ...firstSavedTopic,
    description: "Trygge balancelege med små succeser.",
  };

  assert.equal(
    topicSnapshotHasChanges(firstSavedTopic, firstSavedTopic),
    false,
  );
  assert.equal(topicSnapshotHasChanges(firstSavedTopic, null), true);
  assert.equal(topicSnapshotHasChanges(updatedTopic, firstSavedTopic), true);
  assert.equal(topicSnapshotHasChanges(updatedTopic, updatedTopic), false);
  assert.equal(
    topicSnapshotHasChanges(
      { ...updatedTopic, title: "Balanceeventyr" },
      updatedTopic,
    ),
    true,
  );
});

test("goal and exercise dirty checks cover every editable field", () => {
  const goal = {
    difficulty: "beginner",
    equipment: "Pude",
    minutes: "10",
    summary: "Find balancen.",
    title: "Stå sikkert",
  };
  const exercise = {
    equipment: "Pude",
    instructions: "Stå roligt på puden.",
    measurement: "duration",
    minutes: "5",
    safety: "En voksen står tæt på.",
    target: "10",
    title: "Pudebalance",
  };

  assert.equal(goalSnapshotHasChanges(goal, goal), false);
  for (const change of [
    { difficulty: "intermediate" },
    { equipment: "Pude\nStol" },
    { minutes: "12" },
    { summary: "Find balancen med støtte." },
    { title: "Stå sikkert med støtte" },
  ]) {
    assert.equal(goalSnapshotHasChanges({ ...goal, ...change }, goal), true);
  }

  assert.equal(exerciseSnapshotHasChanges(exercise, exercise), false);

  for (const change of [
    { equipment: "Pude\nStol" },
    { instructions: "Stå på ét ben." },
    { measurement: "repetitions", target: "3" },
    { minutes: "6" },
    { safety: "Brug en væg som støtte." },
    { target: "15" },
    { title: "Pudebalance med støtte" },
  ]) {
    assert.equal(
      exerciseSnapshotHasChanges({ ...exercise, ...change }, exercise),
      true,
    );
  }
});
