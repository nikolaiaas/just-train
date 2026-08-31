export type AdminContentOperationKey =
  | "content.topic_brief"
  | "content.wardrobe_examples"
  | "content.wardrobe_grid_plan"
  | "content.goal_draft"
  | "content.exercise_draft"
  | "content.draft_review"
  | "content.skill_suggestions"
  | "content.skill_package"
  | "content.skill_curriculum";

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
const WARDROBE_CATEGORIES = new Set(["clothing", "equipment", "effect"]);
const WARDROBE_RARITIES = new Set(["common", "rare", "special"]);
const SKILL_DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
const EXERCISE_MEASUREMENTS = new Set([
  "completion",
  "repetitions",
  "duration",
]);

// These phrases make persisted copy speak about a child to an adult. The
// editor-facing reply/reason fields are deliberately excluded from this gate.
// Child-directed safety such as "Få hjælp af en voksen" remains valid.
const PARENT_FRAMED_CHILD_COPY_PATTERN =
  /\b(?:(?:dit|jeres)\s+barn|barnets|barnet|børnenes|børnene|(?:som|kære)\s+(?:forælder(?:en)?|forældre(?:ne)?)|til\s+forældrene)\b/iu;

const NARRATED_CHILD_OR_PARENT_SUBJECT_PATTERN =
  /(?:^|[.!?;:])\s*(?:(?:(?:et|hvert)\s+)?barn|(?:(?:alle|nogle|andre|flere|mange|små|store)\s+)?børn|(?:en\s+)?forælder(?:en)?|(?:(?:dine|mine|sine|vores|jeres|deres)\s+)?forældre(?:ne)?)\s+\p{L}+/iu;

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

function isChildFacing(value: string): boolean {
  return (
    !PARENT_FRAMED_CHILD_COPY_PATTERN.test(value) &&
    !NARRATED_CHILD_OR_PARENT_SUBJECT_PATTERN.test(value)
  );
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
    !isChildFacing(description) ||
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
    !isChildFacing(summary) ||
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
    !isChildFacing(instructions) ||
    !isChildFacing(safetyNote) ||
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
      !isChildFacing(unlockRule) ||
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

function hasExactKeys(
  value: UnknownRecord,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function isBoundedText(
  value: string | null,
  maximumLength: number,
  required: boolean,
): value is string {
  return (
    value !== null &&
    value.length <= maximumLength &&
    (!required || value.length > 0)
  );
}

function normalizeWardrobeGridPlanOutput(
  value: UnknownRecord,
): JsonObject | null {
  if (
    !hasExactKeys(value, ["items"]) ||
    !Array.isArray(value.items) ||
    value.items.length !== 16
  ) {
    return null;
  }

  const items: JsonObject[] = [];
  const itemKeys = [
    "ordinal",
    "name",
    "description",
    "visualDescription",
    "category",
    "equipSlot",
    "rarity",
    "points",
    "unlockRule",
    "reason",
  ] as const;

  for (const [index, candidate] of value.items.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, itemKeys)) return null;

    const ordinal = candidate.ordinal;
    const name = normalizeRequiredSingleLine(candidate.name);
    const description = normalizeRequiredMultiline(candidate.description);
    const visualDescription = normalizeRequiredMultiline(
      candidate.visualDescription,
    );
    const unlockRule = normalizeMultiline(candidate.unlockRule);
    const reason = normalizeRequiredMultiline(candidate.reason);
    const category = candidate.category;
    const equipSlot = candidate.equipSlot;
    const rarity = candidate.rarity;
    const points = candidate.points;

    if (
      ordinal !== index + 1 ||
      !Number.isSafeInteger(ordinal) ||
      !isBoundedText(name, 80, true) ||
      !isBoundedText(description, 240, true) ||
      !isBoundedText(visualDescription, 500, true) ||
      !isBoundedText(unlockRule, 200, false) ||
      !isBoundedText(reason, 300, true) ||
      typeof category !== "string" ||
      !WARDROBE_CATEGORIES.has(category) ||
      typeof equipSlot !== "string" ||
      !WARDROBE_EQUIP_SLOTS.has(equipSlot) ||
      typeof rarity !== "string" ||
      !WARDROBE_RARITIES.has(rarity) ||
      typeof points !== "number" ||
      !Number.isSafeInteger(points) ||
      points < 0 ||
      points > 1_000 ||
      (points === 0 ? unlockRule.length === 0 : unlockRule.length !== 0) ||
      !isChildFacing(description) ||
      !isChildFacing(unlockRule)
    ) {
      return null;
    }

    items.push({
      category,
      description,
      equipSlot,
      name,
      ordinal,
      points,
      rarity,
      reason,
      unlockRule,
      visualDescription,
    });
  }

  return { items };
}

function isSlug(value: string): boolean {
  return value.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function normalizeSkillSuggestionsOutput(
  value: UnknownRecord,
): JsonObject | null {
  if (
    !hasExactKeys(value, ["reply", "skills"]) ||
    !Array.isArray(value.skills) ||
    value.skills.length < 3 ||
    value.skills.length > 8
  ) {
    return null;
  }

  const reply = normalizeRequiredMultiline(value.reply);
  if (!isBoundedText(reply, 1500, true)) return null;

  const skills: JsonObject[] = [];
  const titles = new Set<string>();
  const slugs = new Set<string>();
  const keys = [
    "ordinal",
    "title",
    "slug",
    "childDescription",
    "difficulty",
    "estimatedMinutes",
    "editorialReason",
  ] as const;

  for (const [index, candidate] of value.skills.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, keys)) return null;

    const title = normalizeRequiredSingleLine(candidate.title);
    const slug = normalizeRequiredSingleLine(candidate.slug);
    const childDescription = normalizeRequiredMultiline(
      candidate.childDescription,
    );
    const editorialReason = normalizeRequiredMultiline(
      candidate.editorialReason,
    );
    const titleKey = title?.toLocaleLowerCase("da-DK");
    const slugKey = slug?.toLocaleLowerCase("en-US");

    if (
      candidate.ordinal !== index + 1 ||
      !Number.isSafeInteger(candidate.ordinal) ||
      !isBoundedText(title, 120, true) ||
      !isBoundedText(slug, 120, true) ||
      !isSlug(slug) ||
      !isBoundedText(childDescription, 600, true) ||
      !isChildFacing(childDescription) ||
      !SKILL_DIFFICULTIES.has(String(candidate.difficulty)) ||
      !Number.isSafeInteger(candidate.estimatedMinutes) ||
      Number(candidate.estimatedMinutes) < 1 ||
      Number(candidate.estimatedMinutes) > 180 ||
      !isBoundedText(editorialReason, 500, true) ||
      !titleKey ||
      !slugKey ||
      titles.has(titleKey) ||
      slugs.has(slugKey)
    ) {
      return null;
    }

    titles.add(titleKey);
    slugs.add(slugKey);
    skills.push({
      childDescription,
      difficulty: String(candidate.difficulty),
      editorialReason,
      estimatedMinutes: Number(candidate.estimatedMinutes),
      ordinal: index + 1,
      slug,
      title,
    });
  }

  return { reply, skills };
}

function normalizeSkillPackageOutput(value: UnknownRecord): JsonObject | null {
  if (
    !hasExactKeys(value, ["reply", "skill", "exercises"]) ||
    !isRecord(value.skill) ||
    !Array.isArray(value.exercises) ||
    value.exercises.length < 2 ||
    value.exercises.length > 8
  ) {
    return null;
  }

  const reply = normalizeRequiredMultiline(value.reply);
  const skill = value.skill;
  const skillKeys = [
    "title",
    "slug",
    "childDescription",
    "difficulty",
    "estimatedMinutes",
    "equipment",
    "editorialReason",
  ] as const;

  if (!isBoundedText(reply, 1500, true) || !hasExactKeys(skill, skillKeys)) {
    return null;
  }

  const title = normalizeRequiredSingleLine(skill.title);
  const slug = normalizeRequiredSingleLine(skill.slug);
  const childDescription = normalizeRequiredMultiline(skill.childDescription);
  const equipment = normalizeEquipment(skill.equipment);
  const editorialReason = normalizeRequiredMultiline(skill.editorialReason);

  if (
    !isBoundedText(title, 120, true) ||
    !isBoundedText(slug, 120, true) ||
    !isSlug(slug) ||
    !isBoundedText(childDescription, 600, true) ||
    !isChildFacing(childDescription) ||
    !SKILL_DIFFICULTIES.has(String(skill.difficulty)) ||
    !Number.isSafeInteger(skill.estimatedMinutes) ||
    Number(skill.estimatedMinutes) < 1 ||
    Number(skill.estimatedMinutes) > 180 ||
    equipment === null ||
    equipment.length > 12 ||
    equipment.some((item) => item.length > 80) ||
    !isBoundedText(editorialReason, 500, true)
  ) {
    return null;
  }

  const exercises: JsonObject[] = [];
  const titles = new Set<string>();
  const slugs = new Set<string>();
  const exerciseKeys = [
    "ordinal",
    "title",
    "slug",
    "childInstructions",
    "measurement",
    "targetValue",
    "recommendedMinutes",
    "equipment",
    "childSafetyNote",
    "editorialReason",
  ] as const;

  for (const [index, candidate] of value.exercises.entries()) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, exerciseKeys)) {
      return null;
    }

    const exerciseTitle = normalizeRequiredSingleLine(candidate.title);
    const exerciseSlug = normalizeRequiredSingleLine(candidate.slug);
    const childInstructions = normalizeRequiredMultiline(
      candidate.childInstructions,
    );
    const childSafetyNote = normalizeRequiredMultiline(
      candidate.childSafetyNote,
    );
    const exerciseEquipment = normalizeEquipment(candidate.equipment);
    const exerciseReason = normalizeRequiredMultiline(
      candidate.editorialReason,
    );
    const measurement = String(candidate.measurement);
    const targetValue = candidate.targetValue;
    const titleKey = exerciseTitle?.toLocaleLowerCase("da-DK");
    const slugKey = exerciseSlug?.toLocaleLowerCase("en-US");
    const targetIsValid =
      (measurement === "completion" && targetValue === null) ||
      (measurement === "repetitions" &&
        Number.isSafeInteger(targetValue) &&
        Number(targetValue) >= 1 &&
        Number(targetValue) <= 10_000) ||
      (measurement === "duration" &&
        Number.isSafeInteger(targetValue) &&
        Number(targetValue) >= 1 &&
        Number(targetValue) <= 86_400);

    if (
      candidate.ordinal !== index + 1 ||
      !Number.isSafeInteger(candidate.ordinal) ||
      !isBoundedText(exerciseTitle, 120, true) ||
      !isBoundedText(exerciseSlug, 120, true) ||
      !isSlug(exerciseSlug) ||
      !isBoundedText(childInstructions, 1000, true) ||
      !isChildFacing(childInstructions) ||
      !EXERCISE_MEASUREMENTS.has(measurement) ||
      !targetIsValid ||
      !Number.isSafeInteger(candidate.recommendedMinutes) ||
      Number(candidate.recommendedMinutes) < 1 ||
      Number(candidate.recommendedMinutes) > 180 ||
      exerciseEquipment === null ||
      exerciseEquipment.length > 12 ||
      exerciseEquipment.some((item) => item.length > 80) ||
      !isBoundedText(childSafetyNote, 600, true) ||
      !isChildFacing(childSafetyNote) ||
      !isBoundedText(exerciseReason, 500, true) ||
      !titleKey ||
      !slugKey ||
      titles.has(titleKey) ||
      slugs.has(slugKey)
    ) {
      return null;
    }

    titles.add(titleKey);
    slugs.add(slugKey);
    exercises.push({
      childInstructions,
      childSafetyNote,
      editorialReason: exerciseReason,
      equipment: exerciseEquipment,
      measurement,
      ordinal: index + 1,
      recommendedMinutes: Number(candidate.recommendedMinutes),
      slug: exerciseSlug,
      targetValue: targetValue as JsonPrimitive,
      title: exerciseTitle,
    });
  }

  return {
    exercises,
    reply,
    skill: {
      childDescription,
      difficulty: String(skill.difficulty),
      editorialReason,
      equipment,
      estimatedMinutes: Number(skill.estimatedMinutes),
      slug,
      title,
    },
  };
}

function normalizeSkillCurriculumOutput(
  value: UnknownRecord,
): JsonObject | null {
  if (
    !hasExactKeys(value, ["reply", "skills"]) ||
    !Array.isArray(value.skills) ||
    value.skills.length < 2 ||
    value.skills.length > 6
  ) {
    return null;
  }

  const reply = normalizeRequiredMultiline(value.reply);
  if (!isBoundedText(reply, 1500, true)) return null;

  const skills: JsonObject[] = [];
  const titles = new Set<string>();
  const slugs = new Set<string>();
  const exerciseTitles = new Set<string>();
  const exerciseSlugs = new Set<string>();
  let exercisesPerSkill: number | null = null;
  let exerciseCount = 0;
  const skillKeys = [
    "ordinal",
    "title",
    "slug",
    "childDescription",
    "difficulty",
    "estimatedMinutes",
    "equipment",
    "editorialReason",
    "exercises",
  ] as const;

  for (const [index, candidate] of value.skills.entries()) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, skillKeys) ||
      candidate.ordinal !== index + 1
    ) {
      return null;
    }

    const normalizedPackage = normalizeSkillPackageOutput({
      exercises: candidate.exercises,
      reply,
      skill: {
        childDescription: candidate.childDescription,
        difficulty: candidate.difficulty,
        editorialReason: candidate.editorialReason,
        equipment: candidate.equipment,
        estimatedMinutes: candidate.estimatedMinutes,
        slug: candidate.slug,
        title: candidate.title,
      },
    });
    const normalizedSkill = normalizedPackage?.skill;
    const normalizedExercises = normalizedPackage?.exercises;
    if (
      !isRecord(normalizedSkill) ||
      !Array.isArray(normalizedExercises) ||
      typeof normalizedSkill.title !== "string" ||
      typeof normalizedSkill.slug !== "string"
    ) {
      return null;
    }

    exercisesPerSkill ??= normalizedExercises.length;
    if (normalizedExercises.length !== exercisesPerSkill) return null;

    const titleKey = normalizedSkill.title.toLocaleLowerCase("da-DK");
    const slugKey = normalizedSkill.slug.toLocaleLowerCase("en-US");
    if (titles.has(titleKey) || slugs.has(slugKey)) return null;
    titles.add(titleKey);
    slugs.add(slugKey);
    for (const exercise of normalizedExercises) {
      if (
        !isRecord(exercise) ||
        typeof exercise.title !== "string" ||
        typeof exercise.slug !== "string"
      ) {
        return null;
      }
      const exerciseTitleKey = exercise.title.toLocaleLowerCase("da-DK");
      const exerciseSlugKey = exercise.slug.toLocaleLowerCase("en-US");
      if (
        exerciseTitles.has(exerciseTitleKey) ||
        exerciseSlugs.has(exerciseSlugKey)
      ) {
        return null;
      }
      exerciseTitles.add(exerciseTitleKey);
      exerciseSlugs.add(exerciseSlugKey);
    }
    exerciseCount += normalizedExercises.length;
    skills.push({
      ...normalizedSkill,
      exercises: normalizedExercises,
      ordinal: index + 1,
    });
  }

  return exerciseCount <= 32 ? { reply, skills } : null;
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
    case "content.wardrobe_grid_plan":
      return normalizeWardrobeGridPlanOutput(value);
    case "content.draft_review":
      return normalizeDraftReviewOutput(value);
    case "content.skill_suggestions":
      return normalizeSkillSuggestionsOutput(value);
    case "content.skill_package":
      return normalizeSkillPackageOutput(value);
    case "content.skill_curriculum":
      return normalizeSkillCurriculumOutput(value);
  }
}
