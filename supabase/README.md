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
`templates/passwordless.html`. Hosted Development must be configured with the
same template and callback allowlist separately; local `config.toml` settings
do not change a hosted Supabase project. The administration app implements the
scanner-safe `/auth/continue` page. This local operational test covers returning
passwordless users; the parent-onboarding slice will exercise new-user
confirmation through the real UI.

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

Before applying changes to a linked development project, preview them with
`pnpm exec supabase db push --dry-run`. Do not run a linked reset unless the
target has been confirmed as disposable development infrastructure.

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
