export type WorkspaceStep =
  "topic" | "goal" | "exercise" | "wardrobe" | "review";

export type ExerciseMeasurement = "completion" | "repetitions" | "duration";

export type TopicEditorSnapshot = {
  accentColor: string;
  description: string;
  icon: string;
  title: string;
};

export type GoalEditorSnapshot = {
  difficulty: "beginner" | "intermediate" | "advanced";
  equipment: string;
  minutes: string;
  summary: string;
  title: string;
};

export type ExerciseEditorSnapshot = {
  equipment: string;
  instructions: string;
  measurement: ExerciseMeasurement;
  minutes: string;
  safety: string;
  target: string;
  title: string;
};

const assistantContextGreetings: Record<WorkspaceStep, string> = {
  topic:
    "Jeg hjælper med emnets navn, beskrivelse, ikon og farve. Du vælger selv, om et forslag skal bruges.",
  goal: "Jeg hjælper med et tydeligt første mål, tid og udstyr. Du vælger selv, om et forslag skal bruges.",
  exercise:
    "Jeg hjælper med en tryg deløvelse, måling og sikkerhed. Du vælger selv, om et forslag skal bruges.",
  wardrobe:
    "Jeg kan foreslå syntetiske, brandfrie garderobeeksempler. De bliver ikke gemt automatisk.",
  review:
    "Jeg kan gennemgå den samlede kladde og pege på noget, du bør kontrollere. Intet ændres eller publiceres automatisk.",
};

export function getAssistantContextGreeting(step: WorkspaceStep): string {
  return assistantContextGreetings[step];
}

export function assistantResponseBelongsToContext(input: {
  currentRequestId: string;
  responseRequestId: string | null;
  submittedRequestId: string | null;
}): boolean {
  return Boolean(
    input.responseRequestId &&
    input.responseRequestId === input.currentRequestId &&
    input.responseRequestId === input.submittedRequestId,
  );
}

export function topicSnapshotHasChanges(
  current: TopicEditorSnapshot,
  saved: TopicEditorSnapshot | null,
): boolean {
  return (
    saved === null ||
    current.accentColor !== saved.accentColor ||
    current.description !== saved.description ||
    current.icon !== saved.icon ||
    current.title !== saved.title
  );
}

export function goalSnapshotHasChanges(
  current: GoalEditorSnapshot,
  saved: GoalEditorSnapshot | null,
): boolean {
  return (
    saved === null ||
    current.difficulty !== saved.difficulty ||
    current.equipment !== saved.equipment ||
    current.minutes !== saved.minutes ||
    current.summary !== saved.summary ||
    current.title !== saved.title
  );
}

export function exerciseSnapshotHasChanges(
  current: ExerciseEditorSnapshot,
  saved: ExerciseEditorSnapshot | null,
): boolean {
  return (
    saved === null ||
    current.equipment !== saved.equipment ||
    current.instructions !== saved.instructions ||
    current.measurement !== saved.measurement ||
    current.minutes !== saved.minutes ||
    current.safety !== saved.safety ||
    current.target !== saved.target ||
    current.title !== saved.title
  );
}

/**
 * React actions reset successful/invalid forms through the browser's native
 * form-reset path. Keeping the select option defaults aligned with controlled
 * state prevents that reset from visually jumping back to "completion" while
 * the target field still describes repetitions or duration.
 */
export function syncExerciseMeasurementResetDefault(
  options: Iterable<{ defaultSelected: boolean; value: string }>,
  measurement: ExerciseMeasurement,
): void {
  for (const option of options) {
    option.defaultSelected = option.value === measurement;
  }
}
