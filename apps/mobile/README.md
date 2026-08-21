# Bare Træn mobile

Expo 57 application for the Bare Træn parent/child experience. Parent authentication, profile/family onboarding, owner-only child creation, and selection of active child profiles are backed by Supabase. Today's mission, the goal journey, training progress, and saved results remain clearly labelled fixture content while the next persistence slices are built.

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

## Parent passwordless login

The app uses the single backend configured by the two public Expo variables; there is no production/local selector in the native app. Native builds reject loopback and other non-HTTPS backend addresses, while the Safari development preview can use the exact local Supabase endpoint when that is an intentional integration run.

A parent enters an email address and receives both a six-digit code and a magic-link choice. The first successful login may create the parent account. A magic link must return to the same browser/app installation that requested it because the PKCE verifier stays on that device; the six-digit code is the fallback when the mail is opened elsewhere. Child profiles remain parent-owned and do not get Auth accounts in this phase.

After login, the app loads only the authenticated adult's profile, first family membership, and active child profiles under Row-Level Security. A new adult can create the first family through a retry-safe authenticated database operation. Existing children can be selected, while a family without children gets an honest empty state.

The family owner can create a child profile with only a nickname and one of four preset avatars. The child receives no Auth account, email, password, age, or photo. Creation requires acknowledgement of the current versioned guardian notice, records that acknowledgement in a private database table, and stops at 10 active children per family. The client persists a caller- and backend-scoped request identity before submission, so an interrupted or uncertain request can be retried without creating a duplicate child.

This acknowledgement is an implementation safeguard for the synthetic pilot flow, not approval of the final legal basis or wording. Legal/privacy review, withdrawal, deletion, retention, and any real-child or child-photo pilot remain separate release gates.

The email-to-code, session restoration, first-family onboarding, empty-family, existing-child, and logout flows have been tested in local Safari with synthetic data. Child-creation database rules and interruption-retry behavior have automated local coverage. Local Mailpit and all local browser/app callbacks are ready. Hosted Development already has the exact callbacks, but neither the parent-onboarding nor child-onboarding migration has been deployed there; both require explicit authorization, and the child migration's fail-fast preflight must pass before deployment. Custom hosted SMTP with the Danish template and CAPTCHA or server-side throttling remain separate gates.

On iOS and Android, the full Supabase session is encrypted with Expo Crypto AES-256-GCM before its ciphertext is written to AsyncStorage. The encryption key is kept separately in SecureStore and is restricted to the unlocked device. Safari uses a separate origin-scoped browser adapter so native storage modules never enter its bundle.

This slice adds `expo-crypto`, `expo-secure-store`, and AsyncStorage plus the SecureStore config plugin. It therefore requires a fresh EAS development/preview binary; it cannot be delivered to an older binary as a JavaScript-only update. The app and runtime version were advanced to `1.1.0` so an update containing these imports cannot target the previous `1.0.0` native runtime. Native OTP, cold and warm magic-link callbacks, session restoration, and logout remain acceptance checks for that fresh build.

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
