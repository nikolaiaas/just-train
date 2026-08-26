import { getChildFacingCopyError } from "./child-facing-copy.ts";

export const MAX_CONTENT_TITLE_LENGTH = 120;
export const MAX_GOAL_SUMMARY_LENGTH = 1_000;
export const MAX_EXERCISE_INSTRUCTIONS_LENGTH = 1_500;
export const MAX_EXERCISE_SAFETY_NOTE_LENGTH = 1_000;
export const MAX_EQUIPMENT_ITEMS = 12;
export const MAX_EQUIPMENT_ITEM_LENGTH = 80;
export const MAX_CONTENT_SLUG_LENGTH = 120;
export const MAX_MEDIA_URL_LENGTH = 2_048;
export const MAX_REPETITION_TARGET = 10_000;
export const MAX_DURATION_TARGET_SECONDS = 86_400;
export const MAX_SORT_ORDER = 2_147_483_647;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SINGLE_LINE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const UNSIGNED_INTEGER_PATTERN = /^\d+$/u;

export type GoalDifficulty = "beginner" | "intermediate" | "advanced";
export type ExerciseMeasurement = "completion" | "repetitions" | "duration";

/**
 * Normalized values for an unpublished goals row. requestId is kept
 * separate from the database vocabulary because the server can use it as the
 * row id to make draft creation idempotent, as it does for topics.
 */
export type GoalDraftInput = {
  requestId: string;
  topicId: string;
  slug: string;
  title: string;
  summary: string;
  difficulty: GoalDifficulty;
  estimatedMinutes: number | null;
  equipment: string[];
  heroMediaUrl: string | null;
  sortOrder: number;
};

/**
 * Normalized values for an unpublished exercises row plus the three exercise
 * details shown by the administration reference. The current table stores
 * everything through sortOrder; recommendedMinutes, equipment, and safetyNote
 * intentionally remain explicit so they cannot be silently lost while their
 * persistent columns are added.
 */
export type ExerciseDraftInput = {
  requestId: string;
  goalId: string;
  slug: string;
  title: string;
  instructions: string;
  measurement: ExerciseMeasurement;
  targetValue: number | null;
  videoUrl: string | null;
  sortOrder: number;
  recommendedMinutes: number | null;
  equipment: string[];
  safetyNote: string;
};

export type GoalDraftFieldErrors = Partial<
  Record<
    | "requestId"
    | "topicId"
    | "title"
    | "summary"
    | "difficulty"
    | "estimatedMinutes"
    | "equipment"
    | "heroMediaUrl"
    | "sortOrder",
    string
  >
>;

export type ExerciseDraftFieldErrors = Partial<
  Record<
    | "requestId"
    | "goalId"
    | "title"
    | "instructions"
    | "measurement"
    | "targetValue"
    | "recommendedMinutes"
    | "equipment"
    | "safetyNote"
    | "videoUrl"
    | "sortOrder",
    string
  >
>;

export type GoalDraftValidation =
  | { ok: true; value: GoalDraftInput }
  | { ok: false; fieldErrors: GoalDraftFieldErrors; message: string };

export type ExerciseDraftValidation =
  | { ok: true; value: ExerciseDraftInput }
  | { ok: false; fieldErrors: ExerciseDraftFieldErrors; message: string };

export type ContentStepFormDataLike = {
  getAll(name: string): readonly unknown[];
};

const GOAL_FIELDS = [
  "requestId",
  "topicId",
  "title",
  "summary",
  "difficulty",
  "estimatedMinutes",
  "equipment",
  "heroMediaUrl",
  "sortOrder",
] as const;

const EXERCISE_FIELDS = [
  "requestId",
  "goalId",
  "title",
  "instructions",
  "measurement",
  "targetValue",
  "recommendedMinutes",
  "equipment",
  "safetyNote",
  "videoUrl",
  "sortOrder",
] as const;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function readUniqueStrings<Field extends string>(
  formData: ContentStepFormDataLike,
  fields: readonly Field[],
): { values: Record<Field, string>; unreadableFields: Field[] } {
  const values = {} as Record<Field, string>;
  const unreadableFields: Field[] = [];

  for (const field of fields) {
    const entries = formData.getAll(field);

    if (entries.length !== 1 || typeof entries[0] !== "string") {
      unreadableFields.push(field);
      continue;
    }

    values[field] = entries[0];
  }

  return { values, unreadableFields };
}

function normalizeUuid(value: string): string | null {
  const normalized = value.toLocaleLowerCase("en-US");
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeMultiline(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

/** Produces stable database slugs for Danish goal and exercise titles. */
export function normalizeDanishContentSlug(title: string): string {
  return title
    .trim()
    .toLocaleLowerCase("da-DK")
    .replaceAll("æ", "ae")
    .replaceAll("ø", "oe")
    .replaceAll("å", "aa")
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function parseOptionalInteger(
  value: string,
  minimum: number,
  maximum: number,
): number | null | undefined {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (!UNSIGNED_INTEGER_PATTERN.test(normalized)) {
    return undefined;
  }

  const parsed = Number(normalized);

  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    return undefined;
  }

  return parsed;
}

function parseRequiredInteger(
  value: string,
  minimum: number,
  maximum: number,
): number | undefined {
  const parsed = parseOptionalInteger(value, minimum, maximum);
  return parsed === null ? undefined : parsed;
}

function parseEquipment(value: string): string[] | null {
  if (DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(value)) {
    return null;
  }

  const rawItems = value
    .replace(/\r\n?/gu, "\n")
    .split(/[\n,;]/gu)
    .map((item) => item.replace(/\s+/gu, " ").trim())
    .filter(Boolean);

  const equipment: string[] = [];
  const normalizedItems = new Set<string>();

  for (const item of rawItems) {
    if (codePointLength(item) > MAX_EQUIPMENT_ITEM_LENGTH) {
      return null;
    }

    const normalizedItem = item.toLocaleLowerCase("da-DK");

    if (!normalizedItems.has(normalizedItem)) {
      normalizedItems.add(normalizedItem);
      equipment.push(item);
    }
  }

  return equipment.length <= MAX_EQUIPMENT_ITEMS ? equipment : null;
}

function parseOptionalMediaUrl(value: string): string | null | undefined {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (
    codePointLength(normalized) > MAX_MEDIA_URL_LENGTH ||
    SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);

    if (
      parsed.protocol !== "https:" ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

function validateTitle(
  rawTitle: string,
): { title: string; slug: string } | null {
  const title = rawTitle.trim();
  const slug = normalizeDanishContentSlug(title);

  if (
    title.length === 0 ||
    codePointLength(title) > MAX_CONTENT_TITLE_LENGTH ||
    SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(rawTitle) ||
    slug.length === 0 ||
    slug.length > MAX_CONTENT_SLUG_LENGTH
  ) {
    return null;
  }

  return { title, slug };
}

export function validateGoalDraftForm(
  formData: ContentStepFormDataLike,
): GoalDraftValidation {
  const { values, unreadableFields } = readUniqueStrings(formData, GOAL_FIELDS);
  const fieldErrors: GoalDraftFieldErrors = {};

  for (const field of unreadableFields) {
    fieldErrors[field] =
      "Feltet kunne ikke læses. Genindlæs siden og prøv igen.";
  }

  if (unreadableFields.length > 0) {
    return {
      ok: false,
      fieldErrors,
      message:
        "Færdighedsformularen kunne ikke valideres. Ret felterne og prøv igen.",
    };
  }

  const requestId = normalizeUuid(values.requestId);
  const topicId = normalizeUuid(values.topicId);
  const title = validateTitle(values.title);
  const summary = normalizeMultiline(values.summary);
  const estimatedMinutes = parseOptionalInteger(
    values.estimatedMinutes,
    1,
    180,
  );
  const equipment = parseEquipment(values.equipment);
  const heroMediaUrl = parseOptionalMediaUrl(values.heroMediaUrl);
  const sortOrder = parseRequiredInteger(values.sortOrder, 0, MAX_SORT_ORDER);

  if (!requestId) {
    fieldErrors.requestId =
      "Kladdeanmodningen er ugyldig. Genindlæs siden og prøv igen.";
  }

  if (!topicId) {
    fieldErrors.topicId = "Vælg det emne, som færdigheden skal høre til.";
  }

  if (!title) {
    fieldErrors.title =
      "Skriv et navn på højst " +
      MAX_CONTENT_TITLE_LENGTH +
      " tegn med mindst ét bogstav eller tal.";
  }

  if (
    DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(values.summary) ||
    codePointLength(summary) > MAX_GOAL_SUMMARY_LENGTH
  ) {
    fieldErrors.summary =
      "Beskrivelsen må højst være " +
      MAX_GOAL_SUMMARY_LENGTH +
      " tegn og må ikke indeholde ugyldige tegn.";
  } else {
    const childFacingCopyError = getChildFacingCopyError(summary);
    if (childFacingCopyError) {
      fieldErrors.summary = childFacingCopyError;
    }
  }

  if (
    values.difficulty !== "beginner" &&
    values.difficulty !== "intermediate" &&
    values.difficulty !== "advanced"
  ) {
    fieldErrors.difficulty = "Vælg en gyldig sværhedsgrad.";
  }

  if (estimatedMinutes === undefined) {
    fieldErrors.estimatedMinutes =
      "Træningstiden skal være et helt antal minutter fra 1 til 180.";
  }

  if (!equipment) {
    fieldErrors.equipment =
      "Angiv højst " +
      MAX_EQUIPMENT_ITEMS +
      " ting, hver på højst " +
      MAX_EQUIPMENT_ITEM_LENGTH +
      " tegn.";
  }

  if (heroMediaUrl === undefined) {
    fieldErrors.heroMediaUrl =
      "Videoens adresse skal være en gyldig https-adresse.";
  }

  if (sortOrder === undefined) {
    fieldErrors.sortOrder = "Rækkefølgen skal være et positivt heltal eller 0.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: "Ret felterne, før færdighedskladden gemmes.",
    };
  }

  return {
    ok: true,
    value: {
      requestId: requestId!,
      topicId: topicId!,
      slug: title!.slug,
      title: title!.title,
      summary,
      difficulty: values.difficulty as GoalDifficulty,
      estimatedMinutes: estimatedMinutes!,
      equipment: equipment!,
      heroMediaUrl: heroMediaUrl!,
      sortOrder: sortOrder!,
    },
  };
}

export function validateExerciseDraftForm(
  formData: ContentStepFormDataLike,
): ExerciseDraftValidation {
  const { values, unreadableFields } = readUniqueStrings(
    formData,
    EXERCISE_FIELDS,
  );
  const fieldErrors: ExerciseDraftFieldErrors = {};

  for (const field of unreadableFields) {
    fieldErrors[field] =
      "Feltet kunne ikke læses. Genindlæs siden og prøv igen.";
  }

  if (unreadableFields.length > 0) {
    return {
      ok: false,
      fieldErrors,
      message:
        "Øvelsesformularen kunne ikke valideres. Ret felterne og prøv igen.",
    };
  }

  const requestId = normalizeUuid(values.requestId);
  const goalId = normalizeUuid(values.goalId);
  const title = validateTitle(values.title);
  const instructions = normalizeMultiline(values.instructions);
  const recommendedMinutes = parseOptionalInteger(
    values.recommendedMinutes,
    1,
    180,
  );
  const equipment = parseEquipment(values.equipment);
  const safetyNote = normalizeMultiline(values.safetyNote);
  const videoUrl = parseOptionalMediaUrl(values.videoUrl);
  const sortOrder = parseRequiredInteger(values.sortOrder, 0, MAX_SORT_ORDER);
  let targetValue: number | null | undefined;

  if (values.measurement === "completion") {
    targetValue = values.targetValue.trim().length === 0 ? null : undefined;
  } else if (values.measurement === "repetitions") {
    targetValue = parseRequiredInteger(
      values.targetValue,
      1,
      MAX_REPETITION_TARGET,
    );
  } else if (values.measurement === "duration") {
    targetValue = parseRequiredInteger(
      values.targetValue,
      1,
      MAX_DURATION_TARGET_SECONDS,
    );
  }

  if (!requestId) {
    fieldErrors.requestId =
      "Kladdeanmodningen er ugyldig. Genindlæs siden og prøv igen.";
  }

  if (!goalId) {
    fieldErrors.goalId = "Vælg den færdighed, som øvelsen skal høre til.";
  }

  if (!title) {
    fieldErrors.title =
      "Skriv et navn på højst " +
      MAX_CONTENT_TITLE_LENGTH +
      " tegn med mindst ét bogstav eller tal.";
  }

  if (
    instructions.length === 0 ||
    DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(values.instructions) ||
    codePointLength(instructions) > MAX_EXERCISE_INSTRUCTIONS_LENGTH
  ) {
    fieldErrors.instructions =
      "Forklar øvelsen til barnet med højst " +
      MAX_EXERCISE_INSTRUCTIONS_LENGTH +
      " tegn.";
  } else {
    const childFacingCopyError = getChildFacingCopyError(instructions);
    if (childFacingCopyError) {
      fieldErrors.instructions = childFacingCopyError;
    }
  }

  if (
    values.measurement !== "completion" &&
    values.measurement !== "repetitions" &&
    values.measurement !== "duration"
  ) {
    fieldErrors.measurement = "Vælg, hvordan øvelsen skal måles.";
  }

  if (targetValue === undefined) {
    fieldErrors.targetValue =
      values.measurement === "completion"
        ? "En øvelse, der blot gennemføres, må ikke have et talmål."
        : values.measurement === "duration"
          ? "Varigheden skal være et helt antal sekunder fra 1 til " +
            MAX_DURATION_TARGET_SECONDS +
            "."
          : "Målet skal være et helt antal gentagelser fra 1 til " +
            MAX_REPETITION_TARGET +
            ".";
  }

  if (recommendedMinutes === undefined) {
    fieldErrors.recommendedMinutes =
      "Træningstiden skal være et helt antal minutter fra 1 til 180.";
  }

  if (!equipment) {
    fieldErrors.equipment =
      "Angiv højst " +
      MAX_EQUIPMENT_ITEMS +
      " ting, hver på højst " +
      MAX_EQUIPMENT_ITEM_LENGTH +
      " tegn.";
  }

  if (
    DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(values.safetyNote) ||
    codePointLength(safetyNote) > MAX_EXERCISE_SAFETY_NOTE_LENGTH
  ) {
    fieldErrors.safetyNote =
      "Sikkerhedsteksten må højst være " +
      MAX_EXERCISE_SAFETY_NOTE_LENGTH +
      " tegn og må ikke indeholde ugyldige tegn.";
  } else {
    const childFacingCopyError = getChildFacingCopyError(safetyNote);
    if (childFacingCopyError) {
      fieldErrors.safetyNote = childFacingCopyError;
    }
  }

  if (videoUrl === undefined) {
    fieldErrors.videoUrl =
      "Videoens adresse skal være en gyldig https-adresse.";
  }

  if (sortOrder === undefined) {
    fieldErrors.sortOrder = "Rækkefølgen skal være et positivt heltal eller 0.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: "Ret felterne, før øvelseskladden gemmes.",
    };
  }

  return {
    ok: true,
    value: {
      requestId: requestId!,
      goalId: goalId!,
      slug: title!.slug,
      title: title!.title,
      instructions,
      measurement: values.measurement as ExerciseMeasurement,
      targetValue: targetValue!,
      videoUrl: videoUrl!,
      sortOrder: sortOrder!,
      recommendedMinutes: recommendedMinutes!,
      equipment: equipment!,
      safetyNote,
    },
  };
}
