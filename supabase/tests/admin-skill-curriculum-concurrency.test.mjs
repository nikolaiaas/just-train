import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const databaseContainer = "supabase_db_bare-traen";
const callerId = "10000000-0000-4000-8000-000000000003";
const topicId = "fd000000-0000-4000-8000-000000000001";
const firstSaveRequestId = "fd600000-0000-4000-8000-000000000001";
const secondSaveRequestId = "fd600000-0000-4000-8000-000000000002";
const jobIds = {
  firstCurriculum: "fd500000-0000-4000-8000-000000000001",
  secondCurriculum: "fd500000-0000-4000-8000-000000000002",
  firstPlan: "fd500000-0000-4000-8000-000000000003",
  secondPlan: "fd500000-0000-4000-8000-000000000004",
  firstImage: "fd500000-0000-4000-8000-000000000005",
  secondImage: "fd500000-0000-4000-8000-000000000006",
};

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
        reject(new Error(`Concurrent curriculum session failed: ${stderr}`));
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

    if (stdout.trim() === "1") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`${applicationName} did not reach pg_sleep`);
}

async function prepareFixture() {
  await runSql(`
    begin;
    insert into public.topics (
      id, slug, title, description, icon, accent_color, sort_order,
      content_version, is_published, created_by
    ) values (
      '${topicId}', 'curriculum-race-test', 'Fodboldløb',
      'Du træner et helt lille fodboldforløb.', '⚽', '#53C987', 999,
      1, false, '${callerId}'
    );

    create temporary table curriculum_race_fixture on commit drop as
    with curriculum as (
      select
        jsonb_build_object(
          'message', 'Planlæg et kort testforløb.',
          'topic', jsonb_build_object(
            'title', 'Fodboldløb',
            'description', 'Du træner et helt lille fodboldforløb.'
          ),
          'existingSkills', '[]'::jsonb,
          'history', '[]'::jsonb,
          'skillCount', 2,
          'exercisesPerSkill', 2
        ) as curriculum_input,
        jsonb_build_object(
          'reply', 'Her er hele testforløbet.',
          'skills', jsonb_build_array(
            jsonb_build_object(
              'ordinal', 1,
              'title', 'Dribling race',
              'slug', 'dribling-curriculum-race',
              'childDescription', 'Du lærer at holde bolden tæt.',
              'difficulty', 'beginner',
              'estimatedMinutes', 20,
              'equipment', jsonb_build_array('Bold'),
              'editorialReason', 'Et første trin.',
              'exercises', jsonb_build_array(
                jsonb_build_object(
                  'ordinal', 1,
                  'title', 'Hold bold',
                  'slug', 'hold-bold-curriculum-race',
                  'childInstructions', 'Du fører bolden roligt frem.',
                  'measurement', 'completion',
                  'targetValue', null,
                  'recommendedMinutes', 5,
                  'equipment', jsonb_build_array('Bold'),
                  'childSafetyNote', 'Du stopper, hvis noget gør ondt.',
                  'editorialReason', 'Et trygt trin.'
                ),
                jsonb_build_object(
                  'ordinal', 2,
                  'title', 'Kegleløb',
                  'slug', 'kegleloeb-curriculum-race',
                  'childInstructions', 'Du dribler mellem to kegler.',
                  'measurement', 'repetitions',
                  'targetValue', 4,
                  'recommendedMinutes', 5,
                  'equipment', jsonb_build_array('Bold', 'Kegler'),
                  'childSafetyNote', 'Du holder god afstand.',
                  'editorialReason', 'Træner din retning.'
                )
              )
            ),
            jsonb_build_object(
              'ordinal', 2,
              'title', 'Aflevering race',
              'slug', 'aflevering-curriculum-race',
              'childDescription', 'Du lærer at sende bolden præcist.',
              'difficulty', 'beginner',
              'estimatedMinutes', 20,
              'equipment', jsonb_build_array('Bold'),
              'editorialReason', 'Et tydeligt næste trin.',
              'exercises', jsonb_build_array(
                jsonb_build_object(
                  'ordinal', 1,
                  'title', 'Spark ven',
                  'slug', 'spark-ven-curriculum-race',
                  'childInstructions', 'Du afleverer bolden roligt.',
                  'measurement', 'repetitions',
                  'targetValue', 4,
                  'recommendedMinutes', 5,
                  'equipment', jsonb_build_array('Bold'),
                  'childSafetyNote', 'Du ser efter, at banen er fri.',
                  'editorialReason', 'Træner din aflevering.'
                ),
                jsonb_build_object(
                  'ordinal', 2,
                  'title', 'Ram mål',
                  'slug', 'ram-maal-curriculum-race',
                  'childInstructions', 'Du rammer mellem to kegler.',
                  'measurement', 'duration',
                  'targetValue', 60,
                  'recommendedMinutes', 5,
                  'equipment', jsonb_build_array('Bold', 'Kegler'),
                  'childSafetyNote', 'Du henter bolden, når banen er fri.',
                  'editorialReason', 'Træner din præcision.'
                )
              )
            )
          )
        ) as curriculum_output
    ), wardrobe as (
      select jsonb_agg(
        jsonb_build_object(
          'ordinal', ordinal,
          'name', format('Raceting %s', ordinal),
          'description', format('Du kan bruge raceting %s.', ordinal),
          'visualDescription', format('A centered football item %s.', ordinal),
          'category', 'equipment',
          'equipSlot', 'accessory',
          'rarity', 'common',
          'points', 100,
          'unlockRule', '',
          'reason', 'Passer til hele forløbet.'
        ) order by ordinal
      ) as items
      from generate_series(1, 16) as ordinal
    )
    select
      curriculum.curriculum_input,
      curriculum.curriculum_output,
      jsonb_build_object(
        'history', '[]'::jsonb,
        'message', private.admin_skill_curriculum_wardrobe_message(
          curriculum.curriculum_output
        ),
        'topic', curriculum.curriculum_input -> 'topic'
      ) as plan_input,
      jsonb_build_object('items', wardrobe.items) as plan_output,
      jsonb_build_object(
        'topic', curriculum.curriculum_input -> 'topic',
        'items', (
          select jsonb_agg(
            jsonb_build_object(
              'ordinal', item -> 'ordinal',
              'name', item -> 'name',
              'visualDescription', item -> 'visualDescription',
              'equipSlot', item -> 'equipSlot'
            ) order by (item ->> 'ordinal')::integer
          )
          from jsonb_array_elements(wardrobe.items) as item
        )
      ) as image_input
    from curriculum, wardrobe;

    insert into public.ai_jobs (
      id, scope_kind, operation_id, operation_version_id, requested_by,
      client_request_id, status, attempt_count, max_attempts,
      max_cost_microusd, actual_cost_microusd, queued_at, completed_at,
      input_data, output_data
    )
    select
      request.job_id,
      'admin',
      operation.id,
      operation.active_version_id,
      '${callerId}',
      request.request_id,
      'succeeded',
      0,
      1,
      200000,
      1000,
      now(),
      now(),
      case request.kind
        when 'curriculum' then fixture.curriculum_input
        when 'plan' then fixture.plan_input
        else fixture.image_input
      end,
      case request.kind
        when 'curriculum' then fixture.curriculum_output
        when 'plan' then fixture.plan_output
        else jsonb_build_object(
          'sheetPath', request.job_id::text || '/sheet.png',
          'items', (
            select jsonb_agg(
              jsonb_build_object(
                'ordinal', ordinal,
                'imagePath', request.job_id::text || '/'
                  || lpad(ordinal::text, 2, '0') || '.png'
              ) order by ordinal
            )
            from generate_series(1, 16) as ordinal
          )
        )
      end
    from (
      values
        ('${jobIds.firstCurriculum}'::uuid, 'fd400000-0000-4000-8000-000000000001'::uuid, 'content.skill_curriculum'::text, 'curriculum'::text),
        ('${jobIds.secondCurriculum}'::uuid, 'fd400000-0000-4000-8000-000000000002'::uuid, 'content.skill_curriculum'::text, 'curriculum'::text),
        ('${jobIds.firstPlan}'::uuid, 'fd400000-0000-4000-8000-000000000003'::uuid, 'content.wardrobe_grid_plan'::text, 'plan'::text),
        ('${jobIds.secondPlan}'::uuid, 'fd400000-0000-4000-8000-000000000004'::uuid, 'content.wardrobe_grid_plan'::text, 'plan'::text),
        ('${jobIds.firstImage}'::uuid, 'fd400000-0000-4000-8000-000000000005'::uuid, 'content.wardrobe_grid_image'::text, 'image'::text),
        ('${jobIds.secondImage}'::uuid, 'fd400000-0000-4000-8000-000000000006'::uuid, 'content.wardrobe_grid_image'::text, 'image'::text)
    ) as request(job_id, request_id, operation_key, kind)
    join public.ai_operations as operation
      on operation.operation_key = request.operation_key
    cross join curriculum_race_fixture as fixture;

    insert into private.admin_skill_curriculum_job_context (job_id, topic_id)
    values
      ('${jobIds.firstCurriculum}', '${topicId}'),
      ('${jobIds.secondCurriculum}', '${topicId}');

    insert into private.admin_topic_ai_job_context (job_id, topic_id, purpose)
    values
      ('${jobIds.firstPlan}', '${topicId}', 'skill_package_wardrobe_plan'),
      ('${jobIds.secondPlan}', '${topicId}', 'skill_package_wardrobe_plan'),
      ('${jobIds.firstImage}', '${topicId}', 'skill_package_wardrobe_image'),
      ('${jobIds.secondImage}', '${topicId}', 'skill_package_wardrobe_image');
    commit;
  `);
}

async function cleanupFixture() {
  await runSql(`
    begin;
    delete from public.topics where id = '${topicId}';
    delete from public.ai_jobs where id in (
      '${jobIds.firstCurriculum}', '${jobIds.secondCurriculum}',
      '${jobIds.firstPlan}', '${jobIds.secondPlan}',
      '${jobIds.firstImage}', '${jobIds.secondImage}'
    );
    commit;
  `);
}

function saveSql({ curriculumJobId, planJobId, imageJobId, requestId }) {
  return `
    select set_config(
      'request.jwt.claims',
      '{"sub":"${callerId}","role":"authenticated"}',
      true
    );
    set local role authenticated;
    select changed::text || ':' || cardinality(goal_ids)::text || ':'
      || cardinality(exercise_ids)::text || ':'
      || cardinality(wardrobe_item_ids)::text
    from public.save_admin_skill_curriculum_draft(
      '${topicId}',
      '${curriculumJobId}',
      '${planJobId}',
      '${imageJobId}',
      '${requestId}',
      (select updated_at from public.topics where id = '${topicId}')
    );
  `;
}

test(
  "two simultaneous curriculum saves create exactly one complete atomic batch",
  { timeout: 15_000 },
  async () => {
    const applicationName = "admin_curriculum_save_race";
    let firstSession;

    await prepareFixture();

    try {
      firstSession = startSqlSession(`
        set application_name = '${applicationName}';
        begin;
        ${saveSql({
          curriculumJobId: jobIds.firstCurriculum,
          planJobId: jobIds.firstPlan,
          imageJobId: jobIds.firstImage,
          requestId: firstSaveRequestId,
        })}
        reset role;
        select pg_sleep(3);
        commit;
      `);
      await waitForSleep(applicationName);

      const startedAt = Date.now();
      let secondFailure;
      try {
        await runSql(`
          begin;
          ${saveSql({
            curriculumJobId: jobIds.secondCurriculum,
            planJobId: jobIds.secondPlan,
            imageJobId: jobIds.secondImage,
            requestId: secondSaveRequestId,
          })}
          commit;
        `);
      } catch (error) {
        secondFailure = error;
      }
      const elapsedMilliseconds = Date.now() - startedAt;
      const firstResult = await firstSession.completion;

      assert.match(firstResult.stdout, /true:2:4:16/);
      assert.ok(secondFailure, "one racing save must lose its old revision");
      assert.match(
        `${secondFailure.stderr ?? ""}`,
        /The topic changed before the curriculum could be saved\./,
      );
      assert.ok(
        elapsedMilliseconds >= 1_500,
        "the losing save must wait for the topic-row transaction",
      );

      const { stdout } = await runSql(`
        select
          (select count(*) from private.admin_skill_curriculum_saves
            where topic_id = '${topicId}') || ':' ||
          (select count(*) from public.goals where topic_id = '${topicId}') || ':' ||
          (select count(*) from public.exercises as exercise
            join public.goals as goal on goal.id = exercise.goal_id
            where goal.topic_id = '${topicId}') || ':' ||
          (select count(*) from public.wardrobe_items where topic_id = '${topicId}');
      `);
      assert.equal(stdout.trim(), "1:2:4:16");
    } finally {
      if (firstSession) {
        await firstSession.completion.catch(() => undefined);
      }
      await cleanupFixture();
    }
  },
);
