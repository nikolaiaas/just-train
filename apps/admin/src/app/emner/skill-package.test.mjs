import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSkillWardrobeMessage,
  deriveSkillStageRequestId,
  parseSkillBuilderMode,
  parseSkillPackageOutput,
  parseSkillSuggestionsOutput,
} from "./skill-package.ts";

const skill = {
  childDescription:
    "Du lærer at føre bolden tæt på fødderne og skifte retning.",
  difficulty: "beginner",
  editorialReason: "Et tydeligt første fokus i emnet.",
  estimatedMinutes: 12,
  ordinal: 1,
  slug: "rolig-dribling",
  title: "Rolig dribling",
};

const exercise = (ordinal, overrides = {}) => ({
  childInstructions: "Før bolden roligt frem mellem to markeringer.",
  childSafetyNote: "Find god plads, og kig op, før du skifter retning.",
  editorialReason: "Øvelsen gør det let at mærke kontrollen.",
  equipment: ["En bold", "To kegler"],
  measurement: "repetitions",
  ordinal,
  recommendedMinutes: 4,
  slug: `rolig-dribling-${ordinal}`,
  targetValue: 5,
  title: `Rolig dribling ${ordinal}`,
  ...overrides,
});

test("skill suggestion output is ordered, bounded, and unique", () => {
  const parsed = parseSkillSuggestionsOutput({
    reply: "Her er fire forskellige færdigheder.",
    skills: [
      skill,
      {
        ...skill,
        ordinal: 2,
        slug: "hurtige-vendinger",
        title: "Hurtige vendinger",
      },
      { ...skill, ordinal: 3, slug: "boldkontrol", title: "Boldkontrol" },
    ],
  });

  assert.equal(parsed?.skills.length, 3);
  assert.equal(
    parseSkillSuggestionsOutput({
      reply: "Dublet",
      skills: [skill, { ...skill, ordinal: 2 }, { ...skill, ordinal: 3 }],
    }),
    null,
  );
});

test("skill package enforces exercise measurement targets", () => {
  const valid = {
    exercises: [
      exercise(1),
      exercise(2, { measurement: "completion", targetValue: null }),
    ],
    reply: "Her er hele færdigheden.",
    skill: {
      childDescription: skill.childDescription,
      difficulty: skill.difficulty,
      editorialReason: skill.editorialReason,
      equipment: ["En bold"],
      estimatedMinutes: skill.estimatedMinutes,
      slug: skill.slug,
      title: skill.title,
    },
  };

  assert.equal(parseSkillPackageOutput(valid)?.exercises.length, 2);
  assert.equal(
    parseSkillPackageOutput({
      ...valid,
      exercises: [
        exercise(1, { measurement: "completion", targetValue: 1 }),
        exercise(2),
      ],
    }),
    null,
  );
});

test("builder mode fails closed to manual creation", () => {
  assert.equal(parseSkillBuilderMode("suggest"), "suggest");
  assert.equal(parseSkillBuilderMode("anything-else"), "create");
  assert.equal(parseSkillBuilderMode(["suggest"]), "create");
});

test("derived stage ids are stable and domain separated", async () => {
  const root = "c1000000-0000-4000-8000-000000000001";
  const packageId = await deriveSkillStageRequestId(root, "skill-package");
  const planId = await deriveSkillStageRequestId(
    root,
    "skill-package-wardrobe-plan",
  );

  assert.match(packageId, /^[0-9a-f-]{36}$/u);
  assert.equal(
    packageId,
    await deriveSkillStageRequestId(root, "skill-package"),
  );
  assert.notEqual(packageId, planId);
});

test("wardrobe context names the skill and all exercises", () => {
  const parsed = parseSkillPackageOutput({
    exercises: [exercise(1), exercise(2)],
    reply: "Her er hele færdigheden.",
    skill: {
      childDescription: skill.childDescription,
      difficulty: skill.difficulty,
      editorialReason: skill.editorialReason,
      equipment: ["En bold"],
      estimatedMinutes: skill.estimatedMinutes,
      slug: skill.slug,
      title: skill.title,
    },
  });

  assert.ok(parsed);
  const message = buildSkillWardrobeMessage(parsed);
  assert.match(message, /Rolig dribling/u);
  assert.match(message, /Rolig dribling 1/u);
  assert.match(message, /Rolig dribling 2/u);
  assert.ok(message.length <= 1_000);
});
