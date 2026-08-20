# Supabase development database

This directory is the source of truth for the local and hosted development
database. It contains no hosted project reference, API key, or database
password.

## Local workflow

From the repository root:

```sh
pnpm supabase:start
pnpm supabase:reset
pnpm exec supabase test db
pnpm supabase:lint
```

Local Studio runs at <http://127.0.0.1:54323>. The seed is intentionally made
only from synthetic fixtures. Never replace it with a dump of child or family
data from a hosted environment. The seed runs in one transaction, removes only
its fixed fixture IDs before rebuilding them, and refuses to run unless it sees
the Supabase CLI stack's well-known local JWT secret. This makes repeated local
runs safe and makes an accidental linked `--include-seed` fail closed.

The three local fixture users share the non-secret password
`local-demo-1234`:

- `parent.one@example.test` owns the family with a completed exercise session.
- `parent.two@example.test` owns a separate family used to verify RLS isolation.
- `content.admin@example.test` can manage draft and published training content.

## Authentication and authorization assumptions

- One `profiles` row is created automatically for each Supabase Auth user.
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
