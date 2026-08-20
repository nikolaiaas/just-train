# Bare Træn · Administration

Administrationsappen er indholdsarbejdspladsen til Bare Træn. Den første
version viser emner, træningsmål, øvelser og godkendelsesstatus med lokale
fixture-data.

## Kør lokalt

Projektet kræver Node.js 22 og pnpm-versionen angivet i rodprojektets
`package.json`.

Kør fra repository-roden:

```bash
pnpm install
pnpm dev:admin
```

Åbn derefter [http://localhost:3000](http://localhost:3000).

## Kontroller

```bash
pnpm --filter @bare-traen/admin lint
pnpm --filter @bare-traen/admin typecheck
pnpm --filter @bare-traen/admin build
```

`typecheck` genererer først Next.js' route-typer, så kontrollen også virker i
en ren checkout.

## Miljøvariabler

Kopiér `.env.example` til `.env.local`, når Supabase-integrationen tilsluttes.
Kun Supabase-projektets offentlige URL og publishable key må have
`NEXT_PUBLIC_`-præfiks.

`OPENROUTER_API_KEY` er server-only og må aldrig eksponeres som en offentlig
browservariabel. AI- og databasehandlinger er endnu ikke forbundet; den
nuværende skærm er en interaktiv forhåndsvisning.
