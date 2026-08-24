# Bare Træn mobile

Expo 57 application for the Bare Træn parent/child experience. Parent authentication, profile/family onboarding, owner-only child creation, and selection of active child profiles are backed by Supabase. Today's mission, the goal journey, training progress, and saved results remain clearly labelled fixture content while the next persistence slices are built.

The app is linked to the Expo/EAS project [`@bare-traen/bare-traen`](https://expo.dev/accounts/bare-traen/projects/bare-traen). `app.config.ts` gives the development, preview, and production variants distinct names, URL schemes, and application identifiers.

The native configuration declares Danish as the supported application language
on iOS and Android. The shared screen shell also supplies `da-DK`
accessibility-language metadata so Danish screen content is announced with the
correct language on supported assistive technology.

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

Expo configuration contains only the public Supabase URL and publishable key. Never add a Supabase secret/service-role key, `OPENROUTER_API_KEY`, prompt, or provider configuration; AI calls must go through trusted server code.

## Parent passwordless login

The app uses the single backend configured by the two public Expo variables; there is no production/local selector in the native app. Native builds reject loopback and other non-HTTPS backend addresses, while the Safari development preview can use the exact local Supabase endpoint when that is an intentional integration run.

A parent enters an email address and receives both a six-digit code and a magic-link choice. The first successful login may create the parent account. A magic link must return to the same browser/app installation that requested it because the PKCE verifier stays on that device; the six-digit code is the fallback when the mail is opened elsewhere. Child profiles remain parent-owned and do not get Auth accounts in this phase.

After login, the app loads only the authenticated adult's profile, first family membership, and active child profiles under Row-Level Security. A new adult can create the first family through a retry-safe authenticated database operation. The active child is remembered for that adult, family, app variant, and backend. Child switching, child creation, and logout live under `Min profil` instead of staying on the child's home screen.

The family owner creates a child profile with only a nickname and one of four preset avatars. No photo is collected during child creation, and the child receives no Auth account, email, password, or age. Later, a family member may explicitly promote a reviewed private cartoon result to the child's profile image; the preset remains the fallback. Creation requires acknowledgement of the current versioned guardian notice, records that acknowledgement in a private database table, and stops at 10 active children per family. The client persists a caller- and backend-scoped request identity before submission, so an interrupted or uncertain request can be retried without creating a duplicate child.

This acknowledgement protects child-profile creation, but it is not approval of the final legal basis or wording for a broader release. Legal/privacy review, withdrawal, deletion, and retention remain separate product work before distribution beyond the private family prototype.

The email-to-code, session restoration, first-family onboarding, empty-family, existing-child, and logout flows have been tested in local Safari with synthetic data. Child-creation database rules and interruption-retry behavior have automated local coverage. Local Mailpit and all local browser/app callbacks are ready. The tested parent- and child-onboarding migrations are deployed to Hosted Development. Custom hosted SMTP with the Danish template and CAPTCHA or server-side throttling remain separate gates.

On iOS and Android, the full Supabase session is encrypted with Expo Crypto AES-256-GCM before its ciphertext is written to AsyncStorage. The encryption key is kept separately in SecureStore and is restricted to the unlocked device. Safari uses a separate origin-scoped browser adapter so native storage modules never enter its bundle.

The Auth slice added `expo-crypto`, `expo-secure-store`, and AsyncStorage. The private AI portrait flow also adds `expo-image-picker`, `expo-image-manipulator`, and `expo-file-system`, plus a gallery permission. The app and runtime version are therefore `1.2.0`; an installed `1.1.0` or older development/preview binary must be replaced with a fresh EAS build, not updated over the air. Native OTP, cold and warm magic-link callbacks, session restoration, logout, and gallery permission remain acceptance checks for that fresh build.

## Private family AI cartoon portrait

An authenticated parent can select an active child, choose one photo from the
gallery, and create a 3D cartoon portrait with OpenAI `openai/gpt-image-2`
through the server-side OpenRouter worker. The app downsizes the long edge to
1536 pixels, uploads at most 8 MiB to a reserved private object, and displays
the generated PNG through a short-lived signed URL. Camera and microphone
permissions stay disabled. Both the input and result are linked to the selected
child. After reviewing the result, the family member can explicitly save it as
the child's profile image; the original source photo is never used as the
profile image. Short-lived signed URLs are minted when the image is read, and
the preset avatar remains the safe fallback.

The entry point has no feature toggle or tester allowlist. The current database
migration selects GPT Image 2 as active version 3 without a separate enable
state. Its database prompt and provider options remove the source background
and return a person-only PNG on a plain white canvas, while family access,
active-child ownership, private storage, server-only credentials, per-job cost
limits, and retry-safe job handling remain enforced. Automated tests and
development evidence continue to use synthetic fixtures only.

The client never receives or submits the prompt, model, provider settings, or
OpenRouter key. It sends the stable operation key `portrait.cartoon_3d`; the
server pins the current immutable database version. This lets an administrator
publish a new prompt without a mobile release while preserving the exact
configuration used by existing jobs.

The screen polls the same idempotent job and may ask the worker to reconcile a
stale lease, but it never repeats the paid image-generation POST automatically.
The active job identity is stored without image bytes or signed URLs and is
scoped to the adult, family, child, app variant, and backend, so an interrupted
generation can be resumed and reviewed after the app is opened again.

## Private topic reference photos

The app lists the real published topics for the selected child. A family member
may optionally add one private reference photo per child and topic—for example
a full football-clothes photo for Football. The flow supports review,
replacement, removal, and an explicit skip. The profile image and topic photo
use separate database pointers, and topic photos never enter the public
wardrobe catalogue. Optional photo failures do not block the topic list, and
bounded reservation limits prevent unlimited private uploads while retention
cleanup remains separate work. This slice stores the private reference safely;
applying generated wardrobe items to that photo remains later product work.

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
