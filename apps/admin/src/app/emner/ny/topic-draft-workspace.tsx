"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AdminWardrobeItemDraft } from "@bare-traen/api-client";

import {
  askAdminContentAssistant,
  createAdminExerciseDraft,
  createAdminGoalDraft,
  createAdminTopicDraft,
  updateAdminExerciseDraft,
  updateAdminGoalDraft,
  updateAdminTopicDraft,
  type AssistantDraftReview,
  type AssistantState,
  type AssistantMode,
  type AssistantSuggestion,
  type AssistantWardrobeItem,
  type CreateExerciseState,
  type CreateGoalState,
  type CreateTopicState,
} from "./actions";
import styles from "./page.module.css";
import {
  addExerciseToTopicEditorOutline,
  buildTopicEditorHref,
  getResumeStartingStep,
  type ResumableEditorStep,
  type ResumableTopicDraft,
  type TopicEditorOutlineGoal,
} from "./resume-topic-draft";
import {
  assistantResponseBelongsToContext,
  exerciseSnapshotHasChanges,
  getAssistantContextGreeting,
  goalSnapshotHasChanges,
  syncExerciseMeasurementResetDefault,
  topicSnapshotHasChanges,
  type ExerciseEditorSnapshot,
  type GoalEditorSnapshot,
  type TopicEditorSnapshot,
} from "./workspace-ux";
import { WardrobeAuthoring } from "./wardrobe-authoring";

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
  initialOutline: TopicEditorOutlineGoal[];
  initialStep:
    Extract<ResumableEditorStep, "goal" | "exercise"> | "new-exercise" | null;
  profileName: string;
  topicRequestId: string;
  wardrobeRequestId: string;
};

const initialCreateTopicState: CreateTopicState = { status: "idle" };
const initialCreateGoalState: CreateGoalState = { status: "idle" };
const initialCreateExerciseState: CreateExerciseState = { status: "idle" };
const initialAssistantState: AssistantState = { status: "idle" };

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
  review: "Gennemgang",
};

const assistantPlaceholders: Record<AssistantMode, string> = {
  topic: "Fx: Lav et emne om balance og bevægelse",
  goal: "Fx: Hjælp mig med et enkelt første mål",
  exercise: "Fx: Lav en tryg deløvelse, barnet kan forstå",
  wardrobe: "Fx: Foreslå fem sjove ting til garderoben",
  review: "Fx: Gennemgå kladden for klarhed og sikkerhed",
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
  initialOutline,
  initialStep,
  profileName,
  topicRequestId,
  wardrobeRequestId,
}: TopicDraftWorkspaceProps) {
  const isPublishedTopic = initialDraft?.topic.status === "published";
  const isPublishedGoal = initialDraft?.goal?.status === "published";
  const isPublishedExercise = initialDraft?.exercise?.status === "published";
  const resumedTopicState: CreateTopicState = initialDraft
    ? {
        status: "success",
        message: isPublishedTopic
          ? "Det publicerede emne er hentet. Vælg Rediger for at ændre det direkte."
          : "Emnekladden er hentet. Vælg Rediger for at ændre den.",
        topicId: initialDraft.topic.id,
        updatedAt: initialDraft.topic.updatedAt,
      }
    : initialCreateTopicState;
  const resumedGoalState: CreateGoalState = initialDraft?.goal
    ? {
        status: "success",
        message: isPublishedGoal
          ? "Det publicerede mål er hentet. Vælg Rediger for at ændre det direkte."
          : "Målkladden er hentet. Vælg Rediger for at ændre den.",
        goalId: initialDraft.goal.id,
        updatedAt: initialDraft.goal.updatedAt,
      }
    : initialCreateGoalState;
  const resumedExerciseState: CreateExerciseState = initialDraft?.exercise
    ? {
        status: "success",
        message: isPublishedExercise
          ? "Den publicerede deløvelse er hentet. Vælg Rediger for at ændre den direkte."
          : "Deløvelsen er hentet. Vælg Rediger for at ændre den.",
        exerciseId: initialDraft.exercise.id,
        updatedAt: initialDraft.exercise.updatedAt,
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
  const [topicUpdateState, topicUpdateAction, topicUpdatePending] =
    useActionState(updateAdminTopicDraft, initialCreateTopicState);
  const [goalUpdateState, goalUpdateAction, goalUpdatePending] = useActionState(
    updateAdminGoalDraft,
    initialCreateGoalState,
  );
  const [exerciseUpdateState, exerciseUpdateAction, exerciseUpdatePending] =
    useActionState(updateAdminExerciseDraft, initialCreateExerciseState);
  const [assistantState, assistantAction, assistantPending] = useActionState(
    askAdminContentAssistant,
    initialAssistantState,
  );

  const startingStep = getResumeStartingStep(initialDraft, initialStep);
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
  const [topicUpdatedAt, setTopicUpdatedAt] = useState<string | null>(
    initialDraft?.topic.updatedAt ?? null,
  );
  const [goalUpdatedAt, setGoalUpdatedAt] = useState<string | null>(
    initialDraft?.goal?.updatedAt ?? null,
  );
  const [exerciseUpdatedAt, setExerciseUpdatedAt] = useState<string | null>(
    initialDraft?.exercise?.updatedAt ?? null,
  );
  const [savedTopicSnapshot, setSavedTopicSnapshot] =
    useState<TopicEditorSnapshot | null>(() =>
      initialDraft
        ? {
            accentColor: initialDraft.topic.accentColor ?? "#53C987",
            description: initialDraft.topic.description,
            icon: initialDraft.topic.icon ?? "✨",
            title: initialDraft.topic.title,
          }
        : null,
    );
  const [savedGoalSnapshot, setSavedGoalSnapshot] =
    useState<GoalEditorSnapshot | null>(() =>
      initialDraft?.goal
        ? {
            difficulty: initialDraft.goal.difficulty,
            equipment: initialDraft.goal.equipment.join("\n"),
            minutes: initialDraft.goal.estimatedMinutes?.toString() ?? "",
            summary: initialDraft.goal.summary,
            title: initialDraft.goal.title,
          }
        : null,
    );
  const [savedExerciseSnapshot, setSavedExerciseSnapshot] =
    useState<ExerciseEditorSnapshot | null>(() =>
      initialDraft?.exercise
        ? {
            equipment: initialDraft.exercise.equipment.join("\n"),
            instructions: initialDraft.exercise.instructions,
            measurement: initialDraft.exercise.measurement,
            minutes: initialDraft.exercise.estimatedMinutes?.toString() ?? "",
            safety: initialDraft.exercise.safetyNotes,
            target: initialDraft.exercise.targetValue?.toString() ?? "",
            title: initialDraft.exercise.title,
          }
        : null,
    );

  const [assistantMode, setAssistantMode] =
    useState<AssistantMode>(startingStep);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantErrorMessage, setAssistantErrorMessage] = useState<
    string | null
  >(null);
  const [nextAssistantRequestId, setNextAssistantRequestId] =
    useState(assistantRequestId);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: `welcome-${startingStep}`,
      role: "assistant",
      content: getAssistantContextGreeting(startingStep),
    },
  ]);
  const [suggestion, setSuggestion] = useState<AssistantSuggestion | null>(
    null,
  );
  const [wardrobeSuggestions, setWardrobeSuggestions] = useState<
    AssistantWardrobeItem[]
  >([]);
  const [savedWardrobeItems, setSavedWardrobeItems] = useState<
    AdminWardrobeItemDraft[]
  >(initialDraft?.wardrobeItems ?? []);
  const [wardrobeDirty, setWardrobeDirty] = useState(false);
  const [wardrobeBusy, setWardrobeBusy] = useState(false);
  const [reviewResult, setReviewResult] = useState<AssistantDraftReview | null>(
    null,
  );
  const [assistantSubmission, setAssistantSubmission] = useState<{
    mode: AssistantMode;
    requestId: string;
  } | null>(null);
  const [topicEditing, setTopicEditing] = useState(false);
  const [goalEditing, setGoalEditing] = useState(
    startingStep === "goal" && Boolean(initialDraft?.goal),
  );
  const [exerciseEditing, setExerciseEditing] = useState(
    startingStep === "exercise" && Boolean(initialDraft?.exercise),
  );
  const [stepAnnouncement, setStepAnnouncement] = useState("");
  const [navigationWarning, setNavigationWarning] = useState<string | null>(
    null,
  );
  const [editorOutline, setEditorOutline] =
    useState<TopicEditorOutlineGoal[]>(initialOutline);

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
  const handledTopicUpdateState = useRef<CreateTopicState>(
    initialCreateTopicState,
  );
  const handledGoalUpdateState = useRef<CreateGoalState>(
    initialCreateGoalState,
  );
  const handledExerciseUpdateState = useRef<CreateExerciseState>(
    initialCreateExerciseState,
  );
  const pendingTopicSnapshot = useRef<TopicEditorSnapshot | null>(null);
  const pendingGoalSnapshot = useRef<GoalEditorSnapshot | null>(null);
  const pendingExerciseSnapshot = useRef<ExerciseEditorSnapshot | null>(null);
  const assistantInputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLSpanElement>(null);
  const draftPanelRef = useRef<HTMLElement>(null);
  const draftTitleRef = useRef<HTMLHeadingElement>(null);
  const navigationAlertRef = useRef<HTMLParagraphElement>(null);
  const topicTitleRef = useRef<HTMLInputElement>(null);
  const goalTitleRef = useRef<HTMLInputElement>(null);
  const exerciseTitleRef = useRef<HTMLInputElement>(null);
  const exerciseMeasurementRef = useRef<HTMLSelectElement>(null);
  const focusNextStep = useRef(false);

  const topicCreated = topicState.status === "success";
  const goalCreated = goalState.status === "success";
  const exerciseCreated = exerciseState.status === "success";
  const selectedGoalId =
    goalState.status === "success"
      ? goalState.goalId
      : (initialDraft?.goal?.id ?? null);
  const selectedExerciseId =
    exerciseState.status === "success"
      ? exerciseState.exerciseId
      : (initialDraft?.exercise?.id ?? null);
  const addingExercise =
    initialStep === "new-exercise" &&
    !exerciseCreated &&
    Boolean(selectedGoalId);
  const currentTopicSnapshot: TopicEditorSnapshot = {
    accentColor,
    description,
    icon,
    title,
  };
  const currentGoalSnapshot: GoalEditorSnapshot = {
    difficulty: goalDifficulty,
    equipment: goalEquipment,
    minutes: goalMinutes,
    summary: goalSummary,
    title: goalTitle,
  };
  const currentExerciseSnapshot: ExerciseEditorSnapshot = {
    equipment: exerciseEquipment,
    instructions: exerciseInstructions,
    measurement: exerciseMeasurement,
    minutes: exerciseMinutes,
    safety: exerciseSafety,
    target: exerciseTarget,
    title: exerciseTitle,
  };
  const topicDirty =
    topicEditing &&
    topicCreated &&
    topicSnapshotHasChanges(currentTopicSnapshot, savedTopicSnapshot);
  const goalDirty =
    goalEditing &&
    goalCreated &&
    goalSnapshotHasChanges(currentGoalSnapshot, savedGoalSnapshot);
  const newExerciseDirty =
    addingExercise &&
    Boolean(
      exerciseTitle.trim() ||
      exerciseInstructions.trim() ||
      exerciseTarget.trim() ||
      exerciseMinutes.trim() ||
      exerciseEquipment.trim() ||
      exerciseSafety.trim() ||
      exerciseMeasurement !== "completion",
    );
  const exerciseDirty =
    (exerciseEditing &&
      exerciseCreated &&
      exerciseSnapshotHasChanges(
        currentExerciseSnapshot,
        savedExerciseSnapshot,
      )) ||
    newExerciseDirty;
  const dirtyEditingStep: "topic" | "goal" | "exercise" | "wardrobe" | null =
    topicDirty
      ? "topic"
      : goalDirty
        ? "goal"
        : exerciseDirty
          ? "exercise"
          : wardrobeDirty
            ? "wardrobe"
            : null;
  const topicBusy = topicPending || topicUpdatePending;
  const goalBusy = goalPending || goalUpdatePending;
  const exerciseBusy = exercisePending || exerciseUpdatePending;
  const visibleTopicState = topicEditing ? topicUpdateState : topicState;
  const visibleGoalState = goalEditing ? goalUpdateState : goalState;
  const visibleExerciseState = exerciseEditing
    ? exerciseUpdateState
    : exerciseState;
  const topicErrors =
    visibleTopicState.status === "invalid" ? visibleTopicState.fieldErrors : {};
  const goalErrors =
    visibleGoalState.status === "invalid" ? visibleGoalState.fieldErrors : {};
  const exerciseErrors =
    visibleExerciseState.status === "invalid"
      ? visibleExerciseState.fieldErrors
      : {};

  function resetAssistantContext(mode: AssistantMode) {
    setAssistantMode(mode);
    setAssistantMessage("");
    setAssistantErrorMessage(null);
    setNextAssistantRequestId(window.crypto.randomUUID());
    submittedAssistantMessage.current = null;
    setAssistantSubmission(null);
    setSuggestion(null);
    setReviewResult(null);
    setMessages([
      {
        id: `welcome-${mode}-${window.crypto.randomUUID()}`,
        role: "assistant",
        content: getAssistantContextGreeting(mode),
      },
    ]);
  }

  function focusStepAfterRender() {
    focusNextStep.current = true;
  }

  useEffect(() => {
    if (!focusNextStep.current) return;

    focusNextStep.current = false;
    const frame = window.requestAnimationFrame(() => {
      draftTitleRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeStep]);

  useEffect(() => {
    const select = exerciseMeasurementRef.current;
    if (!select) return;

    syncExerciseMeasurementResetDefault(
      Array.from(select.options),
      exerciseMeasurement,
    );
  }, [exerciseMeasurement]);

  useEffect(() => {
    const activeState =
      activeStep === "topic"
        ? visibleTopicState
        : activeStep === "goal"
          ? visibleGoalState
          : activeStep === "exercise"
            ? visibleExerciseState
            : null;

    if (activeState?.status !== "invalid") return;

    const frame = window.requestAnimationFrame(() => {
      draftPanelRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeStep, visibleExerciseState, visibleGoalState, visibleTopicState]);

  useEffect(() => {
    if (
      topicState.status === "success" &&
      topicState.topicId !== handledTopicId.current
    ) {
      handledTopicId.current = topicState.topicId;
      if (pendingTopicSnapshot.current) {
        setSavedTopicSnapshot(pendingTopicSnapshot.current);
      }
      pendingTopicSnapshot.current = null;
      setTopicUpdatedAt(topicState.updatedAt);
      setNavigationWarning(null);
      const url = new URL(window.location.href);
      url.searchParams.set("topic", topicState.topicId);
      window.history.replaceState(
        null,
        "",
        `${url.pathname}?${url.searchParams.toString()}${url.hash}`,
      );
      setActiveStep("goal");
      resetAssistantContext("goal");
      setStepAnnouncement("Emnekladden er gemt. Trin 2 af 5: Mål.");
      focusStepAfterRender();
    }
  }, [topicState]);

  useEffect(() => {
    if (
      goalState.status === "success" &&
      goalState.goalId !== handledGoalId.current
    ) {
      handledGoalId.current = goalState.goalId;
      if (pendingGoalSnapshot.current) {
        setSavedGoalSnapshot(pendingGoalSnapshot.current);
      }
      pendingGoalSnapshot.current = null;
      setGoalUpdatedAt(goalState.updatedAt);
      setNavigationWarning(null);
      setActiveStep("exercise");
      resetAssistantContext("exercise");
      setStepAnnouncement("Målkladden er gemt. Trin 3 af 5: Deløvelse.");
      focusStepAfterRender();
    }
  }, [goalState]);

  useEffect(() => {
    if (
      exerciseState.status === "success" &&
      exerciseState.exerciseId !== handledExerciseId.current
    ) {
      handledExerciseId.current = exerciseState.exerciseId;
      if (pendingExerciseSnapshot.current) {
        setSavedExerciseSnapshot(pendingExerciseSnapshot.current);
      }
      pendingExerciseSnapshot.current = null;
      setExerciseUpdatedAt(exerciseState.updatedAt);
      setNavigationWarning(null);
      if (selectedGoalId) {
        setEditorOutline((current) =>
          addExerciseToTopicEditorOutline(current, {
            goalId: selectedGoalId,
            id: exerciseState.exerciseId,
            sortOrder: initialDraft?.nextExerciseSortOrder ?? 0,
            title: normalizeText(exerciseTitle, 120) || "Ny deløvelse",
          }),
        );

        const topicId = initialDraft?.topic.id;
        if (topicId) {
          window.history.replaceState(
            null,
            "",
            buildTopicEditorHref({
              exerciseId: exerciseState.exerciseId,
              goalId: selectedGoalId,
              topicId,
            }),
          );
        }
      }
      setActiveStep("wardrobe");
      resetAssistantContext("wardrobe");
      setStepAnnouncement("Deløvelsen er gemt. Trin 4 af 5: Garderobe.");
      focusStepAfterRender();
    }
  }, [
    exerciseState,
    exerciseTitle,
    initialDraft?.nextExerciseSortOrder,
    initialDraft?.topic.id,
    selectedGoalId,
  ]);

  useEffect(() => {
    if (topicUpdateState === handledTopicUpdateState.current) return;
    handledTopicUpdateState.current = topicUpdateState;

    if (topicUpdateState.status === "success") {
      let frame: number | null = null;
      const timer = window.setTimeout(() => {
        if (pendingTopicSnapshot.current) {
          setSavedTopicSnapshot(pendingTopicSnapshot.current);
          pendingTopicSnapshot.current = null;
        }
        setTopicUpdatedAt(topicUpdateState.updatedAt);
        setTopicEditing(false);
        setNavigationWarning(null);
        setAssistantErrorMessage(null);
        setSuggestion(null);
        setStepAnnouncement(
          isPublishedTopic
            ? "Det publicerede emne er opdateret. Ændringen er synlig med det samme."
            : "Emnekladden er opdateret og stadig upubliceret.",
        );
        frame = window.requestAnimationFrame(() => {
          draftTitleRef.current?.focus({ preventScroll: true });
        });
      }, 0);
      return () => {
        window.clearTimeout(timer);
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    }
  }, [isPublishedTopic, topicUpdateState]);

  useEffect(() => {
    if (goalUpdateState === handledGoalUpdateState.current) return;
    handledGoalUpdateState.current = goalUpdateState;

    if (goalUpdateState.status === "success") {
      let frame: number | null = null;
      const timer = window.setTimeout(() => {
        if (pendingGoalSnapshot.current) {
          setSavedGoalSnapshot(pendingGoalSnapshot.current);
          pendingGoalSnapshot.current = null;
        }
        setGoalUpdatedAt(goalUpdateState.updatedAt);
        if (selectedGoalId) {
          setEditorOutline((current) =>
            current.map((goal) =>
              goal.id === selectedGoalId
                ? {
                    ...goal,
                    title: normalizeText(goalTitle, 120) || goal.title,
                  }
                : goal,
            ),
          );
        }
        setGoalEditing(false);
        setNavigationWarning(null);
        setAssistantErrorMessage(null);
        setSuggestion(null);
        setStepAnnouncement(
          isPublishedGoal
            ? "Det publicerede mål er opdateret. Ændringen er synlig med det samme."
            : "Målkladden er opdateret og stadig upubliceret.",
        );
        frame = window.requestAnimationFrame(() => {
          draftTitleRef.current?.focus({ preventScroll: true });
        });
      }, 0);
      return () => {
        window.clearTimeout(timer);
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    }
  }, [goalTitle, goalUpdateState, isPublishedGoal, selectedGoalId]);

  useEffect(() => {
    if (exerciseUpdateState === handledExerciseUpdateState.current) return;
    handledExerciseUpdateState.current = exerciseUpdateState;

    if (exerciseUpdateState.status === "success") {
      let frame: number | null = null;
      const timer = window.setTimeout(() => {
        if (pendingExerciseSnapshot.current) {
          setSavedExerciseSnapshot(pendingExerciseSnapshot.current);
          pendingExerciseSnapshot.current = null;
        }
        setExerciseUpdatedAt(exerciseUpdateState.updatedAt);
        if (selectedExerciseId) {
          setEditorOutline((current) =>
            current.map((goal) => ({
              ...goal,
              exercises: goal.exercises.map((exercise) =>
                exercise.id === selectedExerciseId
                  ? {
                      ...exercise,
                      title:
                        normalizeText(exerciseTitle, 120) || exercise.title,
                    }
                  : exercise,
              ),
            })),
          );
        }
        setExerciseEditing(false);
        setNavigationWarning(null);
        setAssistantErrorMessage(null);
        setSuggestion(null);
        setStepAnnouncement(
          isPublishedExercise
            ? "Den publicerede deløvelse er opdateret. Ændringen er synlig med det samme."
            : "Deløvelseskladden er opdateret og stadig upubliceret.",
        );
        frame = window.requestAnimationFrame(() => {
          draftTitleRef.current?.focus({ preventScroll: true });
        });
      }, 0);
      return () => {
        window.clearTimeout(timer);
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    }
  }, [
    exerciseTitle,
    exerciseUpdateState,
    isPublishedExercise,
    selectedExerciseId,
  ]);

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

      const submitted = submittedAssistantMessage.current;

      if (
        !assistantResponseBelongsToContext({
          currentRequestId: nextAssistantRequestId,
          responseRequestId: response.requestId,
          submittedRequestId: submitted?.requestId ?? null,
        })
      ) {
        return;
      }

      if (response.status !== "success") {
        setAssistantErrorMessage(response.message);
        if (response.requestRecovery === "start_new") {
          submittedAssistantMessage.current = null;
          setAssistantSubmission(null);
          setNextAssistantRequestId(window.crypto.randomUUID());
        }

        return;
      }

      if (!submitted) return;

      submittedAssistantMessage.current = null;
      setAssistantSubmission(null);
      setNextAssistantRequestId(window.crypto.randomUUID());
      setAssistantMessage("");
      setAssistantErrorMessage(null);
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
      setReviewResult(response.review);
      if (response.items.length > 0) {
        setWardrobeSuggestions(response.items);
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
        wardrobeExamples: savedWardrobeItems
          .filter((item) => item.editorialStatus !== "rejected")
          .map((item) => ({
            category: item.category,
            equipSlot: item.equipSlot,
            icon: item.icon,
            name: item.name,
            points: item.points,
            rarity: item.rarity,
            reason:
              item.editorialNote ||
              "Gemt manuelt af en indholdsansvarlig til dette emne.",
            unlockRule: item.unlockRule,
          })),
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
      savedWardrobeItems,
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
      setAssistantSubmission(null);
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

  function preventDirtyNavigation(destination: string): boolean {
    if (wardrobeBusy) {
      const message = `Garderoben gemmer eller opdaterer stadig. Vent et øjeblik, før du ${destination}.`;
      setNavigationWarning(message);
      setStepAnnouncement(message);
      window.requestAnimationFrame(() => navigationAlertRef.current?.focus());
      return true;
    }

    if (!dirtyEditingStep) return false;

    const draftLabel =
      dirtyEditingStep === "topic"
        ? "emnekladden"
        : dirtyEditingStep === "goal"
          ? "målkladden"
          : dirtyEditingStep === "exercise"
            ? "deløvelseskladden"
            : "garderobeformularen";
    const message = `Du har ændringer i ${draftLabel}, som ikke er gemt. Gem eller vælg Annuller ændringer, før du ${destination}.`;
    setNavigationWarning(message);
    setStepAnnouncement(message);
    window.requestAnimationFrame(() => navigationAlertRef.current?.focus());
    return true;
  }

  function closeCleanEditors(except?: "topic" | "goal" | "exercise") {
    if (except !== "topic" && topicEditing && !topicDirty) {
      setTopicEditing(false);
    }
    if (except !== "goal" && goalEditing && !goalDirty) {
      setGoalEditing(false);
    }
    if (except !== "exercise" && exerciseEditing && !exerciseDirty) {
      setExerciseEditing(false);
    }
  }

  function openStep(step: EditorStep) {
    if (!stepIsEnabled(step)) return;
    if (step === activeStep) return;
    if (
      preventDirtyNavigation(
        `går til ${steps.find((item) => item.key === step)?.label ?? "et andet trin"}`,
      )
    ) {
      return;
    }

    closeCleanEditors();
    setActiveStep(step);
    if (assistantModeIsEnabled(step)) {
      resetAssistantContext(step);
    } else {
      setAssistantMode(step);
      setAssistantMessage("");
      setAssistantErrorMessage(null);
      setNextAssistantRequestId(window.crypto.randomUUID());
      submittedAssistantMessage.current = null;
      setAssistantSubmission(null);
      setSuggestion(null);
      setReviewResult(null);
      setMessages([
        {
          id: `welcome-${step}-${window.crypto.randomUUID()}`,
          role: "assistant",
          content: getAssistantContextGreeting(step),
        },
      ]);
    }
    const destination = steps.find((candidate) => candidate.key === step);
    setStepAnnouncement(
      destination
        ? `Trin ${destination.number} af 5: ${destination.label}.`
        : "",
    );
    focusStepAfterRender();
  }

  function beginEditingStep(step: "topic" | "goal" | "exercise") {
    if (
      step !== activeStep &&
      preventDirtyNavigation("åbner en anden kladde")
    ) {
      return;
    }

    closeCleanEditors(step);
    if (step === "topic") setTopicEditing(true);
    if (step === "goal") setGoalEditing(true);
    if (step === "exercise") setExerciseEditing(true);

    setNavigationWarning(null);
    setActiveStep(step);
    resetAssistantContext(step);
    setStepAnnouncement(
      step === "topic"
        ? "Emnekladden er åben for redigering."
        : step === "goal"
          ? "Målkladden er åben for redigering."
          : "Deløvelseskladden er åben for redigering.",
    );

    window.requestAnimationFrame(() => {
      if (step === "topic") topicTitleRef.current?.focus();
      if (step === "goal") goalTitleRef.current?.focus();
      if (step === "exercise") exerciseTitleRef.current?.focus();
    });
  }

  function cancelEditingStep(step: "topic" | "goal" | "exercise") {
    if (step === "topic" && savedTopicSnapshot) {
      setTitle(savedTopicSnapshot.title);
      setDescription(savedTopicSnapshot.description);
      setIcon(savedTopicSnapshot.icon);
      setAccentColor(savedTopicSnapshot.accentColor);
      setTopicEditing(false);
      pendingTopicSnapshot.current = null;
    } else if (step === "goal" && savedGoalSnapshot) {
      setGoalTitle(savedGoalSnapshot.title);
      setGoalSummary(savedGoalSnapshot.summary);
      setGoalDifficulty(savedGoalSnapshot.difficulty);
      setGoalMinutes(savedGoalSnapshot.minutes);
      setGoalEquipment(savedGoalSnapshot.equipment);
      setGoalEditing(false);
      pendingGoalSnapshot.current = null;
    } else if (step === "exercise" && savedExerciseSnapshot) {
      setExerciseTitle(savedExerciseSnapshot.title);
      setExerciseInstructions(savedExerciseSnapshot.instructions);
      setExerciseMeasurement(savedExerciseSnapshot.measurement);
      setExerciseTarget(savedExerciseSnapshot.target);
      setExerciseMinutes(savedExerciseSnapshot.minutes);
      setExerciseEquipment(savedExerciseSnapshot.equipment);
      setExerciseSafety(savedExerciseSnapshot.safety);
      setExerciseEditing(false);
      pendingExerciseSnapshot.current = null;
    } else {
      return;
    }

    setNavigationWarning(null);
    resetAssistantContext(step);
    setStepAnnouncement(
      step === "topic"
        ? "Ændringerne i emnekladden er annulleret. Den senest gemte version er gendannet."
        : step === "goal"
          ? "Ændringerne i målkladden er annulleret. Den senest gemte version er gendannet."
          : "Ændringerne i deløvelseskladden er annulleret. Den senest gemte version er gendannet.",
    );
    window.requestAnimationFrame(() => {
      draftTitleRef.current?.focus({ preventScroll: true });
    });
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

    setNavigationWarning(null);
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
    setAssistantErrorMessage(null);
    handledAssistantRequest.current = null;
    submittedAssistantMessage.current = {
      context: serializedContext,
      history: serializedHistory,
      message,
      mode: assistantMode,
      requestId: nextAssistantRequestId,
    };
    setAssistantSubmission({
      mode: assistantMode,
      requestId: nextAssistantRequestId,
    });
  }

  function selectAssistantMode(mode: AssistantMode) {
    if (assistantPending || !assistantModeIsEnabled(mode)) return;
    if (mode === activeStep && mode === assistantMode) return;
    if (
      preventDirtyNavigation(`skifter AI-hjælpen til ${assistantLabels[mode]}`)
    ) {
      return;
    }
    closeCleanEditors();
    resetAssistantContext(mode);
    setActiveStep(mode);
    const destination = steps.find((candidate) => candidate.key === mode);
    setStepAnnouncement(
      destination
        ? `Trin ${destination.number} af 5: ${destination.label}.`
        : "",
    );
    focusStepAfterRender();
  }

  function openWardrobeAssistant() {
    selectAssistantMode("wardrobe");
    if (!assistantMessage.trim()) {
      setAssistantMessage(
        "Lav 16 emnespecifikke garderobeting som ét 4×4-billedark, og beskriv tydeligt hvad der er på hvert billede.",
      );
    }
    window.requestAnimationFrame(() => assistantInputRef.current?.focus());
  }

  function openReviewAssistant() {
    selectAssistantMode("review");
    window.requestAnimationFrame(() => assistantInputRef.current?.focus());
  }

  const handleWardrobeItemsChange = useCallback(
    (items: AdminWardrobeItemDraft[]) => setSavedWardrobeItems(items),
    [],
  );
  const handleWardrobeDirtyChange = useCallback(
    (dirty: boolean) => setWardrobeDirty(dirty),
    [],
  );
  const handleWardrobeBusyChange = useCallback(
    (busy: boolean) => setWardrobeBusy(busy),
    [],
  );
  const handleWardrobeAnnouncement = useCallback(
    (message: string) => setStepAnnouncement(message),
    [],
  );
  const clearWardrobeNavigationWarning = useCallback(
    () => setNavigationWarning(null),
    [],
  );

  function assistantModeIsEnabled(mode: AssistantMode): boolean {
    if (mode === "topic") return !topicCreated || topicEditing;
    if (mode === "goal") return topicCreated && (!goalCreated || goalEditing);
    if (mode === "exercise")
      return goalCreated && (!exerciseCreated || exerciseEditing);
    if (mode === "wardrobe") return exerciseCreated;
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
  const assistantWorkingHere = Boolean(
    assistantPending &&
    assistantSubmission?.requestId === nextAssistantRequestId &&
    assistantSubmission?.mode === assistantMode &&
    activeStep === assistantMode,
  );
  const currentStatus =
    activeStep === "topic"
      ? topicCreated
      : activeStep === "goal"
        ? goalCreated
        : activeStep === "exercise"
          ? exerciseCreated
          : exerciseCreated;
  const currentStepIsEditing =
    (activeStep === "topic" && topicEditing) ||
    (activeStep === "goal" && goalEditing) ||
    (activeStep === "exercise" && exerciseEditing);
  const currentStepIsPublished =
    activeStep === "topic"
      ? isPublishedTopic
      : activeStep === "goal"
        ? isPublishedGoal
        : activeStep === "exercise"
          ? isPublishedExercise
          : false;
  const draftEyebrow = currentStepIsPublished
    ? currentStepIsEditing
      ? "Direkte redigering"
      : "Publiceret indhold"
    : currentStatus && !currentStepIsEditing && activeStep !== "wardrobe"
      ? "Gemt kladde"
      : "Redigerbar kladde";
  const outlineExerciseCount = editorOutline.reduce(
    (total, goal) => total + goal.exercises.length,
    0,
  );

  return (
    <main className={styles.viewport}>
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {stepAnnouncement}
      </p>
      <section
        className={styles.appShell}
        aria-label={
          isPublishedTopic ? "Rediger publiceret emne" : "Opret nyt emne"
        }
      >
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
              {currentStepIsPublished
                ? "Publiceret"
                : currentStatus
                  ? "Trin gemt"
                  : "Kladde"}
            </span>
            <span className={styles.profileName}>{profileName}</span>
          </div>
        </header>

        <div className={styles.pageBody}>
          <div className={styles.pageToolbar}>
            <div>
              <p className={styles.eyebrow}>
                {isPublishedTopic
                  ? "Rediger publiceret emne"
                  : initialDraft
                    ? "Fortsæt kladde"
                    : "Nyt emne"}
              </p>
              <h1>
                {isPublishedTopic
                  ? `Rediger ${initialDraft?.topic.title ?? "emnet"}`
                  : initialDraft
                    ? `Fortsæt ${initialDraft.topic.title}`
                    : "Skab et forløb sammen med AI"}
              </h1>
              <p>
                {isPublishedTopic
                  ? "Gemte ændringer til dele, der allerede er publiceret, slår direkte igennem i børnenes forløb. Kladder og nye garderobeting forbliver upublicerede. AI ændrer aldrig felter uden dit valg."
                  : "Opret emne, mål og deløvelse som kladder. AI hjælper i hvert trin, men ændrer aldrig felter eller publicerer uden dit valg."}
              </p>
            </div>
            <Link
              className={styles.secondaryButton}
              href="/emner"
              onClick={(event) => {
                if (
                  preventDirtyNavigation(
                    isPublishedTopic ? "lukker redigeringen" : "lukker kladden",
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              {isPublishedTopic ? "Luk redigering" : "Luk kladden"}
            </Link>
          </div>

          <nav
            className={styles.steps}
            aria-label={isPublishedTopic ? "Emnets trin" : "Emnekladdens trin"}
          >
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

          {initialDraft ? (
            <nav
              className={styles.contentOutline}
              aria-labelledby="content-outline-title"
            >
              <header className={styles.contentOutlineHeader}>
                <div>
                  <p className={styles.eyebrow}>Indhold i emnet</p>
                  <h2 id="content-outline-title">Vælg mål eller deløvelse</h2>
                  <p>
                    Alle mål og deløvelser er samlet her. Vælg en for at
                    redigere den, eller tilføj en ny deløvelse under det rette
                    mål.
                  </p>
                </div>
                <span className={styles.outlineCount}>
                  {editorOutline.length} mål · {outlineExerciseCount}{" "}
                  {outlineExerciseCount === 1 ? "deløvelse" : "deløvelser"}
                </span>
              </header>

              {editorOutline.length === 0 ? (
                <p className={styles.outlineEmpty}>
                  Der er ingen mål endnu. Opret det første mål på trin 2.
                </p>
              ) : (
                <div className={styles.outlineGoals}>
                  {editorOutline.map((goal, goalIndex) => {
                    const goalIsSelected =
                      selectedGoalId === goal.id &&
                      (activeStep === "goal" || activeStep === "exercise");

                    return (
                      <section
                        className={
                          goalIsSelected
                            ? styles.outlineGoalSelected
                            : styles.outlineGoal
                        }
                        aria-labelledby={`outline-goal-${goal.id}`}
                        key={goal.id}
                      >
                        <Link
                          className={styles.outlineGoalLink}
                          href={buildTopicEditorHref({
                            goalId: goal.id,
                            topicId: initialDraft.topic.id,
                          })}
                          aria-current={
                            goalIsSelected && activeStep === "goal"
                              ? "page"
                              : undefined
                          }
                          onClick={(event) => {
                            if (goalIsSelected && activeStep === "goal") {
                              event.preventDefault();
                              return;
                            }
                            if (
                              preventDirtyNavigation(
                                `åbner målet ${goal.title}`,
                              )
                            ) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <span className={styles.outlineNumber}>
                            {goalIndex + 1}
                          </span>
                          <span>
                            <small>Mål</small>
                            <strong id={`outline-goal-${goal.id}`}>
                              {goal.title}
                            </strong>
                          </span>
                          <span className={styles.outlineStatus}>
                            {goal.status === "published"
                              ? "Publiceret"
                              : "Kladde"}
                          </span>
                        </Link>

                        <div className={styles.outlineExercises}>
                          {goal.exercises.map((exercise, exerciseIndex) => {
                            const exerciseIsSelected =
                              selectedExerciseId === exercise.id &&
                              !addingExercise &&
                              activeStep === "exercise";

                            return (
                              <Link
                                className={
                                  exerciseIsSelected
                                    ? styles.outlineExerciseSelected
                                    : styles.outlineExercise
                                }
                                href={buildTopicEditorHref({
                                  exerciseId: exercise.id,
                                  goalId: goal.id,
                                  topicId: initialDraft.topic.id,
                                })}
                                aria-current={
                                  exerciseIsSelected ? "page" : undefined
                                }
                                onClick={(event) => {
                                  if (exerciseIsSelected) {
                                    event.preventDefault();
                                    return;
                                  }
                                  if (
                                    preventDirtyNavigation(
                                      `åbner deløvelsen ${exercise.title}`,
                                    )
                                  ) {
                                    event.preventDefault();
                                  }
                                }}
                                key={exercise.id}
                              >
                                <span>{exerciseIndex + 1}</span>
                                <strong>{exercise.title}</strong>
                                <small>
                                  {exercise.status === "published"
                                    ? "Publiceret"
                                    : "Kladde"}
                                </small>
                              </Link>
                            );
                          })}

                          <Link
                            className={
                              addingExercise && goalIsSelected
                                ? styles.outlineAddExerciseActive
                                : styles.outlineAddExercise
                            }
                            href={buildTopicEditorHref({
                              createExercise: true,
                              goalId: goal.id,
                              topicId: initialDraft.topic.id,
                            })}
                            aria-current={
                              addingExercise && goalIsSelected
                                ? "page"
                                : undefined
                            }
                            onClick={(event) => {
                              if (addingExercise && goalIsSelected) {
                                event.preventDefault();
                                return;
                              }
                              if (
                                preventDirtyNavigation(
                                  `tilføjer en ny deløvelse under ${goal.title}`,
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <span aria-hidden="true">+</span>
                            Ny deløvelse
                          </Link>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </nav>
          ) : null}

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
                    <p>
                      Kontekst fra {isPublishedTopic ? "emnet" : "kladden"} ·
                      forslag kræver dit valg
                    </p>
                  </div>
                </div>
                <span className={styles.readyBadge}>
                  <span aria-hidden="true" />
                  {assistantPending
                    ? assistantWorkingHere
                      ? "Arbejder"
                      : "Afslutter"
                    : assistantInteractionEnabled
                      ? "Klar"
                      : "Låst"}
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
                ) : isPublishedTopic ? (
                  "Dette trin er gemt. Vælg Rediger i emnet for at bruge AI på det igen."
                ) : (
                  "Dette trin er gemt. Vælg Rediger i kladden for at bruge AI på det igen."
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
                {assistantWorkingHere ? (
                  <p className={styles.thinkingMessage} role="status">
                    <span aria-hidden="true">✦</span>{" "}
                    {assistantMode === "wardrobe"
                      ? "Forbereder 16 idéer, tegner 4×4-billedarket og beskærer billederne…"
                      : "Udarbejder et forslag…"}
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
              {assistantErrorMessage ? (
                <p className={styles.assistantError} role="alert">
                  {assistantErrorMessage}
                </p>
              ) : null}
            </section>

            <section
              ref={draftPanelRef}
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
                    <p className={styles.eyebrow}>{draftEyebrow}</p>
                    <h2 id="draft-title" ref={draftTitleRef} tabIndex={-1}>
                      {activeStep === "topic"
                        ? title || "Emnets grundlag"
                        : activeStep === "goal"
                          ? goalTitle || "Første mål"
                          : activeStep === "exercise"
                            ? exerciseTitle ||
                              (addingExercise
                                ? "Ny deløvelse"
                                : "Første deløvelse")
                            : activeStep === "wardrobe"
                              ? "Garderobeeksempler"
                              : "Gennemgang"}
                    </h2>
                  </div>
                </div>
                <span className={styles.reviewBadge}>
                  {currentStepIsPublished
                    ? "Publiceret · ændringer er live"
                    : activeStep === "wardrobe"
                      ? "Garderobe · kladder gennemgås først"
                      : activeStep === "review"
                        ? "Gennemgang · publicerer ikke"
                        : "Kladde · ikke publiceret"}
                </span>
              </header>

              {navigationWarning && (dirtyEditingStep || wardrobeBusy) ? (
                <div className={styles.stepContent}>
                  <p
                    ref={navigationAlertRef}
                    className={styles.errorMessage}
                    role="alert"
                    tabIndex={-1}
                  >
                    {navigationWarning}
                  </p>
                </div>
              ) : null}

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
                  action={topicCreated ? topicUpdateAction : topicAction}
                  className={styles.draftForm}
                  noValidate
                  onChange={() => setNavigationWarning(null)}
                  onSubmit={() => {
                    pendingTopicSnapshot.current = currentTopicSnapshot;
                    setNavigationWarning(null);
                  }}
                >
                  <input
                    type="hidden"
                    name="requestId"
                    value={topicCreated ? topicState.topicId : topicRequestId}
                  />
                  {topicCreated ? (
                    <>
                      <input
                        type="hidden"
                        name="expectedUpdatedAt"
                        value={
                          topicUpdatedAt ??
                          (topicState.status === "success"
                            ? topicState.updatedAt
                            : "")
                        }
                      />
                      <input
                        type="hidden"
                        name="publicationStatus"
                        value={initialDraft?.topic.status ?? "draft"}
                      />
                    </>
                  ) : null}
                  <div className={styles.fieldGrid}>
                    <label className={styles.iconField}>
                      <span>Ikon</span>
                      <input
                        name="icon"
                        maxLength={16}
                        value={icon}
                        disabled={topicBusy || (topicCreated && !topicEditing)}
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
                        ref={topicTitleRef}
                        name="title"
                        maxLength={100}
                        required
                        value={title}
                        disabled={topicBusy || (topicCreated && !topicEditing)}
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
                        disabled={topicBusy || (topicCreated && !topicEditing)}
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
                          disabled={
                            topicBusy || (topicCreated && !topicEditing)
                          }
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
                        visibleTopicState.status === "success"
                          ? styles.successMessage
                          : visibleTopicState.status === "idle"
                            ? styles.idleMessage
                            : styles.errorMessage
                      }
                      aria-live="polite"
                    >
                      {visibleTopicState.status === "idle"
                        ? topicEditing
                          ? isPublishedTopic
                            ? "Når du gemmer, bliver ændringerne synlige med det samme."
                            : "Gem ændringerne i den upublicerede emnekladde."
                          : "Emnet gemmes som kladde. Derefter åbner det første mål."
                        : visibleTopicState.message}
                    </p>
                    {topicCreated && !topicEditing ? (
                      <>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => beginEditingStep("topic")}
                        >
                          {isPublishedTopic
                            ? "Rediger emne"
                            : "Rediger emnekladde"}
                        </button>
                        <button
                          className={styles.primaryButton}
                          type="button"
                          onClick={() => openStep("goal")}
                        >
                          Fortsæt til mål
                        </button>
                      </>
                    ) : (
                      <>
                        {topicEditing ? (
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            disabled={topicBusy}
                            onClick={() => cancelEditingStep("topic")}
                          >
                            Annuller ændringer
                          </button>
                        ) : null}
                        <button
                          className={styles.primaryButton}
                          type="submit"
                          disabled={topicBusy || title.trim().length === 0}
                        >
                          {topicBusy
                            ? "Gemmer…"
                            : topicEditing
                              ? "Gem ændringer"
                              : "Gem emnekladde"}
                        </button>
                      </>
                    )}
                  </div>
                </form>
              ) : null}

              {activeStep === "goal" && topicState.status === "success" ? (
                <form
                  action={goalCreated ? goalUpdateAction : goalAction}
                  className={styles.draftForm}
                  noValidate
                  onChange={() => setNavigationWarning(null)}
                  onSubmit={() => {
                    pendingGoalSnapshot.current = currentGoalSnapshot;
                    setNavigationWarning(null);
                  }}
                >
                  <input
                    type="hidden"
                    name="requestId"
                    value={goalCreated ? goalState.goalId : goalRequestId}
                  />
                  {goalCreated ? (
                    <>
                      <input
                        type="hidden"
                        name="expectedUpdatedAt"
                        value={
                          goalUpdatedAt ??
                          (goalState.status === "success"
                            ? goalState.updatedAt
                            : "")
                        }
                      />
                      <input
                        type="hidden"
                        name="publicationStatus"
                        value={initialDraft?.goal?.status ?? "draft"}
                      />
                    </>
                  ) : null}
                  <input
                    type="hidden"
                    name="topicId"
                    value={topicState.topicId}
                  />
                  <input
                    type="hidden"
                    name="heroMediaUrl"
                    value={initialDraft?.goal?.heroMediaUrl ?? ""}
                  />
                  <input
                    type="hidden"
                    name="sortOrder"
                    value={
                      goalCreated
                        ? (initialDraft?.goal?.sortOrder ?? 0)
                        : (initialDraft?.nextGoalSortOrder ?? 0)
                    }
                  />

                  <div className={styles.formGrid}>
                    <label className={styles.fullField}>
                      <span>Navn på målet</span>
                      <input
                        ref={goalTitleRef}
                        name="title"
                        maxLength={120}
                        required
                        value={goalTitle}
                        disabled={goalBusy || (goalCreated && !goalEditing)}
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
                        disabled={goalBusy || (goalCreated && !goalEditing)}
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
                        disabled={goalBusy || (goalCreated && !goalEditing)}
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
                        disabled={goalBusy || (goalCreated && !goalEditing)}
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
                        disabled={goalBusy || (goalCreated && !goalEditing)}
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
                        visibleGoalState.status === "success"
                          ? styles.successMessage
                          : visibleGoalState.status === "idle"
                            ? styles.idleMessage
                            : styles.errorMessage
                      }
                      aria-live="polite"
                    >
                      {visibleGoalState.status === "idle"
                        ? goalEditing
                          ? isPublishedGoal
                            ? "Når du gemmer, bliver målændringen synlig med det samme."
                            : "Gem ændringerne i den upublicerede målkladde."
                          : "Målet gemmes under emnet som en upubliceret kladde."
                        : visibleGoalState.message}
                    </p>
                    {goalCreated && !goalEditing ? (
                      <>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => beginEditingStep("goal")}
                        >
                          {isPublishedGoal
                            ? "Rediger mål"
                            : "Rediger målkladde"}
                        </button>
                        <button
                          className={styles.primaryButton}
                          type="button"
                          onClick={() => openStep("exercise")}
                        >
                          Fortsæt til deløvelse
                        </button>
                      </>
                    ) : (
                      <>
                        {goalEditing ? (
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            disabled={goalBusy}
                            onClick={() => cancelEditingStep("goal")}
                          >
                            Annuller ændringer
                          </button>
                        ) : null}
                        <button
                          className={styles.primaryButton}
                          type="submit"
                          disabled={goalBusy || goalTitle.trim().length === 0}
                        >
                          {goalBusy
                            ? "Gemmer…"
                            : goalEditing
                              ? "Gem ændringer"
                              : "Gem målkladde"}
                        </button>
                      </>
                    )}
                  </div>
                </form>
              ) : null}

              {activeStep === "exercise" && goalState.status === "success" ? (
                <form
                  action={
                    exerciseCreated ? exerciseUpdateAction : exerciseAction
                  }
                  className={styles.draftForm}
                  noValidate
                  onChange={() => setNavigationWarning(null)}
                  onSubmit={() => {
                    pendingExerciseSnapshot.current = currentExerciseSnapshot;
                    setNavigationWarning(null);
                  }}
                >
                  <input
                    type="hidden"
                    name="requestId"
                    value={
                      exerciseCreated
                        ? exerciseState.exerciseId
                        : exerciseRequestId
                    }
                  />
                  {exerciseCreated ? (
                    <>
                      <input
                        type="hidden"
                        name="expectedUpdatedAt"
                        value={
                          exerciseUpdatedAt ??
                          (exerciseState.status === "success"
                            ? exerciseState.updatedAt
                            : "")
                        }
                      />
                      <input
                        type="hidden"
                        name="publicationStatus"
                        value={initialDraft?.exercise?.status ?? "draft"}
                      />
                    </>
                  ) : null}
                  <input type="hidden" name="goalId" value={goalState.goalId} />
                  <input
                    type="hidden"
                    name="videoUrl"
                    value={initialDraft?.exercise?.videoUrl ?? ""}
                  />
                  <input
                    type="hidden"
                    name="sortOrder"
                    value={
                      initialDraft?.exercise?.sortOrder ??
                      initialDraft?.nextExerciseSortOrder ??
                      0
                    }
                  />

                  <div className={styles.formGrid}>
                    <label className={styles.fullField}>
                      <span>Navn på deløvelsen</span>
                      <input
                        ref={exerciseTitleRef}
                        name="title"
                        maxLength={120}
                        required
                        value={exerciseTitle}
                        disabled={
                          exerciseBusy || (exerciseCreated && !exerciseEditing)
                        }
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
                        disabled={
                          exerciseBusy || (exerciseCreated && !exerciseEditing)
                        }
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
                        ref={exerciseMeasurementRef}
                        name="measurement"
                        value={exerciseMeasurement}
                        disabled={
                          exerciseBusy || (exerciseCreated && !exerciseEditing)
                        }
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
                        disabled={
                          exerciseBusy || (exerciseCreated && !exerciseEditing)
                        }
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
                        disabled={
                          exerciseBusy || (exerciseCreated && !exerciseEditing)
                        }
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
                        disabled={
                          exerciseBusy || (exerciseCreated && !exerciseEditing)
                        }
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
                        disabled={
                          exerciseBusy || (exerciseCreated && !exerciseEditing)
                        }
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
                        visibleExerciseState.status === "success"
                          ? styles.successMessage
                          : visibleExerciseState.status === "idle"
                            ? styles.idleMessage
                            : styles.errorMessage
                      }
                      aria-live="polite"
                    >
                      {visibleExerciseState.status === "idle"
                        ? exerciseEditing
                          ? isPublishedExercise
                            ? "Når du gemmer, bliver ændringen synlig med det samme."
                            : "Gem ændringerne i den upublicerede deløvelseskladde."
                          : "Deløvelsen gemmes under målet som en upubliceret kladde."
                        : visibleExerciseState.message}
                    </p>
                    {exerciseCreated && !exerciseEditing ? (
                      <>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={() => beginEditingStep("exercise")}
                        >
                          Rediger deløvelse
                        </button>
                        <button
                          className={styles.primaryButton}
                          type="button"
                          onClick={() => openStep("wardrobe")}
                        >
                          Fortsæt til garderobe
                        </button>
                      </>
                    ) : (
                      <>
                        {addingExercise &&
                        initialDraft &&
                        selectedGoalId &&
                        !exerciseBusy ? (
                          <Link
                            className={styles.secondaryButton}
                            href={buildTopicEditorHref({
                              goalId: selectedGoalId,
                              topicId: initialDraft.topic.id,
                            })}
                          >
                            Annuller ny deløvelse
                          </Link>
                        ) : null}
                        {exerciseEditing ? (
                          <button
                            className={styles.secondaryButton}
                            type="button"
                            disabled={exerciseBusy}
                            onClick={() => cancelEditingStep("exercise")}
                          >
                            Annuller ændringer
                          </button>
                        ) : null}
                        <button
                          className={styles.primaryButton}
                          type="submit"
                          disabled={
                            exerciseBusy ||
                            exerciseTitle.trim().length === 0 ||
                            exerciseInstructions.trim().length === 0
                          }
                        >
                          {exerciseBusy
                            ? "Gemmer…"
                            : exerciseEditing
                              ? "Gem ændringer"
                              : "Gem deløvelse"}
                        </button>
                      </>
                    )}
                  </div>
                </form>
              ) : null}

              {activeStep === "wardrobe" ? (
                <WardrobeAuthoring
                  initialItems={savedWardrobeItems}
                  onAnnouncement={handleWardrobeAnnouncement}
                  onBusyChange={handleWardrobeBusyChange}
                  onClearNavigationWarning={clearWardrobeNavigationWarning}
                  onContinue={() => openStep("review")}
                  onDirtyChange={handleWardrobeDirtyChange}
                  onItemsChange={handleWardrobeItemsChange}
                  onOpenAssistant={openWardrobeAssistant}
                  requestId={wardrobeRequestId}
                  suggestions={wardrobeSuggestions}
                  topicId={
                    topicState.status === "success" ? topicState.topicId : ""
                  }
                />
              ) : null}

              {activeStep === "review" ? (
                <div className={styles.stepContent}>
                  <div className={styles.stepIntro}>
                    <p className={styles.eyebrow}>Gennemgang</p>
                    <h3>
                      {isPublishedTopic
                        ? "Gennemgå det publicerede forløb"
                        : "Forløbets første kladder er klar"}
                    </h3>
                    <p>
                      {isPublishedTopic
                        ? "Du kan gå tilbage til hvert trin og redigere de gemte felter. Kun ændringer til dele, der allerede er publiceret, slår direkte igennem. AI kan hjælpe med et ekstra tjek, men ændrer aldrig noget uden dit valg."
                        : "Alt er fortsat upubliceret. Du kan gå tilbage til hvert trin og redigere de gemte felter. AI kan hjælpe med et ekstra tjek, men ændrer og publicerer aldrig noget her."}
                    </p>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={openReviewAssistant}
                    >
                      Hjælp mig med gennemgangen
                    </button>
                  </div>
                  <div className={styles.reviewGrid}>
                    <article>
                      <span>1</span>
                      <div>
                        <small>Emne</small>
                        <strong>
                          {savedTopicSnapshot?.title ?? "Gemt titel mangler"}
                        </strong>
                        <p>
                          {isPublishedTopic ? "Publiceret" : "Gemt som kladde"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        aria-label={
                          isPublishedTopic
                            ? "Rediger det publicerede emne"
                            : "Rediger emnekladden"
                        }
                        onClick={() => beginEditingStep("topic")}
                      >
                        Rediger
                      </button>
                    </article>
                    <article>
                      <span>2</span>
                      <div>
                        <small>Mål</small>
                        <strong>
                          {savedGoalSnapshot?.title ?? "Gemt titel mangler"}
                        </strong>
                        <p>
                          {isPublishedGoal ? "Publiceret" : "Gemt som kladde"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        aria-label={
                          isPublishedGoal
                            ? "Rediger det publicerede mål"
                            : "Rediger målkladden"
                        }
                        onClick={() => beginEditingStep("goal")}
                      >
                        Rediger
                      </button>
                    </article>
                    <article>
                      <span>3</span>
                      <div>
                        <small>Deløvelse</small>
                        <strong>
                          {savedExerciseSnapshot?.title ?? "Gemt titel mangler"}
                        </strong>
                        <p>
                          {isPublishedExercise
                            ? "Publiceret"
                            : "Gemt som kladde"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        aria-label={
                          isPublishedExercise
                            ? "Rediger den publicerede deløvelse"
                            : "Rediger deløvelseskladden"
                        }
                        onClick={() => beginEditingStep("exercise")}
                      >
                        Rediger
                      </button>
                    </article>
                    <article>
                      <span>4</span>
                      <div>
                        <small>Garderobe</small>
                        <strong>
                          {savedWardrobeItems.length} gemte garderobeting
                        </strong>
                        <p>
                          {
                            savedWardrobeItems.filter(
                              (item) => item.editorialStatus === "approved",
                            ).length
                          }{" "}
                          godkendt ·{" "}
                          {
                            savedWardrobeItems.filter(
                              (item) => item.editorialStatus === "draft",
                            ).length
                          }{" "}
                          kladde ·{" "}
                          {
                            savedWardrobeItems.filter(
                              (item) => item.editorialStatus === "rejected",
                            ).length
                          }{" "}
                          afvist
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        aria-label="Åbn garderobetrinnet"
                        onClick={() => openStep("wardrobe")}
                      >
                        Åbn
                      </button>
                    </article>
                  </div>
                  {reviewResult ? (
                    <section aria-labelledby="ai-review-title">
                      <div className={styles.stepIntro}>
                        <p className={styles.eyebrow}>AI-forslag · ikke gemt</p>
                        <h3 id="ai-review-title">
                          {reviewResult.verdict === "ready_for_human_review"
                            ? "Klar til din menneskelige gennemgang"
                            : "Noget bør kontrolleres først"}
                        </h3>
                        <p>
                          AI-gennemgangen har ikke ændret
                          {isPublishedTopic ? " emnet" : " kladden"}. Brug
                          punkterne som hjælp, og rediger kun et trin, hvis du
                          selv vælger det.
                        </p>
                      </div>
                      <div className={styles.reviewGrid}>
                        {(
                          [
                            ["topic", "Emne"],
                            ["goal", "Mål"],
                            ["exercise", "Deløvelse"],
                            ["wardrobe", "Garderobe"],
                          ] as const
                        ).map(([key, label]) => {
                          const check = reviewResult.checklist[key];
                          return (
                            <article key={key}>
                              <span aria-hidden="true">
                                {check.status === "ok"
                                  ? "✓"
                                  : check.status === "attention"
                                    ? "!"
                                    : "·"}
                              </span>
                              <div>
                                <small>{label}</small>
                                <strong>
                                  {check.status === "ok"
                                    ? "Ser tydeligt ud"
                                    : check.status === "attention"
                                      ? "Kræver opmærksomhed"
                                      : "Valgfrit punkt"}
                                </strong>
                                <p>{check.note}</p>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                      {reviewResult.nextActions.length > 0 ? (
                        <div className={styles.stepIntro}>
                          <p className={styles.eyebrow}>
                            Forslag til næste tjek
                          </p>
                          <h3>Du beslutter, hvad der skal ske</h3>
                          <ol>
                            {reviewResult.nextActions.map((action, index) => (
                              <li key={`${index}-${action}`}>{action}</li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                  <div className={styles.draftFooter}>
                    <p className={styles.successMessage}>
                      {isPublishedTopic
                        ? "Ændringer til publicerede trin er live med det samme; kladder og nye garderobeting bliver i gennemgang."
                        : "Ingen af kladderne er publiceret automatisk."}
                    </p>
                    <Link className={styles.primaryButton} href="/emner">
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
