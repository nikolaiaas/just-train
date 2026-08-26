"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { buildTopicEditorHref } from "@/app/emner/ny/resume-topic-draft";
import {
  buildNewSkillHref,
  buildSubjectDetailHref,
} from "@/app/emner/subject-routes";
import type {
  CompleteSkillPackage,
  SkillBuilderMode,
  SkillDifficulty,
} from "@/app/emner/skill-package";

import {
  generateAdminSkillPackage,
  saveGeneratedAdminSkillPackage,
  suggestAdminSkills,
} from "./actions";
import styles from "./skill-package-workspace.module.css";

type SkillPackageWorkspaceProps = {
  existingSkills: Array<{
    childDescription: string;
    title: string;
  }>;
  initialMode: SkillBuilderMode;
  packageRequestId: string;
  suggestionRequestId: string;
  topic: {
    description: string;
    id: string;
    status: "draft" | "published";
    title: string;
    updatedAt: string;
  };
};

type PendingBuilderNavigation = {
  href: string;
  method: "push" | "replace";
};

const difficultyLabels: Record<SkillDifficulty, string> = {
  advanced: "Øvet",
  beginner: "Begynder",
  intermediate: "Let øvet",
};

const measurementLabels = {
  completion: "Gennemførelse",
  duration: "Tid",
  repetitions: "Gentagelser",
} as const;

const equipSlotLabels = {
  accessory: "Tilbehør",
  body: "På kroppen",
  feet: "På fødderne · ét helt par",
  head: "På hovedet",
  held: "I hånden",
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

const LEAVE_BUILDER_MESSAGE =
  "Vil du forlade byggeren? AI-forslag, som ikke er gemt, bliver ikke vist igen her.";
const HISTORY_GUARD_KEY = "__bareTraenSkillBuilderGuard";

function nextRequestId(): string {
  return globalThis.crypto.randomUUID();
}

function PackageProgress({ skillTitle }: { skillTitle?: string }) {
  return (
    <div className={styles.progressCard} role="status" aria-live="polite">
      <span className={styles.progressSpinner} aria-hidden="true" />
      <div>
        <strong>
          {skillTitle
            ? `AI bygger hele ${skillTitle}`
            : "AI bygger hele færdigheden"}
        </strong>
        <p>
          Først samles øvelserne. Derefter planlægges 16 belønninger, og GPT
          Image 2 tegner ét 4×4-billedark og beskærer det.
        </p>
      </div>
      <ol aria-label="Trin i AI-genereringen">
        <li>Færdighed og øvelser</li>
        <li>16 garderobeidéer</li>
        <li>Billedark og 16 beskæringer</li>
      </ol>
    </div>
  );
}

function InlineError({
  message,
  manualHref,
}: {
  manualHref?: string;
  message: string;
}) {
  return (
    <div className={styles.errorCard} role="alert">
      <strong>Det lykkedes ikke endnu</strong>
      <p>{message}</p>
      {manualHref ? (
        <Link href={manualHref}>Opret færdigheden uden AI</Link>
      ) : null}
    </div>
  );
}

function ChildCopy({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.childCopy}>
      <span>Barnet ser denne tekst</span>
      <p>{children}</p>
    </div>
  );
}

function formatExerciseTarget(exercise: {
  measurement: "completion" | "duration" | "repetitions";
  targetValue: number | null;
}): string {
  if (exercise.measurement === "completion") return "Gennemfør øvelsen";
  if (exercise.measurement === "repetitions") {
    return `${exercise.targetValue ?? 0} gentagelser`;
  }

  const seconds = exercise.targetValue ?? 0;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} sek.`;
  if (rest === 0) return `${minutes} min.`;
  return `${minutes} min. ${rest} sek.`;
}

function PackageReview({ value }: { value: CompleteSkillPackage }) {
  return (
    <div className={styles.reviewStack}>
      <section className={styles.reviewSection} aria-labelledby="skill-review">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>1 · Færdighed</p>
            <h2 id="skill-review">{value.package.skill.title}</h2>
          </div>
          <span className={styles.countPill}>1 færdighed</span>
        </div>
        <ChildCopy>{value.package.skill.childDescription}</ChildCopy>
        <dl className={styles.facts}>
          <div>
            <dt>Niveau</dt>
            <dd>{difficultyLabels[value.package.skill.difficulty]}</dd>
          </div>
          <div>
            <dt>Træningstid</dt>
            <dd>{value.package.skill.estimatedMinutes} min.</dd>
          </div>
          <div>
            <dt>Udstyr</dt>
            <dd>
              {value.package.skill.equipment.length > 0
                ? value.package.skill.equipment.join(" · ")
                : "Intet særligt udstyr"}
            </dd>
          </div>
        </dl>
        <details className={styles.editorialNote}>
          <summary>Hvorfor AI foreslår dette</summary>
          <p>{value.package.skill.editorialReason}</p>
        </details>
      </section>

      <section
        className={styles.reviewSection}
        aria-labelledby="exercise-review"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>2 · Øvelser</p>
            <h2 id="exercise-review">Hele rækkefølgen</h2>
          </div>
          <span className={styles.countPill}>
            {value.package.exercises.length} øvelser
          </span>
        </div>
        <ol className={styles.exerciseList}>
          {value.package.exercises.map((exercise) => (
            <li key={`${exercise.ordinal}:${exercise.slug}`}>
              <span className={styles.ordinal} aria-hidden="true">
                {exercise.ordinal}
              </span>
              <div className={styles.exerciseBody}>
                <div className={styles.exerciseTitle}>
                  <h3>{exercise.title}</h3>
                  <span>{measurementLabels[exercise.measurement]}</span>
                </div>
                <ChildCopy>{exercise.childInstructions}</ChildCopy>
                <dl className={styles.exerciseFacts}>
                  <div>
                    <dt>Mål</dt>
                    <dd>{formatExerciseTarget(exercise)}</dd>
                  </div>
                  <div>
                    <dt>Tid</dt>
                    <dd>{exercise.recommendedMinutes} min.</dd>
                  </div>
                  <div>
                    <dt>Udstyr</dt>
                    <dd>
                      {exercise.equipment.length > 0
                        ? exercise.equipment.join(" · ")
                        : "Intet særligt udstyr"}
                    </dd>
                  </div>
                </dl>
                <div className={styles.safetyCopy}>
                  <strong>Sikkerhed · barnet ser denne tekst</strong>
                  <p>{exercise.childSafetyNote}</p>
                </div>
                <details className={styles.editorialNote}>
                  <summary>Hvorfor øvelsen er med</summary>
                  <p>{exercise.editorialReason}</p>
                </details>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className={`${styles.reviewSection} ${styles.wardrobeSection}`}
        aria-labelledby="wardrobe-review"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>3 · Garderobebelønninger</p>
            <h2 id="wardrobe-review">16 billeder til emnet</h2>
            <p className={styles.sectionIntro}>
              Alle ting er lavet ud fra både emnet og færdigheden. De gemmes som
              kladder og skal stadig godkendes, før de kan publiceres.
            </p>
          </div>
          <span className={styles.countPill}>16 billeder</span>
        </div>
        <ol className={styles.wardrobeGrid}>
          {value.wardrobeItems.map((item) => (
            <li key={`${item.ordinal}:${item.name}`}>
              <div className={styles.rewardImage}>
                <Image
                  alt={`${item.name}. ${item.description}`}
                  fill
                  sizes="(max-width: 700px) 46vw, (max-width: 1100px) 30vw, 220px"
                  src={item.imageUrl}
                  unoptimized
                />
                <span aria-hidden="true">{item.ordinal}</span>
              </div>
              <div className={styles.rewardBody}>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <dl className={styles.rewardFacts}>
                  <div>
                    <dt>Type</dt>
                    <dd>{categoryLabels[item.category]}</dd>
                  </div>
                  <div>
                    <dt>Sjældenhed</dt>
                    <dd>{rarityLabels[item.rarity]}</dd>
                  </div>
                  <div>
                    <dt>Placering</dt>
                    <dd>{equipSlotLabels[item.equipSlot]}</dd>
                  </div>
                  <div>
                    <dt>Sådan låses den op</dt>
                    <dd>
                      {item.points > 0
                        ? `${item.points} point`
                        : item.unlockRule || "Ingen ekstra regel"}
                    </dd>
                  </div>
                </dl>
                <details className={styles.editorialNote}>
                  <summary>Hvorfor belønningen passer</summary>
                  <p>{item.reason}</p>
                </details>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function SkillPackageWorkspace({
  existingSkills,
  initialMode,
  packageRequestId: initialPackageRequestId,
  suggestionRequestId: initialSuggestionRequestId,
  topic,
}: SkillPackageWorkspaceProps) {
  const router = useRouter();
  const [suggestionRequestId, setSuggestionRequestId] = useState(
    initialSuggestionRequestId,
  );
  const [suggestionMessage, setSuggestionMessage] = useState(
    "Foreslå forskellige færdigheder, som passer til emnet og ikke gentager de eksisterende.",
  );
  const [packageRequestId, setPackageRequestId] = useState(
    initialPackageRequestId,
  );
  const [manualTitle, setManualTitle] = useState("");
  const [manualDirection, setManualDirection] = useState("");
  const [buildingSkillSlug, setBuildingSkillSlug] = useState<string | null>(
    null,
  );
  const [activeSuggestionAttempt, setActiveSuggestionAttempt] = useState<{
    requestId: string;
    slug: string;
  } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const suggestionHeadingRef = useRef<HTMLHeadingElement>(null);
  const packageHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusedSuggestionRequestRef = useRef<string | null>(null);
  const focusedPackageRequestRef = useRef<string | null>(null);
  const guardedHistoryEntryRef = useRef(false);
  const pendingNavigationRef = useRef<PendingBuilderNavigation | null>(null);
  const allowNextPopRef = useRef(false);
  const saveSucceededRef = useRef(false);
  const [suggestState, suggestAction, suggestPending] = useActionState(
    suggestAdminSkills,
    { status: "idle" },
  );
  const [packageState, packageAction, packagePending] = useActionState(
    generateAdminSkillPackage,
    { status: "idle" },
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveGeneratedAdminSkillPackage,
    { status: "idle" },
  );

  const manualHref = useMemo(
    () => buildTopicEditorHref({ createGoal: true, topicId: topic.id }),
    [topic.id],
  );

  const activeSuggestionRequestId = useMemo(
    () =>
      suggestState.status === "success" ||
      (suggestState.status === "error" &&
        suggestState.requestRecovery === "start_new")
        ? nextRequestId()
        : suggestionRequestId,
    [suggestState, suggestionRequestId],
  );
  const activePackageRequestId = useMemo(
    () =>
      packageState.status === "error" &&
      packageState.requestRecovery === "start_new"
        ? nextRequestId()
        : packageRequestId,
    [packageRequestId, packageState],
  );
  const suggestionPackageRequestIds = useMemo(() => {
    const ids = new Map<string, string>();
    if (suggestState.status === "success") {
      for (const skill of suggestState.output.skills) {
        ids.set(skill.slug, nextRequestId());
      }
    }
    return ids;
  }, [suggestState]);
  const replacementSuggestionPackageRequestId = useMemo(
    () =>
      packageState.status === "error" &&
      packageState.requestRecovery === "start_new"
        ? nextRequestId()
        : null,
    [packageState],
  );

  useEffect(() => {
    saveSucceededRef.current = saveState.status === "success";
    if (saveState.status === "success") {
      const canonicalHref = buildSubjectDetailHref(saveState.topicId);
      const href = `${canonicalHref}?skillPackageHistory=${encodeURIComponent(saveState.goalId)}`;
      if (guardedHistoryEntryRef.current) {
        pendingNavigationRef.current = { href, method: "replace" };
        window.history.back();
      } else {
        router.replace(href);
      }
    }
  }, [router, saveState]);

  const manualMessage = [
    `Byg en komplet færdighed om ${manualTitle.trim()}.`,
    manualDirection.trim(),
  ]
    .filter(Boolean)
    .join(" ");
  const packageReady = packageState.status === "success";
  const hasGeneratedWork =
    suggestState.status !== "idle" ||
    packageState.status !== "idle" ||
    suggestPending ||
    packagePending;
  const navigationGuardActive =
    hasGeneratedWork && saveState.status !== "success";
  const completionAnnouncement =
    packageState.status === "success"
      ? `AI er færdig. Hele pakken for ${packageState.package.package.skill.title} er klar med ${packageState.package.package.exercises.length} øvelser og 16 garderobebilleder.`
      : suggestState.status === "success"
        ? `AI er færdig. ${suggestState.output.skills.length} færdighedsforslag er klar til at vælge imellem.`
        : "";

  useEffect(() => {
    if (!navigationGuardActive) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [navigationGuardActive]);

  useEffect(() => {
    if (!hasGeneratedWork) return;

    const guardedUrl = window.location.href;
    const guardMarker = `${topic.id}:${initialMode}`;

    function currentHistoryState(): Record<string, unknown> {
      return typeof window.history.state === "object" &&
        window.history.state !== null
        ? (window.history.state as Record<string, unknown>)
        : {};
    }

    function pushGuardedHistoryEntry(): void {
      window.history.pushState(
        { ...currentHistoryState(), [HISTORY_GUARD_KEY]: guardMarker },
        "",
        guardedUrl,
      );
      guardedHistoryEntryRef.current = true;
    }

    if (currentHistoryState()[HISTORY_GUARD_KEY] === guardMarker) {
      guardedHistoryEntryRef.current = true;
    } else {
      pushGuardedHistoryEntry();
    }

    function navigateAfterLeavingGuard(): void {
      const navigation = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      guardedHistoryEntryRef.current = false;
      if (!navigation) return;
      if (navigation.method === "replace") {
        router.replace(navigation.href);
      } else {
        router.push(navigation.href);
      }
    }

    function guardBrowserBack(): void {
      if (pendingNavigationRef.current) {
        navigateAfterLeavingGuard();
        return;
      }

      if (allowNextPopRef.current) {
        allowNextPopRef.current = false;
        guardedHistoryEntryRef.current = false;
        return;
      }

      guardedHistoryEntryRef.current = false;
      if (window.confirm(LEAVE_BUILDER_MESSAGE)) {
        allowNextPopRef.current = true;
        window.history.back();
      } else {
        pushGuardedHistoryEntry();
      }
    }

    function guardSpaNavigation(event: MouseEvent): void {
      if (saveSucceededRef.current) return;

      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const eventTarget = event.target;
      const anchor =
        eventTarget instanceof Element
          ? eventTarget.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }

      const targetUrl = new URL(anchor.href, window.location.href);
      if (
        targetUrl.origin !== window.location.origin ||
        (targetUrl.pathname === window.location.pathname &&
          targetUrl.search === window.location.search)
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      if (!window.confirm(LEAVE_BUILDER_MESSAGE)) return;

      const nextHref = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
      if (guardedHistoryEntryRef.current) {
        pendingNavigationRef.current = { href: nextHref, method: "push" };
        window.history.back();
      } else {
        router.push(nextHref);
      }
    }

    window.addEventListener("popstate", guardBrowserBack);
    document.addEventListener("click", guardSpaNavigation, true);
    return () => {
      window.removeEventListener("popstate", guardBrowserBack);
      document.removeEventListener("click", guardSpaNavigation, true);
      guardedHistoryEntryRef.current = false;
    };
  }, [hasGeneratedWork, initialMode, router, topic.id]);

  useEffect(() => {
    if (
      suggestState.status !== "success" ||
      focusedSuggestionRequestRef.current === suggestState.requestId
    ) {
      return;
    }

    focusedSuggestionRequestRef.current = suggestState.requestId;
    suggestionHeadingRef.current?.focus();
  }, [suggestState]);

  useEffect(() => {
    if (
      packageState.status !== "success" ||
      focusedPackageRequestRef.current === packageState.requestId
    ) {
      return;
    }

    focusedPackageRequestRef.current = packageState.requestId;
    packageHeadingRef.current?.focus();
  }, [packageState]);

  function requestIdForSuggestedSkill(slug: string): string {
    if (activeSuggestionAttempt?.slug === slug) {
      return (
        replacementSuggestionPackageRequestId ??
        activeSuggestionAttempt.requestId
      );
    }

    return suggestionPackageRequestIds.get(slug) ?? activePackageRequestId;
  }

  return (
    <article className={styles.page} aria-labelledby="skill-builder-title">
      <p
        className={styles.visuallyHidden}
        role="status"
        aria-atomic="true"
        aria-live="polite"
      >
        {completionAnnouncement}
      </p>
      <nav className={styles.breadcrumbs} aria-label="Brødkrummer">
        <Link href="/emner">Emner</Link>
        <span aria-hidden="true">/</span>
        <Link href={buildSubjectDetailHref(topic.id)}>{topic.title}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Ny færdighed</span>
      </nav>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Færdighedsbygger</p>
          <h1 id="skill-builder-title">Byg én færdighed helt færdig</h1>
          <p>
            AI samler en færdighed, alle øvelserne og 16 garderobebelønninger.
            Du gennemgår hele pakken, før noget gemmes som kladde.
          </p>
        </div>
        <Link
          className={styles.closeLink}
          href={buildSubjectDetailHref(topic.id)}
        >
          Luk byggeren
        </Link>
      </header>

      <div className={styles.contextBar} aria-label="Aktivt emne">
        <div>
          <span>Emne</span>
          <strong>{topic.title}</strong>
        </div>
        <p>{topic.description}</p>
        <span className={styles.statusPill}>
          {topic.status === "published" ? "Publiceret" : "Kladde"}
        </span>
      </div>

      <nav className={styles.modeSwitch} aria-label="Vælg start på færdigheden">
        <Link
          aria-current={initialMode === "create" ? "page" : undefined}
          href={buildNewSkillHref(topic.id, { suggestWithAi: false })}
        >
          Jeg kender færdigheden
        </Link>
        <Link
          aria-current={initialMode === "suggest" ? "page" : undefined}
          href={buildNewSkillHref(topic.id, { suggestWithAi: true })}
        >
          Foreslå færdigheder med AI
        </Link>
      </nav>

      {!packageReady ? (
        <section className={styles.startCard} aria-labelledby="direction-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>1 · Vælg retning</p>
              <h2 id="direction-title">
                {initialMode === "suggest"
                  ? `Hvad mangler ${topic.title}?`
                  : "Hvilken færdighed vil du bygge?"}
              </h2>
            </div>
            <span className={styles.countPill}>
              {existingSkills.length} eksisterende
            </span>
          </div>

          {initialMode === "suggest" ? (
            <form
              action={suggestAction}
              className={styles.directionForm}
              onSubmit={() => {
                setSuggestionRequestId(activeSuggestionRequestId);
              }}
            >
              <input name="topicId" type="hidden" value={topic.id} />
              <input
                name="requestId"
                type="hidden"
                value={activeSuggestionRequestId}
              />
              <label htmlFor="skill-suggestion-message">
                <span>Retning til AI</span>
                <textarea
                  id="skill-suggestion-message"
                  maxLength={1_000}
                  name="message"
                  onChange={(event) => {
                    setSuggestionMessage(event.target.value);
                    setSuggestionRequestId(nextRequestId());
                  }}
                  required
                  rows={3}
                  value={suggestionMessage}
                />
              </label>
              <button disabled={suggestPending || packagePending} type="submit">
                {suggestPending ? "Finder færdigheder…" : "Foreslå færdigheder"}
              </button>
            </form>
          ) : (
            <form
              action={packageAction}
              className={styles.directionForm}
              onSubmit={() => {
                setPackageRequestId(activePackageRequestId);
                setBuildingSkillSlug("__manual__");
              }}
            >
              <input name="topicId" type="hidden" value={topic.id} />
              <input
                name="requestId"
                type="hidden"
                value={activePackageRequestId}
              />
              <input name="message" type="hidden" value={manualMessage} />
              <input
                name="skillSeed"
                type="hidden"
                value={JSON.stringify({
                  childDescription: "",
                  difficulty: "beginner",
                  estimatedMinutes: null,
                  title: manualTitle.trim(),
                })}
              />
              <label htmlFor="manual-skill-title">
                <span>Navn eller idé</span>
                <input
                  autoComplete="off"
                  id="manual-skill-title"
                  maxLength={120}
                  onChange={(event) => {
                    setManualTitle(event.target.value);
                    setPackageRequestId(nextRequestId());
                  }}
                  placeholder="Fx Dribling"
                  required
                  value={manualTitle}
                />
              </label>
              <label htmlFor="manual-skill-direction">
                <span>Ekstra retning til AI · valgfrit</span>
                <textarea
                  id="manual-skill-direction"
                  maxLength={700}
                  onChange={(event) => {
                    setManualDirection(event.target.value);
                    setPackageRequestId(nextRequestId());
                  }}
                  placeholder="Fx start helt enkelt og slut med et lille temposkift"
                  rows={3}
                  value={manualDirection}
                />
              </label>
              <div className={styles.formActions}>
                <button
                  disabled={
                    packagePending || suggestPending || !manualTitle.trim()
                  }
                  type="submit"
                >
                  {packagePending
                    ? "Bygger hele færdigheden…"
                    : "Lav hele færdigheden med AI"}
                </button>
                <Link href={manualHref}>Opret kun færdigheden manuelt</Link>
              </div>
            </form>
          )}

          {suggestState.status === "error" ? (
            <InlineError
              message={suggestState.message}
              manualHref={manualHref}
            />
          ) : null}
          {packageState.status === "error" ? (
            <InlineError
              message={packageState.message}
              manualHref={manualHref}
            />
          ) : null}
          {initialMode === "create" && packagePending ? (
            <PackageProgress skillTitle={manualTitle.trim()} />
          ) : null}
        </section>
      ) : null}

      {!packageReady && suggestState.status === "success" ? (
        <section
          className={styles.suggestions}
          aria-labelledby="suggestions-title"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>2 · Vælg én</p>
              <h2
                id="suggestions-title"
                ref={suggestionHeadingRef}
                tabIndex={-1}
              >
                Forslag til {topic.title}
              </h2>
              <p className={styles.sectionIntro}>{suggestState.output.reply}</p>
            </div>
            <span className={styles.countPill}>
              {suggestState.output.skills.length} forslag
            </span>
          </div>
          <ol className={styles.suggestionGrid}>
            {suggestState.output.skills.map((skill) => (
              <li key={`${skill.ordinal}:${skill.slug}`}>
                <span className={styles.ordinal} aria-hidden="true">
                  {skill.ordinal}
                </span>
                <h3>{skill.title}</h3>
                <ChildCopy>{skill.childDescription}</ChildCopy>
                <p className={styles.suggestionMeta}>
                  {difficultyLabels[skill.difficulty]} ·{" "}
                  {skill.estimatedMinutes} min.
                </p>
                <details className={styles.editorialNote}>
                  <summary>Hvorfor dette passer</summary>
                  <p>{skill.editorialReason}</p>
                </details>
                <form
                  action={packageAction}
                  onSubmit={() => {
                    const requestId = requestIdForSuggestedSkill(skill.slug);
                    setActiveSuggestionAttempt({
                      requestId,
                      slug: skill.slug,
                    });
                    setBuildingSkillSlug(skill.slug);
                  }}
                >
                  <input name="topicId" type="hidden" value={topic.id} />
                  <input
                    name="requestId"
                    type="hidden"
                    value={requestIdForSuggestedSkill(skill.slug)}
                  />
                  <input
                    name="message"
                    type="hidden"
                    value={`Byg en komplet færdighed ud fra forslaget ${skill.title}. ${skill.editorialReason}`}
                  />
                  <input
                    name="skillSeed"
                    type="hidden"
                    value={JSON.stringify({
                      childDescription: skill.childDescription,
                      difficulty: skill.difficulty,
                      estimatedMinutes: skill.estimatedMinutes,
                      title: skill.title,
                    })}
                  />
                  <button disabled={packagePending} type="submit">
                    {packagePending && buildingSkillSlug === skill.slug
                      ? "Bygger pakken…"
                      : `Byg hele ${skill.title}`}
                  </button>
                </form>
              </li>
            ))}
          </ol>
          {packagePending ? (
            <PackageProgress
              skillTitle={
                suggestState.output.skills.find(
                  (skill) => skill.slug === buildingSkillSlug,
                )?.title
              }
            />
          ) : null}
        </section>
      ) : null}

      {packageState.status === "success" ? (
        <>
          <section
            className={styles.completeIntro}
            aria-labelledby="complete-title"
          >
            <div>
              <p className={styles.eyebrow}>
                Komplet forslag · intet er gemt endnu
              </p>
              <h2 id="complete-title" ref={packageHeadingRef} tabIndex={-1}>
                Gennemgå hele pakken
              </h2>
              <p>{packageState.package.package.reply}</p>
            </div>
            <dl>
              <div>
                <dt>Færdigheder</dt>
                <dd>1</dd>
              </div>
              <div>
                <dt>Øvelser</dt>
                <dd>{packageState.package.package.exercises.length}</dd>
              </div>
              <div>
                <dt>Billeder</dt>
                <dd>16</dd>
              </div>
            </dl>
          </section>

          <PackageReview value={packageState.package} />

          <section className={styles.saveCard} aria-labelledby="save-title">
            <div>
              <p className={styles.eyebrow}>4 · Gem som kladde</p>
              <h2 id="save-title">Én samlet gemning</h2>
              <p>
                Færdigheden, alle øvelser og alle 16 billeder gemmes sammen.
                Intet bliver synligt for børn, før emnet publiceres igen, og
                garderobetingene er godkendt.
              </p>
            </div>
            <form action={saveAction}>
              <input name="topicId" type="hidden" value={topic.id} />
              <input
                name="requestId"
                type="hidden"
                value={packageState.requestId}
              />
              <input
                name="expectedUpdatedAt"
                type="hidden"
                value={topic.updatedAt}
              />
              <input
                name="skillJobId"
                type="hidden"
                value={packageState.package.skillJobId}
              />
              <input
                name="wardrobePlanJobId"
                type="hidden"
                value={packageState.package.wardrobePlanJobId}
              />
              <input
                name="wardrobeImageJobId"
                type="hidden"
                value={packageState.package.imageJobId}
              />
              <label className={styles.reviewCheck}>
                <input
                  checked={reviewed}
                  name="reviewed"
                  onChange={(event) => setReviewed(event.target.checked)}
                  type="checkbox"
                  value="yes"
                />
                <span>
                  Jeg har gennemgået børneteksterne, øvelsesrækkefølgen og alle
                  16 billeder.
                </span>
              </label>
              <button disabled={!reviewed || savePending} type="submit">
                {savePending
                  ? "Gemmer hele pakken…"
                  : "Gem hele pakken som kladde"}
              </button>
            </form>
            {saveState.status === "error" ? (
              <InlineError message={saveState.message} />
            ) : null}
            {saveState.status === "success" ? (
              <div className={styles.successCard} role="status">
                <strong>Hele pakken er gemt</strong>
                <p>
                  {saveState.exerciseCount} øvelser og {saveState.wardrobeCount}{" "}
                  garderobeting er gemt som kladder. Åbner emnet…
                </p>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </article>
  );
}
