import Link from "next/link";

import styles from "./page.module.css";

export default function TopicNotFound() {
  return (
    <section className={styles.routeMessage} aria-labelledby="not-found-title">
      <div className={styles.routeMessageCard}>
        <span aria-hidden="true">🔎</span>
        <h1 id="not-found-title">Emnet blev ikke fundet</h1>
        <p>
          Emnet findes ikke længere, eller din administrator har ikke adgang til
          det.
        </p>
        <div className={styles.routeMessageActions}>
          <Link href="/emner">Tilbage til emner</Link>
        </div>
      </div>
    </section>
  );
}
