import type { AssistantWardrobeItem } from "./assistant-request";

export type SkillDifficulty = "beginner" | "intermediate" | "advanced";
export type SkillExerciseMeasurement =
  "completion" | "repetitions" | "duration";

export type SkillSuggestion = {
  childDescription: string;
  difficulty: SkillDifficulty;
  editorialReason: string;
  estimatedMinutes: number;
  ordinal: number;
  slug: string;
  title: string;
};

export type SkillSuggestionsOutput = {
  reply: string;
  skills: SkillSuggestion[];
};

export type SkillPackageExercise = {
  childInstructions: string;
  childSafetyNote: string;
  editorialReason: string;
  equipment: string[];
  measurement: SkillExerciseMeasurement;
  ordinal: number;
  recommendedMinutes: number;
  slug: string;
  targetValue: number | null;
  title: string;
};

export type SkillPackageOutput = {
  exercises: SkillPackageExercise[];
  reply: string;
  skill: {
    childDescription: string;
    difficulty: SkillDifficulty;
    editorialReason: string;
    equipment: string[];
    estimatedMinutes: number;
    slug: string;
    title: string;
  };
};

export type CompleteSkillPackage = {
  imageJobId: string;
  package: SkillPackageOutput;
  skillJobId: string;
  wardrobeItems: AssistantWardrobeItem[];
  wardrobePlanJobId: string;
};

export type SkillBuilderMode = "create" | "suggest";

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: UnknownRecord,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    actual.every((key) => expected.includes(key))
  );
}

function isBoundedText(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value === value.replace(/\r\n?/gu, "\n").trim() &&
    Array.from(value).length >= minimum &&
    Array.from(value).length <= maximum &&
    !CONTROL_PATTERN.test(value)
  );
}

function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= 120 && SLUG_PATTERN.test(value)
  );
}

function isDifficulty(value: unknown): value is SkillDifficulty {
  return (
    value === "beginner" || value === "intermediate" || value === "advanced"
  );
}

function isIntegerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function parseEquipment(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 12) return null;

  const seen = new Set<string>();
  const equipment: string[] = [];

  for (const candidate of value) {
    if (!isBoundedText(candidate, 1, 80)) return null;
    const key = candidate.toLocaleLowerCase("da-DK");
    if (seen.has(key)) return null;
    seen.add(key);
    equipment.push(candidate);
  }

  return equipment;
}

function keysAreUnique(
  items: readonly { slug: string; title: string }[],
): boolean {
  const slugs = new Set<string>();
  const titles = new Set<string>();

  for (const item of items) {
    const slug = item.slug.toLocaleLowerCase("en-US");
    const title = item.title.toLocaleLowerCase("da-DK");
    if (slugs.has(slug) || titles.has(title)) return false;
    slugs.add(slug);
    titles.add(title);
  }

  return true;
}

export function parseSkillBuilderMode(
  value: string | string[] | undefined,
): SkillBuilderMode {
  return value === "suggest" ? "suggest" : "create";
}

export function parseSkillSuggestionsOutput(
  value: unknown,
): SkillSuggestionsOutput | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["reply", "skills"]) ||
    !isBoundedText(value.reply, 1, 1_500) ||
    !Array.isArray(value.skills) ||
    value.skills.length < 3 ||
    value.skills.length > 8
  ) {
    return null;
  }

  const skills: SkillSuggestion[] = [];

  for (const [index, candidate] of value.skills.entries()) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, [
        "ordinal",
        "title",
        "slug",
        "childDescription",
        "difficulty",
        "estimatedMinutes",
        "editorialReason",
      ]) ||
      candidate.ordinal !== index + 1 ||
      !isBoundedText(candidate.title, 1, 120) ||
      !isSlug(candidate.slug) ||
      !isBoundedText(candidate.childDescription, 1, 600) ||
      !isDifficulty(candidate.difficulty) ||
      !isIntegerBetween(candidate.estimatedMinutes, 1, 180) ||
      !isBoundedText(candidate.editorialReason, 1, 500)
    ) {
      return null;
    }

    skills.push({
      childDescription: candidate.childDescription,
      difficulty: candidate.difficulty,
      editorialReason: candidate.editorialReason,
      estimatedMinutes: candidate.estimatedMinutes,
      ordinal: candidate.ordinal,
      slug: candidate.slug,
      title: candidate.title,
    });
  }

  return keysAreUnique(skills) ? { reply: value.reply, skills } : null;
}

function parseSkillPackageExercise(
  value: unknown,
  index: number,
): SkillPackageExercise | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
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
    ]) ||
    value.ordinal !== index + 1 ||
    !isBoundedText(value.title, 1, 120) ||
    !isSlug(value.slug) ||
    !isBoundedText(value.childInstructions, 1, 1_000) ||
    (value.measurement !== "completion" &&
      value.measurement !== "repetitions" &&
      value.measurement !== "duration") ||
    !isIntegerBetween(value.recommendedMinutes, 1, 180) ||
    !isBoundedText(value.childSafetyNote, 1, 600) ||
    !isBoundedText(value.editorialReason, 1, 500)
  ) {
    return null;
  }

  const equipment = parseEquipment(value.equipment);
  if (!equipment) return null;

  const targetIsValid =
    (value.measurement === "completion" && value.targetValue === null) ||
    (value.measurement === "repetitions" &&
      isIntegerBetween(value.targetValue, 1, 10_000)) ||
    (value.measurement === "duration" &&
      isIntegerBetween(value.targetValue, 1, 86_400));
  if (!targetIsValid) return null;

  return {
    childInstructions: value.childInstructions,
    childSafetyNote: value.childSafetyNote,
    editorialReason: value.editorialReason,
    equipment,
    measurement: value.measurement,
    ordinal: value.ordinal,
    recommendedMinutes: value.recommendedMinutes,
    slug: value.slug,
    targetValue: value.targetValue as number | null,
    title: value.title,
  };
}

export function parseSkillPackageOutput(
  value: unknown,
): SkillPackageOutput | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["reply", "skill", "exercises"]) ||
    !isBoundedText(value.reply, 1, 1_500) ||
    !isRecord(value.skill) ||
    !hasExactKeys(value.skill, [
      "title",
      "slug",
      "childDescription",
      "difficulty",
      "estimatedMinutes",
      "equipment",
      "editorialReason",
    ]) ||
    !isBoundedText(value.skill.title, 1, 120) ||
    !isSlug(value.skill.slug) ||
    !isBoundedText(value.skill.childDescription, 1, 600) ||
    !isDifficulty(value.skill.difficulty) ||
    !isIntegerBetween(value.skill.estimatedMinutes, 1, 180) ||
    !isBoundedText(value.skill.editorialReason, 1, 500) ||
    !Array.isArray(value.exercises) ||
    value.exercises.length < 2 ||
    value.exercises.length > 8
  ) {
    return null;
  }

  const skillEquipment = parseEquipment(value.skill.equipment);
  if (!skillEquipment) return null;

  const exercises = value.exercises.map(parseSkillPackageExercise);
  if (
    exercises.some((exercise) => exercise === null) ||
    !keysAreUnique(exercises as SkillPackageExercise[])
  ) {
    return null;
  }

  return {
    exercises: exercises as SkillPackageExercise[],
    reply: value.reply,
    skill: {
      childDescription: value.skill.childDescription,
      difficulty: value.skill.difficulty,
      editorialReason: value.skill.editorialReason,
      equipment: skillEquipment,
      estimatedMinutes: value.skill.estimatedMinutes,
      slug: value.skill.slug,
      title: value.skill.title,
    },
  };
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function deriveSkillStageRequestId(
  rootRequestId: string,
  stage: "skill-package" | "skill-package-wardrobe-plan",
): Promise<string> {
  if (!UUID_PATTERN.test(rootRequestId)) {
    throw new Error("invalid_skill_root_request_id");
  }

  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `bare-traen:${stage}:v1:${rootRequestId.toLowerCase()}`,
      ),
    ),
  ).slice(0, 16);

  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  return formatUuid(digest);
}

export function buildSkillWardrobeMessage(
  skillPackage: SkillPackageOutput,
): string {
  const exerciseTitles = skillPackage.exercises
    .map((exercise) => exercise.title)
    .join(", ");
  return [
    `Lav garderoben til færdigheden ${skillPackage.skill.title}.`,
    skillPackage.skill.childDescription,
    `Øvelserne er: ${exerciseTitles}.`,
    "Alle ting skal passe til både færdigheden og emnet.",
  ]
    .join(" ")
    .slice(0, 1_000)
    .trim();
}
