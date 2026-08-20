-- Synthetic, deterministic fixtures for local development only.
-- These addresses use the reserved .test domain and do not represent real people.
-- The fixture users are passwordless and sign in through a local email OTP or
-- magic link captured by Mailpit.

begin;

do $$
begin
  -- The CLI local stack uses this documented development-only JWT secret. A
  -- hosted project has a different secret, so --include-seed against a linked
  -- project fails closed before any fixture data is changed.
  if current_setting('app.settings.jwt_secret', true)
    is distinct from 'super-secret-jwt-token-with-at-least-32-characters-long'
  then
    raise exception 'Refusing to load Bare Træn local fixtures outside the Supabase CLI stack.';
  end if;
end;
$$;

-- Make an accidental second local seed run converge on the same fixture graph.
-- Only the fixed synthetic IDs owned by this file are removed.
delete from public.families
where id in (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
);
delete from public.topics
where id in (
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002'
);
delete from auth.users
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'parent.one@example.test',
    '2026-01-01 08:00:00+00',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Demo Forælder"}'::jsonb,
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'parent.two@example.test',
    '2026-01-01 08:00:00+00',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Anden Demo Forælder"}'::jsonb,
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'content.admin@example.test',
    '2026-01-01 08:00:00+00',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Demo Redaktør"}'::jsonb,
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    '',
    '',
    '',
    ''
  );

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '11000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '{"sub":"10000000-0000-4000-8000-000000000001","email":"parent.one@example.test"}'::jsonb,
    'email',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00'
  ),
  (
    '11000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '{"sub":"10000000-0000-4000-8000-000000000002","email":"parent.two@example.test"}'::jsonb,
    'email',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00'
  ),
  (
    '11000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    '{"sub":"10000000-0000-4000-8000-000000000003","email":"content.admin@example.test"}'::jsonb,
    'email',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00',
    '2026-01-01 08:00:00+00'
  );

update public.profiles
set is_admin = true
where id = '10000000-0000-4000-8000-000000000003';

insert into public.families (id, name, created_by, created_at, updated_at)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'Demo Familien',
    '10000000-0000-4000-8000-000000000001',
    '2026-01-02 08:00:00+00',
    '2026-01-02 08:00:00+00'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Den Anden Demo Familie',
    '10000000-0000-4000-8000-000000000002',
    '2026-01-02 08:00:00+00',
    '2026-01-02 08:00:00+00'
  );

insert into public.child_profiles (
  id,
  family_id,
  display_name,
  avatar_seed,
  preferences,
  created_by,
  created_at,
  updated_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Demo Barn',
    'demo-hero-green',
    '{"sound":true,"celebrations":true}'::jsonb,
    '10000000-0000-4000-8000-000000000001',
    '2026-01-02 08:05:00+00',
    '2026-01-02 08:05:00+00'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'Andet Demo Barn',
    'demo-hero-blue',
    '{}'::jsonb,
    '10000000-0000-4000-8000-000000000002',
    '2026-01-02 08:05:00+00',
    '2026-01-02 08:05:00+00'
  );

insert into public.topics (
  id,
  slug,
  title,
  description,
  icon,
  accent_color,
  sort_order,
  is_published,
  published_at,
  created_by,
  created_at,
  updated_at
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    'fodbold',
    'Fodbold',
    'Leg med bolden og lær nye færdigheder trin for trin.',
    '⚽',
    '#53C987',
    10,
    true,
    '2026-01-03 08:00:00+00',
    '10000000-0000-4000-8000-000000000003',
    '2026-01-03 08:00:00+00',
    '2026-01-03 08:00:00+00'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'gymnastik',
    'Gymnastik',
    'Et upubliceret eksempel til redaktørens preview.',
    '🤸',
    '#C39BE8',
    20,
    false,
    null,
    '10000000-0000-4000-8000-000000000003',
    '2026-01-03 08:00:00+00',
    '2026-01-03 08:00:00+00'
  );

insert into public.goals (
  id,
  topic_id,
  slug,
  title,
  summary,
  difficulty,
  estimated_minutes,
  equipment,
  sort_order,
  is_published,
  published_at,
  created_by,
  created_at,
  updated_at
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'laer-at-jonglere',
    'Lær at jonglere',
    'Byg boldkontrol op med små, sjove trin.',
    'beginner',
    10,
    array['En fodbold'],
    10,
    true,
    '2026-01-03 08:05:00+00',
    '10000000-0000-4000-8000-000000000003',
    '2026-01-03 08:05:00+00',
    '2026-01-03 08:05:00+00'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    'staa-paa-haender',
    'Stå på hænder',
    'Et upubliceret mål til redaktørens preview.',
    'intermediate',
    10,
    array['En væg', 'En måtte'],
    10,
    false,
    null,
    '10000000-0000-4000-8000-000000000003',
    '2026-01-03 08:05:00+00',
    '2026-01-03 08:05:00+00'
  );

insert into public.exercises (
  id,
  goal_id,
  slug,
  title,
  instructions,
  measurement,
  target_value,
  sort_order,
  is_published,
  published_at,
  created_by,
  created_at,
  updated_at
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'slip-bolden-og-grib',
    'Slip bolden og grib',
    'Hold bolden foran kroppen, slip den, og grib den igen.',
    'completion',
    null,
    10,
    true,
    '2026-01-03 08:10:00+00',
    '10000000-0000-4000-8000-000000000003',
    '2026-01-03 08:10:00+00',
    '2026-01-03 08:10:00+00'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000001',
    'et-spark-og-grib',
    'Ét spark og grib',
    'Slip bolden, spark den én gang op, og grib den.',
    'repetitions',
    5,
    20,
    true,
    '2026-01-03 08:10:00+00',
    '10000000-0000-4000-8000-000000000003',
    '2026-01-03 08:10:00+00',
    '2026-01-03 08:10:00+00'
  ),
  (
    '60000000-0000-4000-8000-000000000003',
    '50000000-0000-4000-8000-000000000001',
    'to-spark-og-grib',
    'To spark og grib',
    'Hold bolden i luften med to rolige spark, og grib den.',
    'repetitions',
    5,
    30,
    true,
    '2026-01-03 08:10:00+00',
    '10000000-0000-4000-8000-000000000003',
    '2026-01-03 08:10:00+00',
    '2026-01-03 08:10:00+00'
  );

insert into public.child_goals (
  id,
  child_profile_id,
  goal_id,
  status,
  selected_by,
  selected_at,
  completed_at,
  updated_at
)
values (
  '70000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'active',
  '10000000-0000-4000-8000-000000000001',
  '2026-01-04 08:00:00+00',
  null,
  '2026-01-04 08:00:00+00'
);

insert into public.exercise_sessions (
  id,
  child_goal_id,
  started_by,
  status,
  started_at,
  ended_at,
  created_at,
  updated_at
)
values (
  '80000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'in_progress',
  '2026-01-05 15:00:00+00',
  null,
  '2026-01-05 15:00:00+00',
  '2026-01-05 15:00:00+00'
);

insert into public.exercise_attempts (
  id,
  session_id,
  exercise_id,
  attempt_number,
  outcome,
  repetitions,
  perceived_difficulty,
  recorded_by,
  occurred_at,
  created_at,
  updated_at
)
values
  (
    '90000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    1,
    'partial',
    3,
    3,
    '10000000-0000-4000-8000-000000000001',
    '2026-01-05 15:04:00+00',
    '2026-01-05 15:04:00+00',
    '2026-01-05 15:04:00+00'
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000002',
    2,
    'completed',
    5,
    2,
    '10000000-0000-4000-8000-000000000001',
    '2026-01-05 15:07:00+00',
    '2026-01-05 15:07:00+00',
    '2026-01-05 15:07:00+00'
  );

update public.exercise_sessions
set status = 'completed',
    ended_at = '2026-01-05 15:08:00+00'
where id = '80000000-0000-4000-8000-000000000001';

commit;
