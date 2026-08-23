import assert from "node:assert/strict";
import test from "node:test";

import {
  assistantResponseBelongsToContext,
  exerciseSnapshotHasChanges,
  getAssistantContextGreeting,
  goalSnapshotHasChanges,
  orderWardrobeSuggestions,
  syncExerciseMeasurementResetDefault,
  topicSnapshotHasChanges,
  wardrobeSuggestionSnapshot,
  wardrobeSnapshotHasChanges,
} from "./workspace-ux.ts";

test("wardrobe image suggestions render in immutable row-major order", () => {
  const suggestions = Array.from({ length: 16 }, (_, index) => ({
    name: `Forslag ${16 - index}`,
    ordinal: 16 - index,
  }));
  const ordered = orderWardrobeSuggestions(suggestions);

  assert.deepEqual(
    ordered.map((item) => item.ordinal),
    Array.from({ length: 16 }, (_, index) => index + 1),
  );
  assert.equal(suggestions[0].ordinal, 16);
});

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

test("wardrobe dirty checks cover content and unlock method", () => {
  const item = {
    category: "equipment",
    description: "En farverig bold, som barnet kan holde i hånden.",
    editorialNote: "Passer til emnet.",
    equipSlot: "held",
    icon: "🌈",
    imagePath: "70000000-0000-4000-8000-000000000001/01.png",
    name: "Regnbuebold",
    points: "125",
    rarity: "rare",
    unlockMode: "points",
    unlockRule: "",
  };

  assert.equal(wardrobeSnapshotHasChanges(item, item), false);
  assert.equal(wardrobeSnapshotHasChanges(item, null), true);
  assert.equal(
    wardrobeSnapshotHasChanges(
      {
        ...item,
        description: "  En farverig bold, som barnet kan holde i hånden.\r\n",
        editorialNote: "  Passer til emnet.\r\n",
        icon: "  🌈 ",
        imagePath: "  70000000-0000-4000-8000-000000000001/01.png ",
        name: "  Regnbuebold ",
        points: "0125",
      },
      item,
    ),
    false,
  );

  for (const change of [
    { category: "effect" },
    { description: "En bold med klare regnbuefarver." },
    { editorialNote: "Passer til farvetemaet." },
    { equipSlot: "accessory" },
    { icon: "⚽" },
    { imagePath: "70000000-0000-4000-8000-000000000001/02.png" },
    { name: "Stjernebold" },
    { points: "150" },
    { rarity: "special" },
    { unlockMode: "rule", points: "0", unlockRule: "Gennemfør et mål" },
  ]) {
    assert.equal(
      wardrobeSnapshotHasChanges({ ...item, ...change }, item),
      true,
    );
  }
});

test("wardrobe suggestions keep their proposed equipment slot editable", () => {
  const snapshot = wardrobeSuggestionSnapshot({
    category: "clothing",
    description: "Et helt par blå sko med stjerner.",
    equipSlot: "feet",
    imagePath: "70000000-0000-4000-8000-000000000001/01.png",
    name: "Stjernesko",
    points: 75,
    rarity: "rare",
    reason: "Passer til emnet.",
    unlockRule: "",
  });

  assert.equal(snapshot.equipSlot, "feet");
  assert.equal(snapshot.description, "Et helt par blå sko med stjerner.");
  assert.equal(
    snapshot.imagePath,
    "70000000-0000-4000-8000-000000000001/01.png",
  );
  assert.equal(snapshot.icon, "✨");
  assert.equal(snapshot.unlockMode, "points");
  assert.equal(snapshot.points, "75");
});
