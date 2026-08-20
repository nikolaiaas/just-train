# Bare Træn · Administration

Administrationsappen er indholdsarbejdspladsen til Bare Træn. Den beskytter
indholdet med passwordfri Supabase-login og kræver, at den verificerede profil
har administratorrollen i databasen. Indholdsbiblioteket bruger fortsat
syntetiske fixture-data.

## Kør lokalt

Projektet kræver Node.js 22 og pnpm-versionen angivet i rodprojektets
`package.json`.

Kør fra repository-roden:

```bash
pnpm install --frozen-lockfile
pnpm dev:admin
```

Åbn derefter [http://localhost:11000](http://localhost:11000).

På den lokale login-side kan **Udviklingsmiljø** foldes ud. Vælg enten Hosted
Development eller Local Supabase; Production vises aldrig her. Valget har sit
eget session-navnerum og kræver derfor et nyt login.

Til en helt lokal test:

1. Start Local Supabase fra Dev Console.
2. Vælg **Local Supabase** på login-siden.
3. Brug den syntetiske administrator `content.admin@example.test`.
4. Åbn testmailen via Dev Console eller [Mailpit](http://localhost:54324), og
   brug enten den sekscifrede kode eller det sikre link. Der findes intet
   password.

`parent.one@example.test` er en syntetisk negativ test: login lykkes, men
administrationsindholdet må ikke blive vist. Del eller gem aldrig koder,
magic-link-URL'er eller sessioner i screenshots og logs.

## Kontroller

```bash
pnpm --filter @bare-traen/admin lint
pnpm --filter @bare-traen/admin typecheck
pnpm --filter @bare-traen/admin test
pnpm --filter @bare-traen/admin build
```

`typecheck` genererer først Next.js' route-typer, så kontrollen også virker i
en ren checkout.

## Miljøvariabler

Kopiér `.env.example` til `.env.local`. Hosted Development bruger den
offentlige Supabase-URL og publishable key med `NEXT_PUBLIC_`-præfiks. De
valgfri lokale værdier er server-only, så de må ikke få præfikset.

`OPENROUTER_API_KEY` er server-only og må aldrig eksponeres som en offentlig
browservariabel. AI-handlinger er endnu ikke forbundet.

Hosted login kræver desuden en rigtig voksen administratorkonto og en
brugerdefineret SMTP-afsender. Begge dele er separate opgaver; den lokale
passwordfri test virker uden dem.
