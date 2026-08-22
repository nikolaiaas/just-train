import { redirect } from "next/navigation";

import {
  loadAdminTopicLibrary,
  type AdminTopicLibraryItem,
} from "@bare-traen/api-client";

import type { AdminProfile } from "@/lib/auth/access";
import { getAdminAccessSession } from "@/lib/auth/dal";

import { getAiPromptCatalog, type AiPromptCatalog } from "./ai-prompts/data";
import { AiPromptWorkspace } from "./ai-prompts/prompt-workspace";
import { ContentOverview, type Topic } from "./content-overview";
import { logoutAdmin } from "./login/actions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const navigation = [
  { label: "Emner", icon: "grid", active: true, href: "#emner" },
  {
    label: "AI-prompter",
    icon: "sparkle",
    active: false,
    href: "#ai-prompts",
  },
  { label: "Gennemgang", icon: "check", active: false, href: null },
  { label: "Garderober", icon: "hanger", active: false, href: null },
  { label: "Indstillinger", icon: "settings", active: false, href: null },
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
    sparkle: (
      <path d="m12 3 1.05 3.3A5.8 5.8 0 0 0 16.7 10L20 11l-3.3 1.05A5.8 5.8 0 0 0 13 15.7L12 19l-1.05-3.3A5.8 5.8 0 0 0 7.3 12L4 11l3.3-1.05A5.8 5.8 0 0 0 11 6.3L12 3Z" />
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

function AccessDenied() {
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

function AdminDashboard({
  profile,
  promptCatalog,
  topics,
  topicLibraryUnavailable,
}: {
  profile: AdminProfile;
  promptCatalog: AiPromptCatalog;
  topics: Topic[];
  topicLibraryUnavailable: boolean;
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
            <nav className={styles.navigation} aria-label="Primær navigation">
              {navigation.map((item) =>
                item.href ? (
                  <a
                    className={`${styles.navItem} ${item.active ? styles.navItemActive : styles.navItemAvailable}`}
                    href={item.href}
                    aria-current={item.active ? "page" : undefined}
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
                  </span>
                ),
              )}
            </nav>

            <div className={styles.previewStatus}>
              <span className={styles.statusDot} aria-hidden="true" />
              <span>
                <strong>Forbundet indhold</strong>
                {topicLibraryUnavailable
                  ? "Midlertidigt utilgængeligt"
                  : "Supabase"}
              </span>
            </div>
          </aside>

          <div className={styles.dashboardContent}>
            <ContentOverview
              topics={topics}
              unavailable={topicLibraryUnavailable}
            />
            <AiPromptWorkspace catalog={promptCatalog} />
          </div>
        </div>
      </section>
    </main>
  );
}

function formatTopicUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Copenhagen",
  }).format(new Date(value));
}

function toOverviewTopic(topic: AdminTopicLibraryItem): Topic {
  return {
    id: topic.id,
    name: topic.title,
    emoji: topic.icon || "✨",
    goals: topic.goalCount,
    exercises: topic.exerciseCount,
    status: topic.status,
    updatedAt: formatTopicUpdatedAt(topic.updatedAt),
    description: topic.description,
  };
}

export default async function Home() {
  const session = await getAdminAccessSession();
  const access = session.access;

  if (access.kind === "unauthenticated") {
    redirect("/login");
  }

  if (access.kind === "unavailable") {
    redirect("/login?reason=configuration");
  }

  if (access.kind === "denied") {
    return <AccessDenied />;
  }

  if (!session.client) {
    redirect("/login?reason=configuration");
  }

  const [promptCatalog, topicLibraryResult] = await Promise.all([
    getAiPromptCatalog(session.client, access.profile),
    loadAdminTopicLibrary(session.client).then(
      (items) => ({ ok: true as const, items }),
      () => ({ ok: false as const, items: [] }),
    ),
  ]);

  return (
    <AdminDashboard
      profile={access.profile}
      promptCatalog={promptCatalog}
      topics={topicLibraryResult.items.map(toOverviewTopic)}
      topicLibraryUnavailable={!topicLibraryResult.ok}
    />
  );
}
