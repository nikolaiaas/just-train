# Bare Træn — initial phase task list

This phase should produce one working vertical slice that can be run locally, reviewed in a browser, and installed on a real iPhone without a public App Store release.

The pilot slice is:

`parent sign-in → select/create child → choose one football goal → complete one exercise → save result → see progress`

The administration slice is:

`sign in → edit the football goal and its exercises → publish a version → see it in the child app`

## Technical direction

- Mobile: Expo, React Native, Expo Router, TypeScript.
- Administration: Next.js App Router and TypeScript.
- Backend: Supabase PostgreSQL, Auth, private Storage, Row-Level Security, and migrations.
- Shared code: domain types, Zod schemas, rules, API helpers, and design tokens in a pnpm workspace.
- Long-running avatar/video work: queued worker, kept outside normal web requests.

## Preview environments

| Environment                 | Frontend                                        | Backend                                                                  | Purpose                                                  |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Local Mac                   | Next.js dev server plus Expo web/iOS simulator  | Hosted Development normally; local Supabase for explicit backend work    | Visual development plus local backend tests              |
| Physical iPhone development | EAS development build with Expo dev client      | Hosted non-production Supabase                                           | Camera, permissions, timers, and real-device testing     |
| Pull request web preview    | Protected Vercel preview URL                    | Shared development Supabase; automatic preview branches deliberately off | Review administration changes                            |
| Pull request mobile preview | Installed development build plus EAS Update     | Shared development Supabase; automatic preview branches deliberately off | Review JavaScript and asset changes by QR/link           |
| Stakeholder iPhone preview  | EAS internal-distribution build                 | Hosted non-production Supabase                                           | Production-like testing without public App Store release |
| Production                  | App Store build and production admin deployment | Separate production Supabase                                             | Deferred until after the pilot                           |

Supabase provides the backend, not frontend preview hosting. Supabase Preview Branches can create an isolated database, Auth, Storage, Realtime, and Edge Functions environment per pull request. The organization is now on Pro, but branches remain deliberately off until branch-safe Auth, synthetic seed, Vercel wiring, and their separate compute cost are reviewed. Vercel automatically hosts protected administration previews for pull requests and updates the stable preview from `main`; Expo/EAS distributes mobile previews.

Running a frontend on localhost does not select its backend. The administration login has a localhost-only selector between Local Supabase and Hosted Development, with isolated sessions and no Production option. The mobile app deliberately uses the backend fixed by its ignored `.env.local`; local Supabase remains the explicit choice for migrations, tests, Studio, and full-local integration work.

For the initial phase, use:

1. Hosted Development for ordinary browser work, with local Supabase selected explicitly for backend and full-local integration work.
2. One hosted `development` Supabase project for physical phones and shared previews.
3. Vercel preview deployments for the administration app.
4. One EAS development build on the owner's iPhone, followed by an EAS preview build when stable sharing is needed.
5. Keep automatic Supabase per-PR branches off until the project needs parallel schema previews and their branch-safe setup and separate compute cost are approved.

Never copy production child data into local, development, or preview environments. Seed them with synthetic families and children only.

The recommended iPhone progression is:

1. Use the Expo web build in Safari for the earliest screen and navigation work.
2. Use the paid Apple Developer membership and an EAS development build for daily work on the owner's phone. This keeps Expo SDK 57 and does not require Xcode on this Mac.
3. Use an EAS preview build for stable sharing with additional registered phones. It provides an unlisted install link with no App Store review; restrict link access and do not forward it.
4. Move to TestFlight for a broader pilot. TestFlight does not publish the app publicly, although external testing can require Apple's beta review.

## 0. Settle the pilot rules

- [ ] Confirm the first pilot age range and supported devices.
- [x] Confirm that the first release uses parent-owned child profiles with no child Auth account, email, password, age, or photo; direct child login is deferred.
- [x] Require the family owner to accept a versioned guardian notice before creating a persistent child profile, and record that acknowledgement privately.
- [ ] Approve the legal/privacy basis, guardian wording, withdrawal, deletion, and retention flow before a broader real-child pilot; the owner has accepted the narrower risk for the private family cartoon prototype.
- [ ] Define the first goal: `Fodbold → Lær at jonglere`, including its ordered exercises and completion thresholds.
- [ ] Define how a result advances an exercise and when a goal is complete.
- [ ] Define the initial point calculation and three fixed rewards.
- [ ] Decide whether points are spent or only used as unlock thresholds.
- [x] Write the development-media rule: repository development, automated tests, previews, and task evidence use synthetic people and media only; the private authenticated product flow may accept a photo linked to the selected family child.
- [ ] Decide how long original photos and videos may remain after transformation.

Exit condition: the pilot can be described without inventing progression, reward, consent, or retention behaviour while implementing it.

## 1. Create the workspace foundation

- [x] Create a pnpm workspace.
- [x] Create `apps/mobile` with Expo Router and TypeScript.
- [x] Create `apps/admin` with Next.js App Router and TypeScript.
- [x] Create shared `domain`, `design`, and `api-client` packages.
- [x] Add formatting, linting, type-checking, and unit-test commands at the repository root.
- [x] Add environment validation and `.env.example` files without secrets.
- [x] Give development, preview, and production apps different bundle identifiers and visible names so they can coexist on a phone.
- [x] Add a root README with setup requirements and exact start commands.
- [x] Keep the existing HTML and PNG files in a `references` area as design inputs rather than application source.

Exit condition: a clean clone can install dependencies and start both empty applications using documented commands.

## 2. Make local development reproducible

- [x] Add the Supabase CLI as a pinned development dependency.
- [x] Initialize the committed `supabase/` directory.
- [x] Run the local Supabase stack through Docker or another Docker-compatible runtime.
- [x] Add root commands for starting, stopping, resetting, and checking the local backend.
- [x] Add deterministic `seed.sql` data containing one synthetic family, two children, one topic, one goal, and its exercises.
- [x] Prove that a database reset rebuilds the complete schema and seed from files.
- [x] Generate shared TypeScript database types from the local schema.
- [x] Add `pnpm dev:admin`, `pnpm dev:mobile`, and a documented combined development command.
- [x] Add beginner-friendly `pnpm dev:web` and `pnpm dev:iphone` commands.
- [x] Add a one-click local Dev Console with an overview, verified service controls, redacted logs, and an editable four-column task board.
- [x] Add a development-only screen gallery for reviewing reusable components and fixture states.
- [x] Verify local previews in desktop and narrow browser viewports.
- [ ] Verify the mobile preview in the iOS Simulator after full Xcode is installed.

Exit condition: local development does not depend on hand-created dashboard state or production services.

## 3. Establish shared previews

- [x] Create a hosted non-production Supabase project in a specific EU region.
- [x] Apply the tested migration, without the credential-bearing local seed, to the hosted development project.
- [x] Make a private logical pre-deploy backup outside the repository and Git, then deploy the tested parent- and child-onboarding migrations to Hosted Development after explicit authorization and a successful fail-fast preflight on 2026-08-21.
- [x] Enable the native Supabase GitHub integration, restrict it to `nikolaiaas/just-train`, use working directory `.`, select `main` as its production branch, and keep automatic preview branches off until their branch-safe Auth, seed, Vercel, and cost setup is reviewed.
- [x] Protect `main` with pull requests, strict required quality, database, and Vercel preview checks, resolved conversations, squash-only linear history, and no force pushes or deletion.
- [x] Verify end to end that a green protected merge automatically updates Hosted Development; the first protected merge completed the native Supabase deployment, retained aligned migrations, and passed hosted Auth/RLS health checks as well as the stable Vercel update.
- [x] Limit automatic hosted database delivery to immutable files in `supabase/migrations`; never deploy the local seed or push local `config.toml`.
- [x] Require expand/contract database changes so shared pull-request previews, the stable web preview, and installed mobile builds remain compatible while releases overlap.
- [x] Upgrade the `Nikolai Aas` organization to Supabase Pro, keep Spend Cap enabled, and verify that `bare-traen-development` remains healthy on Nano compute without PITR or automatic preview branches. The dashboard exposes three pre-upgrade physical daily backups with Restore controls, most recently 2026-08-20 at 23:07 UTC.
- [ ] Confirm that the first scheduled physical daily database backup dated after the 2026-08-21 Pro upgrade appears, then document the recovery procedure without performing a destructive restore on Hosted Development.
- [ ] Before any real-data pilot, implement and restore-test a separate off-platform backup of Supabase Storage object bytes; database backups contain object metadata only.
- [ ] Finish and document a full private logical-backup restoration rehearsal against a matching Supabase platform baseline. The 2026-08-21 rehearsal verified checksums, permissions, roles, app schema/data, RLS, functions, indexes, and migration history, but the final Storage metadata step is blocked because the current local baseline lacks the hosted `storage.buckets.versioning_status` column; never rewrite the backup to hide that mismatch.
- [ ] Add a separate safe bootstrap for shared synthetic hosted data without known-password accounts.
- [ ] Configure separate local, development, preview, and production environment names.
- [x] Ensure only the Supabase URL and publishable key reach client applications; never expose a service-role or secret key.
- [x] Connect the Next.js administration app to Vercel preview deployments.
- [x] Protect preview deployments from public indexing with robots metadata and response headers.
- [x] Require Vercel team login for pull-request previews; keep the public production URL fixture-only until application authentication exists.
- [x] Configure Vercel and EAS preview environment variables for the hosted development backend.
- [x] Set the hosted development Auth site URL to the stable administration URL and allow the exact 11000/11001 callbacks plus all three app schemes.
- [ ] Connect a custom hosted SMTP provider, disable link tracking, and install the same Danish code-and-magic-link template used locally.
- [x] Add CI that resets the database, runs migrations, generates/checks types, and executes RLS tests, and require those checks before merging to `main`.
- [x] Document the now-available Supabase Pro path for per-pull-request preview branches and its separate compute cost; keep it disabled until the branch-safe setup is ready.
- [ ] If Supabase branching is enabled, connect each Vercel preview to its matching Supabase branch and synthetic seed.
- [ ] If mobile PR previews are automated later, publish an EAS Update after the Supabase preview branch is ready and inject only that branch's public URL/key.

Exit condition: a pull request gets a safe administration preview without touching production data.

## 4. Put the app on an iPhone early

- [x] Create the Expo/EAS project and development, preview, and production build profiles.
- [x] Use the Expo web build for the first JavaScript-only screen work.
- [ ] Optionally install Xcode later for the iOS Simulator and local USB builds.
- [x] Document the free Personal Team limitation: provisioning expires after seven days and the app must then be rebuilt/reinstalled.
- [x] Confirm that a paid Apple Developer Program membership is available for stable distribution and additional testers.
- [x] Confirm the Apple Developer Program account that will own long-lived signing credentials.
- [x] When enabling EAS distribution, register the owner's iPhone for ad hoc provisioning.
- [ ] Build and install a fresh Expo `1.2.0` development client through EAS from the unlisted link/QR code.
- [x] Point the phone build at the hosted development Supabase project.
- [ ] Confirm live local development through Metro on the same network or a tunnel.
- [ ] Verify native OTP, cold and warm magic-link callbacks, session restoration, logout, and gallery permission in the fresh `1.2.0` build.
- [x] Create a production-like EAS internal-distribution preview build that runs without Metro.
- [x] Disable unauthenticated EAS internal-build access, or otherwise document and enforce who may receive unlisted build URLs.
- [x] Configure a `preview` EAS Update channel so JavaScript, styling, and asset changes usually do not require a new binary.
- [x] Document that native-library, permission, and native-configuration changes require a new build, and that the `1.2.0` AI-media slice must not be sent to a `1.1.0` or older binary through EAS Update.
- [x] Keep TestFlight as the later route for a larger tester group; it is beta distribution, not a public App Store launch.

Exit condition: the owner can run Bare Træn on the iPhone without App Store publication. With paid distribution enabled, the same build can be installed from a restricted or carefully shared unlisted link and receive compatible preview updates.

## 5. Build the shared design foundation

- [x] Extract colours, typography, spacing, radii, shadows, and motion values from the concept boards.
- [ ] Select and license/load the production typefaces.
- [ ] Implement mobile primitives: screen shell, header, card, primary/secondary button, input, list row, progress, badge, timer, and empty/error state.
- [ ] Implement administration primitives: shell, sidebar, toolbar, form field, table/list, status badge, panel, dialog, and media placeholder.
- [ ] Make touch targets, text scaling, colour contrast, focus states, and reduced motion part of the component definitions.
- [x] Set the application language and accessibility metadata to Danish.
- [ ] Add representative loading, empty, offline, permission-denied, processing, and failure states to the screen gallery.

Exit condition: pilot screens can be assembled from reviewed components rather than one-off markup.

## 6. Implement the data and permission model

- [x] Add account profiles, families, family memberships, and parent-owned child profiles.
- [ ] Add family invitations.
- [x] Add a private, immutable, versioned guardian-acknowledgement record for child-profile creation without adding child identity fields.
- [ ] Define and implement the approved legal-consent, withdrawal, deletion, and retention records before a broader real-child pilot; the private family prototype is an explicitly accepted narrow exception.
- [ ] Add topics, immutable topic releases, goals, ordered exercise steps, equipment, and safety text.
- [x] Add goal enrolments, training sessions, attempts, personal bests, and difficulty ratings.
- [ ] Add an append-only point ledger, rewards, and child inventory.
- [x] Add stable AI operations, immutable prompt/provider versions, generic family/admin jobs, private media metadata, named media slots, and worker-only attempt audit.
- [x] Store the initial cartoon prompt in the database and let an administrator atomically publish a replacement while existing jobs remain pinned.
- [x] Build the reviewed administration UI for prompt-version publication and active-version history.
- [ ] Implement and test the retention worker that deletes private Storage bytes at `delete_after` and records the completed deletion.
- [ ] Add AI draft/suggestion, review decision, publication, and audit-log structures.
- [x] Configure six-digit passwordless email locally, remove fixture passwords, and protect magic links behind an explicit scanner-safe confirmation page.
- [x] Implement administrator email/OTP sign-in with server-side session handling and an `is_admin` route guard.
- [ ] Add CAPTCHA or server-side throttling before exposing passwordless login publicly.
- [x] Implement parent email/OTP authentication, session restoration, and logout; verify the browser flow against Local Supabase.
- [x] Keep child profiles parent-owned and collect no child Auth, email, password, age, or photo in this slice; direct child authentication remains deferred.
- [x] Add administrator roles in protected metadata and server-side route guards.
- [x] Write and test parent RLS for the current profile, family, membership, and child-profile tables, including owner-only child creation and default-deny private acknowledgement evidence.
- [x] Resolve or explicitly document every current Supabase Database Advisor warning: review the platform `rls_auto_enable` execute grants, preserve the tested boundaries of the four intentional `SECURITY DEFINER` product RPCs, and measure or consolidate overlapping read policies for topics, goals, and exercises.
- [x] Add narrow service-role worker RPCs and positive/negative RLS and Storage-policy tests for the first AI media flow, including parent-session family isolation and selected-child linkage; direct child authentication remains deferred.
- [ ] Add policies and positive/negative tests for each future personal-data table and private Storage bucket as it is introduced.
- [x] Ensure the content-administrator role alone cannot browse child data.

Exit condition: access is denied by the database itself when a client attempts to cross a family or role boundary.

## 7. Build the functional mobile vertical slice

- [x] Implement welcome and parent sign-in.
- [x] Load the authenticated parent's profile and family, create the first family safely, and select existing active child profiles.
- [x] Implement owner-only child creation under the parent's session, with a versioned guardian acknowledgement and a limit of 10 active children per family.
- [x] Use four non-photo preset avatars for child profiles in this slice.
- [x] Require every portrait request to be linked to the selected active child in the authenticated family member's family, and preserve that link across the mobile contract, Storage metadata, preparation RPC, and worker claim.
- [x] Add a gallery-only private family cartoon prototype using database-versioned prompts and `openai/gpt-image-2` through an OpenAI-only, no-fallback OpenRouter route; keep development and evidence synthetic.
- [x] Persist a caller-scoped child-creation request identity and safely retry it after refresh or interruption without creating a duplicate child.
- [ ] Implement topic selection, goal list, and goal detail for the seeded football content.
- [ ] Implement goal enrolment and the child's home screen.
- [ ] Implement the ordered goal journey with completed, current, and locked exercises.
- [ ] Implement the training state machine: `ready → training → result → review → completed → pending sync`.
- [ ] Keep overall session time separate from individual attempts.
- [ ] Support manual repetition and time results before voice input is introduced.
- [ ] Save perceived difficulty and calculate progress/points transactionally on the backend.
- [ ] Show the saved progress and any fixed reward unlock.
- [ ] Add retryable error and offline states for every remaining mutation.

Exit condition: the complete pilot path works against local and hosted development backends.

## 8. Make training resilient

- [x] Calculate timers from timestamps or monotonic time rather than counting interval callbacks.
- [ ] Persist the active session locally before training begins.
- [ ] Restore an interrupted session after backgrounding or terminating the app.
- [ ] Add client-generated event IDs and idempotent server writes.
- [ ] Add a local outbox for results created without connectivity.
- [ ] Cache the enrolled goal and its exercise instructions for basic offline access.
- [ ] Add clear pending-sync, retry, conflict, and successfully-synced states.
- [ ] Test clock changes, rapid repeated taps, app backgrounding, process termination, and duplicate network requests.

Exit condition: a child cannot lose or duplicate a completed attempt because of a refresh, background transition, or temporary network loss.

## 9. Build the functional administration vertical slice

- [x] Implement administrator sign-in and authorization guard.
- [ ] Implement the topic/goal library with draft, review, and published statuses.
- [ ] Implement editing and reordering the seeded goal's exercises.
- [ ] Validate name, explanation, measurement type, target, training time, equipment, and safety text.
- [ ] Implement draft preview using the child-app presentation model.
- [ ] Implement human review and an explicit publish action.
- [ ] Publish an immutable topic release atomically.
- [ ] Record who changed, reviewed, and published each release.
- [ ] Verify that a newly published version appears in the child app while existing enrolments remain pinned safely.

Exit condition: an authorized person can edit and publish content without direct database-dashboard work.

## 10. Run the risky technical spikes

- [ ] Test Danish speech recognition for the single word “stop” on representative iPhones and Android devices in a noisy room.
- [ ] Keep the large stop button available regardless of speech results.
- [ ] Verify that no microphone recording is retained for the voice-stop feature.
- [ ] Test camera capture, gallery selection, compression, upload progress, cancellation, and deletion using synthetic test material.
- [ ] Compare at least two avatar-generation approaches for quality, latency, price, API terms, EU processing, deletion, and failure handling.
- [x] Build and unit-test a bounded OpenRouter image adapter with private Storage, selected-child linkage, idempotent reservation, one provider attempt, sanitized audit data, timeout, and cost ceilings. Preserve the failed Azure/MAI version 1 history and use active version 2 with `openai/gpt-image-2`, OpenAI-only, and no fallback.
- [x] Create a separate 90-day OpenRouter development key with a USD 5 total limit and USD 5 daily guardrail, install it only in the ignored local Function environment and Hosted Development's Edge secrets, and verify the exact GPT Image 2 route with a synthetic 1024 by 1024 PNG: HTTP 200, valid PNG, about 19 seconds, USD 0 OpenRouter billing, and USD 0.014237 reported upstream BYOK cost.
- [x] Deploy the two tested AI migrations to Hosted Development through protected PR #4, deploy `process-ai-job` separately with JWT verification, and verify migration alignment, active Function status, unauthenticated HTTP 401, and CORS HTTP 200. Complete one authenticated hosted end-to-end generation with synthetic media, selected-child linkage, private input/output storage, and a rendered GPT Image 2 result without exposing credentials.
- [ ] Add an autonomous stale-job sweeper and durable failure-transition retry so recovery does not depend on the mobile screen remaining open.
- [ ] Add a durable provider-success checkpoint and idempotent finalizer so an uploaded paid output can be reconciled without regeneration.
- [ ] Delete private Storage objects at their recorded retention deadline and prove both deletion and off-platform byte recovery.
- [ ] Resolve the recorded Zero Data Retention, EU processing, processor-contract, and under-18 risks before any broader real-child rollout; the owner has explicitly accepted them only for the private family prototype.
- [ ] Test short exercise-video download size, playback, caching, and offline behaviour.
- [ ] Prototype personalized motion/video generation separately and record quality, cost, latency, consent, and moderation blockers.
- [ ] Prototype schema-validated AI content drafts that can only create a reviewable draft revision.

Exit condition: each risky feature has a written go/defer decision and does not block the core training loop.

## 11. Add quality and release gates

- [ ] Add unit tests for progression, timer reconstruction, points, rewards, and publication rules.
- [x] Add database migration and RLS tests.
- [ ] Add Playwright smoke tests for the administration pilot path.
- [ ] Add a real-device mobile smoke test, automated with Maestro when the routes stabilize.
- [ ] Add screenshot baselines for the primary child and administration states.
- [ ] Add error reporting with personal-data scrubbing and no session replay on child screens.
- [ ] Add an audit for logs, analytics, crash reports, backups, and third-party processors.
- [ ] Verify account deletion/export and media deletion can be implemented from the chosen data model.
- [x] Run an end-to-end AI-media integration test with synthetic material only; keep all input and output bytes out of Git and task evidence.
- [x] Write a repeatable internal-preview release checklist.

Exit condition: a failed permission test, migration, type check, or core-flow smoke test prevents a preview release.

## Initial-phase completion checklist

- [ ] A new developer can start the complete local stack from the README.
- [x] The administration app has a shareable preview URL.
- [ ] A private Bare Træn build is installed on the owner's iPhone without public App Store release.
- [ ] The functional parent-to-completed-exercise pilot works locally and on the iPhone.
- [ ] The administration pilot can publish versioned content consumed by the mobile app.
- [ ] Timers and pending results survive interruption and reconnect safely.
- [x] RLS tests prove family and administrator isolation.
- [ ] All development and preview data is synthetic.
- [ ] Avatar, voice, and personalized video each have an evidence-based go/defer decision.

## Explicitly deferred beyond the initial phase

- Direct child email login and account recovery.
- All 18 child screens and all 7 administration screens at production depth.
- Full wardrobe/equipment management.
- Production AI-assisted content authoring.
- Automated video anonymization and personalized completion videos.
- Push notifications.
- Payments and subscriptions.
- Public App Store submission.

## Technical references

- [Supabase local development](https://supabase.com/docs/guides/local-development)
- [Supabase deployment and preview branching](https://supabase.com/docs/guides/deployment)
- [Supabase GitHub branch integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase database migration workflow](https://supabase.com/docs/guides/deployment/database-migrations)
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Expo internal iOS distribution](https://docs.expo.dev/build/internal-distribution/)
- [Expo preview updates](https://docs.expo.dev/eas-update/preview/)
- [Apple membership and Personal Team limits](https://developer.apple.com/support/compare-memberships/)
- [Apple TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)
- [Microsoft MAI Image 2.5 on Azure](https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image)
- [Azure model data, privacy, and abuse monitoring](https://learn.microsoft.com/azure/foundry/responsible-ai/openai/data-privacy)
- [OpenRouter image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [OpenAI GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2)
- [OpenRouter Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr)
- [OpenRouter Data Processing Addendum](https://openrouter.ai/data-processing-agreement)
- [OpenRouter terms](https://openrouter.ai/terms)
