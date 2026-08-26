import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(
  new URL("../../../config.toml", import.meta.url),
  "utf8",
);

async function readFunctionSource(slug) {
  return readFile(new URL(`../../${slug}/index.ts`, import.meta.url), "utf8");
}

function readFunctionConfig(slug) {
  const marker = `[functions.${slug}]`;
  const start = config.indexOf(marker);

  assert.notEqual(start, -1, `Missing config for ${slug}`);

  const remainder = config.slice(start + marker.length);
  const nextSection = remainder.search(/\n\[/);

  return nextSection === -1 ? remainder : remainder.slice(0, nextSection);
}

test("user Edge Functions bypass only the legacy gateway verifier", async () => {
  for (const slug of ["process-ai-job", "process-admin-ai-job"]) {
    assert.match(readFunctionConfig(slug), /^verify_jwt\s*=\s*false$/m);

    const source = await readFunctionSource(slug);

    assert.match(source, /authorization\?\.startsWith\("Bearer "\)/);
    assert.match(source, /userClient\.auth\.getUser\(\)/);
    assert.match(
      source,
      /return jsonResponse\(\{ error: "authentication_required" \}, 401\)/,
    );
    assert.match(
      source,
      /return jsonResponse\(\{ error: "job_not_found" \}, 404\)/,
    );

    if (slug === "process-ai-job") {
      assert.match(source, /job\.requested_by === identity\.user\.id/);
      assert.match(source, /reconcile_child_topic_portrait_job_start/);
      assert.match(source, /reconciliation\.mayProcess/);
    } else {
      assert.match(source, /job\.requested_by !== identity\.user\.id/);
    }
  }
});

test("the admin worker additionally requires an admin-scoped job", async () => {
  const source = await readFunctionSource("process-admin-ai-job");

  assert.match(source, /job\.scope_kind !== "admin"/);
});

test("the admin worker expands safely to topic-bound skill package jobs", async () => {
  const source = await readFunctionSource("process-admin-ai-job");

  assert.match(source, /claim_admin_ai_job_for_worker/);
  assert.match(source, /claim_admin_skill_job_for_worker/);
  assert.match(source, /complete_admin_skill_job_for_worker/);
  assert.match(source, /admin_skill_suggestions/);
  assert.match(source, /admin_skill_package/);
  assert.match(source, /"content\.skill_suggestions"/);
  assert.match(source, /"content\.skill_package"/);
});
