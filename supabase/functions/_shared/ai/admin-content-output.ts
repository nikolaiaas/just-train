export type AdminContentOperationKey =
  | "content.topic_brief"
  | "content.wardrobe_examples"
  | "content.goal_draft"
  | "content.exercise_draft"
  | "content.draft_review";

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
type UnknownRecord = Record<string, unknown>;

const WARDROBE_EQUIP_SLOTS = new Set([
  "head",
  "body",
  "held",
  "feet",
  "accessory",
]);

const DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu;
const SINGLE_LINE_SEPARATOR_PATTERN = /[\s\u0000-\u001f\u007f-\u009f]+/gu;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function normalizeMultiline(value: unknown): string | null {
  if (typeof value !== "string") return null;

  return value
    .replace(/\r\n?/gu, "\n")
    .replace(DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN, "")
    .trim();
}

function normalizeRequiredMultiline(value: unknown): string | null {
  const normalized = normalizeMultiline(value);
  return normalized ? normalized : null;
}

function normalizeSingleLine(value: unknown): string | null {
  return typeof value === "string"
    ? value.replace(SINGLE_LINE_SEPARATOR_PATTERN, " ").trim()
    : null;
}

function normalizeRequiredSingleLine(value: unknown): string | null {
  const normalized = normalizeSingleLine(value);
  return normalized ? normalized : null;
}

function normalizeEquipment(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const equipment: string[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    const item = normalizeRequiredSingleLine(candidate);
    if (!item) return null;

    const key = item.toLocaleLowerCase("da-DK");
    if (seen.has(key)) continue;

    seen.add(key);
    equipment.push(item);
  }

  return equipment;
}

function normalizeTopicOutput(value: UnknownRecord): JsonObject | null {
  const reply = normalizeRequiredMultiline(value.reply);
  const suggestion = value.suggestion;
  if (!reply || !isRecord(suggestion) || typeof suggestion.ready !== "boolean")
    return null;

  const title = normalizeSingleLine(suggestion.title);
  const description = normalizeMultiline(suggestion.description);
  const icon = normalizeSingleLine(suggestion.icon);
  const reason = normalizeRequiredMultiline(suggestion.reason);

  if (
    title === null ||
    description === null ||
    icon === null ||
    reason === null ||
    typeof suggestion.accentColor !== "string" ||
    (suggestion.ready &&
      (!title || !description || !icon || !suggestion.accentColor))
  ) {
    return null;
  }

  return {
    reply,
    suggestion: {
      accentColor: suggestion.accentColor,
      description,
      icon,
      ready: suggestion.ready,
      reason,
      title,
    },
  };
}

function normalizeGoalOutput(value: UnknownRecord): JsonObject | null {
  const reply = normalizeRequiredMultiline(value.reply);
  const suggestion = value.suggestion;
  if (!reply || !isRecord(suggestion) || typeof suggestion.ready !== "boolean")
    return null;

  const title = normalizeSingleLine(suggestion.title);
  const summary = normalizeMultiline(suggestion.summary);
  const reason = normalizeRequiredMultiline(suggestion.reason);
  const equipment = normalizeEquipment(suggestion.equipment);
  const estimatedMinutes = suggestion.estimatedMinutes;

  if (!isNullableFiniteNumber(estimatedMinutes)) return null;

  if (
    title === null ||
    summary === null ||
    reason === null ||
    equipment === null ||
    typeof suggestion.difficulty !== "string" ||
    (suggestion.ready && (!title || !summary || estimatedMinutes === null))
  ) {
    return null;
  }

  return {
    reply,
    suggestion: {
      difficulty: suggestion.difficulty,
      equipment,
      estimatedMinutes,
      ready: suggestion.ready,
      reason,
      summary,
      title,
    },
  };
}

function normalizeExerciseOutput(value: UnknownRecord): JsonObject | null {
  const reply = normalizeRequiredMultiline(value.reply);
  const suggestion = value.suggestion;
  if (!reply || !isRecord(suggestion) || typeof suggestion.ready !== "boolean")
    return null;

  const title = normalizeSingleLine(suggestion.title);
  const instructions = normalizeMultiline(suggestion.instructions);
  const safetyNote = normalizeMultiline(suggestion.safetyNote);
  const reason = normalizeRequiredMultiline(suggestion.reason);
  const equipment = normalizeEquipment(suggestion.equipment);
  const recommendedMinutes = suggestion.recommendedMinutes;
  const targetValue = suggestion.targetValue;

  if (
    !isNullableFiniteNumber(recommendedMinutes) ||
    !isNullableFiniteNumber(targetValue)
  ) {
    return null;
  }

  if (
    title === null ||
    instructions === null ||
    safetyNote === null ||
    reason === null ||
    equipment === null ||
    typeof suggestion.measurement !== "string" ||
    (suggestion.ready &&
      (!title ||
        !instructions ||
        !safetyNote ||
        recommendedMinutes === null ||
        (suggestion.measurement !== "completion" && targetValue === null)))
  ) {
    return null;
  }

  return {
    reply,
    suggestion: {
      equipment,
      instructions,
      measurement: suggestion.measurement,
      ready: suggestion.ready,
      reason,
      recommendedMinutes,
      safetyNote,
      targetValue,
      title,
    },
  };
}

function normalizeWardrobeOutput(value: UnknownRecord): JsonObject | null {
  const reply = normalizeRequiredMultiline(value.reply);
  if (!reply || !Array.isArray(value.items)) return null;

  const items: JsonObject[] = [];

  for (const candidate of value.items) {
    if (!isRecord(candidate)) return null;

    const name = normalizeRequiredSingleLine(candidate.name);
    const icon = normalizeRequiredSingleLine(candidate.icon);
    const unlockRule = normalizeMultiline(candidate.unlockRule);
    const reason = normalizeRequiredMultiline(candidate.reason);
    const equipSlot = candidate.equipSlot;

    if (
      !name ||
      !icon ||
      unlockRule === null ||
      !reason ||
      typeof candidate.category !== "string" ||
      typeof candidate.rarity !== "string" ||
      typeof candidate.points !== "number" ||
      (equipSlot !== undefined &&
        (typeof equipSlot !== "string" || !WARDROBE_EQUIP_SLOTS.has(equipSlot)))
    ) {
      return null;
    }

    items.push({
      category: candidate.category,
      ...(typeof equipSlot === "string" ? { equipSlot } : {}),
      icon,
      name,
      points: candidate.points,
      rarity: candidate.rarity,
      reason,
      unlockRule,
    });
  }

  return { items, reply };
}

function normalizeReviewCheck(
  value: unknown,
  allowOptional: boolean,
): JsonObject | null {
  if (!isRecord(value)) return null;

  const note = normalizeRequiredMultiline(value.note);
  const status = value.status;

  if (
    !note ||
    (status !== "ok" &&
      status !== "attention" &&
      (!allowOptional || status !== "optional"))
  ) {
    return null;
  }

  return { note, status };
}

function normalizeDraftReviewOutput(value: UnknownRecord): JsonObject | null {
  const reply = normalizeRequiredMultiline(value.reply);
  const checklist = value.checklist;

  if (
    !reply ||
    (value.verdict !== "ready_for_human_review" &&
      value.verdict !== "needs_attention") ||
    !isRecord(checklist) ||
    !Array.isArray(value.nextActions)
  ) {
    return null;
  }

  const topic = normalizeReviewCheck(checklist.topic, false);
  const goal = normalizeReviewCheck(checklist.goal, false);
  const exercise = normalizeReviewCheck(checklist.exercise, false);
  const wardrobe = normalizeReviewCheck(checklist.wardrobe, true);
  const nextActions = normalizeEquipment(value.nextActions);

  if (!topic || !goal || !exercise || !wardrobe || !nextActions) return null;

  return {
    checklist: { exercise, goal, topic, wardrobe },
    nextActions,
    reply,
    verdict: value.verdict,
  };
}

/**
 * Canonicalizes provider text before the version-pinned SQL completion gate.
 * The strict provider schema handles shape and bounds; this boundary aligns
 * whitespace and case-insensitive equipment uniqueness with persisted content.
 */
export function normalizeAdminContentOutput(
  operationKey: AdminContentOperationKey,
  value: unknown,
): JsonObject | null {
  if (!isRecord(value)) return null;

  switch (operationKey) {
    case "content.topic_brief":
      return normalizeTopicOutput(value);
    case "content.goal_draft":
      return normalizeGoalOutput(value);
    case "content.exercise_draft":
      return normalizeExerciseOutput(value);
    case "content.wardrobe_examples":
      return normalizeWardrobeOutput(value);
    case "content.draft_review":
      return normalizeDraftReviewOutput(value);
  }
}
