import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const childFacingFiles = [
  "../src/app/index.tsx",
  "../src/app/topics/index.tsx",
  "../src/app/topics/[topicId].tsx",
  "../src/app/goals/[goalId].tsx",
  "../src/app/training/[exerciseId].tsx",
  "../src/app/ai/cartoon.tsx",
  "../src/topics/core.ts",
  "../src/training/core.ts",
];

const adultGatePatterns = [
  /få en voksen/i,
  /spørg en voksen/i,
  /kan en voksen hjælpe/i,
  /en voksen er stadig/i,
  /ændret af en voksen/i,
];

test("Kids Mode never presents an adult as the gate to subjects, photos, or training", () => {
  for (const file of childFacingFiles) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");

    for (const pattern of adultGatePatterns) {
      assert.doesNotMatch(source, pattern, `${file} contains ${pattern}`);
    }
  }
});

test("Kids Mode explicitly explains that children can choose their own subject photos", () => {
  const topicsSource = readFileSync(
    new URL("../src/app/topics/index.tsx", import.meta.url),
    "utf8",
  );
  const topicSource = readFileSync(
    new URL("../src/app/topics/[topicId].tsx", import.meta.url),
    "utf8",
  );
  const profilePictureSource = readFileSync(
    new URL("../src/app/ai/cartoon.tsx", import.meta.url),
    "utf8",
  );

  assert.match(topicsSource, /Du kan også selv lave et særligt/);
  assert.match(topicSource, /Vælg selv et tydeligt helkropsbillede/);
  assert.match(profilePictureSource, /Vælg selv et tydeligt billede/);
});

test("Kids Mode wires child-owned subject and goal choices without blocking exploration", () => {
  const authProviderSource = readFileSync(
    new URL("../src/auth/auth-provider.tsx", import.meta.url),
    "utf8",
  );
  const todaySource = readFileSync(
    new URL("../src/app/index.tsx", import.meta.url),
    "utf8",
  );
  const topicSource = readFileSync(
    new URL("../src/app/topics/[topicId].tsx", import.meta.url),
    "utf8",
  );
  const goalSource = readFileSync(
    new URL("../src/app/goals/[goalId].tsx", import.meta.url),
    "utf8",
  );

  assert.match(authProviderSource, /joinChildTrainingSubject/);
  assert.match(authProviderSource, /leaveChildTrainingSubject/);
  assert.match(authProviderSource, /setChildTrainingGoalSelected/);
  assert.match(topicSource, /Vælg .* uden at vente på nogen/);
  assert.match(topicSource, /Fjern fra mine emner/);
  assert.match(goalSource, /Vælg dette mål/);
  assert.match(goalSource, /Du kan altid se og prøve alle øvelserne/);
  assert.match(todaySource, /Vælg dit første emne/);
  assert.match(todaySource, /Vælg et mål/);
});
