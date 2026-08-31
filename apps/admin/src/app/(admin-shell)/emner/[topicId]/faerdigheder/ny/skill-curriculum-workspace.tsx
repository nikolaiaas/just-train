"use client";

import type { AdminSkillCurriculumOutput } from "@bare-traen/api-client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  countCurriculumExercises,
  exercisesPerSkillOptions,
  formatCurriculumExerciseTarget,
  isCurrentCurriculumReview,
  isCurrentWardrobeReview,
  skillCountOptions,
} from "@/app/emner/skill-curriculum";
import type { AssistantWardrobeItem } from "@/app/emner/assistant-request";
import {
  buildNewSkillHref,
  buildSubjectDetailHref,
} from "@/app/emner/subject-routes";

import {
  generateAdminSkillCurriculum,
  generateAdminSkillCurriculumWardrobe,
  saveGeneratedAdminSkillCurriculum,
} from "./actions";
import styles from "./skill-package-workspace.module.css";

type SkillCurriculumWorkspaceProps = {
  existingSkills: Array<{
    childDescription: string;
    title: string;
  }>;
  requestId: string;
  topic: {
    description: string;
    id: string;
    status: "draft" | "published";
    title: string;
    updatedAt: string;
  };
  wardrobeRequestId: string;
};

type PendingBuilderNavigation = {
  href: string;
  method: "push" | "replace";
};

const difficultyLabels = {
  advanced: "Avanceret",
  beginner: "Begynder",
  intermediate: "Øvet",
} as const;

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
  "Vil du forlade planlægningen? AI-planer, som ikke er gemt, bliver ikke vist igen her.";
const HISTORY_GUARD_KEY = "__bareTraenSkillCurriculumGuard";

function nextRequestId(): string {
  return globalThis.crypto.randomUUID();
}

function InlineError({ message }: { message: string }) {
  return (
    <div className={styles.errorCard} role="alert">
      <strong>Det lykkedes ikke endnu</strong>
      <p>{message}</p>
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

function PlannerProgress({ stage }: { stage: "curriculum" | "wardrobe" }) {
  return (
    <div className={styles.progressCard} role="status" aria-live="polite">
      <span className={styles.progressSpinner} aria-hidden="true" />
      <div>
        <strong>
          {stage === "curriculum"
            ? "AI planlægger færdigheder og øvelser"
            : "AI tegner den fælles garderobe"}
        </strong>
        <p>
          {stage === "curriculum"
            ? "Først får du hele læringsforløbet. Der bliver ikke lavet billeder endnu."
            : "Din godkendte læringsplan bevares, mens 16 belønninger planlægges og beskæres."}
        </p>
      </div>
      <ol aria-label="Trin i AI-planlægningen">
        <li data-complete={stage === "wardrobe"}>Færdigheder og øvelser</li>
        <li>16 fælles garderobeidéer</li>
        <li>Billedark og 16 beskæringer</li>
      </ol>
    </div>
  );
}

function CurriculumReview({
  curriculum,
  headingRef,
}: {
  curriculum: AdminSkillCurriculumOutput;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <section
      className={styles.reviewSection}
      aria-labelledby="curriculum-review"
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>2 · Læringsplan</p>
          <h2
            id="curriculum-review"
            ref={headingRef}
            tabIndex={headingRef ? -1 : undefined}
          >
            Færdigheder og øvelser i rækkefølge
          </h2>
          <p className={styles.sectionIntro}>{curriculum.reply}</p>
        </div>
        <span className={styles.countPill}>
          {curriculum.skills.length} færdigheder ·{" "}
          {countCurriculumExercises(curriculum)} øvelser
        </span>
      </div>

      <ol className={styles.curriculumList}>
        {curriculum.skills.map((skill) => (
          <li key={`${skill.ordinal}:${skill.slug}`}>
            <details open={skill.ordinal === 1}>
              <summary>
                <span className={styles.ordinal} aria-hidden="true">
                  {skill.ordinal}
                </span>
                <span>
                  <strong aria-level={3} role="heading">
                    {skill.title}
                  </strong>
                  <small>
                    {skill.exercises.length} øvelser ·{" "}
                    {difficultyLabels[skill.difficulty]} ·{" "}
                    {skill.estimatedMinutes} min.
                  </small>
                </span>
              </summary>
              <div className={styles.curriculumSkillBody}>
                <ChildCopy>{skill.childDescription}</ChildCopy>
                <dl className={styles.facts}>
                  <div>
                    <dt>Niveau</dt>
                    <dd>{difficultyLabels[skill.difficulty]}</dd>
                  </div>
                  <div>
                    <dt>Træningstid</dt>
                    <dd>{skill.estimatedMinutes} min.</dd>
                  </div>
                  <div>
                    <dt>Udstyr</dt>
                    <dd>
                      {skill.equipment.length > 0
                        ? skill.equipment.join(" · ")
                        : "Intet særligt udstyr"}
                    </dd>
                  </div>
                </dl>
                <ol className={styles.exerciseList}>
                  {skill.exercises.map((exercise) => (
                    <li key={`${exercise.ordinal}:${exercise.slug}`}>
                      <span className={styles.ordinal} aria-hidden="true">
                        {exercise.ordinal}
                      </span>
                      <div className={styles.exerciseBody}>
                        <div className={styles.exerciseTitle}>
                          <h4>{exercise.title}</h4>
                          <span>{measurementLabels[exercise.measurement]}</span>
                        </div>
                        <ChildCopy>{exercise.childInstructions}</ChildCopy>
                        <dl className={styles.exerciseFacts}>
                          <div>
                            <dt>Mål</dt>
                            <dd>{formatCurriculumExerciseTarget(exercise)}</dd>
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
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WardrobeReview({ items }: { items: AssistantWardrobeItem[] }) {
  return (
    <section
      className={`${styles.reviewSection} ${styles.wardrobeSection}`}
      aria-labelledby="curriculum-wardrobe-review"
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>3 · Fælles garderobe</p>
          <h2 id="curriculum-wardrobe-review">16 billeder til hele emnet</h2>
          <p className={styles.sectionIntro}>
            Der laves ét fælles sæt ud fra emnet og hele læringsplanen – ikke 16
            nye billeder for hver færdighed.
          </p>
        </div>
        <span className={styles.countPill}>16 billeder</span>
      </div>
      <ol className={styles.wardrobeGrid}>
        {items.map((item) => (
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
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SkillCurriculumWorkspace({
  existingSkills,
  requestId: initialRequestId,
  topic,
  wardrobeRequestId: initialWardrobeRequestId,
}: SkillCurriculumWorkspaceProps) {
  const router = useRouter();
  const [requestId, setRequestId] = useState(initialRequestId);
  const [wardrobeRequestId, setWardrobeRequestId] = useState(
    initialWardrobeRequestId,
  );
  const [message, setMessage] = useState(
    "Planlæg et sammenhængende forløb med tydelig progression. Undgå de færdigheder, der allerede findes.",
  );
  const [skillCount, setSkillCount] = useState(3);
  const [exercisesPerSkill, setExercisesPerSkill] = useState(3);
  const [planInputsDirty, setPlanInputsDirty] = useState(false);
  const [reviewedRequestId, setReviewedRequestId] = useState<string | null>(
    null,
  );
  const curriculumHeadingRef = useRef<HTMLHeadingElement>(null);
  const wardrobeHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusedCurriculumRequestRef = useRef<string | null>(null);
  const focusedWardrobeRequestRef = useRef<string | null>(null);
  const guardedHistoryEntryRef = useRef(false);
  const pendingNavigationRef = useRef<PendingBuilderNavigation | null>(null);
  const allowNextPopRef = useRef(false);
  const saveSucceededRef = useRef(false);
  const preparedNextCurriculumRequestRef = useRef<string | null>(null);
  const preparedNextWardrobeRequestRef = useRef<string | null>(null);
  const [curriculumState, curriculumAction, curriculumPending] = useActionState(
    generateAdminSkillCurriculum,
    { status: "idle" },
  );
  const [wardrobeState, wardrobeAction, wardrobePending] = useActionState(
    generateAdminSkillCurriculumWardrobe,
    { status: "idle" },
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveGeneratedAdminSkillCurriculum,
    { status: "idle" },
  );

  const activeRequestId = useMemo(
    () =>
      curriculumState.status === "error" &&
      curriculumState.requestRecovery === "start_new"
        ? nextRequestId()
        : requestId,
    [curriculumState, requestId],
  );
  const activeWardrobeRequestId = useMemo(
    () =>
      wardrobeState.status === "error" &&
      wardrobeState.requestRecovery === "start_new"
        ? nextRequestId()
        : wardrobeRequestId,
    [wardrobeRequestId, wardrobeState],
  );
  const curriculumReady =
    curriculumState.status === "success" &&
    isCurrentCurriculumReview({
      inputsDirty: planInputsDirty,
      pending: curriculumPending,
      succeeded: true,
    });
  const wardrobeReady =
    wardrobeState.status === "success" &&
    curriculumState.status === "success" &&
    isCurrentWardrobeReview({
      curriculumJobId: curriculumState.curriculumJobId,
      curriculumReady,
      succeeded: true,
      wardrobeCurriculumJobId: wardrobeState.curriculum.curriculumJobId,
    });
  const hasGeneratedWork =
    curriculumState.status !== "idle" ||
    wardrobeState.status !== "idle" ||
    curriculumPending ||
    wardrobePending;
  const navigationGuardActive =
    hasGeneratedWork && saveState.status !== "success";

  useEffect(() => {
    if (
      curriculumState.status !== "success" ||
      preparedNextCurriculumRequestRef.current === curriculumState.requestId
    ) {
      return;
    }
    preparedNextCurriculumRequestRef.current = curriculumState.requestId;
    setRequestId(nextRequestId());
    setPlanInputsDirty(false);
    setReviewedRequestId(null);
  }, [curriculumState]);

  useEffect(() => {
    if (
      wardrobeState.status !== "success" ||
      preparedNextWardrobeRequestRef.current === wardrobeState.requestId
    ) {
      return;
    }
    preparedNextWardrobeRequestRef.current = wardrobeState.requestId;
    setWardrobeRequestId(nextRequestId());
  }, [wardrobeState]);

  useEffect(() => {
    saveSucceededRef.current = saveState.status === "success";
    if (saveState.status !== "success") return;

    const canonicalHref = buildSubjectDetailHref(saveState.topicId);
    const href = `${canonicalHref}?skillPackageHistory=${encodeURIComponent(saveState.goalIds[0] ?? "")}`;
    if (guardedHistoryEntryRef.current) {
      pendingNavigationRef.current = { href, method: "replace" };
      window.history.back();
    } else {
      router.replace(href);
    }
  }, [router, saveState]);

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
    const guardMarker = `${topic.id}:curriculum`;
    const currentHistoryState = (): Record<string, unknown> =>
      typeof window.history.state === "object" && window.history.state !== null
        ? (window.history.state as Record<string, unknown>)
        : {};
    const pushGuardedHistoryEntry = () => {
      window.history.pushState(
        { ...currentHistoryState(), [HISTORY_GUARD_KEY]: guardMarker },
        "",
        guardedUrl,
      );
      guardedHistoryEntryRef.current = true;
    };

    if (currentHistoryState()[HISTORY_GUARD_KEY] === guardMarker) {
      guardedHistoryEntryRef.current = true;
    } else {
      pushGuardedHistoryEntry();
    }

    const navigateAfterLeavingGuard = () => {
      const navigation = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      guardedHistoryEntryRef.current = false;
      if (!navigation) return;
      if (navigation.method === "replace") router.replace(navigation.href);
      else router.push(navigation.href);
    };

    const guardBrowserBack = () => {
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
    };

    const guardSpaNavigation = (event: MouseEvent) => {
      if (
        saveSucceededRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      const anchor =
        target instanceof Element
          ? target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        anchor.target === "_blank"
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
      const href = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
      if (guardedHistoryEntryRef.current) {
        pendingNavigationRef.current = { href, method: "push" };
        window.history.back();
      } else {
        router.push(href);
      }
    };

    window.addEventListener("popstate", guardBrowserBack);
    document.addEventListener("click", guardSpaNavigation, true);
    return () => {
      window.removeEventListener("popstate", guardBrowserBack);
      document.removeEventListener("click", guardSpaNavigation, true);
      guardedHistoryEntryRef.current = false;
    };
  }, [hasGeneratedWork, router, topic.id]);

  useEffect(() => {
    if (
      curriculumState.status !== "success" ||
      focusedCurriculumRequestRef.current === curriculumState.requestId
    ) {
      return;
    }
    focusedCurriculumRequestRef.current = curriculumState.requestId;
    curriculumHeadingRef.current?.focus();
  }, [curriculumState]);

  useEffect(() => {
    if (
      wardrobeState.status !== "success" ||
      focusedWardrobeRequestRef.current === wardrobeState.requestId
    ) {
      return;
    }
    focusedWardrobeRequestRef.current = wardrobeState.requestId;
    wardrobeHeadingRef.current?.focus();
  }, [wardrobeState]);

  const announcement = wardrobeReady
    ? `Hele planen er klar med ${wardrobeState.curriculum.curriculum.skills.length} færdigheder, ${countCurriculumExercises(wardrobeState.curriculum.curriculum)} øvelser og 16 garderobebilleder.`
    : curriculumReady
      ? `Læringsplanen er klar med ${curriculumState.curriculum.skills.length} færdigheder og ${countCurriculumExercises(curriculumState.curriculum)} øvelser.`
      : "";
  const reviewed =
    wardrobeReady && reviewedRequestId === wardrobeState.requestId;

  return (
    <article className={styles.page} aria-labelledby="curriculum-builder-title">
      <p
        className={styles.visuallyHidden}
        role="status"
        aria-atomic="true"
        aria-live="polite"
      >
        {announcement}
      </p>
      <nav className={styles.breadcrumbs} aria-label="Brødkrummer">
        <Link href="/emner">Emner</Link>
        <span aria-hidden="true">/</span>
        <Link href={buildSubjectDetailHref(topic.id)}>{topic.title}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Planlæg færdigheder</span>
      </nav>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>AI-læringsplan</p>
          <h1 id="curriculum-builder-title">
            Planlæg flere færdigheder på én gang
          </h1>
          <p>
            Vælg hvor mange færdigheder og øvelser du vil have. Du ser hele
            rækkefølgen, før AI laver ét fælles sæt garderobebelønninger, og
            intet gemmes uden din gennemgang.
          </p>
        </div>
        <Link
          className={styles.closeLink}
          href={buildSubjectDetailHref(topic.id)}
        >
          Luk planlægningen
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

      <nav
        className={styles.modeSwitch}
        aria-label="Vælg måde at tilføje færdigheder"
      >
        <Link href={buildNewSkillHref(topic.id)}>Byg én færdighed</Link>
        <Link
          aria-current="page"
          href={buildNewSkillHref(topic.id, { suggestWithAi: true })}
        >
          Planlæg flere med AI
        </Link>
      </nav>

      <section
        className={styles.startCard}
        aria-labelledby="planner-direction-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>1 · Sæt rammen</p>
            <h2 id="planner-direction-title">Hvad skal forløbet indeholde?</h2>
            <p className={styles.sectionIntro}>
              AI undgår de eksisterende færdigheder og laver præcis det antal,
              du vælger.
            </p>
          </div>
          <span className={styles.countPill}>
            {existingSkills.length} eksisterende
          </span>
        </div>

        {existingSkills.length > 0 ? (
          <div
            className={styles.existingSkills}
            aria-label="Eksisterende færdigheder"
          >
            <strong>Færdigheder, AI skal undgå</strong>
            <ul>
              {existingSkills.map((skill) => (
                <li key={skill.title}>{skill.title}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <form
          action={curriculumAction}
          className={styles.directionForm}
          onSubmit={() => setRequestId(activeRequestId)}
        >
          <input name="topicId" type="hidden" value={topic.id} />
          <input name="requestId" type="hidden" value={activeRequestId} />
          <div className={styles.plannerCounts}>
            <label htmlFor="skill-count">
              <span>Antal nye færdigheder</span>
              <select
                disabled={curriculumPending || wardrobePending}
                id="skill-count"
                name="skillCount"
                onChange={(event) => {
                  const nextSkillCount = Number(event.target.value);
                  setSkillCount(nextSkillCount);
                  if (nextSkillCount * exercisesPerSkill > 32) {
                    setExercisesPerSkill(Math.floor(32 / nextSkillCount));
                  }
                  setPlanInputsDirty(true);
                  setRequestId(nextRequestId());
                }}
                value={skillCount}
              >
                {skillCountOptions.map((count) => (
                  <option key={count} value={count}>
                    {count} færdigheder
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="exercise-count">
              <span>Øvelser i hver færdighed</span>
              <select
                disabled={curriculumPending || wardrobePending}
                id="exercise-count"
                name="exercisesPerSkill"
                onChange={(event) => {
                  setExercisesPerSkill(Number(event.target.value));
                  setPlanInputsDirty(true);
                  setRequestId(nextRequestId());
                }}
                value={exercisesPerSkill}
              >
                {exercisesPerSkillOptions.map((count) => (
                  <option
                    disabled={count * skillCount > 32}
                    key={count}
                    value={count}
                  >
                    {count} øvelser
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={styles.planSummary}>
            Planen bliver {skillCount} færdigheder med {exercisesPerSkill}{" "}
            øvelser i hver – {skillCount * exercisesPerSkill} øvelser i alt –
            plus ét fælles sæt med 16 garderobebilleder.
          </p>
          <label htmlFor="curriculum-message">
            <span>Retning til AI</span>
            <textarea
              disabled={curriculumPending || wardrobePending}
              id="curriculum-message"
              maxLength={1_000}
              name="message"
              onChange={(event) => {
                setMessage(event.target.value);
                setPlanInputsDirty(true);
                setRequestId(nextRequestId());
              }}
              required
              rows={4}
              value={message}
            />
          </label>
          <div className={styles.formActions}>
            <button
              disabled={curriculumPending || wardrobePending}
              type="submit"
            >
              {curriculumPending
                ? "Planlægger forløbet…"
                : curriculumReady
                  ? "Lav en ny læringsplan"
                  : `Planlæg ${skillCount} færdigheder`}
            </button>
            <Link href={buildNewSkillHref(topic.id)}>
              Byg én færdighed i stedet
            </Link>
          </div>
        </form>
        {curriculumState.status === "error" ? (
          <InlineError message={curriculumState.message} />
        ) : null}
        {curriculumPending ? <PlannerProgress stage="curriculum" /> : null}
      </section>

      {curriculumReady && !wardrobeReady ? (
        <CurriculumReview
          curriculum={curriculumState.curriculum}
          headingRef={curriculumHeadingRef}
        />
      ) : null}

      {curriculumReady && !wardrobeReady ? (
        <section
          className={styles.saveCard}
          aria-labelledby="wardrobe-start-title"
        >
          <div>
            <p className={styles.eyebrow}>Næste trin</p>
            <h2 id="wardrobe-start-title">Ser læringsplanen rigtig ud?</h2>
            <p>
              Lav først billederne, når rækkefølgen giver mening. Hvis planen
              skal ændres, ret retningen ovenfor og lav en ny plan. Efter
              gemning kan hver kladde redigeres enkeltvis.
            </p>
          </div>
          <form
            action={wardrobeAction}
            onSubmit={() => setWardrobeRequestId(activeWardrobeRequestId)}
          >
            <input name="topicId" type="hidden" value={topic.id} />
            <input
              name="requestId"
              type="hidden"
              value={activeWardrobeRequestId}
            />
            <input
              name="curriculumJobId"
              type="hidden"
              value={curriculumState.curriculumJobId}
            />
            <input
              name="skillCount"
              type="hidden"
              value={curriculumState.skillCount}
            />
            <input
              name="exercisesPerSkill"
              type="hidden"
              value={curriculumState.exercisesPerSkill}
            />
            <button
              disabled={curriculumPending || wardrobePending}
              type="submit"
            >
              {wardrobePending
                ? "Laver 16 billeder…"
                : "Godkend planen og lav 16 billeder"}
            </button>
          </form>
          {wardrobeState.status === "error" ? (
            <InlineError message={wardrobeState.message} />
          ) : null}
          {wardrobePending ? <PlannerProgress stage="wardrobe" /> : null}
        </section>
      ) : null}

      {wardrobeReady ? (
        <>
          <section
            className={styles.completeIntro}
            aria-labelledby="complete-curriculum-title"
          >
            <div>
              <p className={styles.eyebrow}>
                Komplet forslag · intet er gemt endnu
              </p>
              <h2
                id="complete-curriculum-title"
                ref={wardrobeHeadingRef}
                tabIndex={-1}
              >
                Hele forløbet er klar
              </h2>
              <p>
                Gennemgå færdighederne, alle øvelserne og det fælles
                garderobesæt én sidste gang.
              </p>
            </div>
            <dl>
              <div>
                <dt>Færdigheder</dt>
                <dd>{wardrobeState.curriculum.curriculum.skills.length}</dd>
              </div>
              <div>
                <dt>Øvelser</dt>
                <dd>
                  {countCurriculumExercises(
                    wardrobeState.curriculum.curriculum,
                  )}
                </dd>
              </div>
              <div>
                <dt>Billeder</dt>
                <dd>16</dd>
              </div>
            </dl>
          </section>
          <CurriculumReview curriculum={wardrobeState.curriculum.curriculum} />
          <WardrobeReview items={wardrobeState.curriculum.wardrobeItems} />

          <section
            className={styles.saveCard}
            aria-labelledby="reroll-wardrobe-title"
          >
            <div>
              <p className={styles.eyebrow}>Valgfrit</p>
              <h2 id="reroll-wardrobe-title">Vil du have andre billeder?</h2>
              <p>
                Behold læringsplanen, og lav et nyt fælles sæt med 16
                garderobebilleder. Det nuværende sæt gemmes ikke.
              </p>
            </div>
            <form
              action={wardrobeAction}
              onSubmit={() => setWardrobeRequestId(activeWardrobeRequestId)}
            >
              <input name="topicId" type="hidden" value={topic.id} />
              <input
                name="requestId"
                type="hidden"
                value={activeWardrobeRequestId}
              />
              <input
                name="curriculumJobId"
                type="hidden"
                value={curriculumState.curriculumJobId}
              />
              <input
                name="skillCount"
                type="hidden"
                value={curriculumState.skillCount}
              />
              <input
                name="exercisesPerSkill"
                type="hidden"
                value={curriculumState.exercisesPerSkill}
              />
              <button
                disabled={curriculumPending || wardrobePending}
                type="submit"
              >
                {wardrobePending
                  ? "Laver et nyt garderobesæt…"
                  : "Lav 16 nye billeder"}
              </button>
            </form>
            {wardrobePending ? <PlannerProgress stage="wardrobe" /> : null}
          </section>

          <section
            className={styles.saveCard}
            aria-labelledby="save-curriculum-title"
          >
            <div>
              <p className={styles.eyebrow}>4 · Gem hele planen</p>
              <h2 id="save-curriculum-title">Gem alt samlet</h2>
              <p>
                Alle færdigheder, øvelser og billeder gemmes som kladder på én
                gang. Hvis noget går galt, bliver der ikke gemt en halv plan.
              </p>
            </div>
            <form action={saveAction}>
              <input name="topicId" type="hidden" value={topic.id} />
              <input
                name="requestId"
                type="hidden"
                value={wardrobeState.requestId}
              />
              <input
                name="expectedUpdatedAt"
                type="hidden"
                value={topic.updatedAt}
              />
              <input
                name="curriculumJobId"
                type="hidden"
                value={wardrobeState.curriculum.curriculumJobId}
              />
              <input
                name="wardrobePlanJobId"
                type="hidden"
                value={wardrobeState.curriculum.wardrobePlanJobId}
              />
              <input
                name="wardrobeImageJobId"
                type="hidden"
                value={wardrobeState.curriculum.imageJobId}
              />
              <label className={styles.reviewCheck}>
                <input
                  checked={reviewed}
                  name="reviewed"
                  onChange={(event) =>
                    setReviewedRequestId(
                      event.target.checked ? wardrobeState.requestId : null,
                    )
                  }
                  type="checkbox"
                  value="yes"
                />
                <span>
                  Jeg har gennemgået alle børnetekster, øvelsesrækkefølger og de
                  16 fælles billeder.
                </span>
              </label>
              <button
                disabled={!reviewed || savePending || wardrobePending}
                type="submit"
              >
                {savePending
                  ? "Gemmer hele planen…"
                  : "Gem hele planen som kladder"}
              </button>
            </form>
            {saveState.status === "error" ? (
              <InlineError message={saveState.message} />
            ) : null}
            {saveState.status === "success" ? (
              <div className={styles.successCard} role="status">
                <strong>Hele planen er gemt</strong>
                <p>
                  {saveState.goalIds.length} færdigheder,{" "}
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
