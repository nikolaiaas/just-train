export type SubjectDraftFields = {
  accentColor: string;
  description: string;
  icon: string;
  title: string;
};

function normalizeText(value: string, maximum: number): string {
  return Array.from(value.replace(/\r\n?/gu, "\n").trim())
    .slice(0, maximum)
    .join("");
}

export function buildSubjectAssistantContext(fields: SubjectDraftFields) {
  return {
    topic: {
      title: normalizeText(fields.title, 100),
      description: normalizeText(fields.description, 500),
      icon: normalizeText(fields.icon, 16),
      accentColor: fields.accentColor.toUpperCase(),
    },
    goal: {
      title: "",
      summary: "",
      difficulty: "beginner" as const,
      estimatedMinutes: null,
      equipment: [] as string[],
    },
    exercise: {
      title: "",
      instructions: "",
      measurement: "completion" as const,
      targetValue: null,
      recommendedMinutes: null,
      equipment: [] as string[],
      safetyNote: "",
    },
    wardrobeExamples: [],
  };
}
