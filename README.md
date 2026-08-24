# Bare Træn

Bare Træn is a Danish training app for children and their parents, with a separate content administration interface. This repository is the first working foundation built from the included HTML concept boards.

The first connected vertical slice is intentionally small:

`parent signs in → chooses a child → opens a published admin subject → completes an exercise → sees saved progress`

The mobile training path now reads published subjects, goals, and exercises from Supabase and stores the selected child's progress there. Development, previews, tests, and repository evidence must still use synthetic people and media only.

## Technology

- Expo 57, React Native, Expo Router, and TypeScript for iPhone and Android.
- Next.js 16 App Router, React, CSS Modules, and TypeScript for administration.
- Supabase PostgreSQL, Auth, Storage, and Row-Level Security for the backend.
- pnpm workspaces for shared domain code and design tokens.
- React 19, Vite 8, Tailwind CSS 4, and a loopback-only Node controller for the local Dev Console.
- Vercel for web previews and Expo/EAS for private iPhone previews.

Supabase hosts the backend, not the visual app previews. The first private family
image operation now uses OpenAI `openai/gpt-image-2` through OpenRouter, pinned
to OpenAI with provider fallback disabled. An authenticated family member can submit a
photo for the currently selected child; the prompt and provider configuration
are versioned in the database. The OpenRouter secret remains server-only and
must never be included in the mobile bundle or a `NEXT_PUBLIC_*` variable.
After review, the generated result can be saved as that child's private profile
image. A separate family-private child-and-topic photo can capture, for example,
football clothing for later wardrobe personalization without reusing the
profile image or entering the public wardrobe catalogue.
That topic photo can produce a private, immutable base cartoon for the child
and subject. Every wardrobe change creates a separate derived look from that
same base plus the complete set of currently equipped catalogue images. A
derived look never becomes the next generation's input, so taking an item off
does not progressively alter the child's original subject figure.
The administration uses the same server boundary for synthetic wardrobe art:
topic text is turned into exactly 16 descriptions, GPT Image 2 draws one 4×4
sheet, and trusted code crops it into 16 catalogue images. Those prompts also
remain database-versioned, so an administrator can improve them without an app
release.

## Requirements

- macOS, Linux, or Windows with Git
- [mise](https://mise.jdx.dev/) or Node.js 22.13+
- pnpm 10.33.1 through Corepack
- Docker Desktop (or another Docker-compatible runtime) for local Supabase
- Optional: Xcode 26.4+ for the iOS Simulator or a local USB iPhone build

Full Xcode is not currently installed on this Mac. That blocks the simulator and local USB builds, but it does not block the recommended EAS cloud build for a registered iPhone.

## Install

```bash
mise install
mise exec -- corepack enable
mise exec -- pnpm install --frozen-lockfile
```

If mise is activated in your shell, the shorter `pnpm` commands below use the pinned Node version automatically. On a shell without mise activation, prefix them with `mise exec --`, for example `mise exec -- pnpm dev`. If you do not use mise, install the Node version listed in `.nvmrc` and then run `corepack enable`.

## Local previews

The easiest everyday option on this Mac is the local development console:

1. Double-click **`Start Bare Træn.command`** in Finder.
2. Keep the Terminal window that appears open.
3. Use the page at [http://127.0.0.1:11009](http://127.0.0.1:11009). **Overview** summarizes services and task counts and can prepare the standalone iPhone preview, **Services** starts and stops local previews and shows their logs, and **Tasks** maintains the priority-ordered active queue by drag and drop. Each task can also record a plain-language implementation note and multiple safe screenshot or HTTPS-link proofs.

The console listens only on this Mac and exposes a fixed set of Bare Træn actions. Its iPhone button reuses the latest successful EAS `preview` build when the mobile build inputs still match; otherwise it can start one new internal-distribution build and shows its progress without starting Metro. It can stop a local preview that was started in another Terminal only after verifying that the process belongs to this checkout; it refuses to stop an unknown program that merely occupies the same port. It has no arbitrary command box, no production backend option, and no database-reset button. Its React interface is built with Vite and Tailwind, and its task board is stored in `tools/dev-console/tasks.json`; small task screenshots live under `tools/dev-console/evidence`. Both are tracked, so they must never contain credentials, sign-in codes or links, real child data, or other personal information. `TASKS.md` remains the complete project roadmap.

Codex in the ChatGPT desktop app also gets a tracked **Start administration** project action. It runs `mise exec -- pnpm preview:admin`, uses the Dev Console's verified-process rules, and keeps the administration available at [http://localhost:11000](http://localhost:11000). A responsive preview from this checkout is reused; a verified but unresponsive preview is restarted; an unknown port owner is left untouched.

For AI features against Local Supabase, Codex also gets a tracked **Start local AI** action. Start Local Supabase in the Dev Console first, then keep the AI action running while testing. It serves both the family image worker and the administration assistant from the ignored local Function environment; Hosted Development does not need this local process.

For a terminal-based start, use the commands below.

Start the administration app and mobile Safari preview together:

```bash
pnpm dev:web
```

Or start the general Metro development server and administration separately:

```bash
pnpm dev:admin
pnpm dev:mobile
```

- Administration opens at [http://localhost:11000](http://localhost:11000).
- The mobile Safari preview normally opens at [http://localhost:11001](http://localhost:11001).
- The development console opens at [http://127.0.0.1:11009](http://127.0.0.1:11009).
- The hosted fixture preview is available at [just-train-admin.vercel.app](https://just-train-admin.vercel.app). Vercel protects pull-request deployments with team login, while the app also sends no-index metadata and headers.

The App Store version of Expo Go is currently incompatible with this Expo SDK 57 project. Use the Safari preview first, then install **Bare Træn Dev** through the EAS `development` profile for real-device work. Do not downgrade the project to make Expo Go work.

The private family cartoon prototype adds native gallery and image-processing
modules and advances the app/runtime version to `1.2.0`. Any installed `1.1.0`
or older development/preview app must be replaced with a fresh EAS build before
this branch can run natively; do not send the slice as an EAS Update to an older
runtime. There is no feature or tester toggle: access is bounded by the signed-in
family, selected child, private Storage, server-only provider call, one attempt,
and spending limits. Repository development, automated tests, previews, and
task evidence must still use synthetic people and media only.

### Local Supabase

Start the local backend and Supabase Studio:

```bash
pnpm supabase:start
pnpm supabase:status
pnpm supabase:reset
pnpm dev:ai
```

Studio is normally available at [http://localhost:54323](http://localhost:54323). `dev:ai` is a separate attached process, so keep that Terminal or Codex action running while using either local AI feature. Starting local Supabase does not silently redirect either app. The administration login on localhost has a hidden **Udviklingsmiljø** selector for Local Supabase or Hosted Development, with separate sessions and no Production option. The mobile app still uses the backend configured in its ignored `.env.local`; a physical iPhone should normally stay on Hosted Development. Never use the service-role key in an app.

The local Supabase stack is development-only and must not be exposed to the public internet. A physical iPhone should normally use the hosted development project rather than the Mac's local database.

The shared `bare-traen-development` project runs in Supabase's Stockholm region. Its current parent- and child-onboarding schema is deployed. The owning organization is on Supabase Pro with Spend Cap enabled; the project remains healthy on Nano compute, with PITR and automatic preview branches off. Vercel creates protected pull-request previews and updates the stable administration preview from `main`; both deliberately use the shared Hosted Development backend for now.

The native Supabase GitHub integration is enabled and restricted to `nikolaiaas/just-train`, with working directory `.`, `main` as its production branch, production deploys enabled, and automatic preview branches off until their branch-safe Auth, seed, Vercel, and cost setup is reviewed. `main` is protected: every change must arrive through a current pull request with successful `quality`, `database`, and Vercel preview checks, resolved conversations, squash merge, and linear history. A protected merge has been verified end to end to update Hosted Development automatically while keeping migrations aligned, Auth and RLS healthy, and the stable Vercel deployment current.

When enabled, only migration files will take this automatic route. Never deploy `supabase/seed.sql` or push local `supabase/config.toml` settings to Hosted Development. Hosted Auth and other operational configuration are reviewed separately. Use backward-compatible expand/contract migrations: add the new shape first, update all clients, and remove an old shape only in a later reviewed migration. This is especially important because an installed iPhone build can outlive a web deployment.

Immediately before the 2026-08-21 onboarding deployment, a private logical database backup was saved outside this repository and outside Git. It is a point-in-time recovery aid, not an automatic backup service and not a copy of uploaded Storage object bytes. After the Pro upgrade, the dashboard exposes three physical daily backups with Restore controls, most recently 2026-08-20 at 23:07 UTC. All three predate the upgrade, so the automatic-backup checkpoint remains open until a scheduled backup dated after 2026-08-21 appears. Database backups do not include uploaded Storage object bytes; a separate Storage-byte backup and restore test remains a required reliability step before a broader real-data pilot, although it is not used as a feature gate for the private family prototype. Put only the hosted project's public URL and publishable key in each app's ignored `.env.local` file.

## iPhone without an App Store release

The Expo app is linked to [`@bare-traen/bare-traen`](https://expo.dev/accounts/bare-traen/projects/bare-traen). Confirm the active login and link from `apps/mobile`:

```bash
cd apps/mobile
pnpm dlx eas-cli@latest project:info
```

The `development` and `preview` profiles in `apps/mobile/eas.json` both use EAS internal distribution:

- `development` builds **Bare Træn Dev** with `expo-dev-client`. Install it once, then run Metro on Bare Træn's reserved port with `pnpm dev:iphone` from the repository root while developing.
- `preview` builds **Bare Træn Preview** as a production-like, standalone app. It opens without Metro and is the better build to send to a small test group.

For either EAS profile, register every iPhone before creating the build, then build from `apps/mobile`:

```bash
pnpm dlx eas-cli@latest device:create
pnpm dlx eas-cli@latest build --platform ios --profile development
pnpm dlx eas-cli@latest build --platform ios --profile preview
```

Only run the profile you need. EAS provides an install link when the build finishes. Stable iOS ad-hoc distribution requires a paid Apple Developer membership, and the provisioning profile must contain each test device's UDID. A newly registered device requires a new build or a re-signed build before it can install the app. Cloud EAS builds do not require Xcode on this Mac.

Ignored `.env.local` files are not available to EAS cloud builders. The linked Expo project's `development` and `preview` environments already contain the hosted Supabase URL and publishable key as sensitive build variables. These are still public client values once bundled; never add a service-role key or `OPENROUTER_API_KEY` to an Expo environment that is bundled into the app.

Compatible JavaScript, styling, and asset changes can be sent to an installed preview build through its configured EAS Update channel:

```bash
pnpm dlx eas-cli@latest update --channel preview --environment preview --message "Describe the preview"
```

Adding or changing native libraries, permissions, Expo SDK versions, or native configuration still requires a fresh iOS build.

For a local USB-installed build instead, run this from the repository root:

```bash
pnpm --filter @bare-traen/mobile exec expo run:ios --device
```

That local path still requires the full Xcode application; Apple's command-line tools alone are insufficient. A free Apple Account can use Personal Team signing for short-lived owner-device testing, but provisioning normally expires after seven days. Use the paid membership and EAS internal distribution for a stable pilot. TestFlight remains the later option for a broader private beta.

The committed `development`, `preview`, and `production` variants use different app names and bundle identifiers so they can coexist on one phone.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

For an approachable walkthrough, see [local development](./docs/local-development.md) and [desktop-agent prompts](./docs/desktop-agents.md). See [TASKS.md](./TASKS.md) for the phased backlog and [docs/architecture.md](./docs/architecture.md) for the environment and security decisions.
