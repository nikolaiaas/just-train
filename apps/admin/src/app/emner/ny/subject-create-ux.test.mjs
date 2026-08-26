import assert from "node:assert/strict";
import test from "node:test";

import { buildSubjectAssistantContext } from "./subject-create-ux.ts";

test("the optional subject assistant receives topic context without inventing a skill", () => {
  assert.deepEqual(
    buildSubjectAssistantContext({
      accentColor: "#53c987",
      description: "  Prøv tricks med bolden.\r\nFind din egen stil.  ",
      icon: " ⚽️ ",
      title: "  Fodbold  ",
    }),
    {
      topic: {
        accentColor: "#53C987",
        description: "Prøv tricks med bolden.\nFind din egen stil.",
        icon: "⚽️",
        title: "Fodbold",
      },
      goal: {
        title: "",
        summary: "",
        difficulty: "beginner",
        estimatedMinutes: null,
        equipment: [],
      },
      exercise: {
        title: "",
        instructions: "",
        measurement: "completion",
        targetValue: null,
        recommendedMinutes: null,
        equipment: [],
        safetyNote: "",
      },
      wardrobeExamples: [],
    },
  );
});

test("assistant context applies the same conservative character limits as the form", () => {
  const context = buildSubjectAssistantContext({
    accentColor: "#53C987",
    description: "🙂".repeat(510),
    icon: "x".repeat(20),
    title: "a".repeat(110),
  });

  assert.equal(Array.from(context.topic.title).length, 100);
  assert.equal(Array.from(context.topic.description).length, 500);
  assert.equal(Array.from(context.topic.icon).length, 16);
});
