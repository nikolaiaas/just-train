import type { ReactNode } from "react";

import type { AdminProfile } from "@/lib/auth/access";

import { logoutAdmin } from "../login/actions";
import styles from "../page.module.css";
import { AdminNavigation } from "./admin-navigation";

function AppMark() {
  return (
    <span className={styles.appMark} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="m12 2.75 2.57 5.2 5.74.84-4.15 4.04.98 5.72L12 15.84l-5.14 2.71.98-5.72-4.15-4.04 5.74-.84L12 2.75Z" />
      </svg>
    </span>
  );
}

export function AccessDenied() {
  return (
    <main className={styles.accessViewport}>
      <section className={styles.accessCard} aria-labelledby="denied-title">
        <AppMark />
        <p className={styles.accessEyebrow}>Adgang begrænset</p>
        <h1 id="denied-title">Denne konto er ikke administrator</h1>
        <p>
          Du er logget ind, men kontoen har ikke adgang til Bare Træns
          administration. Prøv en anden godkendt mailadresse.
        </p>
        <form action={logoutAdmin}>
          <button className={styles.accessButton} type="submit">
            Log ud og prøv en anden konto
          </button>
        </form>
      </section>
    </main>
  );
}

export function AdminShell({
  children,
  profile,
}: {
  children: ReactNode;
  profile: AdminProfile;
}) {
  const initial =
    profile.displayName.trim().charAt(0).toLocaleUpperCase("da-DK") || "A";

  return (
    <main className={styles.viewport}>
      <section
        className={styles.appShell}
        aria-label="Bare Træn administration"
      >
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <AppMark />
            <span>Bare Træn</span>
            <span className={styles.brandDivider} aria-hidden="true" />
            <span className={styles.brandSection}>Administration</span>
          </div>

          <details className={styles.profileMenu}>
            <summary
              className={styles.profile}
              aria-label={
                "Kontomenu for " + profile.displayName + ", indholdsansvarlig"
              }
            >
              <span className={styles.role}>Indholdsansvarlig</span>
              <span className={styles.avatar} aria-hidden="true">
                {initial}
              </span>
            </summary>
            <div className={styles.profilePopover}>
              <strong>{profile.displayName}</strong>
              <span>Administrator</span>
              <form action={logoutAdmin}>
                <button type="submit">Log ud</button>
              </form>
            </div>
          </details>
        </header>

        <div className={styles.shellBody}>
          <aside className={styles.sidebar}>
            <p className={styles.navLabel}>Indhold</p>
            <AdminNavigation />

            <div className={styles.previewStatus}>
              <span className={styles.statusDot} aria-hidden="true" />
              <span>
                <strong>Administration forbundet</strong>
                Supabase
              </span>
            </div>
          </aside>

          <div className={styles.dashboardContent}>{children}</div>
        </div>
      </section>
    </main>
  );
}
