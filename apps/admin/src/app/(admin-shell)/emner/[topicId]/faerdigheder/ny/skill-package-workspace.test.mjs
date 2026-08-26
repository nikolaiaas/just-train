import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceSource = await readFile(
  new URL("./skill-package-workspace.tsx", import.meta.url),
  "utf8",
);

test("a replacement request becomes the current retry attempt instead of replaying the stale UUID", () => {
  assert.match(
    workspaceSource,
    /suggestState\.requestRecovery === "start_new"\)[\s\S]*?\? nextRequestId\(\)[\s\S]*?: suggestionRequestId/,
  );
  assert.match(
    workspaceSource,
    /onSubmit=\{\(\) => \{\s*setSuggestionRequestId\(activeSuggestionRequestId\);\s*\}\}/,
  );
  assert.match(
    workspaceSource,
    /packageState\.requestRecovery === "start_new"[\s\S]*?\? nextRequestId\(\)[\s\S]*?: packageRequestId/,
  );
  assert.match(
    workspaceSource,
    /onSubmit=\{\(\) => \{\s*setPackageRequestId\(activePackageRequestId\);\s*setBuildingSkillSlug\("__manual__"\);\s*\}\}/,
  );
  assert.match(
    workspaceSource,
    /setActiveSuggestionAttempt\(\{\s*requestId,\s*slug: skill\.slug,\s*\}\)/,
  );
});

test("generated work guards unload, same-origin SPA links, and browser back", () => {
  assert.match(workspaceSource, /addEventListener\("beforeunload"/);
  assert.match(workspaceSource, /addEventListener\("popstate"/);
  assert.match(
    workspaceSource,
    /document\.addEventListener\("click", guardSpaNavigation, true\)/,
  );
  assert.match(workspaceSource, /window\.history\.pushState/);
  assert.match(workspaceSource, /window\.history\.back\(\)/);
  assert.match(workspaceSource, /window\.confirm\(LEAVE_BUILDER_MESSAGE\)/);
});

test("successful save pops the sentinel and replaces the underlying builder entry", () => {
  assert.match(
    workspaceSource,
    /const href = `\$\{canonicalHref\}\?skillPackageHistory=\$\{encodeURIComponent\(saveState\.goalId\)\}`/,
  );
  assert.match(
    workspaceSource,
    /if \(saveState\.status === "success"\)[\s\S]*?pendingNavigationRef\.current = \{ href, method: "replace" \};[\s\S]*?window\.history\.back\(\)/,
  );
  assert.match(
    workspaceSource,
    /if \(navigation\.method === "replace"\) \{\s*router\.replace\(navigation\.href\);/,
  );
  assert.doesNotMatch(
    workspaceSource,
    /if \(saveState\.status === "success"\) \{\s*router\.replace\(/,
  );
});

test("completed AI stages are announced and move focus to their result heading", () => {
  assert.match(workspaceSource, /role="status"/);
  assert.match(workspaceSource, /aria-live="polite"/);
  assert.match(workspaceSource, /\{completionAnnouncement\}/);
  assert.match(workspaceSource, /suggestionHeadingRef\.current\?\.focus\(\)/);
  assert.match(workspaceSource, /packageHeadingRef\.current\?\.focus\(\)/);
  assert.match(
    workspaceSource,
    /id="suggestions-title"[\s\S]*?ref=\{suggestionHeadingRef\}[\s\S]*?tabIndex=\{-1\}/,
  );
  assert.match(
    workspaceSource,
    /id="complete-title"[\s\S]*?ref=\{packageHeadingRef\}[\s\S]*?tabIndex=\{-1\}/,
  );
});
