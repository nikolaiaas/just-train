import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cleanupSource = await readFile(
  new URL("./skill-package-history-cleanup.tsx", import.meta.url),
  "utf8",
);
const detailPageSource = await readFile(
  new URL("../../page.tsx", import.meta.url),
  "utf8",
);

test("the detail route validates and mounts only the bounded cleanup handoff", () => {
  assert.match(
    detailPageSource,
    /typeof query\.skillPackageHistory === "string"[\s\S]*?UUID_PATTERN\.test\(query\.skillPackageHistory\)/,
  );
  assert.match(
    detailPageSource,
    /<SkillPackageHistoryCleanup[\s\S]*?canonicalHref=\{buildSubjectDetailHref\(topic\.id\)\}[\s\S]*?cleanupId=\{historyCleanupId\}/,
  );
});

test("the first detail cleanup visit marks a valid Next entry and pushes canonical detail", () => {
  assert.match(
    cleanupSource,
    /window\.history\.replaceState\([\s\S]*?\[CLEANUP_STATE_KEY\]: cleanupId[\s\S]*?router\.push\(canonicalHref\)/,
  );
});

test("returning to the cleanup entry canonicalizes it without recreating the builder", () => {
  assert.match(
    cleanupSource,
    /currentState\[CLEANUP_STATE_KEY\] === cleanupId[\s\S]*?router\.replace\(canonicalHref\)/,
  );
  assert.doesNotMatch(cleanupSource, /faerdigheder\/ny/);
});
