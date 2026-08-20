# Starting Bare Træn with Codex or Claude Desktop

Both desktop agents can run the project for you. The important choice is to give the agent access to the **local project folder**, because local Docker, Safari, and an iPhone on the same network cannot be controlled from an isolated cloud checkout.

The repository now contains two permanent instruction files:

- Codex reads `AGENTS.md` automatically.
- Claude reads `CLAUDE.md`, which imports the same `AGENTS.md` instructions.

That means the prompts below can stay plain and short while both agents receive the same safety, tooling, and preview rules.

## Codex Desktop

1. Open Codex in the desktop app.
2. Open the local folder `/Users/nikolaiaas/Documents/Bare Træn`.
3. Start a local chat in that project. For the everyday preview, use the normal local checkout rather than a separate worktree.
4. Paste one of the prompts below.
5. Codex can keep the development command open in its integrated terminal. Open the reported URLs in Safari.

Optional convenience: in the project's local-environment settings, add actions with these names and commands:

| Action               | Command                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| Start Safari preview | `mise exec -- pnpm dev:web`                                                       |
| Start iPhone server  | `mise exec -- pnpm dev:iphone`                                                    |
| Run project checks   | `mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm test` |

Actions become reusable buttons in Codex's desktop interface. The agent can also run the same commands directly.

## Claude Desktop

1. Open Claude Desktop and choose the **Code** tab. A normal Chat conversation does not have the local coding terminal.
2. Start a new session with environment **Local**.
3. Select `/Users/nikolaiaas/Documents/Bare Træn` as the project folder.
4. Choose **Manual** while learning the flow, or **Accept edits** when you are comfortable reviewing changes.
5. Paste one of the prompts below.

Claude's project context should show `CLAUDE.md`; `/context` confirms that it loaded. The committed `.claude/launch.json` also gives Claude two preview-server choices, **admin** and **mobile-web**, in its server menu.

Claude creates an isolated Git worktree for each Code session. The repository's `.worktreeinclude` copies the two ignored public Supabase client environment files into that worktree, but it does not copy dependencies. If `node_modules` is missing, Claude should run the frozen pnpm install; this reuses pnpm's local cache and does not change package versions.

Only one Bare Træn checkout should serve previews at a time because ports 11000 and 11001 are fixed. A Claude session must preview the same worktree it is editing. If an earlier session owns those ports, stop its servers from that session before verifying new changes; do not reuse a server running code from another checkout.

If the Code tab is missing, update Claude Desktop and confirm that the signed-in account has a paid Claude plan or organization access that includes Claude Code. The regular Chat and Cowork tabs are different products and should not be used to run this local repository.

## Prompt: first-time setup and Safari preview

Copy everything inside this box:

```text
Prepare and start Bare Træn for local Safari development on this Mac.

Work only inside "/Users/nikolaiaas/Documents/Bare Træn". Read AGENTS.md, README.md, and docs/local-development.md first. Run git status and preserve every existing change.

Check the pinned mise, Node, pnpm, and workspace dependencies. Install only what is missing, using the documented mise and pnpm commands with the frozen lockfile. Do not use npm or yarn, change Expo SDK 57, or upgrade or downgrade dependencies.

Check whether the ignored apps/admin/.env.local and apps/mobile/.env.local files exist without printing their contents. Do not overwrite existing files. If this is a fresh clone and either is missing, the fixture screens can still start; report that hosted development Supabase values must be supplied before connected-backend or iPhone Metro work. Only create local public values when I explicitly ask to test against local Supabase, label that choice clearly, and explain that hosted values must be restored before iPhone development. Never print, invent, expose, or commit a service-role key, database password, OPENROUTER_API_KEY, password, or two-factor code.

Start the normal Safari previews with:

mise exec -- pnpm dev:web

Wait until both servers answer, leave the process running, and report the actual mobile and administration URLs clearly. Start local Supabase only if it is needed for the current screens; if you start it, also report the Studio URL. Do not change application source code merely to start the existing project, and do not create a commit for startup-only work.
```

## Prompt: everyday Safari startup

```text
Start the existing Bare Træn Safari development previews.

Read the repository instructions, check git status, and preserve all current work. If node_modules is missing in this checkout or Claude worktree, run `mise exec -- pnpm install --frozen-lockfile`; do not change the lockfile or dependency versions. Do not reset any database.

Before starting, check ports 11000 and 11001. If another Bare Træn session or checkout owns them, do not kill it or reuse it to verify this checkout; tell me which older session I need to stop. Do not fall back to 8081, 3000, or the occupied 9000 range.

When the reserved ports are free, run `mise exec -- pnpm dev:web` in a long-running local terminal. Wait until both services answer, leave them running, and give me clickable mobile and administration URLs. If startup fails, diagnose only what is needed and do not delete caches, Docker data, environment files, or user changes.
```

## Prompt: first iPhone development build

```text
Help me install the existing Bare Træn development build on my iPhone through EAS internal distribution. I have a paid Apple Developer membership. This is not an App Store or TestFlight submission.

Work only inside "/Users/nikolaiaas/Documents/Bare Træn". Read AGENTS.md, README.md, apps/mobile/README.md, and docs/local-development.md. Check git status and preserve all current work.

Keep Expo SDK 57 and the current dependencies, bundle identifiers, variants, eas.json, and native configuration unchanged. Do not use Expo Go or downgrade the project. Never ask me to paste an Apple, Expo, GitHub, Supabase, or other password or two-factor code into chat. Pause so I can complete interactive sign-in, two-factor authentication, agreements, or certificate decisions myself. Do not expose secrets and do not submit anything to an app store.

From apps/mobile, verify the current Expo login and that project:info resolves to @bare-traen/bare-traen. Then run device:create, show me its registration link or QR code, and wait for me to confirm that this phone is registered.

After registration, create only the iOS development build with the existing development profile and EAS-managed signing. Pause before replacing any existing signing certificate. When the build is complete, give me the unlisted build page and explain how to install Bare Træn Dev from Safari on the registered phone. Remind me not to forward the URL because Expo can allow anyone holding an unauthenticated build link to open it.

After I confirm installation, verify silently that apps/mobile/.env.local contains the hosted development Supabase URL, not 127.0.0.1. If it contains local values or is missing, stop and help me restore the two public hosted values; do not start Metro with a local phone backend. Then return to the repository root and start `mise exec -- pnpm dev:iphone`. Leave Metro running and report how the phone should connect. If it cannot connect over LAN, diagnose the network and offer the existing dev:iphone:tunnel command before changing project files.
```

## Prompt: safe shutdown

```text
Stop the Bare Træn local development environment safely.

Stop only the admin and Expo/Metro processes started for this repository by sending Control-C to their own terminal sessions. Do not use killall and do not stop unrelated Node processes. If this session started local Supabase, run `mise exec -- pnpm supabase:stop`; otherwise leave it alone.

Do not reset a database, delete Docker volumes, prune Docker, remove caches, delete files, or alter git changes. Tell me exactly what was stopped and what remains running.
```

## Prompts for normal feature work

Once the preview is running, describe outcomes in ordinary language. For example:

```text
On the child's goal screen, make the next exercise easier to understand. Keep the current visual style, test it in the mobile Safari preview, show me what changed, then run the relevant checks. Commit and push the finished change after the checks pass.
```

You do not need to prescribe files or frameworks. The repository instructions tell both agents which tools and safety boundaries to use.
