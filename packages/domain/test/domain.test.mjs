import assert from "node:assert/strict";
import test from "node:test";

import {
  WARDROBE_EQUIP_SLOTS,
  demoExercises,
  demoGoal,
  demoProgress,
  equipWardrobeItem,
  getCurrentExercise,
  getExercisesForGoal,
  getGoalProgress,
  hasExclusiveWardrobeEquipSlots,
  unequipWardrobeSlot,
} from "../src/index.ts";

test("demo progress resolves to the third exercise at 48 percent", () => {
  const summary = getGoalProgress(demoGoal, demoProgress);

  assert.equal(summary.completedExercises, 2);
  assert.equal(summary.totalExercises, 6);
  assert.equal(summary.currentExerciseNumber, 3);
  assert.equal(summary.percentage, 48);
});

test("current exercise resolves from the progress fixture", () => {
  assert.equal(
    getCurrentExercise(demoExercises, demoProgress)?.title,
    "To spark og grib",
  );
});

test("goal exercises are returned in their learning order", () => {
  const exercises = getExercisesForGoal(demoExercises, demoGoal.id);

  assert.deepEqual(
    exercises.map((exercise) => exercise.order),
    [1, 2, 3, 4, 5, 6],
  );
});

test("wardrobe positions use one feet slot for one complete pair of shoes", () => {
  assert.deepEqual(WARDROBE_EQUIP_SLOTS, [
    "head",
    "body",
    "held",
    "feet",
    "accessory",
  ]);

  const helmet = { id: "helmet", equipSlot: "head" };
  const starShoes = { id: "star-shoes", equipSlot: "feet" };
  const rainbowShoes = { id: "rainbow-shoes", equipSlot: "feet" };
  const firstSelection = equipWardrobeItem([], helmet);
  const withShoes = equipWardrobeItem(firstSelection, starShoes);
  const replacedShoes = equipWardrobeItem(withShoes, rainbowShoes);

  assert.deepEqual(replacedShoes, [helmet, rainbowShoes]);
  assert.equal(hasExclusiveWardrobeEquipSlots(replacedShoes), true);
});

test("equipping the same wardrobe item is idempotent", () => {
  const item = { id: "wand", equipSlot: "held" };

  assert.deepEqual(equipWardrobeItem([item], item), [item]);
});

test("the wardrobe invariant detects duplicate exclusive positions", () => {
  assert.equal(
    hasExclusiveWardrobeEquipSlots([
      { id: "star-shoes", equipSlot: "feet" },
      { id: "rainbow-shoes", equipSlot: "feet" },
    ]),
    false,
  );
  assert.equal(
    hasExclusiveWardrobeEquipSlots([
      { id: "helmet", equipSlot: "head" },
      { id: "star-shoes", equipSlot: "feet" },
      { id: "wand", equipSlot: "held" },
    ]),
    true,
  );
});

test("unequipping one position preserves every other equipped item", () => {
  const helmet = { id: "helmet", equipSlot: "head" };
  const shoes = { id: "shoes", equipSlot: "feet" };

  assert.deepEqual(unequipWardrobeSlot([helmet, shoes], "feet"), [helmet]);
});
