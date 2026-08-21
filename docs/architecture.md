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

The frontend location and backend target are independent. A page on localhost does not automatically use Local Supabase. The administration login exposes a localhost-only choice between Local Supabase and Hosted Development, with isolated sessions and no Production option. Mobile builds are fixed to the backend in their build or ignored local environment and intentionally have no runtime environment selector. Schema tests, Studio, and explicit full-local work use the Docker stack.

The parent- and child-onboarding migrations were tested locally and deployed to Hosted Development on 2026-08-21 after explicit authorization and a successful fail-fast compatibility preflight. Vercel creates protected previews for pull requests and updates the stable administration preview from `main`.

The native Supabase GitHub integration is enabled, restricted to `nikolaiaas/just-train`, and configured with working directory `.`, `main` as its production branch, and production deploys on. Automatic preview branches remain off until their branch-safe Auth, seed, Vercel, and cost setup is reviewed. `main` is protected by current pull requests, required GitHub quality, database, and Vercel preview checks, resolved conversations, squash-only linear history, and blocked force pushes/deletion. A protected merge has verified automatic hosted deployment end to end, including aligned migrations, healthy hosted Auth and RLS checks, and the stable Vercel update.

Only `supabase/migrations` will be part of automatic hosted database deployment. The local credential-bearing `seed.sql` and local `config.toml` are never pushed to Hosted Development; environment configuration such as Auth callbacks, templates, SMTP, and rate controls is reviewed separately. Deployed migrations are immutable. Schema changes use expand/contract releases so the shared preview backend remains compatible with pull-request frontends, the stable web deployment, and older installed mobile builds.

Immediately before the 2026-08-21 hosted deployment, a private logical backup of the migration-relevant database state was stored outside this repository and Git. It is a point-in-time recovery aid rather than continuous protection, and it does not copy Supabase Storage object bytes. The organization is on Pro with Spend Cap enabled; Hosted Development remains healthy on Nano compute, with PITR and automatic preview branches off. The dashboard exposes three pre-upgrade physical daily backups with Restore controls, most recently 2026-08-20 at 23:07 UTC. The automatic-backup checkpoint stays open until a scheduled backup dated after the 2026-08-21 upgrade appears, and a separate Storage-object backup and restore test remains required before a broader real-data pilot. The owner has accepted that this reliability work does not gate the private family cartoon prototype.

The Dev Console at `127.0.0.1:11009` is a development tool only. Its React 19 interface is compiled with Vite 8 and Tailwind CSS 4; a small local Node process is still required because browser code cannot start programs by itself. The process binds only to loopback, accepts same-origin requests with a per-run token, exposes only fixed Bare Træn actions, and never provides arbitrary shell access or a production-backend selector. Its standalone-iPhone action is fixed to the internal EAS `preview` profile: it validates the Expo project and build identity, reuses a build whose mobile inputs still match, or starts exactly one missing preview build. It discards raw artifact and log URLs and opens only the canonical Expo dashboard page constructed from a validated build id. It may stop a process it did not launch only after a fixed inspection proves that the process is a Bare Træn development command from this exact checkout or worktree. A coincidental port occupant remains protected.

## Security boundaries

- Row-Level Security is default-deny. A parent may access only families where their authenticated profile has an active membership.
- Child profiles do not log in directly in the initial slice. A parent owns the authenticated session and chooses a child context; the slice collects no child Auth account, email, password, age, or photo.
- First-family onboarding is bound to the authenticated parent's identity in a retry-safe database operation. Child creation is a separate owner-only operation bound to the expected authenticated adult, permits only four preset avatars, and enforces at most 10 active children per family.
- Before child creation, the owner accepts a versioned guardian notice. The immutable acknowledgement is stored outside the exposed API schema with a default-deny boundary. The owner has accepted the remaining legal/privacy, withdrawal, deletion, and retention risk for the private family cartoon prototype; that work remains required before a broader pilot.
- A caller- and backend-scoped child-creation request identity is persisted before submission and reused after interruption, while the database makes repeated submissions idempotent.
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
validated input. The Edge worker claims the pinned configuration, downloads the
exact reserved private object, calls OpenRouter server-side, and exposes only a
ready generated output through a short-lived signed URL.

A new validated client request safely supersedes an older unclaimed upload
reservation for the same family member and operation, so a crash cannot lock
that capability forever while a different AI operation remains independent.
This closes the old job and both media metadata slots but deliberately does not
mutate Storage tables as a substitute for object deletion. Any bytes uploaded
before the crash remain private. `delete_after` is currently a retention
deadline in metadata, not proof that the bytes are physically deleted; an
automatic deletion worker is still required before a broader rollout.

The first operation, `portrait.cartoon_3d`, preserves the unsuccessful
Microsoft `microsoft/mai-image-2.5` Azure route as immutable version 1 history.
Its active version 2 pins OpenAI `openai/gpt-image-2` to OpenRouter's OpenAI
image endpoint with provider fallback disabled and keeps the prompt in the
database:

> Create a friendly stylized 3D cartoon version of this person. Preserve their recognizable face, hairstyle, skin tone and distinctive features.

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

## First vertical slice

The first backend-connected implementation should prove:

1. An administrator publishes one topic, goal, and ordered exercise set.
2. A parent authenticates and can see only their own family and child profiles.
3. The child chooses the football goal and records a manual result.
4. A timestamp-based session survives backgrounding and a result can be submitted idempotently.
5. Progress remains after the app restarts.
6. Automated RLS tests prove that another family cannot read or modify the records.

The private selected-child cartoon prototype is separate from this training
slice. Production camera/avatar integration, personalized video, speech
recognition, rewards, notifications, and full offline support remain outside it.
