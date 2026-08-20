# Bare Træn

Bare Træn is a Danish training app for children and their parents, with a separate content administration interface. This repository is the first working foundation built from the included HTML concept boards.

The initial vertical slice is intentionally small:

`parent signs in → chooses a child → opens a goal → completes an exercise → sees saved progress`

The app currently uses synthetic fixture data while the Supabase schema and privacy rules are established. Do not add real child data, photos, audio, or video to development environments.

## Technology

- Expo 57, React Native, Expo Router, and TypeScript for iPhone and Android.
- Next.js 16 App Router, React, CSS Modules, and TypeScript for administration.
- Supabase PostgreSQL, Auth, Storage, and Row-Level Security for the backend.
- pnpm workspaces for shared domain code and design tokens.
- React 19, Vite 8, Tailwind CSS 4, and a loopback-only Node controller for the local Dev Console.
- Vercel for web previews and Expo/EAS for private iPhone previews.

Supabase hosts the backend, not the visual app previews. OpenRouter is reserved for later server-side AI operations; its secret key must never be included in the mobile bundle or a `NEXT_PUBLIC_*` variable.

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
3. Use the page at [http://127.0.0.1:11009](http://127.0.0.1:11009). **Overview** summarizes services and task counts, **Services** starts and stops previews and shows their logs, and **Tasks** maintains the priority-ordered active queue by drag and drop.

The console listens only on this Mac and exposes a fixed set of Bare Træn actions. It can stop a preview that was started in another Terminal only after verifying that the process belongs to this checkout; it refuses to stop an unknown program that merely occupies the same port. It has no arbitrary command box, no production backend option, and no database-reset button. Its React interface is built with Vite and Tailwind, and its task board is stored in `tools/dev-console/tasks.json`; `TASKS.md` remains the complete project roadmap.

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

### Local Supabase

Start the local backend and Supabase Studio:

```bash
pnpm supabase:start
pnpm supabase:status
pnpm supabase:reset
```

Studio is normally available at [http://localhost:54323](http://localhost:54323). Starting local Supabase does not silently redirect either app: this Mac's ignored `.env.local` files normally point to the hosted development project so Safari and iPhone use the same disposable backend. When a task explicitly needs an app connected to the local stack, temporarily use only the local public URL and publishable key reported by `pnpm supabase:status`, then restore the hosted public values before real-device work. Never use the service-role key in an app.

The local Supabase stack is development-only and must not be exposed to the public internet. A physical iPhone should normally use the hosted development project rather than the Mac's local database.

The shared `bare-traen-development` project runs in Supabase's Stockholm region. Its schema is deployed exclusively from `supabase/migrations`; the credential-bearing local fixture seed is deliberately blocked from hosted environments. Put only the hosted project's public URL and publishable key in each app's ignored `.env.local` file.

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
