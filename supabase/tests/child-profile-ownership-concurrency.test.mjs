import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const databaseContainer = "supabase_db_bare-traen";
const familyId = "20000000-0000-4000-8000-000000000001";
const removedOwnerId = "10000000-0000-4000-8000-000000000001";
const remainingOwnerId = "10000000-0000-4000-8000-000000000002";
const requestId = "d1000000-0000-4000-8000-000000000088";
const ownerRemovalApplicationName = "child_owner_removal_race";
const migrationUrl = new URL(
  "../migrations/202608210001_child_profile_creation.sql",
  import.meta.url,
);

test("the migration freezes child writes before running its preflight", async () => {
  const migration = (await readFile(migrationUrl, "utf8"))
    .toLowerCase()
    .replace(/\s+/g, " ");
  const lockPosition = migration.indexOf(
    "lock table public.child_profiles in share row exclusive mode;",
  );
  const preflightPosition = migration.indexOf(
    "select private.assert_child_profile_creation_preconditions();",
  );

  assert.notEqual(lockPosition, -1, "the DML-conflicting lock must exist");
  assert.notEqual(preflightPosition, -1, "the preflight call must exist");
  assert.ok(
    lockPosition < preflightPosition,
    "the DML-conflicting lock must be acquired before the preflight call",
  );
});

function psqlArguments(sql) {
  return [
    "exec",
    databaseContainer,
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-At",
    "-c",
    sql,
  ];
}

async function runSql(sql) {
  return execFile("docker", psqlArguments(sql), {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

function startOwnerRemoval() {
  const sql = `
    set application_name = '${ownerRemovalApplicationName}';
    begin;
    delete from public.family_memberships
    where family_id = '${familyId}'
      and user_id = '${removedOwnerId}';
    select pg_sleep(3);
    commit;
  `;
  const process = spawn("docker", psqlArguments(sql), {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";

  process.stdout.setEncoding("utf8");
  process.stderr.setEncoding("utf8");
  process.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  process.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const completion = new Promise((resolve, reject) => {
    process.on("error", (error) => {
      reject(error);
    });
    process.on("close", (code) => {
      if (code === 0) {
        resolve({ stderr, stdout });
      } else {
        reject(new Error(`Owner-removal session failed: ${stderr.trim()}`));
      }
    });
  });

  return { completion };
}

async function waitForOwnerRemovalLock() {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const { stdout } = await runSql(`
      select count(*)
      from pg_stat_activity
      where application_name = '${ownerRemovalApplicationName}'
        and wait_event = 'PgSleep';
    `);

    if (stdout.trim() === "1") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(
    "Owner-removal session did not reach pg_sleep with the family lock held",
  );
}

async function prepareFixture() {
  await runSql(`
    begin;
    delete from public.child_profiles as child
    using private.child_profile_consents as consent
    where child.id = consent.child_profile_id
      and consent.creation_request_id = '${requestId}';
    insert into public.family_memberships (family_id, user_id, role, added_by)
    values (
      '${familyId}',
      '${removedOwnerId}',
      'owner',
      '${removedOwnerId}'
    )
    on conflict (family_id, user_id) do update set role = 'owner';
    insert into public.family_memberships (family_id, user_id, role, added_by)
    values (
      '${familyId}',
      '${remainingOwnerId}',
      'owner',
      '${removedOwnerId}'
    )
    on conflict (family_id, user_id) do update set role = 'owner';
    commit;
  `);
}

async function restoreFixture() {
  await runSql(`
    begin;
    delete from public.child_profiles as child
    using private.child_profile_consents as consent
    where child.id = consent.child_profile_id
      and consent.creation_request_id = '${requestId}';
    insert into public.family_memberships (family_id, user_id, role, added_by)
    values (
      '${familyId}',
      '${removedOwnerId}',
      'owner',
      '${removedOwnerId}'
    )
    on conflict (family_id, user_id) do update set role = 'owner';
    delete from public.family_memberships
    where family_id = '${familyId}'
      and user_id = '${remainingOwnerId}';
    commit;
  `);
}

test(
  "a child request waiting on owner removal rechecks membership after the lock",
  { timeout: 15_000 },
  async () => {
    let ownerRemoval;

    await prepareFixture();

    try {
      ownerRemoval = startOwnerRemoval();
      await waitForOwnerRemovalLock();

      const startedAt = Date.now();
      let creationFailure;

      try {
        await runSql(`
          begin;
          select set_config(
            'request.jwt.claims',
            '{"sub":"${removedOwnerId}","role":"authenticated"}',
            true
          );
          set local role authenticated;
          select * from public.create_child_profile(
            '${familyId}',
            '${removedOwnerId}',
            '${requestId}',
            'Samtidigt Demo Barn',
            'preset-star',
            'child-profile-pilot-v1',
            true
          );
          commit;
        `);
      } catch (error) {
        creationFailure = error;
      }

      const elapsedMilliseconds = Date.now() - startedAt;
      await ownerRemoval.completion;

      assert.ok(creationFailure, "the removed owner request must fail closed");
      assert.match(
        `${creationFailure.stderr ?? ""}`,
        /Family owner access is required\./,
      );
      assert.ok(
        elapsedMilliseconds >= 1_500,
        "the request must have waited on the owner-removal family lock",
      );

      const { stdout } = await runSql(`
        select count(*)
        from private.child_profile_consents
        where creation_request_id = '${requestId}';
      `);
      assert.equal(
        stdout.trim(),
        "0",
        "the denied request must leave no child",
      );
    } finally {
      if (ownerRemoval) {
        await ownerRemoval.completion.catch(() => undefined);
      }
      await restoreFixture();
    }
  },
);
