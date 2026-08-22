"use client";

import Link from "next/link";

import styles from "./page.module.css";

export default function TopicDetailError({ reset }: { reset: () => void }) {
  return (
    <section className={styles.routeMessage} aria-labelledby="error-title">
      <div className={styles.routeMessageCard}>
        <span aria-hidden="true">↻</span>
        <h1 id="error-title">Emnet kunne ikke hentes</h1>
        <p>
          Emnedataene kunne ikke vises som forventet. Prøv igen, eller gå
          tilbage til emneoversigten.
        </p>
        <div className={styles.routeMessageActions}>
          <button type="button" onClick={reset}>
            Prøv igen
          </button>
          <Link href="/emner">Tilbage til emner</Link>
        </div>
      </div>
    </section>
  );
}
