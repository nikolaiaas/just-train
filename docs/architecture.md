# Initial architecture decisions

## Repository shape

| Area                | Responsibility                                                             |
| ------------------- | -------------------------------------------------------------------------- |
| `apps/mobile`       | Parent/child experience built with Expo and React Native                   |
| `apps/admin`        | Content administration built with Next.js App Router                       |
| `packages/domain`   | Framework-independent types, fixtures, and business rules                  |
| `packages/design`   | Portable visual tokens shared by native and web code                       |
| `supabase`          | Reproducible database migrations, policies, tests, and synthetic seed data |
| `tools/dev-console` | React/Vite local console for service controls, redacted logs, and tasks    |

This is one pnpm workspace so domain rules can be tested once and used by both interfaces. Mobile-specific components and web-specific components remain in their own applications.

## Environments and previews

| Environment  | Interface                                               | Backend                                                                  | Data policy                                      |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| Local        | Next.js on localhost; Expo web/Simulator                | Local Supabase for backend work; hosted Development for normal UI work   | Synthetic seed only                              |
| Development  | Local UI or shared preview                              | Hosted `bare-traen-development` Supabase project in Stockholm            | Synthetic test data only                         |
| Pull request | Protected Vercel preview; later EAS Update              | Shared development; automatic Supabase preview branches deliberately off | Synthetic test data only                         |
| Pilot        | Protected web preview; EAS internal build or TestFlight | Separate persistent staging project/branch                               | Consented pilot data only after the privacy gate |
| Production   | Public releases later                                   | Separate production project                                              | Production data                                  |

The Supabase organization is on Pro, so preview branches are available when parallel schema work justifies their separate compute cost and branch-safe setup. They provide isolated backend resources, not a frontend hosting surface. Vercel is the administration preview host and Expo/EAS is the mobile preview channel. Automatic preview branches remain deliberately off: a pull-request Vercel deployment uses shared Hosted Development and cannot rely on an unmerged migration.

The frontend location and backend target are independent. A page on localhost does not automatically use Local Supabase. The administration login exposes a localhost-only choice between Local Supabase and Hosted Development, with isolated sessions and no Production option; every protected administration route repeats the server-resolved target as `Lokal Supabase` or `Hosted Development` in its top bar. Mobile builds are fixed to the backend in their build or ignored local environment and intentionally have no runtime environment selector. Schema tests, Studio, and explicit full-local work use the Docker stack. Local seed rows never appear in Hosted Development unless a separate trusted synthetic-content bootstrap or administrator action creates them there.

The parent- and child-onboarding migrations were tested locally and deployed to Hosted Development on 2026-08-21 after explicit authorization and a successful fail-fast compatibility preflight. Vercel creates protected previews for pull requests and updates the stable administration preview from `main`.

The native Supabase GitHub integration is enabled, restricted to `nikolaiaas/just-train`, and configured with working directory `.`, `main` as its production branch, and production deploys on. Automatic preview branches remain off until their branch-safe Auth, seed, Vercel, and cost setup is reviewed. `main` is protected by current pull requests, required GitHub quality, database, and Vercel preview checks, resolved conversations, squash-only linear history, and blocked force pushes/deletion. A protected merge has verified automatic hosted deployment end to end, including aligned migrations, healthy hosted Auth and RLS checks, and the stable Vercel update.

The native integration applies `supabase/migrations` and currently redeploys the repository's configured Edge Functions after a protected merge to `main`; post-merge verification therefore checks both migration alignment and Function source/health. The local credential-bearing `seed.sql` and local `config.toml` are never pushed to Hosted Development, and environment configuration such as Auth callbacks, templates, SMTP, rate controls, and secrets remains a separate reviewed action. Deployed migrations are immutable. Schema changes use expand/contract releases so the shared preview backend remains compatible with pull-request frontends, the stable web deployment, and older installed mobile builds.

Immediately before the 2026-08-21 hosted deployment, a private logical backup of the migration-relevant database state was stored outside this repository and Git. It is a point-in-time recovery aid rather than continuous protection, and it does not copy Supabase Storage object bytes. The organization is on Pro with Spend Cap enabled; Hosted Development remains healthy on Nano compute, with PITR and automatic preview branches off. The dashboard exposes three pre-upgrade physical daily backups with Restore controls, most recently 2026-08-20 at 23:07 UTC. The automatic-backup checkpoint stays open until a scheduled backup dated after the 2026-08-21 upgrade appears, and a separate Storage-object backup and restore test remains required before a broader real-data pilot. The owner has accepted that this reliability work does not gate the private family cartoon prototype.

The Dev Console at `127.0.0.1:11009` is a development tool only. Its React 19 interface is compiled with Vite 8 and Tailwind CSS 4; a small local Node process is still required because browser code cannot start programs by itself. The process binds only to loopback, accepts same-origin requests with a per-run token, exposes only fixed Bare Træn actions, and never provides arbitrary shell access or a production-backend selector. Its standalone-iPhone action is fixed to the internal EAS `preview` profile: it validates the Expo project and build identity, reuses a build whose mobile inputs still match, or starts exactly one missing preview build. It discards raw artifact and log URLs and opens only the canonical Expo dashboard page constructed from a validated build id. It may stop a process it did not launch only after a fixed inspection proves that the process is a Bare Træn development command from this exact checkout or worktree. A coincidental port occupant remains protected.

## Security boundaries

- Row-Level Security is default-deny. A parent may access only families where their authenticated profile has an active membership.
- Child profiles do not log in directly. A parent owns the authenticated session and chooses a remembered child context; child switching and account actions are separated under `Min profil`. Child creation collects no Auth account, email, password, age, or photo.
- Inside that selected child context, Kids Mode is self-service. A child may join or leave any currently published subject, select or deselect its goals, train, and use the private profile- and subject-photo flows without a second adult approval. Publication, account creation, child switching, and other account controls remain separate administration or parent concerns.
- First-family onboarding is bound to the authenticated parent's identity in a retry-safe database operation. Child creation is a separate owner-only operation bound to the expected authenticated adult, permits only four preset avatars, and enforces at most 10 active children per family.
- Before child creation, the owner accepts a versioned guardian notice. The immutable acknowledgement is stored outside the exposed API schema with a default-deny boundary. The owner has accepted the remaining legal/privacy, withdrawal, deletion, and retention risk for the private family cartoon prototype; that work remains required before a broader pilot.
- A caller- and backend-scoped child-creation request identity is persisted before submission and reused after interruption, while the database makes repeated submissions idempotent.
- A reviewed generated portrait may be promoted through a guarded RPC to a private child-profile asset; the app stores only the asset pointer and mints short-lived signed URLs at read time. A separate private pointer holds at most one current reference photo per child and published topic. Neither pointer accepts a client-provided Storage path, and topic references never become public wardrobe assets.
- Each child/topic pair may retain one immutable base cartoon and append-only render history. The visible wardrobe look is a separate pointer derived from the base plus a server-snapshotted complete equipped set; it can never replace the base or become another render's input. Family clients receive only guarded RPC results and short-lived signed URLs, never private paths or prompts.
- Content administration is restricted by an explicit profile role and is separated from family data.
- Browser and mobile clients receive only a Supabase URL and publishable key. Elevated database keys remain in trusted server or worker environments.
- Native Auth sessions are encrypted with AES-256-GCM before their ciphertext reaches AsyncStorage, with the encryption key stored separately in the platform key store through SecureStore. Web PKCE state uses separate origin-scoped browser storage.
- OpenRouter is called only from a server route, Edge Function, or worker. `OPENROUTER_API_KEY` must never use `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` prefixes.
- Development, automated tests, previews, and task evidence contain synthetic people and media. The product contract separately permits an authenticated family member to process a photo linked to a selected child in that member's family. Broader pilot or production use still requires the unresolved legal/privacy, guardian wording, withdrawal, retention, deletion, processor, and threat-model work.

## AI operation foundation

AI features share one server-owned operation model instead of letting clients
send prompts, model names, providers, or arbitrary options. `ai_operations`
contains stable capability keys. Each active configuration is an immutable
`ai_operation_versions` row containing the prompt, provider route,
request and input/output contracts, timeout, attempt limit, and cost ceiling.
An administrator can publish a new prompt version through a guarded RPC; jobs
already created remain pinned to their original version, so prompt changes do
not require a mobile release and cannot silently alter in-flight work.

`ai_jobs` is the generic family/admin work record and leaves room for future
text and structured-output operations. Media capabilities attach named,
ordered private assets through `ai_job_media`, while provider attempts remain
in the non-exposed `private` schema. A client supplies only an operation key and
validated input. Media workers download the exact reserved private object and
expose a ready generated output only through a short-lived signed URL.
Structured-content workers send only bounded editorial context and return a
schema-validated proposal; they never write content rows or publish a version.

A new validated client request safely supersedes an older unclaimed upload
reservation for the same family member and operation, so a crash cannot lock
that capability forever while a different AI operation remains independent.
This closes the old job and both media metadata slots but deliberately does not
mutate Storage tables as a substitute for object deletion. Any bytes uploaded
before the crash remain private. `delete_after` is currently a retention
deadline in metadata, not proof that the bytes are physically deleted; an
automatic deletion worker is still required before a broader rollout.

The first operation, `portrait.cartoon_3d`, preserves the unsuccessful
Microsoft `microsoft/mai-image-2.5` Azure route as immutable version 1 history
and the first successful OpenAI route as immutable version 2 history. Its
active version 3 pins OpenAI `openai/gpt-image-2` to OpenRouter's OpenAI image
endpoint with provider fallback disabled, isolates the person on a plain white
canvas, and keeps the prompt in the database:

> Create a friendly stylized 3D cartoon version of this person. Preserve their recognizable face, hairstyle, skin tone and distinctive features. Remove the original background completely. Show only the person, isolated with clean edges against a plain solid white background. Do not add scenery, props, other people, text, borders, frames, shadows or decorative elements.

This is a private authenticated family feature. A family member submits one
gallery image for a currently selected active child, and the database verifies
both family membership and the child link before reserving private input/output
objects. There is no feature or tester toggle. Authentication, family
isolation, private Storage, a server-only key, one provider attempt, idempotent
jobs, and request/cost ceilings remain enforced.

On 2026-08-21 the exact version 2 route was verified with a synthetic 1024 by
1024 PNG: OpenRouter returned HTTP 200 and a valid PNG in about 19 seconds. The
request was OpenAI-only with fallback disabled. OpenRouter reported the request
as BYOK and billed USD 0, while reporting an upstream inference cost of USD
0.014237. The external key guardrail now enforces the USD 5 daily budget only;
its earlier provider, model, and ZDR restrictions were removed. The worker
still independently pins the exact OpenAI model/provider route.

The two AI migrations reached Hosted Development through protected PR #4 on
2026-08-21, and `process-ai-job` was then deployed separately as an active Edge
Function with JWT verification enabled. The hosted endpoint passed
unauthenticated HTTP 401 and CORS HTTP 200 smoke checks. An authenticated
Hosted Development test then completed a full synthetic upload, job,
OpenAI GPT Image 2 generation, private output read, and result render for the
selected synthetic child. The owner has accepted the under-18/provider risk for
the private family prototype. A durable queue and stale-job sweeper,
provider-success checkpoint and idempotent finalizer, physical retention
deletion, Storage-byte recovery test, and the broader legal/privacy review
remain roadmap work rather than claims of current protection. The decision
history is recorded in
[`ai-image-provider-review.md`](./ai-image-provider-review.md).

Administration uses bounded operations for topic, goal, exercise, wardrobe,
and full-draft review. Their prompts and strict JSON contracts live in
immutable database versions. Structured operations pin `openai/gpt-5-mini`
through OpenRouter to OpenAI-only routing with fallback disabled. The browser
can provide only validated editorial context and a short bounded conversation;
it cannot select a provider, model, prompt, cost limit, publication state, or
database identity. A redaktør must explicitly copy a proposal into the form
and save an unpublished draft. The review operation returns only a structured
checklist and next actions; it has no save, approval, or publication shape.

Subject creation and skill authoring are deliberately separate. Creating a
subject stores only the topic draft and returns to its detail route. From there,
`content.skill_suggestions` can propose several distinct child-facing skills
against the canonical saved topic and existing skills. A single visible “build
the whole skill” action then orchestrates three pinned jobs:
`content.skill_package` for one skill and 2–8 ordered exercises,
`content.wardrobe_grid_plan` for exactly 16 rewards informed by that topic and
generated skill, and `content.wardrobe_grid_image` for the 4×4 image sheet and
crops. These remain separate provider jobs so the structured-text token ceiling
stays bounded.

The final package is saved through one idempotent transaction bound to the
canonical topic and exact succeeded job lineage. It either creates the skill,
every exercise, and all 16 image-backed wardrobe rows, or creates nothing. All
rows remain unpublished drafts, and wardrobe rows still require an explicit
editorial decision before topic publication. Obvious parent- or
narrator-addressed wording is rejected consistently in child-visible topic,
skill, exercise, safety, wardrobe-description, and unlock fields at the Admin
form, Edge normalization, and SQL completion/save boundaries. Editor replies
and reasons are not child-visible and may continue to address the editor.

The visual wardrobe flow deliberately uses two separately versioned
operations. `content.wardrobe_grid_plan` turns the current topic title,
description, and bounded editor direction into exactly 16 ordered item
specifications. `content.wardrobe_grid_image` pins `openai/gpt-image-2` and
receives that same topic text plus all 16 visual descriptions. Its editable
database prompt asks for one square 4×4 sheet in row-major order with no text,
logos, people, or cross-cell bleed. Trusted Edge code validates the returned
PNG, crops it mechanically into cells 01 through 16, and stores the sheet and
crops under the image job id. No image prompt, provider choice, crop path, or
raw image byte is accepted from the public client.

The family wardrobe renderer uses two further immutable operations.
`portrait.child_topic_base` turns the current private child/topic reference
into a full-body subject figure and includes the published topic title and
description in trusted prompt expansion. `portrait.child_topic_wardrobe`
always receives that ready base as reference 1 and every currently equipped
catalogue image in deterministic slot order after it. Equipment selection and
render reservation are one transaction. The database records the exact base,
source, item ids, image paths, equipment fingerprint, and render sequence
before the worker can call OpenRouter; the fingerprint also incorporates each
catalogue item's content version. Stale or out-of-order jobs remain history and
cannot advance the visible pointer.

Topic-specific reward authoring is persisted separately in `wardrobe_items`.
Each row belongs to one topic and carries a nullable synthetic image path and
child-facing description, either a bounded point price or bounded unlock rule,
category, exclusive body slot, rarity, editorial note, order, and an explicit
`draft`, `approved`, or `rejected` decision. The dedicated public-read
`wardrobe-images` bucket contains synthetic shared catalogue art only; writes
remain service-role-only. It must never contain child photos or other personal
media. The standalone wardrobe assistant remains a transient 16-card proposal
until an administrator opens and saves individual cards. The complete skill
builder can instead save all 16 reviewed cards atomically as draft wardrobe
rows, but never approves or publishes them. Published-row edits, including image
and description changes, stay in the private pending revision and become
child-visible only after another approval and topic publication. Legacy rows
may have no image, but new interfaces show an explicit missing-image state
rather than presenting the old emoji as catalogue artwork.

## Connected training slice

The backend-connected implementation proves:

1. An administrator publishes one topic, goal, and ordered exercise set.
2. A parent authenticates and can see only their own family and child profiles.
3. The child joins or leaves any published subject and selects or deselects its goals without adult approval; these choices persist independently of training progress.
4. The child chooses any current exercise and records a manual result against exact route ids.
5. The result is submitted with a client request id and the database returns the original completion on retry.
6. Exercise, goal, subject, and overall progress are rebuilt from durable child choices and exercise progress after the app restarts; leaving and rejoining never deletes progress.
7. Automated RLS tests prove that another family cannot read or modify the records.

The private selected-child and subject cartoons share the trusted media worker
but stay separate from training completion data. Production camera capture,
personalized video, speech recognition, rewards, notifications, and full
offline support remain outside this slice.
