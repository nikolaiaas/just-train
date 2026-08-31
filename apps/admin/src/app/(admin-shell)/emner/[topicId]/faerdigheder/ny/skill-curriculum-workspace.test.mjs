import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceSource = await readFile(
  new URL("./skill-curriculum-workspace.tsx", import.meta.url),
  "utf8",
);
const pageSource = await readFile(
  new URL("./page.tsx", import.meta.url),
  "utf8",
);

test("AI mode opens the multi-skill curriculum planner", () => {
  assert.match(pageSource, /if \(mode === "suggest"\)/u);
  assert.match(pageSource, /<SkillCurriculumWorkspace/u);
  assert.match(workspaceSource, /Planlæg flere færdigheder på én gang/u);
  assert.doesNotMatch(workspaceSource, /Vælg én/u);
});

test("the planner makes exact skill and exercise counts explicit", () => {
  assert.match(workspaceSource, /name="skillCount"/u);
  assert.match(workspaceSource, /name="exercisesPerSkill"/u);
  assert.match(workspaceSource, /skillCount \* exercisesPerSkill/u);
  assert.match(workspaceSource, /`Planlæg \$\{skillCount\} færdigheder`/u);
});

test("changed inputs hide stale results and every rerun gets a fresh identity", () => {
  assert.match(workspaceSource, /isCurrentCurriculumReview/u);
  assert.match(workspaceSource, /setPlanInputsDirty\(true\)/u);
  assert.match(workspaceSource, /preparedNextCurriculumRequestRef/u);
  assert.match(workspaceSource, /setRequestId\(nextRequestId\(\)\)/u);
});

test("curriculum review nests every exercise under its skill", () => {
  assert.match(workspaceSource, /curriculum\.skills\.map/u);
  assert.match(workspaceSource, /skill\.exercises\.map/u);
  assert.match(workspaceSource, /Færdigheder og øvelser i rækkefølge/u);
  assert.match(workspaceSource, /curriculumReady && !wardrobeReady/u);
});

test("one shared wardrobe grid follows curriculum review", () => {
  assert.match(workspaceSource, /Godkend planen og lav 16 billeder/u);
  assert.match(workspaceSource, /ét fælles sæt/u);
  assert.match(workspaceSource, /saveGeneratedAdminSkillCurriculum/u);
  assert.match(workspaceSource, /Gem hele planen som kladder/u);
});

test("wardrobe retries and rerolls use a separate fresh request", () => {
  assert.match(pageSource, /wardrobeRequestId=\{randomUUID\(\)\}/u);
  assert.match(workspaceSource, /activeWardrobeRequestId/u);
  assert.match(workspaceSource, /preparedNextWardrobeRequestRef/u);
  assert.match(workspaceSource, /Lav 16 nye billeder/u);
});

test("unsaved curriculum work is protected and completion is announced", () => {
  assert.match(workspaceSource, /addEventListener\("beforeunload"/u);
  assert.match(workspaceSource, /addEventListener\("popstate"/u);
  assert.match(workspaceSource, /aria-live="polite"/u);
  assert.match(workspaceSource, /curriculumHeadingRef\.current\?\.focus\(\)/u);
  assert.match(workspaceSource, /wardrobeHeadingRef\.current\?\.focus\(\)/u);
});
