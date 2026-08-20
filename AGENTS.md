# Bare Træn agent guide

## Read first

- Read `README.md` and `docs/local-development.md` before changing or starting the project.
- Read `TASKS.md` for the current phase and `docs/architecture.md` for system boundaries.
- Preserve all existing user changes. Never reset, revert, stash, delete, or overwrite unrelated work.

## Toolchain and previews

- This is a pnpm workspace pinned to Node 22.23.2. On this Mac, run commands through `mise exec --`, for example `mise exec -- pnpm typecheck`.
- Use pnpm only. Do not switch to npm or yarn, and do not upgrade or downgrade dependencies unless the task explicitly requires it.
- The mobile app uses Expo SDK 57. The App Store build of Expo Go is incompatible with this project; do not downgrade the app to make Expo Go work.
- Prefer `mise exec -- pnpm dev:console` when the user wants the clickable local control page. It runs at `http://127.0.0.1:11009`; the root `Start Bare Træn.command` file is the Finder launcher.
- Use `mise exec -- pnpm dev:web` for the admin app and mobile Safari preview.
- Use `mise exec -- pnpm dev:iphone` after **Bare Træn Dev** has been installed through an EAS development build.
- Use `mise exec -- pnpm supabase:start` only when a task needs the local backend. Supabase Studio is at `http://localhost:54323`.
- Bare Træn reserves its own local range: admin `http://localhost:11000`, mobile web/Metro `http://localhost:11001`, and the built Dev Console `http://127.0.0.1:11009`. Port `11010` is reserved only for the Dev Console's Vite hot-reload server while editing that tool. Do not move these services back to ports 3000, 8081, or the occupied 9000 range.
- Full Xcode is optional for the EAS cloud-build route. It is required only for the simulator or a local USB build.

## Safety and data

- Use synthetic child and family data only. Never put real child photos, audio, video, or personal data in development or previews.
- Never print, invent, or commit credentials. `.env.local` files are ignored and must stay ignored.
- Claude Desktop copies the two current public-client `.env.local` files into its isolated worktrees through `.worktreeinclude`. If either file ever gains a secret, remove that path from `.worktreeinclude` and use Claude's encrypted local environment instead.
- Client apps may contain only the public Supabase URL and publishable key. Never expose a service-role key, database password, or `OPENROUTER_API_KEY`.
- OpenRouter calls must later run through trusted server code, never directly from the Expo bundle or public browser code.
- Do not reset a local database unless the task requires a clean synthetic database. Never reset a linked hosted database.
- Do not deploy migrations, create accounts, rotate credentials, replace Apple signing certificates, or submit to an app store without explicit authorization.
- Interactive sign-in, password, two-factor, Apple agreement, and payment steps belong to the user. Never ask the user to paste passwords or two-factor codes into chat.

## Quality and delivery

- Run checks proportional to the change. The complete suite is `mise exec -- pnpm typecheck`, `lint`, `test`, `build`, and `format:check`.
- When implementing requested work, make small coherent commits and push them after checks pass, unless the user says otherwise.
- Starting or stopping a preview alone should not create a commit.
- `TASKS.md` is the complete roadmap. `tools/dev-console/tasks.json` is the small tracked, user-editable active queue with the exact statuses `backlog`, `todo`, `doing`, and `done` plus a priority order within each status; preserve user changes, never put secrets or real personal/child data in it, and keep overlapping statuses honest when feature work is completed.
- For long-running servers, report the actual URLs and leave the requested processes running. Stop only processes confirmed to belong to this repository.
- A preview used to verify changes must run from the same checkout or worktree as those changes. With the fixed 11000/11001 ports, stop the prior Bare Træn preview before starting one from another worktree; never verify against stale code from a different session.
