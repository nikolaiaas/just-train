# Internal-preview release checklist

Use this checklist for every shared Bare Træn preview. Select only the surfaces
that changed: administration/Vercel, Supabase migrations, Edge Functions, EAS
Update, or a fresh iOS build. Stop the release when a required check fails.

## 1. Define the release

- [ ] Record the release commit and the changed surfaces.
- [ ] Confirm that development, automated checks, preview data, screenshots,
      and AI input/output use synthetic people and media only.
- [ ] Confirm that clients receive only the Supabase URL and publishable key.
      Keep service-role, database, and OpenRouter credentials server-only and
      out of Git, logs, screenshots, and task evidence.
- [ ] Classify every database change as backward-compatible expand/contract.
      Never edit a migration that has already been deployed.
- [ ] If a migration deletes or rewrites data, stop until a fresh private
      logical backup outside Git and a written recovery plan exist. Treat
      Supabase Storage bytes separately because database backups do not contain
      them.
- [ ] Decide the rollback before release: revert web/client code through a new
      protected pull request, redeploy the last known-good Edge Function code,
      and repair a deployed schema with a new forward migration. A destructive
      hosted restore is an incident action, not a routine rollback.

## 2. Prove the candidate locally

- [ ] Install the locked dependencies with
      `mise exec -- pnpm install --frozen-lockfile`.
- [ ] Run `mise exec -- pnpm typecheck`, `mise exec -- pnpm lint`,
      `mise exec -- pnpm test`, `mise exec -- pnpm build`, and
      `mise exec -- pnpm format:check`.
- [ ] For a database change, run the disposable local database path used by CI:
      `mise exec -- pnpm supabase:start`, `mise exec -- pnpm supabase:reset`,
      `mise exec -- pnpm test:supabase-auth`,
      `mise exec -- pnpm supabase:types`,
      `git diff --exit-code -- packages/domain/src/database.generated.ts`,
      `mise exec -- pnpm supabase:test`, and
      `mise exec -- pnpm supabase:lint`.
- [ ] Smoke-test the changed core path locally with synthetic fixtures. For AI
      media, keep both source and result bytes outside Git and task evidence.

## 3. Use the protected pull-request path

- [ ] Open a current pull request into `main`; never push a release directly to
      `main`.
- [ ] Wait for the required GitHub `quality` and `database` jobs and the Vercel
      preview check to pass, then resolve every review conversation.
- [ ] Smoke-test the protected Vercel preview. It uses shared Hosted
      Development while Supabase preview branches are off, so do not expect an
      unmerged migration to exist there.
- [ ] Squash-merge with linear history only after every required check and
      relevant preview smoke test is green.

## 4. Verify hosted delivery

- [ ] Confirm that Vercel deployed the merged `main` commit and smoke-test the
      stable administration preview.
- [ ] If migrations changed, verify that the native Supabase integration
      applied every new migration to Hosted Development and that local and
      hosted migration histories align. Never deploy `seed.sql`, push local
      `config.toml`, or reset a linked project.
- [ ] If Edge Function code changed, obtain explicit hosted-mutation approval,
      verify required secret names without revealing values, and deploy it
      separately; merging migrations does not deploy Functions. Deploy
      `process-ai-job` and `process-admin-ai-job` with `--no-verify-jwt` as
      configured when either worker or its gateway setting changed.

- [ ] Confirm both deployed Functions have legacy gateway JWT verification
      disabled. Each handler must still require a bearer token, resolve the
      user with Supabase Auth, enforce job ownership and RLS, and reject an
      unauthenticated request with `401`; the admin handler must also require an
      admin-scoped job. Check CORS preflight returns `200`. If behavior changed,
      complete one authenticated synthetic end-to-end smoke test for each
      affected worker.
- [ ] Recheck hosted Auth/RLS health for a database or authentication change.

## 5. Choose the correct iOS delivery

- [ ] Confirm `apps/mobile` still reports app version `1.2.0` and uses the
      `appVersion` runtime policy. Confirm that the selected internal profile
      auto-increments the remotely managed iOS build number. Never send this
      slice to an installed `1.1.0` or older binary.
- [ ] For JavaScript, styling, or asset-only changes on a compatible `1.2.0`
      binary, change to `apps/mobile` and publish only to the intended channel
      with the command below.

Run from `apps/mobile`:

```bash
mise exec -- pnpm dlx eas-cli@latest update --channel preview --environment preview --message "Describe the preview"
```

- [ ] For native libraries, permissions, Expo SDK, native configuration, or an
      older installed runtime, register the iPhone and create a fresh build.
      Use `development` for the owner's Metro-connected **Bare Træn Dev** app or
      `preview` for the standalone **Bare Træn Preview** app. From `apps/mobile`,
      run `mise exec -- pnpm dlx eas-cli@latest device:create` and then one of
      `mise exec -- pnpm dlx eas-cli@latest build --platform ios --profile development`
      or `mise exec -- pnpm dlx eas-cli@latest build --platform ios --profile preview`.
      For the owner's already registered phone, the Dev Console's **Installér
      på iPhone** button performs the current-build check and starts only the
      missing `preview` build; it never starts Metro or a production build.

- [ ] Treat the enabled EAS device registry and the build's ad hoc provisioning
      profile as the installation allowlist. Share an unlisted installation URL
      only with a tester whose phone is included; rebuild after changing that
      allowlist. Do not publish the URL in Git, task evidence, or chat history.

## 6. Final smoke and release record

- [ ] On every released surface, verify launch, sign-in/session restoration,
      logout, the changed core flow, permission denial, and a retryable failure
      state with synthetic data.
- [ ] For a fresh iOS `1.2.0` build, also verify native OTP, cold and warm magic
      links, gallery permission, and either Metro connectivity (`development`)
      or standalone launch (`preview`).
- [ ] Record the commit, pull request, passed checks, Vercel deployment,
      migration IDs, Function version, EAS project/build identifier and channel,
      smoke-test result, known gaps, and rollback reference. In the approved
      private release record, link only to authenticated project dashboards;
      never record an install-artifact URL, credentials, one-time codes,
      personal data, or media bytes.
- [ ] If any release gate or smoke test fails, stop distribution, record the
      failure, and use the preselected rollback path before retrying.
