# Supabase Advisor review

Reviewed on 2026-08-21 against the migration-backed local schema and the
Hosted Development Advisor items recorded in the task board. Migration
`202608210004_database_advisor_hardening.sql` is intentionally
backward-compatible. It does not change hosted state until it reaches `main`
through the protected migration flow.

## Current Security Advisor warnings

| Advisor check                                             | Object                                                                          | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0028 anon_security_definer_function_executable`          | `public.rls_auto_enable()` through `PUBLIC`                                     | Resolved by conditionally revoking `EXECUTE` from `PUBLIC`, `anon`, `authenticated`, and `service_role`. The Supabase event trigger invokes this helper internally; API roles never need to call it. The conditional handles the current local CLI baseline, where the optional hosted helper is absent.                                                                                                                                                                                    |
| `0029 authenticated_security_definer_function_executable` | `public.rls_auto_enable()`                                                      | Resolved by the same least-privilege revocation. The function owner retains the privilege needed for the event trigger.                                                                                                                                                                                                                                                                                                                                                                     |
| `0029 authenticated_security_definer_function_executable` | `public.complete_parent_onboarding(text,text)`                                  | Accepted and tested. This is an authenticated product RPC, not a general helper. It has an empty fixed `search_path`, derives identity only from `auth.uid()`, locks the caller's profile, and can update only that profile or return/create the caller's first family. `PUBLIC` and `anon` cannot execute it. Its idempotent, cross-user, and concurrency boundaries are covered by `004_parent_onboarding.test.sql` and the onboarding integration tests.                                 |
| `0029 authenticated_security_definer_function_executable` | `public.create_child_profile(uuid,uuid,uuid,text,text,text,boolean)`            | Accepted and tested. The RPC has an empty fixed `search_path`, binds the expected adult to `auth.uid()`, requires active owner membership, accepts only reviewed preset avatars and the current notice version, enforces the active-child limit, and writes immutable consent evidence. `PUBLIC` and `anon` cannot execute it. Positive, negative, idempotency, and concurrency coverage lives in `005_child_profile_creation.test.sql` and `child-profile-ownership-concurrency.test.mjs`. |
| `0029 authenticated_security_definer_function_executable` | `public.prepare_ai_media_job(text,uuid,uuid,uuid,media_subject_kind,text,uuid)` | Accepted and tested. It has an empty fixed `search_path`, binds authority to `auth.uid()`, and verifies family membership, selected-child linkage, immutable operation configuration, idempotency, and bounded private-media reservations. `PUBLIC` and `anon` cannot execute it.                                                                                                                                                                                                           |
| `0029 authenticated_security_definer_function_executable` | `public.publish_ai_operation_version(text,text,uuid)`                           | Accepted and tested. It has an empty fixed `search_path`, binds authority to `auth.uid()`, requires `private.is_admin()`, and uses expected-version concurrency control. `PUBLIC` and `anon` cannot execute it.                                                                                                                                                                                                                                                                             |
| Auth leaked-password protection disabled                  | Hosted Auth                                                                     | Accepted for the current passwordless-only preview flow, with the conditions recorded below. It must be enabled before a password flow is introduced.                                                                                                                                                                                                                                                                                                                                       |

The Security Advisor snapshot therefore contains zero errors and seven warnings:
two removable grants on the platform auto-RLS helper, four intentional
authenticated product RPCs, and one password-setting warning that does not
apply to the current passwordless credentials.

## Current Performance Advisor warnings

| Advisor check                       | Object                                     | Disposition                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0006 multiple_permissive_policies` | `public.topics`, authenticated `SELECT`    | Resolved. The published-content and admin-read expressions are consolidated into one authenticated policy; `anon` keeps one separate published-only policy. |
| `0006 multiple_permissive_policies` | `public.goals`, authenticated `SELECT`     | Resolved with the same role split while retaining the published-topic requirement for non-admin readers.                                                    |
| `0006 multiple_permissive_policies` | `public.exercises`, authenticated `SELECT` | Resolved with the same role split while retaining the published-goal and published-topic requirements for non-admin readers.                                |

The policy change reduces the affected authenticated policy set from two
permissive `SELECT` policies per table to one. There are now exactly three
anonymous and three authenticated content-read policies across the three
tables. `008_database_advisor_hardening.test.sql` asserts those counts and the
same anonymous, parent, and administrator row visibility as before.

## Security-definer RPC implementation notes

The AI foundation deliberately exposes
`publish_ai_operation_version(text,text,uuid)` and
`prepare_ai_media_job(text,uuid,uuid,uuid,media_subject_kind,text,uuid)` to
`authenticated`. Both have an empty fixed `search_path`, reject anonymous
execution, derive authority from `auth.uid()`, and perform server-owned
validation that cannot be expressed safely as direct table grants. The first
requires `private.is_admin()` and uses expected-version concurrency control;
the second verifies family membership, selected-child linkage, immutable
operation configuration, idempotency, and bounded private media reservations.
Their behavioral boundaries are covered in
`006_ai_media_foundation.test.sql`, `007_ai_multi_operation_foundation.test.sql`,
and the AI supersede concurrency test.

The worker claim, completion, and failure functions are granted only to
`service_role`, never to `anon` or `authenticated`. Advisor notices about the
four authenticated product RPCs are therefore reviewed exceptions rather than
unexamined exposure. Any new public `SECURITY DEFINER` function must repeat the
same fixed-path, caller-binding, least-privilege, negative-test, and concurrency
review before merge.

## Leaked-password protection

The seventh current Security Advisor warning reports that leaked-password
protection is not enabled. Bare Træn's current product authentication is
passwordless email OTP or a one-use magic link: neither the administration nor
mobile client asks for, creates, stores, or submits a user password, and
children have no Auth accounts. The warning therefore does not weaken a
password used by the current product flow.

This is an accepted preview-environment exception, not a permanent waiver.
Leaked-password protection must be enabled before any password sign-up, password
sign-in, password recovery, or broader externally exposed password flow is
introduced. The existing open work for custom SMTP plus CAPTCHA or server-side
throttling still applies to the passwordless endpoints and is not replaced by
this decision.

## Verification and follow-up

Local verification consists of a complete database reset, all pgTAP and
database-concurrency tests, and `supabase db lint`. After the migration reaches
Hosted Development through a reviewed merge, rerun both the Security and
Performance Advisors. The three multiple-policy warnings and the two
`rls_auto_enable` execute warnings should disappear. The authenticated product
RPC notices remain documented, intentional exceptions; do not suppress them by
granting direct writes to the underlying protected tables.

## References

- [Supabase Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors)
- [Supabase database-function security and privileges](https://supabase.com/docs/guides/database/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
