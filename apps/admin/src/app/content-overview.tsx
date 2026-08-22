"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import {
  countDraftTopics,
  topicStatusCopy,
  topicStatusFilterOptions,
  type TopicStatus,
} from "./content-overview-state";
import styles from "./page.module.css";

export type Topic = {
  id: string;
  name: string;
  emoji: string;
  goals: number;
  exercises: number;
  status: TopicStatus;
  updatedAt: string;
  description: string;
};

type ContentOverviewProps = {
  topics: Topic[];
  unavailable?: boolean;
};

const statusContent: Record<
  TopicStatus,
  { label: string; className: string; detail: string }
> = {
  published: {
    ...topicStatusCopy.published,
    className: styles.statusPublished,
  },
  draft: {
    ...topicStatusCopy.draft,
    className: styles.statusDraft,
  },
};

function SearchIcon() {
  return (
    <svg
      className={styles.controlIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      className={styles.buttonIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 1.05 3.3A5.8 5.8 0 0 0 16.7 10L20 11l-3.3 1.05A5.8 5.8 0 0 0 13 15.7L12 19l-1.05-3.3A5.8 5.8 0 0 0 7.3 12L4 11l3.3-1.05A5.8 5.8 0 0 0 11 6.3L12 3Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      className={styles.arrowIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function StatusBadge({ status }: { status: TopicStatus }) {
  const content = statusContent[status];

  return (
    <span className={`${styles.statusBadge} ${content.className}`}>
      <span className={styles.badgeDot} aria-hidden="true" />
      {content.label}
    </span>
  );
}

export function ContentOverview({
  topics,
  unavailable = false,
}: ContentOverviewProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | TopicStatus>("all");
  const deferredQuery = useDeferredValue(query);

  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("da-DK");
  const filteredTopics = topics.filter((topic) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      `${topic.name} ${topic.description}`
        .toLocaleLowerCase("da-DK")
        .includes(normalizedQuery);
    const matchesStatus = status === "all" || topic.status === status;

    return matchesQuery && matchesStatus;
  });

  const stats = [
    { value: topics.length, label: "emner i alt" },
    {
      value: topics.reduce((total, topic) => total + topic.goals, 0),
      label: "træningsmål",
    },
    {
      value: countDraftTopics(topics),
      label: "kladder",
    },
  ];

  return (
    <section className={styles.content} id="emner" aria-labelledby="page-title">
      <div className={styles.toolbar}>
        <div>
          <p className={styles.eyebrow}>Indholdsbibliotek</p>
          <h1 className={styles.title} id="page-title">
            Emner
          </h1>
          <p className={styles.intro}>
            Opret og vedligehold træningsmål, øvelser og belønninger.
          </p>
        </div>

        <Link className={styles.primaryButton} href="/emner/ny">
          <SparkleIcon />
          Nyt emne med AI
        </Link>
      </div>

      <dl className={styles.summary} aria-label="Overblik over indhold">
        {stats.map((stat) => (
          <div className={styles.summaryCard} key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <section className={styles.library} aria-labelledby="topic-list-title">
        <div className={styles.libraryHeader}>
          <div>
            <h2 id="topic-list-title">Alle emner</h2>
            <p aria-live="polite">
              {filteredTopics.length === topics.length
                ? `${topics.length} emner i biblioteket`
                : `${filteredTopics.length} af ${topics.length} emner vist`}
            </p>
          </div>

          <div className={styles.filters}>
            <label className={styles.searchControl}>
              <span className={styles.visuallyHidden}>Søg efter emne</span>
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Søg efter emne"
              />
            </label>

            <label className={styles.selectControl}>
              <span className={styles.visuallyHidden}>
                Filtrér efter status
              </span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "all" | TopicStatus)
                }
              >
                {topicStatusFilterOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {unavailable ? (
          <div className={styles.emptyState} role="alert">
            <span aria-hidden="true">↻</span>
            <h3>Emnebiblioteket kan ikke hentes</h3>
            <p>
              Forbindelsen til indholdsdatabasen er midlertidigt utilgængelig.
            </p>
          </div>
        ) : filteredTopics.length > 0 ? (
          <div className={styles.tableScroller}>
            <table className={styles.topicTable}>
              <caption className={styles.visuallyHidden}>
                Emner med antal træningsmål, øvelser og status
              </caption>
              <thead>
                <tr>
                  <th scope="col">Emne</th>
                  <th scope="col">Træningsmål</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className={styles.visuallyHidden}>Handling</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map((topic) => (
                  <tr key={topic.id}>
                    <th scope="row">
                      <span className={styles.topicIdentity}>
                        <span className={styles.topicIcon} aria-hidden="true">
                          {topic.emoji}
                        </span>
                        <span>
                          <strong>{topic.name}</strong>
                          <small>
                            Opdateret{" "}
                            {topic.updatedAt.toLocaleLowerCase("da-DK")}
                          </small>
                        </span>
                      </span>
                    </th>
                    <td data-label="Træningsmål">
                      <span className={styles.topicCounts}>
                        <strong>{topic.goals} mål</strong>
                        <small>
                          {topic.exercises}{" "}
                          {topic.exercises === 1 ? "øvelse" : "øvelser"}
                        </small>
                      </span>
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={topic.status} />
                    </td>
                    <td className={styles.actionCell}>
                      <Link
                        className={styles.openButton}
                        href={`/emner/${encodeURIComponent(topic.id)}`}
                        aria-label={`Åbn ${topic.name}`}
                      >
                        Åbn
                        <ArrowIcon />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span aria-hidden="true">{topics.length === 0 ? "✨" : "🔎"}</span>
            <h3>
              {topics.length === 0
                ? "Opret det første emne"
                : "Ingen emner matcher"}
            </h3>
            <p>
              {topics.length === 0
                ? "Start med et emnegrundlag, som gemmes som en upubliceret kladde."
                : "Prøv en anden søgning eller vælg alle statusser."}
            </p>
            {topics.length === 0 ? (
              <Link className={styles.secondaryButton} href="/emner/ny">
                Opret emnekladde
              </Link>
            ) : (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
              >
                Nulstil filtre
              </button>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
