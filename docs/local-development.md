# Local development, in plain language

This is the everyday guide for running Bare Træn on this Mac, in Safari, and on an iPhone. The normal flow uses a local control page, so you do not need to remember Terminal commands.

## What runs where

Bare Træn has three parts:

- **Mobile preview**: the child/parent app shown in Safari at `http://localhost:11001`.
- **Administration**: the content interface at `http://localhost:11000`.
- **Supabase**: the database and sign-in system. Local Supabase Studio is at `http://localhost:54323`.

The **Bare Træn Dev Console** at `http://127.0.0.1:11009` starts and monitors those parts. It is a local helper rather than a deployed part of the product.

Parent sign-in, profile loading, family onboarding, and owner-only child creation now use Supabase, while training goals, exercises, progress, and results still use clearly labelled synthetic fixture content. Pure visual work in Safari does not need Docker, but a complete local sign-in, family, or child-creation test does.

## One-time setup on this Mac

Install these applications once:

1. Docker Desktop, for the local database.
2. Codex Desktop and/or Claude Desktop, for working with the project.
3. Safari is already included with macOS.

Full Xcode is optional. It is needed for Apple's iOS Simulator or a USB build made on this Mac, but it is **not** needed for the recommended EAS cloud build.

Open Terminal, paste this block, and press Return:

```bash
cd "/Users/nikolaiaas/Documents/Bare Træn"
mise install
mise exec -- corepack enable
mise exec -- pnpm install --frozen-lockfile
```

This installs the exact Node and package versions chosen for the project. It does not publish or upload the app.

The two ignored `.env.local` files are already configured on this Mac for the hosted development Supabase project. They contain environment-specific public connection values and must never be committed. On a fresh Mac or fresh clone, ask Codex or Claude to create the missing files using the first-time prompt in [desktop-agents.md](./desktop-agents.md).

## Everyday development: use the control page

In Finder, open the project folder and double-click:

**`Start Bare Træn.command`**

A Terminal window opens and then the Bare Træn Dev Console opens in the browser. Keep the Terminal window open while using it.

The menu has three pages:

- **Overview** is the welcome page. It summarizes what is running and how many tasks are in each column.
- **Services** starts and stops Supabase, administration, mobile web, and the iPhone server; opens their pages; and shows recent credential-redacted logs.
- **Tasks** keeps the active queue in **Backlog**, **To do**, **Doing**, and **Done**. Cards are always shown in priority order. Drag a card to change its priority or move it to another column; the up/down controls provide the same operation from a keyboard. **Hide Done** removes the completed column from view without deleting anything. Edit a task to add a plain-language implementation note and several proof items. Proof can be a stable HTTPS link or a small screenshot stored under `tools/dev-console/evidence/<task-id>/`.

The service page can also stop a Bare Træn preview that was started from another Terminal or agent. Before showing that stop button, the console verifies that the listening process belongs to this exact checkout or worktree. If an unrelated application—including Bare Træn from another worktree—uses the same port, the console labels it as protected and refuses to stop it.

The console is intentionally limited. It runs only on this Mac, cannot execute arbitrary commands, cannot connect to Production, and does not offer a database reset. The full project roadmap remains in `TASKS.md`; the smaller editable board is plain JSON saved in `tools/dev-console/tasks.json`.

Task edits and evidence screenshots are real repository changes and therefore appear in Git. Keep the JSON board and screenshot folder small and reviewable. Never put passwords, API keys, one-time codes, magic-link URLs, real email addresses, real child information, or other personal data in either place. Use only synthetic screenshots, crop them to the relevant result, and keep each image below 1 MiB when practical. `TASKS.md` remains the durable roadmap, and an overlapping item should be updated deliberately in both places when it is completed.

Mobile web and the iPhone development server both use port `11001`, so only one of those modes can run at a time. The console explains this instead of moving either service to an unexpected port.

To close the console, use its stop buttons first and then press **Control-C** in its Terminal window.

## Terminal alternative for the Safari preview

Open one Terminal window and run:

```bash
cd "/Users/nikolaiaas/Documents/Bare Træn"
mise exec -- pnpm dev:web
```

Keep that Terminal window open. It is the engine serving both previews.

Open these addresses in Safari:

- Mobile app: [http://localhost:11001](http://localhost:11001)
- Administration: [http://localhost:11000](http://localhost:11000)

Changes normally appear automatically after a file is saved. To stop both previews, return to Terminal and press **Control-C** once.

## When a task needs the local database

First open Docker Desktop and wait until it says the engine is running. Then run:

```bash
cd "/Users/nikolaiaas/Documents/Bare Træn"
mise exec -- pnpm supabase:start
```

Open Supabase Studio at [http://localhost:54323](http://localhost:54323). Local passwordless emails appear in Mailpit at [http://127.0.0.1:54324](http://127.0.0.1:54324). Use only a synthetic or adult test address, and never capture the inbox, a code, or a magic link as task evidence.

Useful commands are:

```bash
# Show whether local Supabase is running
mise exec -- pnpm supabase:status

# Rebuild only the local database with synthetic example data
mise exec -- pnpm supabase:reset

# Stop this project's local Supabase containers
mise exec -- pnpm supabase:stop
```

`supabase:reset` deliberately targets only the **local** database, deletes and recreates its development data, and then explicitly loads `supabase/seed.sql`. Automatic branch seeding is disabled, and the seed itself refuses to run unless it detects the known local Supabase stack. Use the reset only when a clean synthetic database is wanted. Never run a reset against a hosted project.

The local CLI may show a warning that `[inbucket]` is deprecated when it starts Mailpit. This is expected for now: the hosted GitHub deployment parser rejects the newer `[local_smtp]` name, while the current local CLI still accepts `[inbucket]` and keeps Mailpit available at port 54324.

Starting local Supabase does **not** automatically switch either app away from its configured backend. The administration login has a localhost-only **Udviklingsmiljø** choice between Local Supabase and Hosted Development. The mobile app has no runtime selector: its backend is fixed when it starts from the two public values in its ignored `.env.local`. If a task needs mobile Safari connected to Local Supabase, ask the agent to replace only those two public values temporarily and restore the hosted values before iPhone work.

With Local Supabase selected, a synthetic adult can complete first-family onboarding and then create a child profile with only a nickname and one of four non-photo preset avatars. Only the family owner may create one, the flow records a versioned guardian acknowledgement privately, and each family is limited to 10 active children. The app saves a request identity before submission so an interrupted or uncertain request can be retried without creating a duplicate child. Keep local development, automated tests, previews, and task evidence synthetic. The product's private family cartoon contract can accept a selected-child photo, but that does not turn real family data into acceptable development fixtures.

## Private family AI cartoon prototype

The first AI image flow accepts one gallery image for the authenticated
parent's currently selected active child, prepares it locally, stores input and
output in private Supabase Storage, and lets OpenAI `openai/gpt-image-2`
transform it through OpenRouter. The server request allows only provider
`openai` and disables fallback. The prompt, model, provider, limits, and
contracts come from an immutable database operation version rather than the
app, so a prompt can change without a mobile release and an existing job stays
pinned to its original version.

There is no feature or tester toggle. The database verifies the signed-in
family and selected-child link; private bucket policies, server-only provider
credentials, idempotency, one provider attempt, a timeout, and request/cost
ceilings remain. Development and verification in this repository must still
use synthetic people and media only, even though the private family product
flow permits a family member to choose a real photo of the selected child.

A limited 90-day OpenRouter development key is installed in the ignored local
Function environment and Hosted Development's Edge secrets. The key has a USD 5
total limit; its assigned guardrail now retains only a USD 5 daily budget.
Earlier Azure/model allowlists and the non-frontier ZDR requirement were
removed. The worker independently enforces `openai/gpt-image-2`, OpenAI-only,
and no fallback.

An exact live test on 2026-08-21 used a synthetic 1024 by 1024 PNG and returned
HTTP 200 with a valid PNG in about 19 seconds. OpenRouter marked the request as
BYOK and billed USD 0; its response reported USD 0.014237 in upstream inference
cost. No real family photo was used. The earlier immutable version 1 Azure/MAI
route and its two HTTP 400 tests remain part of the decision history.

The migration and Edge Function have not been deployed to Hosted Development,
so the hosted secret alone does not make this flow live. The owner has accepted
the remaining under-18/provider risk for this private family prototype. Durable
recovery, post-provider finalization, physical retention deletion, Storage-byte
recovery, and broader privacy/legal work remain open. `delete_after` is metadata
only until a deletion worker actually removes the private object. See
[`ai-image-provider-review.md`](./ai-image-provider-review.md) and
`supabase/README.md` for the decision and explicitly approved local commands.

The local Auth callback list is ready for ports 11000/11001 and the development, preview, and production app schemes. The same exact callbacks are already registered in Hosted Development, and the tested parent- and child-onboarding migrations were deployed there on 2026-08-21 after the child migration's fail-fast preflight passed. Custom hosted SMTP with the Danish template and CAPTCHA or server-side throttling remain separate gates before passwordless login is exposed publicly.

Supabase hosts the backend, not the visible previews. The administration preview belongs on Vercel, and iPhone previews belong on Expo/EAS.

## Automatic merge and preview flow

Vercel creates protected administration previews for pull requests and updates the stable preview from `main`. `main` is protected by pull requests and the required quality, database, and Vercel preview checks. The native Supabase GitHub integration is enabled for this repository with `main` production deploys on and preview branches off. A protected merge has been verified end to end to update Hosted Development automatically, retain aligned migrations, pass hosted Auth and RLS health checks, and update the stable Vercel deployment.

The shared preview flow works as follows:

1. A pull request runs the required GitHub **quality** and **database** checks. The database check starts a disposable local Supabase stack, applies every migration, and runs the permission tests without touching Hosted Development.
2. Vercel creates or refreshes a protected administration preview for the pull request. Automatic Supabase preview branches remain deliberately off on the current Pro plan, so that page uses the shared Hosted Development backend and does not receive an unmerged database migration.
3. GitHub protects `main`: the required checks must pass before the pull request can be merged. The Supabase GitHub integration is allowed to use only `nikolaiaas/just-train`, with `main` selected as its production branch.
4. After the green pull request is merged, the integration automatically applies new files from `supabase/migrations` to Hosted Development, and Vercel updates the stable administration preview at [just-train-admin.vercel.app](https://just-train-admin.vercel.app).

Once enabled, the automatic Supabase path is deliberately limited to database migrations. It must not deploy the local synthetic `supabase/seed.sql`, and it must not push local `supabase/config.toml` to the hosted project. Hosted Auth URLs, email templates, SMTP, and other operational settings are changed separately and reviewed as environment configuration.

A database change must use an **expand/contract** sequence. First add a backward-compatible table, column, function, or policy; then merge and update the web and mobile clients; only after every relevant client no longer needs the old shape may a separate reviewed migration remove it. Never edit an already-deployed migration. This keeps the stable web preview, pull-request previews, and installed iPhone builds compatible while releases overlap.

Immediately before the onboarding migrations were deployed on 2026-08-21, a private logical backup of the migration-relevant database state was written to a folder outside the repository and outside Git. It is a manual point-in-time safety copy rather than continuous backup coverage, and database backups do not copy the bytes of files uploaded to Supabase Storage.

The owning organization is now on Supabase Pro with Spend Cap enabled. Hosted Development remains healthy on Nano compute, and PITR and automatic preview branches remain off. The dashboard exposes three pre-upgrade physical daily backups with Restore controls, most recently 2026-08-20 at 23:07 UTC; the automatic-backup checkpoint stays open until the first scheduled backup dated after the 2026-08-21 upgrade appears. Before a real-data pilot, independently back up and restore-test the bytes in Supabase Storage. A migration that removes or rewrites data must not be merged until a fresh private backup and a tested recovery plan have been recorded.

## First installation on your iPhone

The project uses Expo SDK 57. The App Store version of Expo Go does not currently support this SDK, even when Expo Go is freshly installed. Keep SDK 57 and install the project's own **Bare Træn Dev** app instead.

Parent login added native storage and cryptography modules, and the private family AI cartoon prototype now adds gallery and image-processing modules. The app/runtime version is `1.2.0`. An installed `1.1.0` or older development or preview app must therefore be replaced with a fresh EAS build. Do not publish this slice as an EAS Update to an older native runtime.

Your paid Apple Developer membership lets EAS build and sign this app in the cloud. Full Xcode is not required for this route.

### 1. Confirm the Expo project

In Terminal, run:

```bash
cd "/Users/nikolaiaas/Documents/Bare Træn/apps/mobile"
mise exec -- pnpm dlx eas-cli@latest whoami
mise exec -- pnpm dlx eas-cli@latest project:info
```

The project should be `@bare-traen/bare-traen`. If a sign-in window appears, complete it yourself. Do not paste a password or two-factor code into an AI chat.

### 2. Register the iPhone

Run:

```bash
mise exec -- pnpm dlx eas-cli@latest device:create
```

EAS shows a link or QR code. Open it on the iPhone and follow the steps so Apple can add this phone to the private provisioning profile.

Each iPhone needs to be registered. Adding another phone later requires a new or re-signed build.

### 3. Create and install the development build

Run:

```bash
mise exec -- pnpm dlx eas-cli@latest build --platform ios --profile development
```

Choose EAS-managed signing when asked. You may need to complete Apple sign-in and two-factor authentication. EAS eventually shows an unlisted installation link; open that link in Safari on the registered iPhone and install **Bare Træn Dev**. Do not forward the link: Expo projects can allow anyone holding an unauthenticated build URL to open it.

The first launch may ask you to enable Developer Mode. Follow the iPhone's instructions and restart it if requested.

## Everyday iPhone development

After **Bare Træn Dev** is installed, put the Mac and iPhone on the same Wi-Fi. From the repository root, run:

```bash
cd "/Users/nikolaiaas/Documents/Bare Træn"
mise exec -- pnpm dev:iphone
```

Keep Terminal running, then open **Bare Træn Dev** on the phone. This is the fast development connection: saved JavaScript and styling changes can appear without reinstalling the app.

If the local network blocks the connection, stop the command with Control-C and try:

```bash
mise exec -- pnpm dev:iphone:tunnel
```

The phone should normally use the hosted development Supabase project. `127.0.0.1` on an iPhone means the phone itself, not this Mac. New-parent family onboarding and owner-only child creation are now available there for synthetic testing. The GPT Image 2 migration and Edge Function are not deployed there yet, so the private family cartoon flow is not currently available from that hosted backend. A deliberate later deployment may make the private family prototype available to authenticated family members; broader real-data testing still depends on the privacy, retention, and backup roadmap.

## A standalone preview for another tester

Use the `preview` build when someone should test without keeping this Mac and its development server running:

```bash
cd "/Users/nikolaiaas/Documents/Bare Træn/apps/mobile"
mise exec -- pnpm dlx eas-cli@latest device:create
mise exec -- pnpm dlx eas-cli@latest build --platform ios --profile preview
```

Register the tester's phone first, then share the unlisted EAS installation link only with that tester. Apple still restricts installation to registered devices, but the build page itself may be reachable by anyone who has its URL unless unauthenticated build access is disabled in the Expo project settings. This is ad-hoc distribution; it does not publish the app in the App Store.

JavaScript, styling, and image updates can often be sent to a compatible installed preview build through EAS Update. Native libraries, permissions, Expo SDK changes, and other native configuration require a new build. In particular, never send the `1.2.0` AI-media slice to an installed `1.1.0` or older binary.

## Accounts: individual, not shared

Each collaborator should use their own Expo account and their own Apple ID. Add those accounts to the Expo organization and Apple Developer team when access is needed. Do not share a common password, Apple two-factor code, signing login, or personal GitHub login.

The same applies to GitHub, Vercel, Supabase, and OpenRouter: invite individual accounts and grant only the access each person needs.

## Common messages

**“The module `expo` is not installed”**

The Expo command was run from the wrong directory or outside the workspace toolchain. Return to the repository root and use `mise exec -- pnpm dev:web` or `mise exec -- pnpm dev:iphone`.

**“Project is incompatible with this version of Expo Go”**

That is expected for SDK 57. Use Safari or **Bare Træn Dev**; do not reinstall Expo Go and do not downgrade the project.

**“Unsupported environment” or the wrong Node version**

The command was run without mise. Start it with `mise exec --`, as shown in every command above.

**Safari cannot open localhost**

Check that the Terminal window running `dev:web` is still open and has not stopped with an error. The first successful lines should mention ports 11000 and 11001.

**“Port 11001 is running this app in another window”**

The preview is already running in an older Terminal window. Keep using that preview, or press Control-C in the older window before starting `dev:web` again. The same rule applies if port 11000 is already occupied by the Bare Træn administration app.

**The iPhone cannot find the development server**

Confirm the phone and Mac use the same Wi-Fi, turn off a VPN temporarily, and try `dev:iphone:tunnel`. Keep the Terminal process running.

**Docker or Supabase will not start**

Open Docker Desktop and wait until it is ready, then retry `mise exec -- pnpm supabase:start`. Ask Codex or Claude to diagnose it if the error remains; do not delete Docker data or run a prune command.
