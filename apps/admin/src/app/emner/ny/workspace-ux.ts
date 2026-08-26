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

export type WardrobeEditorSnapshot = {
  category: "clothing" | "equipment" | "effect";
  description: string;
  editorialNote: string;
  equipSlot: "" | "head" | "body" | "held" | "feet" | "accessory";
  icon: string;
  imagePath: string;
  name: string;
  points: string;
  rarity: "common" | "rare" | "special";
  unlockMode: "points" | "rule";
  unlockRule: string;
};

export type WardrobeSuggestionSnapshotInput = {
  category: WardrobeEditorSnapshot["category"];
  description: string;
  equipSlot: Exclude<WardrobeEditorSnapshot["equipSlot"], "">;
  imagePath: string;
  name: string;
  points: number;
  rarity: WardrobeEditorSnapshot["rarity"];
  reason: string;
  unlockRule: string;
};

const assistantContextGreetings: Record<WorkspaceStep, string> = {
  topic:
    "Jeg hjælper med emnets navn, beskrivelse, ikon og farve. Du vælger selv, om et forslag skal bruges.",
  goal: "Jeg hjælper med en tydelig første færdighed, tid og udstyr. Du vælger selv, om et forslag skal bruges.",
  exercise:
    "Jeg hjælper med en tryg øvelse, måling og sikkerhed. Du vælger selv, om et forslag skal bruges.",
  wardrobe:
    "Jeg kan lave 16 syntetiske, brandfrie garderobebilleder med beskrivelser. De er ikke gemt, før du vælger og tilpasser hvert forslag.",
  review:
    "Jeg kan gennemgå den samlede kladde og pege på noget, du bør kontrollere. Intet ændres eller publiceres automatisk.",
};

type AssistantContextGreetingOptions = {
  addingGoal?: boolean;
  editingGoal?: boolean;
  currentGoalTitle?: string;
  existingGoalTitles?: readonly string[];
};

type TopicWorkspaceCopyInput = {
  isAddingGoal: boolean;
  isExistingTopic: boolean;
  isPublishedTopic: boolean;
  topicTitle: string;
};

export type TopicWorkspaceCopy = {
  ariaLabel: string;
  closeAction: string;
  closeLabel: string;
  description: string;
  eyebrow: string;
  heading: string;
  stepsLabel: string;
};

function describeExistingGoalSequence(titles: readonly string[]): string {
  const visibleTitles = titles.slice(0, 8).map((title, index) => {
    const normalized = title.replace(/\s+/gu, " ").trim();
    const shortened = Array.from(normalized).slice(0, 80).join("");
    return `${index + 1}. ${shortened}`;
  });
  const hiddenCount = Math.max(0, titles.length - visibleTitles.length);

  return [
    visibleTitles.join("; "),
    hiddenCount > 0 ? `og ${hiddenCount} mere` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function getAssistantContextGreeting(
  step: WorkspaceStep,
  options: AssistantContextGreetingOptions = {},
): string {
  if (step === "goal" && options.addingGoal) {
    const existingGoalTitles = options.existingGoalTitles ?? [];
    const sequence = describeExistingGoalSequence(existingGoalTitles);

    return sequence
      ? `Du tilføjer en ny færdighed efter de eksisterende. De står i denne rækkefølge: ${sequence}. Jeg hjælper med en tydelig ny færdighed, tid og udstyr. Du vælger selv, om et forslag skal bruges.`
      : "Du tilføjer en ny færdighed til det gemte emne. Jeg hjælper med færdigheden, tid og udstyr. Du vælger selv, om et forslag skal bruges.";
  }

  if (step === "goal" && options.editingGoal) {
    const title = options.currentGoalTitle?.replace(/\s+/gu, " ").trim();

    return title
      ? `Du redigerer den eksisterende færdighed “${Array.from(title).slice(0, 120).join("")}”. Jeg hjælper med at gøre færdigheden, tiden og udstyret tydeligt. Du vælger selv, om et forslag skal bruges.`
      : "Du redigerer en eksisterende færdighed. Jeg hjælper med at gøre færdigheden, tiden og udstyret tydeligt. Du vælger selv, om et forslag skal bruges.";
  }

  return assistantContextGreetings[step];
}

export function getAssistantMessagePlaceholder(
  step: WorkspaceStep,
  options: Pick<
    AssistantContextGreetingOptions,
    "addingGoal" | "editingGoal"
  > = {},
): string {
  if (step === "goal" && options.addingGoal) {
    return "Fx: Hjælp mig med en ny færdighed, der bygger videre på de eksisterende";
  }

  if (step === "goal" && options.editingGoal) {
    return "Fx: Hjælp mig med at gøre denne færdighed tydeligere";
  }

  if (step === "goal") {
    return "Fx: Hjælp mig med en enkel første færdighed";
  }

  if (step === "topic") return "Fx: Lav et emne om balance og bevægelse";
  if (step === "exercise") {
    return "Fx: Lav en tryg øvelse, barnet kan forstå";
  }
  if (step === "wardrobe") {
    return "Fx: Foreslå fem sjove ting til garderoben";
  }
  return "Fx: Gennemgå kladden for klarhed og sikkerhed";
}

export function getTopicWorkspaceCopy({
  isAddingGoal,
  isExistingTopic,
  isPublishedTopic,
  topicTitle,
}: TopicWorkspaceCopyInput): TopicWorkspaceCopy {
  const title = topicTitle.trim() || "emnet";

  if (isAddingGoal) {
    return {
      ariaLabel: `Tilføj færdighed til ${title}`,
      closeAction: "går tilbage til emnet",
      closeLabel: "Tilbage til emnet",
      description:
        "Emnet er allerede gemt. Du opretter kun en ny færdighed og dens øvelser som upublicerede kladder. AI ændrer aldrig felter eller publicerer uden dit valg.",
      eyebrow: "Ny færdighed",
      heading: `Tilføj en færdighed til ${title}`,
      stepsLabel: "Oprettelse af færdighed",
    };
  }

  if (isExistingTopic) {
    return {
      ariaLabel: `Rediger ${title}`,
      closeAction: "lukker redigeringen",
      closeLabel: "Luk redigering",
      description: isPublishedTopic
        ? "Gemte ændringer til dele, der allerede er publiceret, slår direkte igennem i børnenes forløb. Kladder og nye garderobeting forbliver upublicerede. AI ændrer aldrig felter uden dit valg."
        : "Emnet er allerede gemt som en upubliceret kladde. Du kan redigere emnet, dets færdigheder, øvelser og garderobe. AI ændrer aldrig felter eller publicerer uden dit valg.",
      eyebrow: isPublishedTopic
        ? "Rediger publiceret emne"
        : "Rediger emnekladde",
      heading: `Rediger ${title}`,
      stepsLabel: "Emnets trin",
    };
  }

  return {
    ariaLabel: "Opret nyt emne",
    closeAction: "lukker kladden",
    closeLabel: "Luk kladden",
    description:
      "Opret emne, færdighed og øvelse som kladder. AI hjælper i hvert trin, men ændrer aldrig felter eller publicerer uden dit valg.",
    eyebrow: "Nyt emne",
    heading: "Skab et forløb sammen med AI",
    stepsLabel: "Emnekladdens trin",
  };
}

export function orderWardrobeSuggestions<
  Suggestion extends { name: string; ordinal: number },
>(suggestions: readonly Suggestion[]): Suggestion[] {
  return [...suggestions].sort(
    (left, right) =>
      left.ordinal - right.ordinal ||
      left.name.localeCompare(right.name, "da-DK"),
  );
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

export function wardrobeSnapshotHasChanges(
  current: WardrobeEditorSnapshot,
  saved: WardrobeEditorSnapshot | null,
): boolean {
  if (saved === null) return true;

  const normalizePoints = (value: string) => {
    const trimmed = value.trim();
    if (!/^\d+$/u.test(trimmed)) return trimmed;

    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) ? parsed.toString() : trimmed;
  };
  const normalizeSnapshot = (snapshot: WardrobeEditorSnapshot) => ({
    ...snapshot,
    description: snapshot.description.replace(/\r\n?/gu, "\n").trim(),
    editorialNote: snapshot.editorialNote.replace(/\r\n?/gu, "\n").trim(),
    icon: snapshot.icon.trim(),
    imagePath: snapshot.imagePath.trim(),
    name: snapshot.name.trim(),
    points: normalizePoints(snapshot.points),
    unlockRule: snapshot.unlockRule.replace(/\s+/gu, " ").trim(),
  });
  const normalizedCurrent = normalizeSnapshot(current);
  const normalizedSaved = normalizeSnapshot(saved);

  return (
    normalizedCurrent.category !== normalizedSaved.category ||
    normalizedCurrent.description !== normalizedSaved.description ||
    normalizedCurrent.editorialNote !== normalizedSaved.editorialNote ||
    normalizedCurrent.equipSlot !== normalizedSaved.equipSlot ||
    normalizedCurrent.icon !== normalizedSaved.icon ||
    normalizedCurrent.imagePath !== normalizedSaved.imagePath ||
    normalizedCurrent.name !== normalizedSaved.name ||
    normalizedCurrent.points !== normalizedSaved.points ||
    normalizedCurrent.rarity !== normalizedSaved.rarity ||
    normalizedCurrent.unlockMode !== normalizedSaved.unlockMode ||
    normalizedCurrent.unlockRule !== normalizedSaved.unlockRule
  );
}

export function wardrobeSuggestionSnapshot(
  item: WardrobeSuggestionSnapshotInput,
): WardrobeEditorSnapshot {
  return {
    category: item.category,
    description: item.description,
    editorialNote: item.reason,
    equipSlot: item.equipSlot,
    icon: "✨",
    imagePath: item.imagePath,
    name: item.name,
    points: item.points > 0 ? item.points.toString() : "0",
    rarity: item.rarity,
    unlockMode: item.points > 0 ? "points" : "rule",
    unlockRule: item.unlockRule,
  };
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
