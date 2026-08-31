import type {
  AdminSkillCurriculumOutput,
  AdminSkillPackageExercise,
} from "@bare-traen/api-client";

import type { AssistantWardrobeItem } from "./assistant-request";

export type CompleteSkillCurriculum = {
  curriculum: AdminSkillCurriculumOutput;
  curriculumJobId: string;
  imageJobId: string;
  wardrobeItems: AssistantWardrobeItem[];
  wardrobePlanJobId: string;
};

export type SkillCurriculumCounts = {
  exerciseCount: number;
  exercisesPerSkill: number;
  skillCount: number;
};

export const skillCountOptions = [2, 3, 4, 5, 6] as const;
export const exercisesPerSkillOptions = [2, 3, 4, 5, 6, 7, 8] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCurrentCurriculumReview(input: {
  inputsDirty: boolean;
  pending: boolean;
  succeeded: boolean;
}): boolean {
  return input.succeeded && !input.pending && !input.inputsDirty;
}

export function isCurrentWardrobeReview(input: {
  curriculumJobId: string | null;
  curriculumReady: boolean;
  succeeded: boolean;
  wardrobeCurriculumJobId: string | null;
}): boolean {
  return (
    input.succeeded &&
    input.curriculumReady &&
    input.curriculumJobId !== null &&
    input.wardrobeCurriculumJobId === input.curriculumJobId
  );
}

export function parseSkillCurriculumCounts(input: {
  exercisesPerSkill: string;
  skillCount: string;
}): SkillCurriculumCounts | null {
  const skillCount = Number(input.skillCount);
  const exercisesPerSkill = Number(input.exercisesPerSkill);
  if (
    !Number.isSafeInteger(skillCount) ||
    skillCount < 2 ||
    skillCount > 6 ||
    !Number.isSafeInteger(exercisesPerSkill) ||
    exercisesPerSkill < 2 ||
    exercisesPerSkill > 8 ||
    skillCount * exercisesPerSkill > 32
  ) {
    return null;
  }

  return {
    exerciseCount: skillCount * exercisesPerSkill,
    exercisesPerSkill,
    skillCount,
  };
}

export function countCurriculumExercises(
  curriculum: AdminSkillCurriculumOutput,
): number {
  return curriculum.skills.reduce(
    (total, skill) => total + skill.exercises.length,
    0,
  );
}

export function formatCurriculumExerciseTarget(
  exercise: Pick<AdminSkillPackageExercise, "measurement" | "targetValue">,
): string {
  if (exercise.measurement === "completion") return "Gennemfør øvelsen";
  if (exercise.measurement === "repetitions") {
    return `${exercise.targetValue ?? 0} gentagelser`;
  }

  const seconds = exercise.targetValue ?? 0;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} sek.`;
  if (rest === 0) return `${minutes} min.`;
  return `${minutes} min. ${rest} sek.`;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function deriveCurriculumStageRequestId(
  rootRequestId: string,
  stage: "curriculum" | "curriculum-wardrobe-plan",
): Promise<string> {
  if (!UUID_PATTERN.test(rootRequestId)) {
    throw new Error("invalid_curriculum_root_request_id");
  }

  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `bare-traen:skill-${stage}:v1:${rootRequestId.toLowerCase()}`,
      ),
    ),
  ).slice(0, 16);

  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  return formatUuid(digest);
}
