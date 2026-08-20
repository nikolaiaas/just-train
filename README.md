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
- Vercel for web previews and Expo/EAS for private iPhone previews.

Supabase hosts the backend, not the visual app previews. OpenRouter is reserved for later server-side AI operations; its secret key must never be included in the mobile bundle or a `NEXT_PUBLIC_*` variable.

## Requirements

- macOS, Linux, or Windows with Git
- [mise](https://mise.jdx.dev/) or Node.js 22.13+
- pnpm 10.33.1 through Corepack
- Docker Desktop (or another Docker-compatible runtime) for local Supabase
- Xcode 26.4+ for the iOS Simulator or a local iPhone build

Full Xcode is not currently installed on this Mac; the command-line tools alone cannot run the iOS Simulator or install an iPhone build.

## Install

```bash
mise trust
mise install
mise exec -- corepack enable
mise exec -- pnpm install
```

If mise is activated in your shell, the shorter `pnpm` commands below use the pinned Node version automatically. On a shell without mise activation, prefix them with `mise exec --`, for example `mise exec -- pnpm dev`. If you do not use mise, install the Node version listed in `.nvmrc` and then run `corepack enable`.

## Local previews

Start the two fixture-backed interfaces together:

```bash
pnpm dev
```

Or start them separately:

```bash
pnpm dev:admin
pnpm dev:mobile
```

- Administration opens at [http://localhost:3000](http://localhost:3000).
- Expo prints a QR code and shortcuts for web, iOS Simulator, and Android.
- Expo Go is enough for the current UI preview. Use the development build once native capabilities are added.

Start the local backend and Supabase Studio:

```bash
pnpm supabase:start
pnpm supabase:status
pnpm supabase:reset
```

Studio is normally available at [http://localhost:54323](http://localhost:54323). Copy each app's `.env.example` to `.env.local` and use the public URL and publishable key printed by `pnpm supabase:status`. Never use the service-role key in an app.

The local Supabase stack is development-only and must not be exposed to the public internet. A physical iPhone should normally use the hosted development project rather than the Mac's local database.

The shared `bare-traen-development` project runs in Supabase's Stockholm region.
Its schema is deployed exclusively from `supabase/migrations`; the credential-bearing
local fixture seed is deliberately blocked from hosted environments. Put the hosted
project's public URL and publishable key in each app's ignored `.env.local` file.

## iPhone without an App Store release

There are three useful stages:

1. For the owner's phone, install an Expo development build directly from the Mac with `pnpm --filter @bare-traen/mobile exec expo run:ios --device`. A free Apple Account works, but the Personal Team provisioning expires after seven days.
2. For a small test group, use the `preview` profile in `apps/mobile/eas.json`. EAS internal distribution creates a private install link and avoids App Store review, but each iPhone UDID must be registered and a paid Apple Developer membership is required.
3. For a broader pilot, use TestFlight. It is still private beta distribution rather than a public App Store launch, although the first external build can require beta review.

The committed `development`, `preview`, and `production` variants use different app names and bundle identifiers so they can coexist on one phone.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

See [TASKS.md](./TASKS.md) for the phased backlog and [docs/architecture.md](./docs/architecture.md) for the environment and security decisions.
