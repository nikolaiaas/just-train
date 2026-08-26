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

function skillSuggestion(ordinal, overrides = {}) {
  return {
    ordinal,
    title: `Færdighed ${ordinal}`,
    slug: `faerdighed-${ordinal}`,
    childDescription: `Du lærer færdighed ${ordinal}.`,
    difficulty: "beginner",
    estimatedMinutes: 20,
    editorialReason: "Et tydeligt trin i emnet.",
    ...overrides,
  };
}

function skillExercise(ordinal, overrides = {}) {
  return {
    ordinal,
    title: `Øvelse ${ordinal}`,
    slug: `oevelse-${ordinal}`,
    childInstructions: "Du fører bolden roligt mellem keglerne.",
    measurement: "completion",
    targetValue: null,
    recommendedMinutes: 10,
    equipment: [" Bold ", "bold"],
    childSafetyNote: "Få hjælp af en voksen, hvis banen er glat.",
    editorialReason: "En enkel og tydelig øvelse.",
    ...overrides,
  };
}

test("normalizes ordered skill suggestions and complete exercise packages", () => {
  const suggestions = normalizeAdminContentOutput("content.skill_suggestions", {
    reply: " Tre muligheder. ",
    skills: [skillSuggestion(1), skillSuggestion(2), skillSuggestion(3)],
  });
  const packageOutput = normalizeAdminContentOutput("content.skill_package", {
    reply: " Et samlet udkast. ",
    skill: {
      title: " Dribling ",
      slug: "dribling",
      childDescription: " Du lærer at holde bolden tæt. ",
      difficulty: "beginner",
      estimatedMinutes: 30,
      equipment: ["Bold", "bold", "4\t kegler"],
      editorialReason: "Et godt første trin.",
    },
    exercises: [skillExercise(1), skillExercise(2)],
  });

  assert.equal(suggestions?.skills.length, 3);
  assert.equal(suggestions?.reply, "Tre muligheder.");
  assert.equal(packageOutput?.skill.title, "Dribling");
  assert.deepEqual(packageOutput?.skill.equipment, ["Bold", "4 kegler"]);
  assert.deepEqual(packageOutput?.exercises[0].equipment, ["Bold"]);
});

test("rejects reordered, duplicate, inconsistent, and parent-framed skill copy", () => {
  const validSuggestions = [
    skillSuggestion(1),
    skillSuggestion(2),
    skillSuggestion(3),
  ];

  for (const skills of [
    validSuggestions.map((skill, index) =>
      index === 1 ? { ...skill, ordinal: 3 } : skill,
    ),
    validSuggestions.map((skill, index) =>
      index === 1 ? { ...skill, slug: "faerdighed-1" } : skill,
    ),
    validSuggestions.map((skill, index) =>
      index === 1
        ? { ...skill, childDescription: "Dit barn lærer at drible." }
        : skill,
    ),
    validSuggestions.map((skill, index) =>
      index === 1
        ? { ...skill, childDescription: "Barnet lærer at drible." }
        : skill,
    ),
    validSuggestions.map((skill, index) =>
      index === 1
        ? { ...skill, childDescription: "Forældre skal holde bolden." }
        : skill,
    ),
    validSuggestions.map((skill, index) =>
      index === 1
        ? { ...skill, childDescription: "Børn kan øve sig med bolden." }
        : skill,
    ),
    validSuggestions.map((skill, index) =>
      index === 1
        ? { ...skill, childDescription: "Forældre hjælper med øvelsen." }
        : skill,
    ),
    validSuggestions.map((skill, index) =>
      index === 1
        ? { ...skill, childDescription: "Barn løber gennem banen." }
        : skill,
    ),
    validSuggestions.map((skill, index) =>
      index === 1
        ? { ...skill, childDescription: "Børn dribler med bolden." }
        : skill,
    ),
  ]) {
    assert.equal(
      normalizeAdminContentOutput("content.skill_suggestions", {
        reply: "Tre muligheder.",
        skills,
      }),
      null,
    );
  }

  for (const exercises of [
    [skillExercise(1, { targetValue: 3 }), skillExercise(2)],
    [
      skillExercise(1, {
        childSafetyNote: "Sørg for at barnet bruger en sikker bane.",
      }),
      skillExercise(2),
    ],
  ]) {
    assert.equal(
      normalizeAdminContentOutput("content.skill_package", {
        reply: "Et udkast.",
        skill: {
          title: "Dribling",
          slug: "dribling",
          childDescription: "Du lærer at holde bolden tæt.",
          difficulty: "beginner",
          estimatedMinutes: 30,
          equipment: ["Bold"],
          editorialReason: "Et godt trin.",
        },
        exercises,
      }),
      null,
    );
  }

  assert.notEqual(
    normalizeAdminContentOutput("content.skill_package", {
      reply: "Et udkast.",
      skill: {
        title: "Dribling",
        slug: "dribling",
        childDescription: "Du lærer at holde bolden tæt.",
        difficulty: "beginner",
        estimatedMinutes: 30,
        equipment: ["Bold"],
        editorialReason: "Et godt trin.",
      },
      exercises: [
        skillExercise(1, {
          childSafetyNote: "Spørg dine forældre om hjælp.",
        }),
        skillExercise(2),
      ],
    }),
    null,
  );
});

test("rejects parent-framed copy from existing child-visible operations", () => {
  for (const summary of [
    "Dit barn lærer at drible.",
    "Som forælder kan du stille keglerne frem.",
    "Kære forældre, find en bold sammen.",
    "Denne besked er til forældrene.",
    "Forælderen bør hjælpe med banen.",
    "Børn kan øve sig med bolden.",
    "Barn løber gennem banen.",
    "Børn dribler med bolden.",
    "Forældre hjælper med øvelsen.",
  ]) {
    assert.equal(
      normalizeAdminContentOutput("content.goal_draft", {
        reply: "Forslag.",
        suggestion: {
          ready: true,
          title: "Dribling",
          summary,
          difficulty: "beginner",
          estimatedMinutes: 20,
          equipment: ["Bold"],
          reason: "Relevant.",
        },
      }),
      null,
      summary,
    );
  }
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
