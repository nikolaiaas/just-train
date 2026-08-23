import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_WARDROBE_EDITORIAL_NOTE_LENGTH,
  MAX_WARDROBE_DESCRIPTION_LENGTH,
  MAX_WARDROBE_ICON_LENGTH,
  MAX_WARDROBE_NAME_LENGTH,
  MAX_WARDROBE_POINTS,
  MAX_WARDROBE_UNLOCK_RULE_LENGTH,
  validateWardrobeDecisionForm,
  validateWardrobeItemDraftForm,
} from "./wardrobe-item-draft.ts";

const ITEM_ID = "d4000000-0000-4000-8000-000000000001";
const TOPIC_ID = "d4000000-0000-4000-8000-000000000002";

function draftForm(overrides = {}) {
  const values = {
    requestId: ITEM_ID,
    topicId: TOPIC_ID,
    name: "  Regnbuebold  ",
    icon: "  🌈  ",
    description: "  En farverig syntetisk bold til garderoben.  ",
    imagePath: "A9ED2205-4AB3-4A28-99D0-A8E61E4A2260/01.PNG",
    category: "equipment",
    equipSlot: "held",
    rarity: "rare",
    points: "125",
    unlockRule: "",
    editorialNote: "  Passer til emnets farver.  ",
    sortOrder: "2",
    ...overrides,
  };
  const formData = new FormData();
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) formData.append(name, value);
  }
  return formData;
}

function decisionForm(overrides = {}) {
  const values = {
    itemId: ITEM_ID,
    topicId: TOPIC_ID,
    expectedUpdatedAt: "2026-08-22T10:00:00.000Z",
    decision: "approved",
    ...overrides,
  };
  const formData = new FormData();
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) formData.append(name, value);
  }
  return formData;
}

test("normalizes a point-priced wardrobe draft", () => {
  assert.deepEqual(validateWardrobeItemDraftForm(draftForm()), {
    ok: true,
    value: {
      requestId: ITEM_ID,
      topicId: TOPIC_ID,
      name: "Regnbuebold",
      icon: "🌈",
      description: "En farverig syntetisk bold til garderoben.",
      imagePath: "a9ed2205-4ab3-4a28-99d0-a8e61e4a2260/01.png",
      category: "equipment",
      equipSlot: "held",
      rarity: "rare",
      points: 125,
      unlockRule: "",
      editorialNote: "Passer til emnets farver.",
      sortOrder: 2,
    },
  });
});

test("accepts an unlock rule only when points are zero", () => {
  const result = validateWardrobeItemDraftForm(
    draftForm({ points: "0", unlockRule: "Gennemfør tre deløvelser" }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.value.points : null, 0);

  for (const invalid of [
    draftForm({ points: "0", unlockRule: "" }),
    draftForm({ points: "50", unlockRule: "Gennemfør et mål" }),
  ]) {
    const validation = validateWardrobeItemDraftForm(invalid);
    assert.equal(validation.ok, false);
    assert.ok(!validation.ok && validation.fieldErrors.unlockRule);
  }
});

test("rejects duplicated, missing, and non-string fields", () => {
  const form = draftForm();
  form.append("name", "Et andet navn");
  form.delete("rarity");
  form.set("icon", new Blob(["synthetic"], { type: "text/plain" }));
  const result = validateWardrobeItemDraftForm(form);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.fieldErrors.name);
  assert.ok(!result.ok && result.fieldErrors.rarity);
  assert.ok(!result.ok && result.fieldErrors.icon);
});

test("requires one supported exclusive equipment position", () => {
  for (const equipSlot of ["head", "body", "held", "feet", "accessory"]) {
    const result = validateWardrobeItemDraftForm(draftForm({ equipSlot }));
    assert.equal(result.ok, true, equipSlot);
  }

  for (const equipSlot of ["", "left-shoe", "both-hands"]) {
    const result = validateWardrobeItemDraftForm(draftForm({ equipSlot }));
    assert.equal(result.ok, false, equipSlot);
    assert.ok(!result.ok && result.fieldErrors.equipSlot);
  }
});

test("enforces bounded content and point values", () => {
  const cases = [
    ["name", "x".repeat(MAX_WARDROBE_NAME_LENGTH + 1)],
    ["icon", "🙂".repeat(MAX_WARDROBE_ICON_LENGTH + 1)],
    ["description", "x".repeat(MAX_WARDROBE_DESCRIPTION_LENGTH + 1)],
    ["points", String(MAX_WARDROBE_POINTS + 1)],
    ["unlockRule", "x".repeat(MAX_WARDROBE_UNLOCK_RULE_LENGTH + 1)],
    ["editorialNote", "x".repeat(MAX_WARDROBE_EDITORIAL_NOTE_LENGTH + 1)],
  ];

  for (const [field, value] of cases) {
    const overrides =
      field === "unlockRule"
        ? { points: "0", unlockRule: value }
        : { [field]: value };
    const result = validateWardrobeItemDraftForm(draftForm(overrides));
    assert.equal(result.ok, false, field);
    assert.ok(!result.ok && result.fieldErrors[field], field);
  }
});

test("allows legacy items without an image and rejects foreign image paths", () => {
  const legacy = validateWardrobeItemDraftForm(
    draftForm({ description: "", imagePath: "" }),
  );
  assert.equal(legacy.ok, true);

  for (const imagePath of [
    "https://example.com/item.png",
    "a9ed2205-4ab3-4a28-99d0-a8e61e4a2260/sheet.png",
    "a9ed2205-4ab3-4a28-99d0-a8e61e4a2260/17.png",
  ]) {
    const result = validateWardrobeItemDraftForm(draftForm({ imagePath }));
    assert.equal(result.ok, false, imagePath);
    assert.ok(!result.ok && result.fieldErrors.imagePath);
  }
});

test("validates only approved or rejected decisions with a revision", () => {
  assert.deepEqual(validateWardrobeDecisionForm(decisionForm()), {
    ok: true,
    value: {
      itemId: ITEM_ID,
      topicId: TOPIC_ID,
      expectedUpdatedAt: "2026-08-22T10:00:00.000Z",
      decision: "approved",
    },
  });

  for (const overrides of [
    { itemId: "invalid" },
    { decision: "draft" },
    { expectedUpdatedAt: "not-a-date" },
  ]) {
    assert.equal(
      validateWardrobeDecisionForm(decisionForm(overrides)).ok,
      false,
    );
  }
});
