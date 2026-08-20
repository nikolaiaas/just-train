import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  isLocalDevelopmentHost,
  validateConfirmationUrl,
} from "./confirmation-url";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Fortsæt login · Bare Træn",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

type ContinuePageProps = {
  searchParams: Promise<{
    confirmation_url?: string | string[];
  }>;
};

export default async function ContinuePage({
  searchParams,
}: ContinuePageProps) {
  const [query, requestHeaders] = await Promise.all([searchParams, headers()]);
  const confirmationUrl = validateConfirmationUrl(query.confirmation_url, {
    configuredSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    allowLocalSupabase: isLocalDevelopmentHost(
      requestHeaders.get("host"),
      process.env.NODE_ENV,
    ),
  });

  return (
    <main className={styles.viewport}>
      <section className={styles.card} aria-labelledby="continue-title">
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            ★
          </span>
          <span>Bare Træn</span>
        </div>

        {confirmationUrl ? (
          <>
            <p className={styles.eyebrow}>Sikkert login</p>
            <h1 id="continue-title">Fortsæt dit login</h1>
            <p className={styles.description}>
              Vi har kontrolleret, at loginlinket fører til Bare Træns
              sign-in-tjeneste. Linket åbnes først, når du selv fortsætter.
            </p>
            <form action="/auth/continue/confirm" method="post">
              <input
                type="hidden"
                name="confirmation_url"
                value={confirmationUrl}
              />
              <button className={styles.button} type="submit">
                Fortsæt og log ind
              </button>
            </form>
            <p className={styles.help}>
              Knappen beskytter engangslinket mod automatiske mail-scannere.
            </p>
          </>
        ) : (
          <div role="alert">
            <p className={styles.eyebrow}>Ugyldigt loginlink</p>
            <h1 id="continue-title">Linket kan ikke bruges</h1>
            <p className={styles.description}>
              Linket er ikke et gyldigt Bare Træn-loginlink. Gå tilbage til
              login og bed om en ny mail.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
