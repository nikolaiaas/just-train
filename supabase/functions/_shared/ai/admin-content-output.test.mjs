import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAdminContentOutput } from "./admin-content-output.ts";

test("canonicalizes single-line copy and case-insensitive equipment duplicates", () => {
  assert.deepEqual(
    normalizeAdminContentOutput("content.goal_draft", {
      reply: "Et forslag\r\nmed forklaring",
      suggestion: {
        ready: true,
        title: "Styr\n  bolden",
        summary: "Hold bolden tæt.\r\nTag det roligt.",
        difficulty: "beginner",
        estimatedMinutes: 10,
        equipment: [" Bold ", "bold", "4\t kegler"],
        reason: "Et\rklart første mål.",
      },
    }),
    {
      reply: "Et forslag\nmed forklaring",
      suggestion: {
        difficulty: "beginner",
        equipment: ["Bold", "4 kegler"],
        estimatedMinutes: 10,
        ready: true,
        reason: "Et\nklart første mål.",
        summary: "Hold bolden tæt.\nTag det roligt.",
        title: "Styr bolden",
      },
    },
  );
});

test("canonicalizes topic, exercise, and wardrobe output without changing structure", () => {
  const topic = normalizeAdminContentOutput("content.topic_brief", {
    reply: " Klar idé ",
    suggestion: {
      ready: true,
      title: "Bold\n leg",
      description: "Leg\r\nmed bold",
      icon: "⚽\n✨",
      accentColor: "#53C987",
      reason: "Passer til emnet.",
    },
  });
  const exercise = normalizeAdminContentOutput("content.exercise_draft", {
    reply: "Prøv dette.",
    suggestion: {
      ready: false,
      title: "",
      instructions: "",
      measurement: "repetitions",
      targetValue: null,
      recommendedMinutes: null,
      equipment: ["Bold", "BOLD"],
      safetyNote: "",
      reason: "Målet skal afklares.",
    },
  });
  const wardrobe = normalizeAdminContentOutput("content.wardrobe_examples", {
    reply: "Tre idéer.",
    items: Array.from({ length: 3 }, (_, index) => ({
      name: `Regnbue\n ting ${index + 1}`,
      icon: "🌈",
      category: "equipment",
      equipSlot: index === 0 ? "feet" : "accessory",
      rarity: "common",
      points: 100,
      unlockRule: "",
      reason: "Et brandfrit eksempel.",
    })),
  });

  assert.equal(topic?.suggestion.title, "Bold leg");
  assert.equal(topic?.suggestion.description, "Leg\nmed bold");
  assert.deepEqual(exercise?.suggestion.equipment, ["Bold"]);
  assert.equal(wardrobe?.items[0].name, "Regnbue ting 1");
  assert.equal(wardrobe?.items[0].equipSlot, "feet");
});

test("preserves immutable legacy wardrobe shape and rejects unknown slots", () => {
  const legacyItems = Array.from({ length: 3 }, (_, index) => ({
    name: `Legacyting ${index + 1}`,
    icon: "🌟",
    category: "clothing",
    rarity: "common",
    points: 100,
    unlockRule: "",
    reason: "Et ældre versionsbundet forslag.",
  }));

  const legacy = normalizeAdminContentOutput("content.wardrobe_examples", {
    reply: "Tre ældre forslag.",
    items: legacyItems,
  });
  const invalid = normalizeAdminContentOutput("content.wardrobe_examples", {
    reply: "Tre forslag med en forkert placering.",
    items: legacyItems.map((item) => ({ ...item, equipSlot: "left-foot" })),
  });

  assert.equal(Object.hasOwn(legacy?.items[0] ?? {}, "equipSlot"), false);
  assert.equal(invalid, null);
});

function wardrobeGridItem(ordinal, overrides = {}) {
  return {
    ordinal,
    name: `Fodboldting ${ordinal}`,
    description: `En venlig garderobeting til fodbold ${ordinal}.`,
    visualDescription: `A centered blue football item, variant ${ordinal}.`,
    category: "clothing",
    equipSlot: ordinal % 2 === 0 ? "feet" : "accessory",
    rarity: "common",
    points: 100,
    unlockRule: "",
    reason: "Passer til emnets legende udtryk.",
    ...overrides,
  };
}

test("normalizes exactly sixteen row-major wardrobe grid items without icons", () => {
  const items = Array.from({ length: 16 }, (_, index) =>
    wardrobeGridItem(index + 1, {
      name: ` Fodbold\n ting ${index + 1} `,
      description: ` Beskrivelse ${index + 1}. `,
    }),
  );

  const normalized = normalizeAdminContentOutput("content.wardrobe_grid_plan", {
    items,
  });

  assert.equal(normalized?.items.length, 16);
  assert.equal(normalized?.items[0].ordinal, 1);
  assert.equal(normalized?.items[15].ordinal, 16);
  assert.equal(normalized?.items[0].name, "Fodbold ting 1");
  assert.equal(normalized?.items[0].description, "Beskrivelse 1.");
  assert.equal(Object.hasOwn(normalized?.items[0] ?? {}, "icon"), false);
});

test("rejects incomplete, reordered, icon-bearing, and invalid-reward grid plans", () => {
  const validItems = Array.from({ length: 16 }, (_, index) =>
    wardrobeGridItem(index + 1),
  );

  for (const items of [
    validItems.slice(0, 15),
    validItems.map((item, index) =>
      index === 1 ? { ...item, ordinal: 3 } : item,
    ),
    validItems.map((item, index) =>
      index === 0 ? { ...item, icon: "👟" } : item,
    ),
    validItems.map((item, index) =>
      index === 0 ? { ...item, points: 0, unlockRule: "" } : item,
    ),
    validItems.map((item, index) =>
      index === 0
        ? { ...item, points: 100, unlockRule: "Efter tre øvelser" }
        : item,
    ),
  ]) {
    assert.equal(
      normalizeAdminContentOutput("content.wardrobe_grid_plan", { items }),
      null,
    );
  }
});

test("fails closed when canonicalization removes required copy", () => {
  assert.equal(
    normalizeAdminContentOutput("content.topic_brief", {
      reply: "\u0000",
      suggestion: {
        ready: true,
        title: "Balance",
        description: "Tryg bevægelse",
        icon: "✨",
        accentColor: "#53C987",
        reason: "Klar",
      },
    }),
    null,
  );
});

test("canonicalizes a non-mutating draft review without creating proposal data", () => {
  assert.deepEqual(
    normalizeAdminContentOutput("content.draft_review", {
      reply: " Samlet set er kladden klar. ",
      verdict: "ready_for_human_review",
      checklist: {
        topic: { status: "ok", note: " Tydeligt\r\nemne. " },
        goal: { status: "ok", note: "Målet passer." },
        exercise: { status: "ok", note: "Trinnet er konkret." },
        wardrobe: {
          status: "optional",
          note: "Garderobeeksempler er valgfrie.",
        },
      },
      nextActions: [
        " Læs sikkerhedsteksten højt ",
        "læs sikkerhedsteksten højt",
      ],
    }),
    {
      checklist: {
        exercise: { note: "Trinnet er konkret.", status: "ok" },
        goal: { note: "Målet passer.", status: "ok" },
        topic: { note: "Tydeligt\nemne.", status: "ok" },
        wardrobe: {
          note: "Garderobeeksempler er valgfrie.",
          status: "optional",
        },
      },
      nextActions: ["Læs sikkerhedsteksten højt"],
      reply: "Samlet set er kladden klar.",
      verdict: "ready_for_human_review",
    },
  );

  assert.equal(
    normalizeAdminContentOutput("content.draft_review", {
      reply: "Forkert status.",
      verdict: "ready_for_human_review",
      checklist: {
        topic: { status: "optional", note: "Emnet kan ikke være valgfrit." },
        goal: { status: "ok", note: "Klar." },
        exercise: { status: "ok", note: "Klar." },
        wardrobe: { status: "optional", note: "Valgfri." },
      },
      nextActions: [],
    }),
    null,
  );
});
