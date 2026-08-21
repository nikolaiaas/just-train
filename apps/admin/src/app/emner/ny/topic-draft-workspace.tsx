"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  askAdminContentAssistant,
  createAdminExerciseDraft,
  createAdminGoalDraft,
  createAdminTopicDraft,
  initialAssistantState,
  initialCreateExerciseState,
  initialCreateGoalState,
  initialCreateTopicState,
  type AssistantMode,
  type AssistantSuggestion,
  type AssistantWardrobeItem,
  type CreateExerciseState,
  type CreateGoalState,
  type CreateTopicState,
} from "./actions";
import styles from "./page.module.css";
import {
  getResumeStartingStep,
  type ResumableTopicDraft,
} from "./resume-topic-draft";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type EditorStep = "topic" | "goal" | "exercise" | "wardrobe" | "review";

type TopicDraftWorkspaceProps = {
  assistantRequestId: string;
  exerciseRequestId: string;
  goalRequestId: string;
  initialDraft: ResumableTopicDraft | null;
  profileName: string;
  topicRequestId: string;
};

const steps: Array<{ key: EditorStep; label: string; number: string }> = [
  { key: "topic", label: "Grundlag", number: "1" },
  { key: "goal", label: "Mål", number: "2" },
  { key: "exercise", label: "Deløvelser", number: "3" },
  { key: "wardrobe", label: "Garderobe", number: "4" },
  { key: "review", label: "Gennemgang", number: "5" },
];

const assistantLabels: Record<AssistantMode, string> = {
  topic: "Emne",
  goal: "Mål",
  exercise: "Deløvelse",
  wardrobe: "Garderobe",
};

const assistantPlaceholders: Record<AssistantMode, string> = {
  topic: "Fx: Lav et emne om balance og bevægelse",
  goal: "Fx: Hjælp mig med et enkelt første mål",
  exercise: "Fx: Lav en tryg deløvelse, barnet kan forstå",
  wardrobe: "Fx: Foreslå fem sjove ting til garderoben",
};

const difficultyLabels = {
  beginner: "Begynder",
  intermediate: "Øvet",
  advanced: "Avanceret",
} as const;

const measurementLabels = {
  completion: "Gennemført",
  repetitions: "Gentagelser",
  duration: "Sekunder",
} as const;

const categoryLabels: Record<AssistantWardrobeItem["category"], string> = {
  clothing: "Tøj",
  equipment: "Udstyr",
  effect: "Effekt",
};

const rarityLabels: Record<AssistantWardrobeItem["rarity"], string> = {
  common: "Almindelig",
  rare: "Sjælden",
  special: "Særlig",
};

function normalizeText(value: string, maximum: number): string {
  return Array.from(value.replace(/\r\n?/gu, "\n").trim())
    .slice(0, maximum)
    .join("");
}

function parseOptionalInteger(value: string, maximum: number): number | null {
  const normalized = value.trim();
  if (!/^\d+$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : null;
}

function parseEquipment(value: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const rawItem of value.split(/[\n,;]/gu)) {
    const item = normalizeText(rawItem.replace(/\s+/gu, " "), 80);
    const key = item.toLocaleLowerCase("da-DK");

    if (item && !seen.has(key)) {
      seen.add(key);
      result.push(item);
    }

    if (result.length === 12) break;
  }

  return result;
}

function compactPreview(parts: Array<string | null>): string {
  const content = parts
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const characters = Array.from(content);
  return characters.length > 280
    ? `${characters.slice(0, 277).join("")}…`
    : content;
}

function SparkleIcon() {
  return (
    <svg
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

function AppMark() {
  return (
    <span className={styles.appMark} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="m12 2.75 2.57 5.2 5.74.84-4.15 4.04.98 5.72L12 15.84l-5.14 2.71.98-5.72-4.15-4.04 5.74-.84L12 2.75Z" />
      </svg>
    </span>
  );
}

function WardrobeSuggestions({ items }: { items: AssistantWardrobeItem[] }) {
  if (items.length === 0) return null;

  return (
    <section
      className={styles.wardrobeSuggestions}
      aria-labelledby="wardrobe-title"
    >
      <header>
        <div>
          <p className={styles.eyebrow}>Syntetiske eksempler</p>
          <h3 id="wardrobe-title">Idéer til garderoben</h3>
        </div>
        <span>{items.length} forslag</span>
      </header>
      <div className={styles.wardrobeGrid}>
        {items.map((item, index) => (
          <article
            className={styles.wardrobeCard}
            key={`${item.name}-${index}`}
          >
            <span className={styles.wardrobeIcon} aria-hidden="true">
              {item.icon}
            </span>
            <strong>{item.name}</strong>
            <small>
              {categoryLabels[item.category]} · {rarityLabels[item.rarity]}
            </small>
            <p>
              {item.points > 0
                ? `${item.points} point`
                : item.unlockRule || "Oplåsningsregel foreslås senere"}
            </p>
            <span className={styles.exampleBadge}>Ikke gemt</span>
          </article>
        ))}
      </div>
      <p className={styles.wardrobeDisclaimer}>
        Forslagene er kun eksempler i kladden. De kan først gemmes, når den
        særskilte garderobemodel og menneskelige godkendelse er på plads.
      </p>
    </section>
  );
}

function SuggestionCard({
  before,
  after,
  suggestion,
  onApply,
}: {
  before: string;
  after: string;
  suggestion: AssistantSuggestion | null;
  onApply: () => void;
}) {
  if (!suggestion) return null;

  return (
    <aside className={styles.suggestionCard}>
      <div className={styles.suggestionBody}>
        <div className={styles.suggestionHeading}>
          <span aria-hidden="true">✦</span>
          <strong>
            {suggestion.ready ? "AI-forslag klar" : "AI har et spørgsmål"}
          </strong>
        </div>
        <div className={styles.suggestionComparison}>
          <div>
            <small>Før</small>
            <p>{before}</p>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <small>Forslag</small>
            <p>{after}</p>
          </div>
        </div>
        <p className={styles.suggestionReason}>
          <strong>Hvorfor:</strong> {suggestion.reason}
        </p>
      </div>
      {suggestion.ready ? (
        <button type="button" onClick={onApply}>
          Brug forslaget
        </button>
      ) : null}
    </aside>
  );
}

export function TopicDraftWorkspace({
  assistantRequestId,
  exerciseRequestId,
  goalRequestId,
  initialDraft,
  profileName,
  topicRequestId,
}: TopicDraftWorkspaceProps) {
  const resumedTopicState: CreateTopicState = initialDraft
    ? {
        status: "success",
        message: "Emnekladden er hentet. Gemte felter er låst.",
        topicId: initialDraft.topic.id,
      }
    : initialCreateTopicState;
  const resumedGoalState: CreateGoalState = initialDraft?.goal
    ? {
        status: "success",
        message: "Målkladden er hentet. Gemte felter er låst.",
        goalId: initialDraft.goal.id,
      }
    : initialCreateGoalState;
  const resumedExerciseState: CreateExerciseState = initialDraft?.exercise
    ? {
        status: "success",
        message: "Deløvelsen er hentet. Gemte felter er låst.",
        exerciseId: initialDraft.exercise.id,
      }
    : initialCreateExerciseState;

  const [topicState, topicAction, topicPending] = useActionState(
    createAdminTopicDraft,
    resumedTopicState,
  );
  const [goalState, goalAction, goalPending] = useActionState(
    createAdminGoalDraft,
    resumedGoalState,
  );
  const [exerciseState, exerciseAction, exercisePending] = useActionState(
    createAdminExerciseDraft,
    resumedExerciseState,
  );
  const [assistantState, assistantAction, assistantPending] = useActionState(
    askAdminContentAssistant,
    initialAssistantState,
  );

  const startingStep = getResumeStartingStep(initialDraft);
  const [activeStep, setActiveStep] = useState<EditorStep>(startingStep);
  const [title, setTitle] = useState(initialDraft?.topic.title ?? "");
  const [description, setDescription] = useState(
    initialDraft?.topic.description ?? "",
  );
  const [icon, setIcon] = useState(initialDraft?.topic.icon ?? "✨");
  const [accentColor, setAccentColor] = useState(
    initialDraft?.topic.accentColor ?? "#53C987",
  );

  const [goalTitle, setGoalTitle] = useState(initialDraft?.goal?.title ?? "");
  const [goalSummary, setGoalSummary] = useState(
    initialDraft?.goal?.summary ?? "",
  );
  const [goalDifficulty, setGoalDifficulty] = useState<
    "beginner" | "intermediate" | "advanced"
  >(initialDraft?.goal?.difficulty ?? "beginner");
  const [goalMinutes, setGoalMinutes] = useState(
    initialDraft?.goal?.estimatedMinutes?.toString() ?? "",
  );
  const [goalEquipment, setGoalEquipment] = useState(
    initialDraft?.goal?.equipment.join("\n") ?? "",
  );

  const [exerciseTitle, setExerciseTitle] = useState(
    initialDraft?.exercise?.title ?? "",
  );
  const [exerciseInstructions, setExerciseInstructions] = useState(
    initialDraft?.exercise?.instructions ?? "",
  );
  const [exerciseMeasurement, setExerciseMeasurement] = useState<
    "completion" | "repetitions" | "duration"
  >(initialDraft?.exercise?.measurement ?? "completion");
  const [exerciseTarget, setExerciseTarget] = useState(
    initialDraft?.exercise?.targetValue?.toString() ?? "",
  );
  const [exerciseMinutes, setExerciseMinutes] = useState(
    initialDraft?.exercise?.estimatedMinutes?.toString() ?? "",
  );
  const [exerciseEquipment, setExerciseEquipment] = useState(
    initialDraft?.exercise?.equipment.join("\n") ?? "",
  );
  const [exerciseSafety, setExerciseSafety] = useState(
    initialDraft?.exercise?.safetyNotes ?? "",
  );

  const [assistantMode, setAssistantMode] =
    useState<AssistantMode>(startingStep);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [nextAssistantRequestId, setNextAssistantRequestId] =
    useState(assistantRequestId);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Jeg kan hjælpe med emnet, det første mål, en deløvelse og syntetiske garderobeeksempler. Du vælger altid selv, om et forslag skal bruges.",
    },
  ]);
  const [suggestion, setSuggestion] = useState<AssistantSuggestion | null>(
    null,
  );
  const [wardrobeItems, setWardrobeItems] = useState<AssistantWardrobeItem[]>(
    [],
  );

  const handledAssistantRequest = useRef<string | null>(null);
  const submittedAssistantMessage = useRef<{
    context: string;
    history: string;
    message: string;
    mode: AssistantMode;
    requestId: string;
  } | null>(null);
  const handledTopicId = useRef<string | null>(initialDraft?.topic.id ?? null);
  const handledGoalId = useRef<string | null>(initialDraft?.goal?.id ?? null);
  const handledExerciseId = useRef<string | null>(
    initialDraft?.exercise?.id ?? null,
  );
  const assistantInputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLSpanElement>(null);

  const topicCreated = topicState.status === "success";
  const goalCreated = goalState.status === "success";
  const exerciseCreated = exerciseState.status === "success";
  const topicErrors =
    topicState.status === "invalid" ? topicState.fieldErrors : {};
  const goalErrors =
    goalState.status === "invalid" ? goalState.fieldErrors : {};
  const exerciseErrors =
    exerciseState.status === "invalid" ? exerciseState.fieldErrors : {};

  useEffect(() => {
    if (
      topicState.status === "success" &&
      topicState.topicId !== handledTopicId.current
    ) {
      handledTopicId.current = topicState.topicId;
      const url = new URL(window.location.href);
      url.searchParams.set("topic", topicState.topicId);
      window.history.replaceState(
        null,
        "",
        `${url.pathname}?${url.searchParams.toString()}${url.hash}`,
      );
      setActiveStep("goal");
      setAssistantMode("goal");
      setAssistantMessage("");
      setNextAssistantRequestId(window.crypto.randomUUID());
      submittedAssistantMessage.current = null;
      setSuggestion(null);
    }
  }, [topicState]);

  useEffect(() => {
    if (
      goalState.status === "success" &&
      goalState.goalId !== handledGoalId.current
    ) {
      handledGoalId.current = goalState.goalId;
      setActiveStep("exercise");
      setAssistantMode("exercise");
      setAssistantMessage("");
      setNextAssistantRequestId(window.crypto.randomUUID());
      submittedAssistantMessage.current = null;
      setSuggestion(null);
    }
  }, [goalState]);

  useEffect(() => {
    if (
      exerciseState.status === "success" &&
      exerciseState.exerciseId !== handledExerciseId.current
    ) {
      handledExerciseId.current = exerciseState.exerciseId;
      setActiveStep("wardrobe");
      setAssistantMode("wardrobe");
      setAssistantMessage("");
      setNextAssistantRequestId(window.crypto.randomUUID());
      submittedAssistantMessage.current = null;
      setSuggestion(null);
    }
  }, [exerciseState]);

  useEffect(() => {
    if (
      assistantState.status === "idle" ||
      !assistantState.requestId ||
      assistantState.requestId === handledAssistantRequest.current
    ) {
      return;
    }

    const response = assistantState;
    const timer = window.setTimeout(() => {
      handledAssistantRequest.current = response.requestId;

      if (response.requestId !== nextAssistantRequestId) return;

      if (response.status !== "success") {
        if (response.requestRecovery === "start_new") {
          submittedAssistantMessage.current = null;
          setNextAssistantRequestId(window.crypto.randomUUID());
        }

        return;
      }

      const submitted = submittedAssistantMessage.current;

      if (!submitted || submitted.requestId !== response.requestId) return;

      submittedAssistantMessage.current = null;
      setNextAssistantRequestId(window.crypto.randomUUID());
      setAssistantMessage("");
      setSuggestion(null);

      setMessages((current) => [
        ...current,
        {
          id: `${response.requestId}-user`,
          role: "user",
          content: submitted.message,
        },
        {
          id: `${response.requestId}-assistant`,
          role: "assistant",
          content: response.reply,
        },
      ]);
      setSuggestion(response.suggestion);
      if (response.items.length > 0) {
        setWardrobeItems(response.items);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [assistantState, nextAssistantRequestId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [assistantPending, messages]);

  const serializedHistory = useMemo(
    () =>
      JSON.stringify(
        messages.slice(-6).map(({ role, content }) => ({ role, content })),
      ),
    [messages],
  );

  const serializedContext = useMemo(
    () =>
      JSON.stringify({
        topic: {
          title: normalizeText(title, 100),
          description: normalizeText(description, 500),
          icon: normalizeText(icon, 16),
          accentColor: accentColor.toUpperCase(),
        },
        goal: {
          title: normalizeText(goalTitle, 120),
          summary: normalizeText(goalSummary, 1_000),
          difficulty: goalDifficulty,
          estimatedMinutes: parseOptionalInteger(goalMinutes, 180),
          equipment: parseEquipment(goalEquipment),
        },
        exercise: {
          title: normalizeText(exerciseTitle, 120),
          instructions: normalizeText(exerciseInstructions, 1_500),
          measurement: exerciseMeasurement,
          targetValue:
            exerciseMeasurement === "completion"
              ? null
              : parseOptionalInteger(
                  exerciseTarget,
                  exerciseMeasurement === "duration" ? 86_400 : 10_000,
                ),
          recommendedMinutes: parseOptionalInteger(exerciseMinutes, 180),
          equipment: parseEquipment(exerciseEquipment),
          safetyNote: normalizeText(exerciseSafety, 1_000),
        },
      }),
    [
      accentColor,
      description,
      exerciseEquipment,
      exerciseInstructions,
      exerciseMeasurement,
      exerciseMinutes,
      exerciseSafety,
      exerciseTarget,
      exerciseTitle,
      goalDifficulty,
      goalEquipment,
      goalMinutes,
      goalSummary,
      goalTitle,
      icon,
      title,
    ],
  );

  useEffect(() => {
    const submitted = submittedAssistantMessage.current;

    if (
      !submitted ||
      assistantPending ||
      submitted.requestId !== nextAssistantRequestId
    ) {
      return;
    }

    if (
      submitted.message !== assistantMessage.trim() ||
      submitted.mode !== assistantMode ||
      submitted.context !== serializedContext ||
      submitted.history !== serializedHistory
    ) {
      submittedAssistantMessage.current = null;
      handledAssistantRequest.current = null;
      setNextAssistantRequestId(window.crypto.randomUUID());
    }
  }, [
    assistantMessage,
    assistantMode,
    assistantPending,
    nextAssistantRequestId,
    serializedContext,
    serializedHistory,
  ]);

  function describeCurrentSuggestion(current: AssistantSuggestion): string {
    if (current.kind === "topic") {
      return compactPreview([
        title.trim() || "Uden navn",
        description.trim() || "Ingen beskrivelse",
        icon.trim() || "Intet ikon",
        accentColor.toUpperCase(),
      ]);
    }

    if (current.kind === "goal") {
      return compactPreview([
        goalTitle.trim() || "Uden navn",
        goalSummary.trim() || "Ingen forklaring",
        difficultyLabels[goalDifficulty],
        goalMinutes ? `${goalMinutes} min.` : "Ingen tid",
        goalEquipment.trim() || "Intet udstyr",
      ]);
    }

    return compactPreview([
      exerciseTitle.trim() || "Uden navn",
      exerciseInstructions.trim() || "Ingen instruktion",
      measurementLabels[exerciseMeasurement],
      exerciseTarget || "Intet talmål",
      exerciseMinutes ? `${exerciseMinutes} min.` : "Ingen tid",
      exerciseEquipment.trim() || "Intet udstyr",
      exerciseSafety.trim() || "Ingen sikkerhedstekst",
    ]);
  }

  function describeProposedSuggestion(proposal: AssistantSuggestion): string {
    if (proposal.kind === "topic") {
      return compactPreview([
        proposal.title || "Uden navn",
        proposal.description || "Ingen beskrivelse",
        proposal.icon || "Intet ikon",
        proposal.accentColor || "Ingen farve",
      ]);
    }

    if (proposal.kind === "goal") {
      return compactPreview([
        proposal.title || "Uden navn",
        proposal.summary || "Ingen forklaring",
        difficultyLabels[proposal.difficulty],
        proposal.estimatedMinutes
          ? `${proposal.estimatedMinutes} min.`
          : "Ingen tid",
        proposal.equipment.join(", ") || "Intet udstyr",
      ]);
    }

    return compactPreview([
      proposal.title || "Uden navn",
      proposal.instructions || "Ingen instruktion",
      measurementLabels[proposal.measurement],
      proposal.targetValue?.toString() ?? "Intet talmål",
      proposal.recommendedMinutes
        ? `${proposal.recommendedMinutes} min.`
        : "Ingen tid",
      proposal.equipment.join(", ") || "Intet udstyr",
      proposal.safetyNote || "Ingen sikkerhedstekst",
    ]);
  }

  function stepIsEnabled(step: EditorStep): boolean {
    if (step === "topic") return true;
    if (step === "goal") return topicCreated;
    if (step === "exercise") return goalCreated;
    return exerciseCreated;
  }

  function openStep(step: EditorStep) {
    if (!stepIsEnabled(step)) return;
    setActiveStep(step);
    setSuggestion(null);
    if (step !== "review" && assistantModeIsEnabled(step)) {
      setAssistantMode(step);
    }
  }

  function applySuggestion() {
    if (
      !suggestion?.ready ||
      suggestion.kind !== activeStep ||
      !assistantModeIsEnabled(suggestion.kind)
    ) {
      return;
    }

    if (suggestion.kind === "topic") {
      setTitle(suggestion.title);
      setDescription(suggestion.description);
      setIcon(suggestion.icon || "✨");
      setAccentColor(suggestion.accentColor || "#53C987");
    } else if (suggestion.kind === "goal") {
      setGoalTitle(suggestion.title);
      setGoalSummary(suggestion.summary);
      setGoalDifficulty(suggestion.difficulty);
      setGoalMinutes(suggestion.estimatedMinutes?.toString() ?? "");
      setGoalEquipment(suggestion.equipment.join("\n"));
    } else {
      setExerciseTitle(suggestion.title);
      setExerciseInstructions(suggestion.instructions);
      setExerciseMeasurement(suggestion.measurement);
      setExerciseTarget(suggestion.targetValue?.toString() ?? "");
      setExerciseMinutes(suggestion.recommendedMinutes?.toString() ?? "");
      setExerciseEquipment(suggestion.equipment.join("\n"));
      setExerciseSafety(suggestion.safetyNote);
    }

    setSuggestion(null);
  }

  function handleAssistantSubmit() {
    const message = assistantMessage.trim();
    if (
      !message ||
      activeStep !== assistantMode ||
      !assistantModeIsEnabled(assistantMode)
    ) {
      return;
    }

    setSuggestion(null);
    if (assistantMode === "wardrobe") setWardrobeItems([]);
    handledAssistantRequest.current = null;
    submittedAssistantMessage.current = {
      context: serializedContext,
      history: serializedHistory,
      message,
      mode: assistantMode,
      requestId: nextAssistantRequestId,
    };
  }

  function selectAssistantMode(mode: AssistantMode) {
    if (assistantPending || !assistantModeIsEnabled(mode)) return;
    setAssistantMode(mode);
    setSuggestion(null);
    setActiveStep(mode);
  }

  function openWardrobeAssistant() {
    selectAssistantMode("wardrobe");
    window.requestAnimationFrame(() => assistantInputRef.current?.focus());
  }

  function assistantModeIsEnabled(mode: AssistantMode): boolean {
    if (mode === "topic") return !topicCreated;
    if (mode === "goal") return topicCreated && !goalCreated;
    if (mode === "exercise") return goalCreated && !exerciseCreated;
    return exerciseCreated;
  }

  const visibleSuggestion =
    suggestion?.kind === assistantMode &&
    suggestion.kind === activeStep &&
    assistantModeIsEnabled(suggestion.kind)
      ? suggestion
      : null;
  const assistantInteractionEnabled =
    activeStep === assistantMode && assistantModeIsEnabled(assistantMode);
  const suggestionBefore = visibleSuggestion
    ? describeCurrentSuggestion(visibleSuggestion)
    : "";
  const suggestionAfter = visibleSuggestion
    ? describeProposedSuggestion(visibleSuggestion)
    : "";
  const currentStatus =
    activeStep === "topic"
      ? topicCreated
      : activeStep === "goal"
        ? goalCreated
        : activeStep === "exercise"
          ? exerciseCreated
          : false;

  return (
    <main className={styles.viewport}>
      <section className={styles.appShell} aria-label="Opret nyt emne">
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <AppMark />
            <span>Bare Træn</span>
            <span className={styles.brandDivider} aria-hidden="true" />
            <span>Administration</span>
          </div>
          <div className={styles.topbarActions}>
            <span className={styles.draftStatus}>
              <span aria-hidden="true" />
              {currentStatus ? "Trin gemt" : "Kladde"}
            </span>
            <span className={styles.profileName}>{profileName}</span>
          </div>
        </header>

        <div className={styles.pageBody}>
          <div className={styles.pageToolbar}>
            <div>
              <p className={styles.eyebrow}>
                {initialDraft ? "Fortsæt kladde" : "Nyt emne"}
              </p>
              <h1>
                {initialDraft
                  ? `Fortsæt ${initialDraft.topic.title}`
                  : "Skab et forløb sammen med AI"}
              </h1>
              <p>
                Opret emne, mål og deløvelse som kladder. AI hjælper i hvert
                trin, men ændrer aldrig felter eller publicerer uden dit valg.
              </p>
            </div>
            <Link className={styles.secondaryButton} href="/">
              Luk kladden
            </Link>
          </div>

          <nav className={styles.steps} aria-label="Emnekladdens trin">
            {steps.map((step) => {
              const enabled = stepIsEnabled(step.key);
              return (
                <button
                  type="button"
                  className={
                    activeStep === step.key ? styles.stepActive : styles.step
                  }
                  aria-current={activeStep === step.key ? "step" : undefined}
                  disabled={!enabled}
                  onClick={() => openStep(step.key)}
                  key={step.key}
                >
                  <span>{step.number}</span>
                  {step.label}
                </button>
              );
            })}
          </nav>

          <div className={styles.workspace}>
            <section
              className={styles.assistantPanel}
              aria-labelledby="assistant-title"
            >
              <header className={styles.panelHeader}>
                <div>
                  <span className={styles.aiMark} aria-hidden="true">
                    <SparkleIcon />
                  </span>
                  <div>
                    <h2 id="assistant-title">AI-assistent</h2>
                    <p>Kontekst fra kladden · forslag kræver dit valg</p>
                  </div>
                </div>
                <span className={styles.readyBadge}>
                  <span aria-hidden="true" />
                  {assistantPending ? "Arbejder" : "Klar"}
                </span>
              </header>

              <div
                className={styles.modePicker}
                role="group"
                aria-label="AI-hjælp til redigeringstrin"
              >
                {(Object.keys(assistantLabels) as AssistantMode[]).map(
                  (mode) => (
                    <button
                      type="button"
                      aria-pressed={assistantMode === mode}
                      disabled={
                        assistantPending || !assistantModeIsEnabled(mode)
                      }
                      onClick={() => selectAssistantMode(mode)}
                      key={mode}
                    >
                      {assistantLabels[mode]}
                    </button>
                  ),
                )}
              </div>

              <div className={styles.contextNote}>
                {assistantInteractionEnabled ? (
                  <>
                    Hjælper lige nu med:{" "}
                    <strong>{assistantLabels[assistantMode]}</strong>
                  </>
                ) : (
                  "Dette trin er allerede gemt. Åbn det første ulåste trin for at bruge AI."
                )}
              </div>

              <div
                className={styles.chat}
                role="log"
                aria-live="polite"
                aria-label="Samtale med AI-assistenten"
              >
                {messages.map((message) => (
                  <p
                    className={
                      message.role === "user"
                        ? styles.userMessage
                        : styles.assistantMessage
                    }
                    key={message.id}
                  >
                    {message.content}
                  </p>
                ))}
                {assistantPending ? (
                  <p className={styles.thinkingMessage} role="status">
                    <span aria-hidden="true">✦</span> Udarbejder et forslag…
                  </p>
                ) : null}
                <span ref={chatEndRef} aria-hidden="true" />
              </div>

              <form
                action={assistantAction}
                className={styles.chatForm}
                onSubmit={handleAssistantSubmit}
              >
                <input type="hidden" name="mode" value={assistantMode} />
                <input
                  type="hidden"
                  name="requestId"
                  value={nextAssistantRequestId}
                />
                <input type="hidden" name="history" value={serializedHistory} />
                <input type="hidden" name="context" value={serializedContext} />
                <label>
                  <span className={styles.visuallyHidden}>Besked til AI</span>
                  <textarea
                    ref={assistantInputRef}
                    name="message"
                    rows={2}
                    maxLength={1000}
                    required
                    value={assistantMessage}
                    disabled={assistantPending || !assistantInteractionEnabled}
                    onChange={(event) =>
                      setAssistantMessage(event.target.value)
                    }
                    placeholder={assistantPlaceholders[assistantMode]}
                  />
                </label>
                <button
                  type="submit"
                  disabled={
                    assistantPending ||
                    !assistantInteractionEnabled ||
                    !assistantMessage.trim()
                  }
                  aria-label="Send besked til AI"
                >
                  Send
                </button>
              </form>
              {assistantState.status === "error" ? (
                <p className={styles.assistantError} role="alert">
                  {assistantState.message}
                </p>
              ) : null}
            </section>

            <section
              className={styles.draftPanel}
              aria-labelledby="draft-title"
            >
              <header className={styles.panelHeader}>
                <div>
                  <span className={styles.topicPreview} aria-hidden="true">
                    {activeStep === "topic"
                      ? icon || "✨"
                      : activeStep === "goal"
                        ? "◎"
                        : activeStep === "exercise"
                          ? "↗"
                          : activeStep === "wardrobe"
                            ? "🎒"
                            : "✓"}
                  </span>
                  <div>
                    <p className={styles.eyebrow}>Redigerbar kladde</p>
                    <h2 id="draft-title">
                      {activeStep === "topic"
                        ? title || "Emnets grundlag"
                        : activeStep === "goal"
                          ? goalTitle || "Første mål"
                          : activeStep === "exercise"
                            ? exerciseTitle || "Første deløvelse"
                            : activeStep === "wardrobe"
                              ? "Garderobeeksempler"
                              : "Gennemgang"}
                    </h2>
                  </div>
                </div>
                <span className={styles.reviewBadge}>Ikke publiceret</span>
              </header>

              {activeStep !== "wardrobe" && activeStep !== "review" ? (
                <SuggestionCard
                  before={suggestionBefore}
                  after={suggestionAfter}
                  suggestion={visibleSuggestion}
                  onApply={applySuggestion}
                />
              ) : null}

              {activeStep === "topic" ? (
                <form
                  action={topicAction}
                  className={styles.draftForm}
                  noValidate
                >
                  <input
                    type="hidden"
                    name="requestId"
                    value={topicRequestId}
                  />
                  <div className={styles.fieldGrid}>
                    <label className={styles.iconField}>
                      <span>Ikon</span>
                      <input
                        name="icon"
                        maxLength={16}
                        value={icon}
                        disabled={topicPending || topicCreated}
                        aria-invalid={Boolean(topicErrors.icon)}
                        onChange={(event) => setIcon(event.target.value)}
                      />
                      {topicErrors.icon ? (
                        <small>{topicErrors.icon}</small>
                      ) : null}
                    </label>

                    <label className={styles.titleField}>
                      <span>Navn på emnet</span>
                      <input
                        name="title"
                        maxLength={100}
                        required
                        value={title}
                        disabled={topicPending || topicCreated}
                        aria-invalid={Boolean(topicErrors.title)}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Fx Fodbold eller Lær at male"
                      />
                      {topicErrors.title ? (
                        <small>{topicErrors.title}</small>
                      ) : null}
                    </label>

                    <label className={styles.descriptionField}>
                      <span>Kort beskrivelse</span>
                      <textarea
                        name="description"
                        rows={5}
                        maxLength={500}
                        value={description}
                        disabled={topicPending || topicCreated}
                        aria-invalid={Boolean(topicErrors.description)}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Hvad skal barnet opleve og lære i dette emne?"
                      />
                      <span className={styles.fieldMeta}>
                        <span>
                          {topicErrors.description ??
                            "Beskriv emnet i et enkelt, børnevenligt sprog."}
                        </span>
                        <span>{Array.from(description).length} / 500</span>
                      </span>
                    </label>

                    <label className={styles.colorField}>
                      <span>Emnefarve</span>
                      <span>
                        <input
                          name="accentColor"
                          type="color"
                          value={accentColor}
                          disabled={topicPending || topicCreated}
                          aria-invalid={Boolean(topicErrors.accentColor)}
                          onChange={(event) =>
                            setAccentColor(event.target.value)
                          }
                        />
                        <code>{accentColor.toUpperCase()}</code>
                      </span>
                      {topicErrors.accentColor ? (
                        <small>{topicErrors.accentColor}</small>
                      ) : null}
                    </label>
                  </div>

                  <div className={styles.draftFooter}>
                    <p
                      className={
                        topicState.status === "success"
                          ? styles.successMessage
                          : topicState.status === "idle"
                            ? styles.idleMessage
                            : styles.errorMessage
                      }
                      aria-live="polite"
                    >
                      {topicState.status === "idle"
                        ? "Emnet gemmes som kladde. Derefter åbner det første mål."
                        : topicState.message}
                    </p>
                    {topicCreated ? (
                      <button
                        className={styles.primaryButton}
                        type="button"
                        onClick={() => openStep("goal")}
                      >
                        Fortsæt til mål
                      </button>
                    ) : (
                      <button
                        className={styles.primaryButton}
                        type="submit"
                        disabled={topicPending || title.trim().length === 0}
                      >
                        {topicPending ? "Gemmer…" : "Gem emnekladde"}
                      </button>
                    )}
                  </div>
                </form>
              ) : null}

              {activeStep === "goal" && topicState.status === "success" ? (
                <form
                  action={goalAction}
                  className={styles.draftForm}
                  noValidate
                >
                  <input type="hidden" name="requestId" value={goalRequestId} />
                  <input
                    type="hidden"
                    name="topicId"
                    value={topicState.topicId}
                  />
                  <input type="hidden" name="heroMediaUrl" value="" />
                  <input
                    type="hidden"
                    name="sortOrder"
                    value={initialDraft?.nextGoalSortOrder ?? 0}
                  />

                  <div className={styles.formGrid}>
                    <label className={styles.fullField}>
                      <span>Navn på målet</span>
                      <input
                        name="title"
                        maxLength={120}
                        required
                        value={goalTitle}
                        disabled={goalPending || goalCreated}
                        aria-invalid={Boolean(goalErrors.title)}
                        onChange={(event) => setGoalTitle(event.target.value)}
                        placeholder="Fx Styr bolden tæt på kroppen"
                      />
                      {goalErrors.title ? (
                        <small>{goalErrors.title}</small>
                      ) : null}
                    </label>

                    <label className={styles.fullField}>
                      <span>Hvad skal barnet lære?</span>
                      <textarea
                        name="summary"
                        rows={4}
                        maxLength={1000}
                        value={goalSummary}
                        disabled={goalPending || goalCreated}
                        aria-invalid={Boolean(goalErrors.summary)}
                        onChange={(event) => setGoalSummary(event.target.value)}
                        placeholder="Beskriv et tydeligt og realistisk mål."
                      />
                      {goalErrors.summary ? (
                        <small>{goalErrors.summary}</small>
                      ) : null}
                    </label>

                    <label>
                      <span>Sværhedsgrad</span>
                      <select
                        name="difficulty"
                        value={goalDifficulty}
                        disabled={goalPending || goalCreated}
                        aria-invalid={Boolean(goalErrors.difficulty)}
                        onChange={(event) =>
                          setGoalDifficulty(
                            event.target.value as typeof goalDifficulty,
                          )
                        }
                      >
                        <option value="beginner">Begynder</option>
                        <option value="intermediate">Øvet</option>
                        <option value="advanced">Avanceret</option>
                      </select>
                      {goalErrors.difficulty ? (
                        <small>{goalErrors.difficulty}</small>
                      ) : null}
                    </label>

                    <label>
                      <span>Anbefalet tid i minutter</span>
                      <input
                        name="estimatedMinutes"
                        type="number"
                        min="1"
                        max="180"
                        inputMode="numeric"
                        value={goalMinutes}
                        disabled={goalPending || goalCreated}
                        aria-invalid={Boolean(goalErrors.estimatedMinutes)}
                        onChange={(event) => setGoalMinutes(event.target.value)}
                        placeholder="15"
                      />
                      {goalErrors.estimatedMinutes ? (
                        <small>{goalErrors.estimatedMinutes}</small>
                      ) : null}
                    </label>

                    <label className={styles.fullField}>
                      <span>Udstyr</span>
                      <textarea
                        name="equipment"
                        rows={3}
                        value={goalEquipment}
                        disabled={goalPending || goalCreated}
                        aria-invalid={Boolean(goalErrors.equipment)}
                        onChange={(event) =>
                          setGoalEquipment(event.target.value)
                        }
                        placeholder={"Én ting pr. linje, fx:\nBold\n4 kegler"}
                      />
                      {goalErrors.equipment ? (
                        <small>{goalErrors.equipment}</small>
                      ) : (
                        <small className={styles.helpText}>
                          Brug almindeligt, brandfrit udstyr. Feltet må gerne
                          være tomt.
                        </small>
                      )}
                    </label>
                  </div>

                  <div className={styles.draftFooter}>
                    <p
                      className={
                        goalState.status === "success"
                          ? styles.successMessage
                          : goalState.status === "idle"
                            ? styles.idleMessage
                            : styles.errorMessage
                      }
                      aria-live="polite"
                    >
                      {goalState.status === "idle"
                        ? "Målet gemmes under emnet som en upubliceret kladde."
                        : goalState.message}
                    </p>
                    {goalCreated ? (
                      <button
                        className={styles.primaryButton}
                        type="button"
                        onClick={() => openStep("exercise")}
                      >
                        Fortsæt til deløvelse
                      </button>
                    ) : (
                      <button
                        className={styles.primaryButton}
                        type="submit"
                        disabled={goalPending || goalTitle.trim().length === 0}
                      >
                        {goalPending ? "Gemmer…" : "Gem målkladde"}
                      </button>
                    )}
                  </div>
                </form>
              ) : null}

              {activeStep === "exercise" && goalState.status === "success" ? (
                <form
                  action={exerciseAction}
                  className={styles.draftForm}
                  noValidate
                >
                  <input
                    type="hidden"
                    name="requestId"
                    value={exerciseRequestId}
                  />
                  <input type="hidden" name="goalId" value={goalState.goalId} />
                  <input type="hidden" name="videoUrl" value="" />
                  <input
                    type="hidden"
                    name="sortOrder"
                    value={initialDraft?.nextExerciseSortOrder ?? 0}
                  />

                  <div className={styles.formGrid}>
                    <label className={styles.fullField}>
                      <span>Navn på deløvelsen</span>
                      <input
                        name="title"
                        maxLength={120}
                        required
                        value={exerciseTitle}
                        disabled={exercisePending || exerciseCreated}
                        aria-invalid={Boolean(exerciseErrors.title)}
                        onChange={(event) =>
                          setExerciseTitle(event.target.value)
                        }
                        placeholder="Fx Slalom med bold"
                      />
                      {exerciseErrors.title ? (
                        <small>{exerciseErrors.title}</small>
                      ) : null}
                    </label>

                    <label className={styles.fullField}>
                      <span>Instruktion direkte til barnet</span>
                      <textarea
                        name="instructions"
                        rows={5}
                        maxLength={1500}
                        required
                        value={exerciseInstructions}
                        disabled={exercisePending || exerciseCreated}
                        aria-invalid={Boolean(exerciseErrors.instructions)}
                        onChange={(event) =>
                          setExerciseInstructions(event.target.value)
                        }
                        placeholder="Skriv kort, venligt og trin for trin."
                      />
                      {exerciseErrors.instructions ? (
                        <small>{exerciseErrors.instructions}</small>
                      ) : null}
                    </label>

                    <label>
                      <span>Sådan måles øvelsen</span>
                      <select
                        name="measurement"
                        value={exerciseMeasurement}
                        disabled={exercisePending || exerciseCreated}
                        aria-invalid={Boolean(exerciseErrors.measurement)}
                        onChange={(event) => {
                          const measurement = event.target
                            .value as typeof exerciseMeasurement;
                          setExerciseMeasurement(measurement);
                          if (measurement === "completion")
                            setExerciseTarget("");
                        }}
                      >
                        <option value="completion">Gennemført</option>
                        <option value="repetitions">Gentagelser</option>
                        <option value="duration">Varighed i sekunder</option>
                      </select>
                      {exerciseErrors.measurement ? (
                        <small>{exerciseErrors.measurement}</small>
                      ) : null}
                    </label>

                    <label>
                      <span>
                        {exerciseMeasurement === "completion"
                          ? "Intet talmål"
                          : exerciseMeasurement === "duration"
                            ? "Mål i sekunder"
                            : "Antal gentagelser"}
                      </span>
                      <input
                        name="targetValue"
                        type="number"
                        min="1"
                        max={
                          exerciseMeasurement === "duration" ? "86400" : "10000"
                        }
                        inputMode="numeric"
                        readOnly={exerciseMeasurement === "completion"}
                        value={exerciseTarget}
                        disabled={exercisePending || exerciseCreated}
                        aria-invalid={Boolean(exerciseErrors.targetValue)}
                        onChange={(event) =>
                          setExerciseTarget(event.target.value)
                        }
                        placeholder={
                          exerciseMeasurement === "completion"
                            ? "Intet tal"
                            : "6"
                        }
                      />
                      {exerciseErrors.targetValue ? (
                        <small>{exerciseErrors.targetValue}</small>
                      ) : null}
                    </label>

                    <label>
                      <span>Anbefalet tid i minutter</span>
                      <input
                        name="recommendedMinutes"
                        type="number"
                        min="1"
                        max="180"
                        inputMode="numeric"
                        value={exerciseMinutes}
                        disabled={exercisePending || exerciseCreated}
                        aria-invalid={Boolean(
                          exerciseErrors.recommendedMinutes,
                        )}
                        onChange={(event) =>
                          setExerciseMinutes(event.target.value)
                        }
                        placeholder="10"
                      />
                      {exerciseErrors.recommendedMinutes ? (
                        <small>{exerciseErrors.recommendedMinutes}</small>
                      ) : null}
                    </label>

                    <label>
                      <span>Udstyr</span>
                      <textarea
                        name="equipment"
                        rows={3}
                        value={exerciseEquipment}
                        disabled={exercisePending || exerciseCreated}
                        aria-invalid={Boolean(exerciseErrors.equipment)}
                        onChange={(event) =>
                          setExerciseEquipment(event.target.value)
                        }
                        placeholder={"Bold\n4 kegler"}
                      />
                      {exerciseErrors.equipment ? (
                        <small>{exerciseErrors.equipment}</small>
                      ) : null}
                    </label>

                    <label className={styles.fullField}>
                      <span>Sikkerhed og voksenhjælp</span>
                      <textarea
                        name="safetyNote"
                        rows={3}
                        maxLength={1000}
                        value={exerciseSafety}
                        disabled={exercisePending || exerciseCreated}
                        aria-invalid={Boolean(exerciseErrors.safetyNote)}
                        onChange={(event) =>
                          setExerciseSafety(event.target.value)
                        }
                        placeholder="Fx: Find et sted med god plads, og få hjælp af en voksen ved behov."
                      />
                      {exerciseErrors.safetyNote ? (
                        <small>{exerciseErrors.safetyNote}</small>
                      ) : null}
                    </label>
                  </div>

                  <div className={styles.draftFooter}>
                    <p
                      className={
                        exerciseState.status === "success"
                          ? styles.successMessage
                          : exerciseState.status === "idle"
                            ? styles.idleMessage
                            : styles.errorMessage
                      }
                      aria-live="polite"
                    >
                      {exerciseState.status === "idle"
                        ? "Deløvelsen gemmes under målet som en upubliceret kladde."
                        : exerciseState.message}
                    </p>
                    {exerciseCreated ? (
                      <button
                        className={styles.primaryButton}
                        type="button"
                        onClick={() => openStep("wardrobe")}
                      >
                        Fortsæt til garderobe
                      </button>
                    ) : (
                      <button
                        className={styles.primaryButton}
                        type="submit"
                        disabled={
                          exercisePending ||
                          exerciseTitle.trim().length === 0 ||
                          exerciseInstructions.trim().length === 0
                        }
                      >
                        {exercisePending ? "Gemmer…" : "Gem deløvelse"}
                      </button>
                    )}
                  </div>
                </form>
              ) : null}

              {activeStep === "wardrobe" ? (
                <div className={styles.stepContent}>
                  <div className={styles.stepIntro}>
                    <p className={styles.eyebrow}>AI-eksempler</p>
                    <h3>Skab belønninger, der passer til emnet</h3>
                    <p>
                      Vælg Garderobe i AI-assistenten og beskriv stilen. Du kan
                      fx få forslag som turkise støvler, en regnbuebold eller en
                      trænerkasket – altid uden rigtige brands.
                    </p>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={openWardrobeAssistant}
                    >
                      Hjælp mig med garderoben
                    </button>
                  </div>
                  <WardrobeSuggestions items={wardrobeItems} />
                  <div className={styles.draftFooter}>
                    <p className={styles.idleMessage}>
                      Garderobeforslag gemmes endnu ikke. Det bliver næste
                      selvstændige indholdsmodel og godkendelsesflow.
                    </p>
                    <button
                      className={styles.primaryButton}
                      type="button"
                      onClick={() => openStep("review")}
                    >
                      Gå til gennemgang
                    </button>
                  </div>
                </div>
              ) : null}

              {activeStep === "review" ? (
                <div className={styles.stepContent}>
                  <div className={styles.stepIntro}>
                    <p className={styles.eyebrow}>Gennemgang</p>
                    <h3>Forløbets første kladder er klar</h3>
                    <p>
                      Alt er fortsat upubliceret. Du kan gå tilbage til hvert
                      trin og se de gemte felter eller vende tilbage til
                      oversigten.
                    </p>
                  </div>
                  <div className={styles.reviewGrid}>
                    <article>
                      <span>1</span>
                      <div>
                        <small>Emne</small>
                        <strong>{title}</strong>
                        <p>Gemt som kladde</p>
                      </div>
                    </article>
                    <article>
                      <span>2</span>
                      <div>
                        <small>Mål</small>
                        <strong>{goalTitle}</strong>
                        <p>Gemt under emnet</p>
                      </div>
                    </article>
                    <article>
                      <span>3</span>
                      <div>
                        <small>Deløvelse</small>
                        <strong>{exerciseTitle}</strong>
                        <p>Gemt under målet</p>
                      </div>
                    </article>
                    <article>
                      <span>4</span>
                      <div>
                        <small>Garderobe</small>
                        <strong>{wardrobeItems.length} AI-eksempler</strong>
                        <p>Ikke gemt endnu</p>
                      </div>
                    </article>
                  </div>
                  <div className={styles.draftFooter}>
                    <p className={styles.successMessage}>
                      Ingen af kladderne er publiceret automatisk.
                    </p>
                    <Link className={styles.primaryButton} href="/">
                      Se emneoversigten
                    </Link>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
