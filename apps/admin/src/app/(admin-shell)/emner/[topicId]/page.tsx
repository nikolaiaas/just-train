import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAdminAccessSession } from "@/lib/auth/dal";

import {
  loadAdminTopicDetail,
  type AdminTopicDetailExercise,
  type AdminTopicDetailStatus,
  type AdminTopicDetailWardrobeItem,
} from "./data";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Emnedetaljer · Bare Træn Administration",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TopicDetailPageProps = {
  params: Promise<{ topicId: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Copenhagen",
});

const difficultyLabels = {
  advanced: "Øvet",
  beginner: "Begynder",
  intermediate: "Let øvet",
} as const;

const categoryLabels = {
  clothing: "Tøj",
  effect: "Effekt",
  equipment: "Udstyr",
} as const;

const rarityLabels = {
  common: "Almindelig",
  rare: "Sjælden",
  special: "Særlig",
} as const;

type DisplayStatus = AdminTopicDetailStatus | "approved";

const statusLabels: Record<DisplayStatus, string> = {
  approved: "Godkendt",
  draft: "Kladde",
  published: "Publiceret",
};

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={`${styles.statusBadge} ${
        status === "published"
          ? styles.statusPublished
          : status === "approved"
            ? styles.statusApproved
            : styles.statusDraft
      }`}
    >
      <span className={styles.statusDot} aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}

function WardrobeStatusBadge({ item }: { item: AdminTopicDetailWardrobeItem }) {
  const status: DisplayStatus =
    item.status === "published"
      ? "published"
      : item.editorialStatus === "approved"
        ? "approved"
        : "draft";

  return <StatusBadge status={status} />;
}

function getContentEditHref({
  exerciseId,
  goalId,
  topicId,
}: {
  exerciseId?: string;
  goalId?: string;
  topicId: string;
}): string {
  const search = new URLSearchParams({ topic: topicId });
  if (goalId) search.set("goal", goalId);
  if (exerciseId) search.set("exercise", exerciseId);
  return `/emner/ny?${search.toString()}`;
}

function EquipmentList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className={styles.mutedValue}>Intet særligt udstyr</span>;
  }

  return (
    <ul className={styles.chipList} aria-label="Udstyr" role="list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function formatExerciseTarget(exercise: AdminTopicDetailExercise): string {
  if (exercise.measurement === "completion") return "Gennemførelse";

  if (exercise.measurement === "repetitions") {
    return `${exercise.targetValue} gentagelser`;
  }

  const seconds = exercise.targetValue ?? 0;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) return `${remainingSeconds} sek.`;
  if (remainingSeconds === 0) return `${minutes} min.`;
  return `${minutes} min. ${remainingSeconds} sek.`;
}

function WardrobeUnlock({ item }: { item: AdminTopicDetailWardrobeItem }) {
  if (item.points !== null) {
    return (
      <p className={styles.unlockRule}>
        <strong>{item.points}</strong> point
      </p>
    );
  }

  return (
    <p className={styles.unlockRule}>
      <span>Låses op ved:</span> {item.unlockRule}
    </p>
  );
}

export default async function TopicDetailPage({
  params,
}: TopicDetailPageProps) {
  const [session, routeParams] = await Promise.all([
    getAdminAccessSession(),
    params,
  ]);

  if (session.access.kind !== "authorized" || !session.client) {
    return null;
  }

  const topic = await loadAdminTopicDetail(session.client, routeParams.topicId);

  if (!topic) notFound();

  const goalCount = topic.goals.length;
  const exerciseCount = topic.goals.reduce(
    (total, goal) => total + goal.exercises.length,
    0,
  );

  return (
    <article className={styles.page} aria-labelledby="topic-title">
      <nav className={styles.breadcrumbs} aria-label="Brødkrummer">
        <Link href="/emner">Emner</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{topic.title}</span>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <span
            className={styles.topicIcon}
            style={{ backgroundColor: topic.accentColor ?? "#dff1ed" }}
            aria-hidden="true"
          >
            {topic.icon || "✨"}
          </span>
          <div className={styles.heroCopy}>
            <div className={styles.titleLine}>
              <p className={styles.eyebrow}>Emneoversigt</p>
              <StatusBadge status={topic.status} />
            </div>
            <h1 id="topic-title">{topic.title}</h1>
            <p className={styles.description}>
              {topic.description ||
                "Der er endnu ikke skrevet en beskrivelse af emnet."}
            </p>
          </div>
        </div>

        <Link
          className={styles.editButton}
          href={getContentEditHref({ topicId: topic.id })}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
          </svg>
          Rediger emne
        </Link>
      </header>

      <dl className={styles.summary} aria-label="Emnets status og indhold">
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={topic.status} />
          </dd>
        </div>
        <div>
          <dt>Senest opdateret</dt>
          <dd>{formatDate(topic.updatedAt)}</dd>
        </div>
        <div>
          <dt>Indhold</dt>
          <dd>
            {goalCount} {goalCount === 1 ? "mål" : "mål"} · {exerciseCount}{" "}
            {exerciseCount === 1 ? "øvelse" : "øvelser"}
          </dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>v{topic.contentVersion}</dd>
        </div>
      </dl>

      <section className={styles.section} aria-labelledby="goals-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Træningsforløb</p>
            <h2 id="goals-heading">Mål og øvelser</h2>
          </div>
          <span className={styles.countPill}>
            {goalCount} {goalCount === 1 ? "mål" : "mål"}
          </span>
        </div>

        {topic.goals.length === 0 ? (
          <div className={styles.emptyState}>
            <span aria-hidden="true">🎯</span>
            <div>
              <h3>Ingen træningsmål endnu</h3>
              <p>
                Tilføj et mål og nogle små øvelser, når emnet skal bygges
                videre.
              </p>
            </div>
          </div>
        ) : (
          <ol className={styles.goalList} role="list">
            {topic.goals.map((goal, goalIndex) => (
              <li className={styles.goalCard} key={goal.id}>
                <header className={styles.goalHeader}>
                  <div>
                    <p className={styles.itemKicker}>Mål {goalIndex + 1}</p>
                    <h3>{goal.title}</h3>
                    <p>{goal.summary || "Målet har endnu ingen forklaring."}</p>
                  </div>
                  <div className={styles.itemActions}>
                    <StatusBadge status={goal.status} />
                    <Link
                      aria-label={`Rediger mål: ${goal.title}`}
                      className={styles.inlineEditButton}
                      href={getContentEditHref({
                        goalId: goal.id,
                        topicId: topic.id,
                      })}
                    >
                      Rediger mål
                    </Link>
                  </div>
                </header>

                <dl className={styles.goalFacts}>
                  <div>
                    <dt>Niveau</dt>
                    <dd>{difficultyLabels[goal.difficulty]}</dd>
                  </div>
                  <div>
                    <dt>Træningstid</dt>
                    <dd>
                      {goal.estimatedMinutes === null
                        ? "Ikke angivet"
                        : `${goal.estimatedMinutes} min.`}
                    </dd>
                  </div>
                  <div className={styles.equipmentFact}>
                    <dt>Udstyr</dt>
                    <dd>
                      <EquipmentList items={goal.equipment} />
                    </dd>
                  </div>
                </dl>

                <section
                  className={styles.exerciseSection}
                  aria-labelledby={`exercises-${goal.id}`}
                >
                  <div className={styles.exerciseHeading}>
                    <h4 id={`exercises-${goal.id}`}>Deløvelser</h4>
                    <span>{goal.exercises.length}</span>
                  </div>

                  {goal.exercises.length === 0 ? (
                    <p className={styles.inlineEmpty}>
                      Der er endnu ikke tilknyttet deløvelser til dette mål.
                    </p>
                  ) : (
                    <ol className={styles.exerciseList} role="list">
                      {goal.exercises.map((exercise, exerciseIndex) => (
                        <li className={styles.exerciseCard} key={exercise.id}>
                          <div className={styles.exerciseNumber}>
                            <span className={styles.visuallyHidden}>
                              Deløvelse {exerciseIndex + 1}
                            </span>
                            <span aria-hidden="true">{exerciseIndex + 1}</span>
                          </div>
                          <div className={styles.exerciseContent}>
                            <div className={styles.exerciseTitleLine}>
                              <h5>{exercise.title}</h5>
                              <div className={styles.itemActions}>
                                <StatusBadge status={exercise.status} />
                                <Link
                                  aria-label={`Rediger deløvelse: ${exercise.title}`}
                                  className={styles.inlineEditButton}
                                  href={getContentEditHref({
                                    exerciseId: exercise.id,
                                    goalId: goal.id,
                                    topicId: topic.id,
                                  })}
                                >
                                  Rediger deløvelse
                                </Link>
                              </div>
                            </div>
                            <p>
                              {exercise.instructions ||
                                "Der er endnu ikke skrevet en instruktion."}
                            </p>
                            <dl className={styles.exerciseFacts}>
                              <div>
                                <dt>Mål</dt>
                                <dd>{formatExerciseTarget(exercise)}</dd>
                              </div>
                              <div>
                                <dt>Tid</dt>
                                <dd>
                                  {exercise.estimatedMinutes === null
                                    ? "Ikke angivet"
                                    : `${exercise.estimatedMinutes} min.`}
                                </dd>
                              </div>
                            </dl>
                            <EquipmentList items={exercise.equipment} />
                            <div className={styles.safetyNote}>
                              <strong>Sikkerhed</strong>
                              <span>
                                {exercise.safetyNotes ||
                                  "Ingen særlige sikkerhedsnoter."}
                              </span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={styles.section} aria-labelledby="wardrobe-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Belønninger til emnet</p>
            <h2 id="wardrobe-heading">Garderobe til {topic.title}</h2>
            <p className={styles.sectionIntro}>
              Tingene her hører kun til dette emne og kan bruges som små,
              motiverende belønninger.
            </p>
          </div>
          <span className={styles.countPill}>{topic.wardrobeItems.length}</span>
        </div>

        {topic.wardrobeItems.length === 0 ? (
          <div className={styles.emptyState}>
            <span aria-hidden="true">🧢</span>
            <div>
              <h3>Garderoben er tom</h3>
              <p>
                Der er endnu ikke gemt tøj, udstyr eller effekter til dette
                emne.
              </p>
            </div>
          </div>
        ) : (
          <ul className={styles.wardrobeGrid} role="list">
            {topic.wardrobeItems.map((item) => (
              <li className={styles.wardrobeCard} key={item.id}>
                <span className={styles.rewardIcon} aria-hidden="true">
                  {item.icon}
                </span>
                <div className={styles.rewardContent}>
                  <div className={styles.rewardTitleLine}>
                    <h3>{item.name}</h3>
                    <WardrobeStatusBadge item={item} />
                  </div>
                  <p className={styles.rewardMeta}>
                    {categoryLabels[item.category]} ·{" "}
                    {rarityLabels[item.rarity]}
                  </p>
                  <WardrobeUnlock item={item} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
