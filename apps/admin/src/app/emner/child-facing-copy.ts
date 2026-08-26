const PARENT_OR_NARRATOR_PHRASE_PATTERN =
  /\b(?:(?:dit|jeres)\s+barn|barnets|barnet|børnenes|børnene|(?:som|kære)\s+(?:forælder(?:en)?|forældre(?:ne)?)|til\s+forældrene)\b/iu;

const NARRATED_CHILD_OR_PARENT_SUBJECT_PATTERN =
  /(?:^|[.!?;:])\s*(?:(?:(?:et|hvert)\s+)?barn|(?:(?:alle|nogle|andre|flere|mange|små|store)\s+)?børn|(?:en\s+)?forælder(?:en)?|(?:(?:dine|mine|sine|vores|jeres|deres)\s+)?forældre(?:ne)?)\s+\p{L}+/iu;

export const CHILD_FACING_COPY_ERROR =
  "Skriv teksten direkte til barnet, for eksempel med du, dig eller en kort opfordring. Undgå at skrive om “barnet” eller til forældre.";

/**
 * Catches unambiguous parent- or narrator-facing wording in fields that the
 * child sees verbatim. It deliberately does not require the word `du`, so a
 * direct instruction such as “Leg med bolden” remains valid. References to an
 * adult are also allowed when they address the child, for example “Få hjælp
 * af en voksen”.
 */
export function getChildFacingCopyError(value: string): string | null {
  return PARENT_OR_NARRATOR_PHRASE_PATTERN.test(value) ||
    NARRATED_CHILD_OR_PARENT_SUBJECT_PATTERN.test(value)
    ? CHILD_FACING_COPY_ERROR
    : null;
}
