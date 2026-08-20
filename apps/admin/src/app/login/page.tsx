import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { parseLoginReason } from "@/lib/auth/callback";
import { getAdminAccess } from "@/lib/auth/dal";
import { getAdminRequestContext } from "@/lib/auth/request-context";

import { LoginForm } from "./login-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Log ind · Bare Træn Administration",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

const reasonMessages = {
  configuration: "Login er ikke konfigureret i dette miljø endnu.",
  "link-expired":
    "Loginlinket er udløbet eller allerede brugt. Bed om en ny mail.",
  "link-invalid": "Loginlinket kan ikke bruges. Bed om en ny mail.",
  "signed-out": "Du er nu logget ud.",
} as const;

type LoginPageProps = {
  searchParams: Promise<{ reason?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [query, context, access] = await Promise.all([
    searchParams,
    getAdminRequestContext(),
    getAdminAccess(),
  ]);

  if (access.kind === "authorized" || access.kind === "denied") {
    redirect("/");
  }

  const reason = parseLoginReason(query.reason);

  return (
    <main className={styles.viewport}>
      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            ★
          </span>
          <span>Bare Træn</span>
          <span aria-hidden="true">·</span>
          <span>Administration</span>
        </div>

        <div className={styles.intro}>
          <p className={styles.eyebrow}>Sikkert login</p>
          <h1 id="login-title">Velkommen tilbage</h1>
          <p>
            Få et loginlink og en sekscifret engangskode sendt til din mail.
          </p>
        </div>

        <LoginForm
          backend={context.resolution.backend}
          configurationAvailable={context.resolution.configured}
          localAvailable={context.resolution.localAvailable}
          reasonMessage={reason ? reasonMessages[reason] : null}
          selectorVisible={context.resolution.selectorVisible}
        />
      </section>
    </main>
  );
}
