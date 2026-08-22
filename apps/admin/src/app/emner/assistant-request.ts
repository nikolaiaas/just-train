export type AssistantMode =
  "topic" | "goal" | "exercise" | "wardrobe" | "review";

export type AssistantHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantTopicContext = {
  title: string;
  description: string;
  icon: string;
  accentColor: string;
};

export type AssistantGoalContext = {
  title: string;
  summary: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number | null;
  equipment: string[];
};

export type AssistantExerciseContext = {
  title: string;
  instructions: string;
  measurement: "completion" | "repetitions" | "duration";
  targetValue: number | null;
  recommendedMinutes: number | null;
  equipment: string[];
  safetyNote: string;
};

export type AssistantEditorialContext = {
  topic: AssistantTopicContext;
  goal: AssistantGoalContext;
  exercise: AssistantExerciseContext;
  wardrobeExamples: AssistantWardrobeItem[];
};

type TopicEditorialInput = {
  message: string;
  draft: AssistantTopicContext;
  history: AssistantHistoryMessage[];
};

type GoalEditorialInput = {
  message: string;
  topic: Pick<AssistantTopicContext, "title" | "description">;
  draft: AssistantGoalContext;
  history: AssistantHistoryMessage[];
};

type ExerciseEditorialInput = {
  message: string;
  topic: Pick<AssistantTopicContext, "title" | "description">;
  goal: AssistantGoalContext;
  position: number;
  sequence: Array<{
    position: number;
    title: string;
    measurement: AssistantExerciseContext["measurement"];
    targetValue: number | null;
  }>;
  draft: AssistantExerciseContext;
  history: AssistantHistoryMessage[];
};

type ReviewEditorialInput = {
  message: string;
  topic: AssistantTopicContext;
  goal: AssistantGoalContext;
  exercise: AssistantExerciseContext;
  wardrobeExamples: AssistantWardrobeItem[];
  history: AssistantHistoryMessage[];
};

export type AssistantRequest = {
  mode: AssistantMode;
  operationKey:
    | "content.topic_brief"
    | "content.goal_draft"
    | "content.exercise_draft"
    | "content.wardrobe_examples"
    | "content.draft_review";
  requestId: string;
  inputData:
    | TopicEditorialInput
    | GoalEditorialInput
    | ExerciseEditorialInput
    | ReviewEditorialInput;
};

export type TopicAssistantSuggestion = {
  kind: "topic";
  ready: boolean;
  title: string;
  description: string;
  icon: string;
  accentColor: string;
  reason: string;
};

export type GoalAssistantSuggestion = {
  kind: "goal";
  ready: boolean;
  title: string;
  summary: string;
  difficulty: AssistantGoalContext["difficulty"];
  estimatedMinutes: number | null;
  equipment: string[];
  reason: string;
};

export type ExerciseAssistantSuggestion = {
  kind: "exercise";
  ready: boolean;
  title: string;
  instructions: string;
  measurement: AssistantExerciseContext["measurement"];
  targetValue: number | null;
  recommendedMinutes: number | null;
  equipment: string[];
  safetyNote: string;
  reason: string;
};

export type AssistantSuggestion =
  | TopicAssistantSuggestion
  | GoalAssistantSuggestion
  | ExerciseAssistantSuggestion;

export type AssistantWardrobeItem = {
  name: string;
  icon: string;
  category: "clothing" | "equipment" | "effect";
  rarity: "common" | "rare" | "special";
  points: number;
  unlockRule: string;
  reason: string;
};

export type AssistantDraftReviewCheck = {
  status: "ok" | "attention" | "optional";
  note: string;
};

export type AssistantDraftReview = {
  verdict: "ready_for_human_review" | "needs_attention";
  checklist: {
    topic: AssistantDraftReviewCheck;
    goal: AssistantDraftReviewCheck;
    exercise: AssistantDraftReviewCheck;
    wardrobe: AssistantDraftReviewCheck;
  };
  nextActions: string[];
};

export type ParsedAssistantOutput = {
  reply: string;
  suggestion: AssistantSuggestion | null;
  items: AssistantWardrobeItem[];
  review?: AssistantDraftReview;
};

export type AssistantRequestValidation =
  { ok: true; value: AssistantRequest } | { ok: false; message: string };

export type AssistantFormDataLike = {
  getAll(name: string): readonly unknown[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const SINGLE_LINE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const FIELD_NAMES = [
  "mode",
  "requestId",
  "message",
  "history",
  "context",
] as const;

type AssistantFieldName = (typeof FIELD_NAMES)[number];
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    actualKeys.every((key) => keys.includes(key))
  );
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function readUniqueStrings(
  formData: AssistantFormDataLike,
): Record<AssistantFieldName, string> | null {
  const values = {} as Record<AssistantFieldName, string>;

  for (const field of FIELD_NAMES) {
    const entries = formData.getAll(field);

    if (entries.length !== 1 || typeof entries[0] !== "string") {
      return null;
    }

    values[field] = entries[0];
  }

  return values;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function normalizeMultiline(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

function isNormalizedString(
  value: unknown,
  maximum: number,
  allowMultiline = false,
): value is string {
  if (typeof value !== "string") return false;

  const normalized = allowMultiline ? normalizeMultiline(value) : value.trim();
  const invalidCharacters = allowMultiline
    ? DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(value)
    : SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value);

  return (
    value === normalized &&
    codePointLength(value) <= maximum &&
    !invalidCharacters
  );
}

function parseHistory(value: string): AssistantHistoryMessage[] | null {
  const parsed = parseJson(value);

  if (!Array.isArray(parsed) || parsed.length > 6) return null;

  const history: AssistantHistoryMessage[] = [];

  for (const entry of parsed) {
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, ["role", "content"]) ||
      (entry.role !== "user" && entry.role !== "assistant") ||
      typeof entry.content !== "string"
    ) {
      return null;
    }

    const content = normalizeMultiline(entry.content);

    if (
      content.length === 0 ||
      codePointLength(content) > 1_800 ||
      DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(entry.content)
    ) {
      return null;
    }

    history.push({ role: entry.role, content });
  }

  return history;
}

function isNullableInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number | null {
  return (
    value === null ||
    (Number.isInteger(value) &&
      (value as number) >= minimum &&
      (value as number) <= maximum)
  );
}

function parseUniqueStrings(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
  allowMultiline = false,
): string[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (
      !isNormalizedString(item, maximumLength, allowMultiline) ||
      item.length === 0
    )
      return null;
    const key = item.toLocaleLowerCase("da-DK");
    if (seen.has(key)) return null;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function parseEquipment(value: unknown, maximumItems = 12): string[] | null {
  return parseUniqueStrings(value, maximumItems, 80);
}

function parseTopicContext(value: unknown): AssistantTopicContext | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["title", "description", "icon", "accentColor"]) ||
    !isNormalizedString(value.title, 100) ||
    !isNormalizedString(value.description, 500, true) ||
    !isNormalizedString(value.icon, 16) ||
    !isNormalizedString(value.accentColor, 7) ||
    (value.accentColor.length > 0 &&
      !ACCENT_COLOR_PATTERN.test(value.accentColor))
  ) {
    return null;
  }

  return {
    title: value.title,
    description: value.description,
    icon: value.icon,
    accentColor: value.accentColor.toLocaleUpperCase("en-US"),
  };
}

function parseGoalContext(value: unknown): AssistantGoalContext | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "title",
      "summary",
      "difficulty",
      "estimatedMinutes",
      "equipment",
    ]) ||
    !isNormalizedString(value.title, 120) ||
    !isNormalizedString(value.summary, 1_000, true) ||
    (value.difficulty !== "beginner" &&
      value.difficulty !== "intermediate" &&
      value.difficulty !== "advanced") ||
    !isNullableInteger(value.estimatedMinutes, 1, 180)
  ) {
    return null;
  }

  const equipment = parseEquipment(value.equipment);
  if (!equipment) return null;

  return {
    title: value.title,
    summary: value.summary,
    difficulty: value.difficulty,
    estimatedMinutes: value.estimatedMinutes,
    equipment,
  };
}

function parseExerciseContext(value: unknown): AssistantExerciseContext | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "title",
      "instructions",
      "measurement",
      "targetValue",
      "recommendedMinutes",
      "equipment",
      "safetyNote",
    ]) ||
    !isNormalizedString(value.title, 120) ||
    !isNormalizedString(value.instructions, 1_500, true) ||
    (value.measurement !== "completion" &&
      value.measurement !== "repetitions" &&
      value.measurement !== "duration") ||
    !isNullableInteger(value.recommendedMinutes, 1, 180) ||
    !isNormalizedString(value.safetyNote, 1_000, true)
  ) {
    return null;
  }

  const equipment = parseEquipment(value.equipment);
  const targetIsValid =
    value.measurement === "completion"
      ? value.targetValue === null
      : isNullableInteger(
          value.targetValue,
          1,
          value.measurement === "duration" ? 86_400 : 10_000,
        );

  if (!equipment || !targetIsValid) return null;

  return {
    title: value.title,
    instructions: value.instructions,
    measurement: value.measurement,
    targetValue: value.targetValue as number | null,
    recommendedMinutes: value.recommendedMinutes,
    equipment,
    safetyNote: value.safetyNote,
  };
}

function parseWardrobeExamples(
  value: unknown,
  minimumItems: number,
): AssistantWardrobeItem[] | null {
  if (
    !Array.isArray(value) ||
    value.length < minimumItems ||
    value.length > 6
  ) {
    return null;
  }

  const items: AssistantWardrobeItem[] = [];

  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, [
        "name",
        "icon",
        "category",
        "rarity",
        "points",
        "unlockRule",
        "reason",
      ]) ||
      !isNormalizedString(item.name, 80) ||
      item.name.length === 0 ||
      !isNormalizedString(item.icon, 16) ||
      item.icon.length === 0 ||
      (item.category !== "clothing" &&
        item.category !== "equipment" &&
        item.category !== "effect") ||
      (item.rarity !== "common" &&
        item.rarity !== "rare" &&
        item.rarity !== "special") ||
      !Number.isInteger(item.points) ||
      (item.points as number) < 0 ||
      (item.points as number) > 1_000 ||
      !isNormalizedString(item.unlockRule, 200, true) ||
      !isNormalizedString(item.reason, 300, true) ||
      item.reason.length === 0 ||
      !(
        ((item.points as number) >= 1 && item.unlockRule.length === 0) ||
        ((item.points as number) === 0 && item.unlockRule.length >= 1)
      )
    ) {
      return null;
    }

    items.push({
      name: item.name,
      icon: item.icon,
      category: item.category,
      rarity: item.rarity,
      points: item.points as number,
      unlockRule: item.unlockRule,
      reason: item.reason,
    });
  }

  return items;
}

function parseEditorialContext(
  value: string,
): AssistantEditorialContext | null {
  const parsed = parseJson(value);

  if (
    !isRecord(parsed) ||
    (!hasExactKeys(parsed, ["topic", "goal", "exercise"]) &&
      !hasExactKeys(parsed, ["topic", "goal", "exercise", "wardrobeExamples"]))
  ) {
    return null;
  }

  const topic = parseTopicContext(parsed.topic);
  const goal = parseGoalContext(parsed.goal);
  const exercise = parseExerciseContext(parsed.exercise);
  const wardrobeExamples = parseWardrobeExamples(
    parsed.wardrobeExamples ?? [],
    0,
  );

  return topic && goal && exercise && wardrobeExamples
    ? { topic, goal, exercise, wardrobeExamples }
    : null;
}

function operationForMode(
  mode: AssistantMode,
): AssistantRequest["operationKey"] {
  if (mode === "topic") return "content.topic_brief";
  if (mode === "goal") return "content.goal_draft";
  if (mode === "exercise") return "content.exercise_draft";
  if (mode === "wardrobe") return "content.wardrobe_examples";
  return "content.draft_review";
}

export function validateAssistantRequest(
  formData: AssistantFormDataLike,
): AssistantRequestValidation {
  const values = readUniqueStrings(formData);

  if (!values) {
    return {
      ok: false,
      message: "AI-anmodningen kunne ikke læses. Genindlæs siden og prøv igen.",
    };
  }

  const mode = values.mode;
  const requestId = values.requestId.toLocaleLowerCase("en-US");
  const message = normalizeMultiline(values.message);
  const history = parseHistory(values.history);
  const context = parseEditorialContext(values.context);

  if (
    (mode !== "topic" &&
      mode !== "goal" &&
      mode !== "exercise" &&
      mode !== "wardrobe" &&
      mode !== "review") ||
    !UUID_PATTERN.test(requestId) ||
    message.length === 0 ||
    codePointLength(message) > 1_000 ||
    DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(values.message) ||
    !history ||
    !context
  ) {
    return {
      ok: false,
      message:
        "AI-anmodningen indeholder ugyldige eller for lange felter. Ret teksten og prøv igen.",
    };
  }

  const common = { message, history };
  let inputData: AssistantRequest["inputData"];

  if (mode === "goal") {
    inputData = {
      ...common,
      topic: {
        title: context.topic.title,
        description: context.topic.description,
      },
      draft: context.goal,
    };
  } else if (mode === "exercise") {
    inputData = {
      ...common,
      topic: {
        title: context.topic.title,
        description: context.topic.description,
      },
      goal: context.goal,
      position: 1,
      sequence: [],
      draft: context.exercise,
    };
  } else if (mode === "review") {
    const targetIsComplete =
      context.exercise.measurement === "completion" ||
      context.exercise.targetValue !== null;

    if (
      context.topic.title.length === 0 ||
      context.topic.description.length === 0 ||
      context.topic.icon.length === 0 ||
      context.topic.accentColor.length === 0 ||
      context.goal.title.length === 0 ||
      context.goal.summary.length === 0 ||
      context.goal.estimatedMinutes === null ||
      context.exercise.title.length === 0 ||
      context.exercise.instructions.length === 0 ||
      context.exercise.recommendedMinutes === null ||
      context.exercise.safetyNote.length === 0 ||
      !targetIsComplete
    ) {
      return {
        ok: false,
        message:
          "Gennemgangen kræver et gemt emne, mål og deløvelse med alle obligatoriske felter.",
      };
    }

    inputData = {
      ...common,
      topic: context.topic,
      goal: context.goal,
      exercise: context.exercise,
      wardrobeExamples: context.wardrobeExamples,
    };
  } else {
    inputData = { ...common, draft: context.topic };
  }

  return {
    ok: true,
    value: {
      mode,
      operationKey: operationForMode(mode),
      requestId,
      inputData,
    },
  };
}

function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value === normalizeMultiline(value) &&
    codePointLength(value) >= minimum &&
    codePointLength(value) <= maximum &&
    !DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function parseTopicOutput(value: UnknownRecord): ParsedAssistantOutput | null {
  if (
    !hasExactKeys(value, ["reply", "suggestion"]) ||
    !isBoundedString(value.reply, 1, 1_500) ||
    !isRecord(value.suggestion) ||
    !hasExactKeys(value.suggestion, [
      "ready",
      "title",
      "description",
      "icon",
      "accentColor",
      "reason",
    ]) ||
    typeof value.suggestion.ready !== "boolean" ||
    !isBoundedString(value.suggestion.title, 0, 100) ||
    !isBoundedString(value.suggestion.description, 0, 500) ||
    !isBoundedString(value.suggestion.icon, 0, 16) ||
    !isBoundedString(value.suggestion.accentColor, 0, 7) ||
    (value.suggestion.accentColor.length > 0 &&
      !ACCENT_COLOR_PATTERN.test(value.suggestion.accentColor)) ||
    !isBoundedString(value.suggestion.reason, 0, 500)
  ) {
    return null;
  }

  if (
    value.suggestion.ready &&
    (value.suggestion.title.length === 0 ||
      value.suggestion.description.length === 0 ||
      value.suggestion.icon.length === 0 ||
      value.suggestion.accentColor.length === 0)
  ) {
    return null;
  }

  return {
    reply: value.reply,
    suggestion: {
      kind: "topic",
      ready: value.suggestion.ready,
      title: value.suggestion.title,
      description: value.suggestion.description,
      icon: value.suggestion.icon,
      accentColor: value.suggestion.accentColor.toLocaleUpperCase("en-US"),
      reason: value.suggestion.reason,
    },
    items: [],
  };
}

function parseGoalOutput(value: UnknownRecord): ParsedAssistantOutput | null {
  if (
    !hasExactKeys(value, ["reply", "suggestion"]) ||
    !isBoundedString(value.reply, 1, 1_500) ||
    !isRecord(value.suggestion) ||
    !hasExactKeys(value.suggestion, [
      "ready",
      "title",
      "summary",
      "difficulty",
      "estimatedMinutes",
      "equipment",
      "reason",
    ]) ||
    typeof value.suggestion.ready !== "boolean" ||
    !isBoundedString(value.suggestion.title, 0, 120) ||
    !isBoundedString(value.suggestion.summary, 0, 1_000) ||
    (value.suggestion.difficulty !== "beginner" &&
      value.suggestion.difficulty !== "intermediate" &&
      value.suggestion.difficulty !== "advanced") ||
    !isNullableInteger(value.suggestion.estimatedMinutes, 1, 180) ||
    !isBoundedString(value.suggestion.reason, 1, 500)
  ) {
    return null;
  }

  const equipment = parseEquipment(value.suggestion.equipment);
  if (
    !equipment ||
    (value.suggestion.ready &&
      (value.suggestion.title.length === 0 ||
        value.suggestion.summary.length === 0 ||
        value.suggestion.estimatedMinutes === null))
  ) {
    return null;
  }

  return {
    reply: value.reply,
    suggestion: {
      kind: "goal",
      ready: value.suggestion.ready,
      title: value.suggestion.title,
      summary: value.suggestion.summary,
      difficulty: value.suggestion.difficulty,
      estimatedMinutes: value.suggestion.estimatedMinutes,
      equipment,
      reason: value.suggestion.reason,
    },
    items: [],
  };
}

function parseExerciseOutput(
  value: UnknownRecord,
): ParsedAssistantOutput | null {
  if (
    !hasExactKeys(value, ["reply", "suggestion"]) ||
    !isBoundedString(value.reply, 1, 1_500) ||
    !isRecord(value.suggestion) ||
    !hasExactKeys(value.suggestion, [
      "ready",
      "title",
      "instructions",
      "measurement",
      "targetValue",
      "recommendedMinutes",
      "equipment",
      "safetyNote",
      "reason",
    ]) ||
    typeof value.suggestion.ready !== "boolean" ||
    !isBoundedString(value.suggestion.title, 0, 120) ||
    !isBoundedString(value.suggestion.instructions, 0, 1_500) ||
    (value.suggestion.measurement !== "completion" &&
      value.suggestion.measurement !== "repetitions" &&
      value.suggestion.measurement !== "duration") ||
    !isNullableInteger(value.suggestion.recommendedMinutes, 1, 180) ||
    !isBoundedString(value.suggestion.safetyNote, 0, 1_000) ||
    !isBoundedString(value.suggestion.reason, 1, 500)
  ) {
    return null;
  }

  const equipment = parseEquipment(value.suggestion.equipment);
  const targetIsValid =
    value.suggestion.measurement === "completion"
      ? value.suggestion.targetValue === null
      : isNullableInteger(
          value.suggestion.targetValue,
          1,
          value.suggestion.measurement === "duration" ? 86_400 : 10_000,
        );

  if (
    !equipment ||
    !targetIsValid ||
    (value.suggestion.ready &&
      (value.suggestion.title.length === 0 ||
        value.suggestion.instructions.length === 0 ||
        value.suggestion.recommendedMinutes === null ||
        value.suggestion.safetyNote.length === 0 ||
        (value.suggestion.measurement !== "completion" &&
          value.suggestion.targetValue === null)))
  ) {
    return null;
  }

  return {
    reply: value.reply,
    suggestion: {
      kind: "exercise",
      ready: value.suggestion.ready,
      title: value.suggestion.title,
      instructions: value.suggestion.instructions,
      measurement: value.suggestion.measurement,
      targetValue: value.suggestion.targetValue as number | null,
      recommendedMinutes: value.suggestion.recommendedMinutes,
      equipment,
      safetyNote: value.suggestion.safetyNote,
      reason: value.suggestion.reason,
    },
    items: [],
  };
}

function parseWardrobeOutput(
  value: UnknownRecord,
): ParsedAssistantOutput | null {
  if (
    !hasExactKeys(value, ["reply", "items"]) ||
    !isBoundedString(value.reply, 1, 1_500)
  ) {
    return null;
  }

  const items = parseWardrobeExamples(value.items, 3);
  if (!items) return null;

  return { reply: value.reply, suggestion: null, items };
}

function parseReviewCheck(
  value: unknown,
  allowOptional: boolean,
): AssistantDraftReviewCheck | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["status", "note"]) ||
    (value.status !== "ok" &&
      value.status !== "attention" &&
      (!allowOptional || value.status !== "optional")) ||
    !isBoundedString(value.note, 1, 500)
  ) {
    return null;
  }

  return { status: value.status, note: value.note };
}

function parseReviewOutput(value: UnknownRecord): ParsedAssistantOutput | null {
  if (
    !hasExactKeys(value, ["reply", "verdict", "checklist", "nextActions"]) ||
    !isBoundedString(value.reply, 1, 1_500) ||
    (value.verdict !== "ready_for_human_review" &&
      value.verdict !== "needs_attention") ||
    !isRecord(value.checklist) ||
    !hasExactKeys(value.checklist, ["topic", "goal", "exercise", "wardrobe"]) ||
    !Array.isArray(value.nextActions) ||
    value.nextActions.length > 6
  ) {
    return null;
  }

  const topic = parseReviewCheck(value.checklist.topic, false);
  const goal = parseReviewCheck(value.checklist.goal, false);
  const exercise = parseReviewCheck(value.checklist.exercise, false);
  const wardrobe = parseReviewCheck(value.checklist.wardrobe, true);
  const nextActions = parseUniqueStrings(value.nextActions, 6, 300, true);

  if (!topic || !goal || !exercise || !wardrobe || !nextActions) return null;

  return {
    reply: value.reply,
    suggestion: null,
    items: [],
    review: {
      verdict: value.verdict,
      checklist: { topic, goal, exercise, wardrobe },
      nextActions,
    },
  };
}

export function parseAssistantOutput(
  mode: AssistantMode,
  value: unknown,
): ParsedAssistantOutput | null {
  if (!isRecord(value)) return null;

  if (mode === "topic") return parseTopicOutput(value);
  if (mode === "goal") return parseGoalOutput(value);
  if (mode === "exercise") return parseExerciseOutput(value);
  if (mode === "wardrobe") return parseWardrobeOutput(value);
  return parseReviewOutput(value);
}
