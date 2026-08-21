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
