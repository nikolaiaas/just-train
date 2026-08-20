# Bare Træn mobile

Expo 57 application for the Bare Træn parent/child experience. The current fixture-backed preview covers today's mission, the goal journey, a timestamp-based training timer, and a completion state. Supabase persistence and authentication are the next vertical slice.

The app is linked to the Expo/EAS project [`@bare-traen/bare-traen`](https://expo.dev/accounts/bare-traen/projects/bare-traen). `app.config.ts` gives the development, preview, and production variants distinct names, URL schemes, and application identifiers.

## Local development

Install from the repository root, then use the existing workspace scripts:

```bash
pnpm install
pnpm dev:web
pnpm dev:iphone
```

`pnpm dev:web` starts the administration app and this mobile app in a browser. `pnpm dev:iphone` starts Metro for an installed **Bare Træn Dev** development client.

The App Store version of Expo Go is currently incompatible with this Expo SDK 57 project. Use the Safari preview or an EAS development build; do not downgrade the SDK to make Expo Go work. Keep the Mac and iPhone on the same local network while using the development client, and keep Metro running.

Copy `.env.example` to the ignored `.env.local` for local development. On a physical iPhone, use the hosted `bare-traen-development` project's public URL and publishable key. Do not use `http://127.0.0.1:54321`, because loopback on the phone does not reach the Mac.

Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` belong in the Expo client. Never add a Supabase secret/service-role key or `OPENROUTER_API_KEY`; AI calls must go through trusted server code.

## EAS builds for an iPhone

Run EAS commands from this directory. The first command should report `@bare-traen/bare-traen`:

```bash
pnpm dlx eas-cli@latest project:info
```

The committed build profiles are:

| Profile       | Installed app     | Use                                                                |
| ------------- | ----------------- | ------------------------------------------------------------------ |
| `development` | Bare Træn Dev     | Native development client; requires Metro while the app is in use. |
| `preview`     | Bare Træn Preview | Standalone, production-like build for a small test group.          |
| `production`  | Bare Træn         | Later App Store/TestFlight release path.                           |

Register each iPhone UDID before building an internal iOS profile:

```bash
pnpm dlx eas-cli@latest device:create
pnpm dlx eas-cli@latest build --platform ios --profile development
pnpm dlx eas-cli@latest build --platform ios --profile preview
```

Run only the build profile needed. EAS returns a direct install link; the `preview` app runs without Metro. For a development build, start Metro from the repository root after installation:

```bash
pnpm dev:iphone
```

Stable ad-hoc installation requires a paid Apple Developer membership and a provisioning profile containing every test device. Registering a new phone requires a new build or re-signing an existing build. EAS builds in the cloud, so full Xcode is not required for this path.

Local `.env.local` files are ignored and are not uploaded to EAS. The linked project's `development` and `preview` EAS environments already contain the hosted Supabase URL and publishable key as sensitive build variables.

After a development or preview binary has been installed, publish compatible JavaScript and asset changes to the preview channel with:

```bash
pnpm dlx eas-cli@latest update --channel preview --environment preview --message "Describe the preview"
```

Native-library, permission, Expo SDK, and native-configuration changes require a fresh build; an over-the-air update cannot change the installed native runtime.

## Local native iOS build

To compile and install directly over USB from the Mac, run from the repository root:

```bash
pnpm --filter @bare-traen/mobile exec expo run:ios --device
```

This path requires the full Xcode application; the standalone command-line tools are not enough. Personal Team signing with a free Apple Account is useful for short-lived testing on the owner's phone, but it normally expires after seven days. Use paid Apple Developer signing and EAS internal distribution for stable installs.
