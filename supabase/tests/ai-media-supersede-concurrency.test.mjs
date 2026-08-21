import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const databaseContainer = "supabase_db_bare-traen";
const callerId = "10000000-0000-4000-8000-000000000001";
const adminId = "10000000-0000-4000-8000-000000000003";
const familyId = "20000000-0000-4000-8000-000000000001";
const operationKey = "portrait.cartoon_3d";

function psqlArguments(sql) {
  return [
    "exec",
    databaseContainer,
    "psql",
    "-X",
    "-q",
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

function startSqlSession(sql) {
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
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) {
        resolve({ stderr, stdout });
      } else {
        reject(new Error(`Concurrent AI session failed: ${stderr.trim()}`));
      }
    });
  });

  return { completion };
}

async function waitForSleep(applicationName) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const { stdout } = await runSql(`
      select count(*)
      from pg_stat_activity
      where application_name = '${applicationName}'
        and wait_event = 'PgSleep';
    `);

    if (stdout.trim() === "1") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`${applicationName} did not reach pg_sleep`);
}

async function prepareFixture(clientRequestId) {
  await runSql(`
    begin;
    update public.ai_operations
    set is_enabled = true
    where operation_key = '${operationKey}';
    insert into private.ai_media_testers (user_id, authorized_by, expires_at)
    values ('${callerId}', '${adminId}', now() + interval '1 day')
    on conflict (user_id) do update
    set authorized_by = excluded.authorized_by,
        authorized_at = now(),
        expires_at = excluded.expires_at;
    select set_config(
      'request.jwt.claims',
      '{"sub":"${callerId}","role":"authenticated"}',
      true
    );
    set local role authenticated;
    select *
    from public.prepare_ai_media_job(
      '${operationKey}',
      '${familyId}',
      '${callerId}',
      '${clientRequestId}',
      'adult_test',
      'image/jpeg',
      null
    );
    reset role;
    insert into storage.objects (bucket_id, name, owner_id, metadata)
    select
      asset.storage_bucket,
      asset.storage_object_path,
      '${callerId}',
      '{"size": 1024, "mimetype": "image/jpeg"}'::jsonb
    from public.ai_jobs as job
    join public.ai_job_media as link
      on link.job_id = job.id
      and link.slot = 'reference_image'
      and link.ordinal = 0
    join public.media_assets as asset on asset.id = link.media_asset_id
    where job.client_request_id = '${clientRequestId}';
    commit;
  `);

  const { stdout } = await runSql(`
    select id
    from public.ai_jobs
    where requested_by = '${callerId}'
      and client_request_id = '${clientRequestId}';
  `);
  const jobId = stdout.trim();

  assert.match(jobId, /^[0-9a-f-]{36}$/);
  return jobId;
}

async function cleanupFixture(clientRequestIds) {
  const ids = clientRequestIds.map((id) => `'${id}'`).join(", ");

  await runSql(`
    begin;
    -- These tests insert Storage metadata only (no object bytes). Bypass the
    -- protective trigger solely to remove those exact synthetic rows again.
    set local session_replication_role = replica;
    delete from storage.objects as object
    using public.media_assets as asset,
          public.ai_job_media as link,
          public.ai_jobs as job
    where asset.storage_bucket = object.bucket_id
      and asset.storage_object_path = object.name
      and link.media_asset_id = asset.id
      and job.id = link.job_id
      and job.requested_by = '${callerId}'
      and job.client_request_id in (${ids});
    set local session_replication_role = origin;
    create temporary table ai_test_assets on commit drop as
    select distinct link.media_asset_id as id
    from public.ai_job_media as link
    join public.ai_jobs as job on job.id = link.job_id
    where job.requested_by = '${callerId}'
      and job.client_request_id in (${ids});
    delete from public.ai_jobs
    where requested_by = '${callerId}'
      and client_request_id in (${ids});
    delete from public.media_assets
    where id in (select id from ai_test_assets);
    delete from private.ai_media_testers where user_id = '${callerId}';
    update public.ai_operations
    set is_enabled = false
    where operation_key = '${operationKey}';
    commit;
  `);
}

test(
  "a worker waits for a committed supersede and never claims its old job",
  { timeout: 15_000 },
  async () => {
    const oldRequestId = "e3000000-0000-4000-8000-000000000001";
    const newRequestId = "e3000000-0000-4000-8000-000000000002";
    const applicationName = "ai_prepare_wins_race";
    let prepareSession;

    const jobId = await prepareFixture(oldRequestId);

    try {
      prepareSession = startSqlSession(`
        set application_name = '${applicationName}';
        begin;
        select set_config(
          'request.jwt.claims',
          '{"sub":"${callerId}","role":"authenticated"}',
          true
        );
        set local role authenticated;
        select *
        from public.prepare_ai_media_job(
          '${operationKey}',
          '${familyId}',
          '${callerId}',
          '${newRequestId}',
          'adult_test',
          'image/jpeg',
          null
        );
        select pg_sleep(3);
        commit;
      `);
      await waitForSleep(applicationName);

      const startedAt = Date.now();
      const { stdout } = await runSql(`
        set role service_role;
        select count(*)
        from public.claim_ai_media_job_for_worker('${jobId}');
      `);
      const elapsedMilliseconds = Date.now() - startedAt;
      await prepareSession.completion;

      assert.equal(stdout.trim(), "0");
      assert.ok(
        elapsedMilliseconds >= 1_500,
        "the claim must wait for the superseding job-row transaction",
      );
    } finally {
      if (prepareSession) {
        await prepareSession.completion.catch(() => undefined);
      }
      await cleanupFixture([oldRequestId, newRequestId]);
    }
  },
);

test(
  "a committed worker claim makes a racing prepare fail without cancellation",
  { timeout: 15_000 },
  async () => {
    const oldRequestId = "e3000000-0000-4000-8000-000000000003";
    const newRequestId = "e3000000-0000-4000-8000-000000000004";
    const applicationName = "ai_claim_wins_race";
    let claimSession;

    const jobId = await prepareFixture(oldRequestId);

    try {
      claimSession = startSqlSession(`
        set application_name = '${applicationName}';
        begin;
        set local role service_role;
        select count(*)
        from public.claim_ai_media_job_for_worker('${jobId}');
        select pg_sleep(3);
        commit;
      `);
      await waitForSleep(applicationName);

      const startedAt = Date.now();
      let prepareFailure;

      try {
        await runSql(`
          begin;
          select set_config(
            'request.jwt.claims',
            '{"sub":"${callerId}","role":"authenticated"}',
            true
          );
          set local role authenticated;
          select *
          from public.prepare_ai_media_job(
            '${operationKey}',
            '${familyId}',
            '${callerId}',
            '${newRequestId}',
            'adult_test',
            'image/jpeg',
            null
          );
          commit;
        `);
      } catch (error) {
        prepareFailure = error;
      }

      const elapsedMilliseconds = Date.now() - startedAt;
      const claimResult = await claimSession.completion;

      assert.ok(prepareFailure, "the racing prepare must fail closed");
      assert.match(
        `${prepareFailure.stderr ?? ""}`,
        /Only one AI media test can be active at a time\./,
      );
      assert.equal(claimResult.stdout.trim().split("\n")[0], "1");
      assert.ok(
        elapsedMilliseconds >= 1_500,
        "the prepare must wait for the worker's job-row transaction",
      );

      const { stdout } = await runSql(`
        select status::text || ':' || attempt_count
        from public.ai_jobs
        where id = '${jobId}';
      `);
      assert.equal(stdout.trim(), "processing:1");
    } finally {
      if (claimSession) {
        await claimSession.completion.catch(() => undefined);
      }
      await cleanupFixture([oldRequestId, newRequestId]);
    }
  },
);
