import { ContentOverview, type Topic } from "./content-overview";
import styles from "./page.module.css";

const topics: Topic[] = [
  {
    id: "football",
    name: "Fodbold",
    emoji: "⚽",
    goals: 4,
    exercises: 24,
    status: "published",
    updatedAt: "I dag kl. 09.42",
    description:
      "Boldkontrol, afleveringer og afslutninger bygget op i korte, trygge forløb.",
  },
  {
    id: "gymnastics",
    name: "Gymnastik",
    emoji: "🤸",
    goals: 3,
    exercises: 18,
    status: "review",
    updatedAt: "I går kl. 15.08",
    description:
      "Balance, kolbøtter og håndstand med tydelige sikkerhedstrin til barnet.",
  },
  {
    id: "painting",
    name: "Lær at male",
    emoji: "🎨",
    goals: 1,
    exercises: 6,
    status: "draft",
    updatedAt: "18. aug. kl. 11.31",
    description:
      "Leg med farver, former og pensler i et roligt kreativt forløb.",
  },
];

const navigation = [
  { label: "Emner", icon: "grid", active: true },
  { label: "Gennemgang", icon: "check", active: false },
  { label: "Garderober", icon: "hanger", active: false },
  { label: "Indstillinger", icon: "settings", active: false },
] as const;

type NavIconName = (typeof navigation)[number]["icon"];

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    check: (
      <>
        <path d="M20 11.1V12a8 8 0 1 1-4.75-7.32" />
        <path d="m9 11 2.25 2.25L21 3.5" />
      </>
    ),
    hanger: (
      <>
        <path d="M9.2 6.3A3 3 0 1 1 13 9.2v1.3" />
        <path d="m13 10.5 8 6.5H3l8-6.5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.3V9.55h.1A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 3.7l.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1v-.1h4.05v.1a1.7 1.7 0 0 0 1.05 1.7 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4.05h-.1A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
  };

  return (
    <svg
      className={styles.navIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function AppMark() {
  return (
    <span className={styles.appMark} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="m12 2.75 2.57 5.2 5.74.84-4.15 4.04.98 5.72L12 15.84l-5.14 2.71.98-5.72-4.15-4.04 5.74-.84L12 2.75Z" />
      </svg>
    </span>
  );
}

export default function Home() {
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

          <div
            className={styles.profile}
            aria-label="Logget ind som Nikolai, indholdsansvarlig"
          >
            <span className={styles.role}>Indholdsansvarlig</span>
            <span className={styles.avatar} aria-hidden="true">
              N
            </span>
          </div>
        </header>

        <div className={styles.shellBody}>
          <aside className={styles.sidebar}>
            <p className={styles.navLabel}>Indhold</p>
            <nav className={styles.navigation} aria-label="Primær navigation">
              {navigation.map((item) =>
                item.active ? (
                  <a
                    className={`${styles.navItem} ${styles.navItemActive}`}
                    href="#emner"
                    aria-current="page"
                    key={item.label}
                  >
                    <NavIcon name={item.icon} />
                    <span>{item.label}</span>
                  </a>
                ) : (
                  <span
                    className={styles.navItem}
                    aria-disabled="true"
                    key={item.label}
                    title="Kommer i en senere fase"
                  >
                    <NavIcon name={item.icon} />
                    <span>{item.label}</span>
                    {item.label === "Gennemgang" ? (
                      <span className={styles.navCount} aria-label="2 afventer">
                        2
                      </span>
                    ) : null}
                  </span>
                ),
              )}
            </nav>

            <div className={styles.previewStatus}>
              <span className={styles.statusDot} aria-hidden="true" />
              <span>
                <strong>Lokal preview</strong>
                Fixture-data
              </span>
            </div>
          </aside>

          <ContentOverview topics={topics} />
        </div>
      </section>
    </main>
  );
}
