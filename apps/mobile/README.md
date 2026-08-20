# Bare Træn mobile

Expo 57 application for the Bare Træn parent/child experience.

Run commands from the repository root:

```bash
pnpm dev:mobile
pnpm --filter @bare-traen/mobile ios
pnpm --filter @bare-traen/mobile web
```

The current preview is fixture-backed and covers today's mission, the goal journey, a timestamp-based training timer, and a completion state. Supabase persistence and authentication are the next vertical-slice task.

Copy `.env.example` to `.env.local` for local development. Only the Supabase URL and publishable key belong in the Expo environment. Never add a service-role key or `OPENROUTER_API_KEY`; AI calls must go through trusted server code.

`app.config.ts` selects separate development, preview, and production bundle identifiers through `APP_VARIANT`. `eas.json` contains the matching initial EAS build profiles, but the EAS project and Apple signing still need to be initialized with the owner's accounts.
