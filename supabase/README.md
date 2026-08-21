# Supabase development database

This directory is the source of truth for the local and hosted development
database. It contains no hosted project reference, API key, or database
password.

## Local workflow

From the repository root:

```sh
pnpm supabase:start
pnpm supabase:reset
pnpm test:supabase-auth
pnpm supabase:test
pnpm supabase:lint
```

Local Studio runs at <http://127.0.0.1:54323>. The seed is intentionally made
only from synthetic fixtures. Never replace it with a dump of child or family
data from a hosted environment. The seed runs in one transaction, removes only
its fixed fixture IDs before rebuilding them, and refuses to run unless it sees
the Supabase CLI stack's well-known local JWT secret. This makes repeated local
runs safe and makes an accidental linked `--include-seed` fail closed.

The three local fixture users are passwordless:

- `parent.one@example.test` owns the family with a completed exercise session.
- `parent.two@example.test` owns a separate family used to verify RLS isolation.
- `content.admin@example.test` can manage draft and published training content.

Request a sign-in email from the application, then open local Mailpit at
<http://127.0.0.1:54324>. Each Danish email contains both a six-digit one-time
code and a magic-link button. They are two ways to use the same one-time
credential, so request a fresh email before testing the other route. The code
and link expire after ten minutes, and a new email can be requested after 60
seconds. Mailpit captures local messages instead of delivering them to a real
mailbox. The button first opens `/auth/continue`, where the user must explicitly
continue before the underlying one-use Supabase link is opened. This prevents
email link scanners from consuming the credential before the user sees it.

Both new-account confirmations and returning-user sign-ins use
`templates/passwordless.html`. Hosted Development has the exact callback
allowlist, but custom SMTP and the matching Danish template remain a separate
hosted-configuration gate; local `config.toml` settings do not change a hosted
Supabase project. The administration app implements the scanner-safe
`/auth/continue` page. Local operational tests cover both returning passwordless
users and the new-parent onboarding flow without sending real email.

## Authentication and authorization assumptions

- One `profiles` row is created automatically for each Supabase Auth user.
- A verified adult completes first-family setup through the retry-safe
  `complete_parent_onboarding` RPC. It updates only the caller's display name,
  returns an existing membership when one is already present, or creates one
  family and owner membership atomically. It never creates a child profile.
- In the first vertical slice, children are parent-owned records, not Auth
  users. Direct child login is deliberately deferred.
- Family membership is the boundary for children, selected goals, sessions,
  attempts, and progress. RLS helper functions are in the non-exposed
  `private` schema.
- Published topics, goals, and exercises are readable before sign-in. Draft
  content and all content mutations require an authenticated profile whose
  `is_admin` flag was provisioned by trusted SQL or a server-side workflow.
- Anonymous content grants omit creator UUIDs; authenticated content admins
  retain the audit fields they need.
- Authenticated clients have no update privilege on `profiles.is_admin`, so a
  user cannot self-promote even when updating their own profile.
- Attempts are append-only and individual selected goals and sessions are not
  client-deletable. A trusted family/child erasure still cascades through the
  history, and progress is repaired during any lower-level trusted cascade.
- The service role bypasses RLS, but it still has explicit least-privilege
  grants: it can support family administration and validated content/training
  writes, but cannot overwrite derived progress or rewrite/delete individual
  attempts. It must never be embedded in the Expo app or browser bundle.

## Hosted Development delivery

The parent- and child-onboarding migrations through
`202608210001_child_profile_creation.sql` were deployed to Hosted Development
on 2026-08-21 after the compatibility preflight passed. The selected routine
deployment flow will be:

1. Open a pull request in `nikolaiaas/just-train`.
2. The required GitHub quality and database jobs install a disposable local
   Supabase stack, apply all migrations, and run the database tests.
3. Merge only after those checks pass. The Supabase GitHub integration will be
   restricted to this repository and apply new migration files from its
   selected production branch, `main`.

`main` is now protected by pull requests and the required `quality`,
`database`, and Vercel preview checks. The native integration is enabled for
`nikolaiaas/just-train`, working directory `.`, production branch `main`, with
production deploys on and preview branches off. Until the first end-to-end
merge verification is complete, a merge must not be treated as proof that
Hosted Development received the migration.

Automatic Supabase preview branches are off while Hosted Development uses the
Free plan. A Vercel pull-request preview therefore uses the shared hosted
schema and will not see a new database migration until it reaches `main`. Make
schema changes with an expand/contract sequence: add a backward-compatible
shape first, migrate all web and mobile callers, then remove the old shape in a
later reviewed migration. Never modify an already-deployed migration.

Only `supabase/migrations` will belong in the automatic hosted deployment path. Never use
`--include-seed`, never deploy `seed.sql`, and never push this directory's
`config.toml` to Hosted Development. Auth callbacks, templates, SMTP, and other
operational settings are managed separately with an explicit review. A manual
`pnpm exec supabase db push --dry-run` is useful for an authorized diagnostic,
and, after the integration is verified, normal changes should reach Hosted
Development through a green pull request and merge rather than an ad hoc local
push. Never run a linked reset.

## Backup boundary

Immediately before the 2026-08-21 onboarding deployment, a private logical
backup was saved outside this repository and outside Git. In plain terms, it is
a dated point-in-time copy of the database roles, application schema, and
application table rows needed as a migration recovery aid. It contains no
committed credentials and its private path and contents must not be copied into
issues, task evidence, or CI logs.

This one manual copy is not continuous backup coverage. The current Supabase
Free project has no automatic database backups or uptime guarantee, and a
database backup does not copy the bytes stored in Supabase Storage. Before any
real-person or real-child data is allowed, the owner must separately approve
Supabase Pro billing, verify database backup and recovery, and approve an
independent backup process for Storage object bytes. Until then, destructive or
data-rewriting hosted migrations require a fresh private backup and a recorded
recovery plan before merge.

The 2026-08-21 recovery rehearsal verified the private files and checksums,
roles, application schema and data, migration history, all 11 RLS-enabled app
tables, 38 policies, 19 functions, and indexes in an isolated environment. The
entire hosted dump is not yet restore-rehearsed: its Storage metadata expects a
`storage.buckets.versioning_status` column that the current local Supabase
baseline does not have. The backup contains zero Storage metadata rows, but the
statement still cannot be parsed against that older target schema. Keep the
backup unchanged and repeat the final rehearsal against a matching hosted or
local Supabase platform baseline before treating it as a complete recovery
path. Supabase Storage object bytes always require a separate backup.

### Child-creation migration preflight

`202608210001_child_profile_creation.sql` deliberately fails before adding its
name constraint or active-child trigger when existing hosted data is not
compatible. It reports only aggregate counts and refuses to make product
decisions silently. The migration first takes a DML-conflicting lock on child
profiles, so an older client cannot insert or reactivate a child between the
compatibility count and installation of the new enforcement trigger.

- A child name with surrounding whitespace or control characters must be
  reviewed and normalized explicitly with the family. The migration does not
  rewrite names automatically.
- A family with more than ten active child profiles must be reviewed by its
  owner. The appropriate profiles must be deactivated or otherwise remediated
  before retrying; the migration never chooses a child on the family's behalf.

Treat either preflight exception as a deployment stop, inspect the affected
synthetic development rows through a trusted workflow, and rerun the complete
local reset and database tests before attempting the hosted migration again.
