import styles from "./page.module.css";

export default function LoadingTopicDraft() {
  return (
    <main className={styles.viewport} aria-busy="true">
      <section className={styles.loadingCard} role="status">
        <span className={styles.loadingMark} aria-hidden="true">
          ✦
        </span>
        <div>
          <strong>Åbner emnekladden…</strong>
          <p>Henter den sikre administrationssession.</p>
        </div>
      </section>
    </main>
  );
}
