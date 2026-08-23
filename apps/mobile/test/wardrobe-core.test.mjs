import assert from "node:assert/strict";
import test from "node:test";

import { WardrobeError } from "@bare-traen/api-client";

import {
  WARDROBE_SLOT_DETAILS,
  applyWardrobeEquipmentState,
  getWardrobeErrorMessage,
  getWardrobeImageAccessibilityLabel,
  planWardrobeEquipment,
  resolveSelectedChildWardrobeId,
} from "../src/wardrobe/core.ts";

const childId = "30000000-0000-4000-8000-000000000001";
const topicId = "10000000-0000-4000-8000-000000000001";

function wardrobeItem(overrides) {
  return {
    acquiredAt: "2026-08-23T08:00:00.000Z",
    category: "clothing",
    childProfileId: childId,
    description: "Et helt par lette sko med lyn på siden.",
    equipSlot: "feet",
    equippedAt: null,
    icon: "👟",
    imagePath: "70000000-0000-4000-8000-000000000001/01.png",
    imageUrl:
      "https://example.test/wardrobe-images/70000000-0000-4000-8000-000000000001/01.png",
    isEquipped: false,
    name: "Lynsko",
    rarity: "rare",
    topicId,
    wardrobeItemId: "f1000000-0000-4000-8000-000000000001",
    ...overrides,
  };
}

test("describes wardrobe images without exposing the legacy emoji", () => {
  const shoes = wardrobeItem({
    description: "  Et helt par lette sko\nmed lyn på siden.  ",
  });

  assert.equal(
    getWardrobeImageAccessibilityLabel(shoes),
    "Lynsko. Et helt par lette sko med lyn på siden.",
  );
  assert.doesNotMatch(getWardrobeImageAccessibilityLabel(shoes), /👟/u);
  assert.equal(
    getWardrobeImageAccessibilityLabel({ description: "", name: "Lynsko" }),
    "Lynsko",
  );
});

test("treats a feet item as one shoe pair and plans an explicit replacement", () => {
  const currentShoes = wardrobeItem({
    equippedAt: "2026-08-23T08:05:00.000Z",
    isEquipped: true,
    name: "Grønne sko",
  });
  const newShoes = wardrobeItem({
    name: "Røde sko",
    wardrobeItemId: "f1000000-0000-4000-8000-000000000002",
  });

  assert.match(WARDROBE_SLOT_DETAILS.feet.label, /par/);
  assert.match(WARDROBE_SLOT_DETAILS.feet.description, /samlet par/);
  assert.deepEqual(planWardrobeEquipment([currentShoes, newShoes], newShoes), {
    kind: "replace",
    replacement: currentShoes,
  });
});

test("applies the atomic equipment answer and removes the previous same-slot item", () => {
  const currentShoes = wardrobeItem({
    equippedAt: "2026-08-23T08:05:00.000Z",
    isEquipped: true,
    name: "Grønne sko",
  });
  const newShoes = wardrobeItem({
    name: "Røde sko",
    wardrobeItemId: "f1000000-0000-4000-8000-000000000002",
  });
  const helmet = wardrobeItem({
    equipSlot: "head",
    equippedAt: "2026-08-23T08:06:00.000Z",
    icon: "🧢",
    isEquipped: true,
    name: "Hjelm",
    wardrobeItemId: "f1000000-0000-4000-8000-000000000003",
  });

  const result = applyWardrobeEquipmentState([currentShoes, newShoes, helmet], {
    acquiredAt: newShoes.acquiredAt,
    childProfileId: childId,
    equipSlot: "feet",
    equippedAt: "2026-08-23T08:10:00.000Z",
    isEquipped: true,
    wardrobeItemId: newShoes.wardrobeItemId,
  });

  assert.equal(result[0].isEquipped, false);
  assert.equal(result[0].equippedAt, null);
  assert.equal(result[1].isEquipped, true);
  assert.equal(result[1].name, "Røde sko");
  assert.equal(result[2].isEquipped, true);
});

test("rejects stale or mismatched equipment answers", () => {
  const shoes = wardrobeItem({});

  assert.throws(
    () =>
      applyWardrobeEquipmentState([shoes], {
        acquiredAt: shoes.acquiredAt,
        childProfileId: childId,
        equipSlot: "head",
        equippedAt: null,
        isEquipped: false,
        wardrobeItemId: shoes.wardrobeItemId,
      }),
    /matcher ikke/,
  );
});

test("scopes wardrobe requests to the selected child in the current session", () => {
  assert.equal(
    resolveSelectedChildWardrobeId({
      availableChildIds: [childId],
      bootstrapProfileId: "20000000-0000-4000-8000-000000000001",
      currentSessionUserId: "20000000-0000-4000-8000-000000000001",
      selectedChildId: childId,
      sessionUserId: "20000000-0000-4000-8000-000000000001",
    }),
    childId,
  );

  assert.throws(
    () =>
      resolveSelectedChildWardrobeId({
        availableChildIds: [childId],
        bootstrapProfileId: "20000000-0000-4000-8000-000000000001",
        currentSessionUserId: "20000000-0000-4000-8000-000000000002",
        selectedChildId: childId,
        sessionUserId: "20000000-0000-4000-8000-000000000001",
      }),
    /aktivt barn/,
  );
});

test("maps stable API errors without leaking database details", () => {
  assert.match(
    getWardrobeErrorMessage(
      new WardrobeError("child_wardrobe_mutation_failed"),
    ),
    /ikke gemmes/,
  );
  assert.match(getWardrobeErrorMessage(new Error("database detail")), /Prøv/);
  assert.doesNotMatch(
    getWardrobeErrorMessage(new Error("database detail")),
    /database detail/,
  );
});
