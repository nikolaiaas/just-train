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
- The hosted fixture preview is available at [just-train-admin.vercel.app](https://just-train-admin.vercel.app). Vercel protects pull-request deployments with team login, while the app also sends no-index metadata and headers.
- Expo prints shortcuts for web, iOS Simulator, and Android.
- Expo Go is enough for the current JavaScript-only preview. Use the EAS `development` build when the app begins to depend on custom native capabilities.

### Expo Go on an iPhone over LAN

Expo Go is the quickest route to a real iPhone and does not require Xcode or an Apple Developer membership:

1. Install Expo Go on the iPhone and connect the Mac and phone to the same local network.
2. Put the hosted development project's public Supabase URL and publishable key in the ignored `apps/mobile/.env.local`. Do not use the example's `127.0.0.1` URL on a physical phone: that address would point back to the phone itself.
3. Start Metro explicitly in Expo Go/LAN mode from the repository root:

   ```bash
   pnpm --filter @bare-traen/mobile exec expo start --go --lan
   ```

4. Scan the QR code with Expo Go. Keep Metro running while using the app.

The current screens still use fixtures, but the hosted `bare-traen-development` Supabase project is the intended backend for physical-device development. `.env.local` is ignored and is never uploaded to EAS.

### Local Supabase

Start the local backend and Supabase Studio:

```bash
pnpm supabase:start
pnpm supabase:status
pnpm supabase:reset
```

Studio is normally available at [http://localhost:54323](http://localhost:54323). Copy each app's `.env.example` to `.env.local` and use the public URL and publishable key printed by `pnpm supabase:status`. Never use the service-role key in an app.

The local Supabase stack is development-only and must not be exposed to the public internet. A physical iPhone should normally use the hosted development project rather than the Mac's local database.

The shared `bare-traen-development` project runs in Supabase's Stockholm region. Its schema is deployed exclusively from `supabase/migrations`; the credential-bearing local fixture seed is deliberately blocked from hosted environments. Put only the hosted project's public URL and publishable key in each app's ignored `.env.local` file.

## iPhone without an App Store release

The Expo app is linked to [`@bare-traen/bare-traen`](https://expo.dev/accounts/bare-traen/projects/bare-traen). Confirm the active login and link from `apps/mobile`:

```bash
cd apps/mobile
pnpm dlx eas-cli@latest project:info
```

The `development` and `preview` profiles in `apps/mobile/eas.json` both use EAS internal distribution:

- `development` builds **Bare Træn Dev** with `expo-dev-client`. Install it once, then run Metro with `pnpm --filter @bare-traen/mobile exec expo start --dev-client --lan` from the repository root while developing.
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

See [TASKS.md](./TASKS.md) for the phased backlog and [docs/architecture.md](./docs/architecture.md) for the environment and security decisions.
