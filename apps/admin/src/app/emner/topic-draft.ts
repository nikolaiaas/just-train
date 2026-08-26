import { getChildFacingCopyError } from "./child-facing-copy.ts";

export const MAX_TOPIC_TITLE_LENGTH = 100;
export const MAX_TOPIC_DESCRIPTION_LENGTH = 500;
export const MAX_TOPIC_ICON_LENGTH = 16;
export const MAX_TOPIC_SLUG_LENGTH = 120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SINGLE_LINE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export type TopicDraftInput = {
  requestId: string;
  title: string;
  slug: string;
  description: string;
  icon: string | null;
  accentColor: string | null;
};

export type TopicDraftFieldErrors = {
  requestId?: string;
  title?: string;
  description?: string;
  icon?: string;
  accentColor?: string;
};

export type TopicDraftValidation =
  | { ok: true; value: TopicDraftInput }
  | {
      ok: false;
      fieldErrors: TopicDraftFieldErrors;
      message: string;
    };

export type TopicDraftFormDataLike = {
  getAll(name: string): readonly unknown[];
};

type TopicDraftField = keyof TopicDraftFieldErrors;

const FIELD_NAMES: readonly TopicDraftField[] = [
  "requestId",
  "title",
  "description",
  "icon",
  "accentColor",
];

const UNREADABLE_FIELD_MESSAGES: Record<TopicDraftField, string> = {
  requestId: "Kladdeanmodningen er ugyldig. Genindlæs siden og prøv igen.",
  title: "Emnenavnet kunne ikke læses. Skriv navnet igen.",
  description: "Beskrivelsen kunne ikke læses. Skriv beskrivelsen igen.",
  icon: "Ikonet kunne ikke læses. Vælg ikonet igen.",
  accentColor: "Farven kunne ikke læses. Vælg farven igen.",
};

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function readUniqueStrings(formData: TopicDraftFormDataLike): {
  values: Record<TopicDraftField, string>;
  errors: TopicDraftFieldErrors;
} {
  const values = {} as Record<TopicDraftField, string>;
  const errors: TopicDraftFieldErrors = {};

  for (const field of FIELD_NAMES) {
    const entries = formData.getAll(field);

    if (entries.length !== 1 || typeof entries[0] !== "string") {
      errors[field] = UNREADABLE_FIELD_MESSAGES[field];
      continue;
    }

    values[field] = entries[0];
  }

  return { values, errors };
}

/**
 * Produces the stable, database-safe slug used for Danish topic titles.
 * Danish letters are transliterated deliberately before other accents are
 * removed, so `ø` and `å` do not change meaning across JavaScript runtimes.
 */
export function normalizeDanishTopicSlug(title: string): string {
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

export function validateTopicDraftForm(
  formData: TopicDraftFormDataLike,
): TopicDraftValidation {
  const { values, errors: fieldErrors } = readUniqueStrings(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: "Formularen kunne ikke valideres. Ret felterne og prøv igen.",
    };
  }

  const requestId = values.requestId.toLocaleLowerCase("en-US");
  const title = values.title.trim();
  const description = values.description.replace(/\r\n?/gu, "\n").trim();
  const icon = values.icon.trim();
  const accentColor = values.accentColor.trim();

  if (!UUID_PATTERN.test(requestId)) {
    fieldErrors.requestId =
      "Kladdeanmodningen er ugyldig. Genindlæs siden og prøv igen.";
  }

  if (title.length === 0) {
    fieldErrors.title = "Skriv et navn på emnet.";
  } else if (SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(values.title)) {
    fieldErrors.title = "Emnenavnet skal stå på én linje.";
  } else if (codePointLength(title) > MAX_TOPIC_TITLE_LENGTH) {
    fieldErrors.title = `Emnenavnet må højst være ${MAX_TOPIC_TITLE_LENGTH} tegn.`;
  }

  const slug = normalizeDanishTopicSlug(title);

  if (!fieldErrors.title) {
    if (slug.length === 0) {
      fieldErrors.title =
        "Emnenavnet skal indeholde mindst ét bogstav eller tal.";
    } else if (slug.length > MAX_TOPIC_SLUG_LENGTH) {
      fieldErrors.title =
        "Emnenavnet bliver for langt som adresse. Brug et kortere navn.";
    }
  }

  if (DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(values.description)) {
    fieldErrors.description =
      "Beskrivelsen indeholder tegn, som ikke kan gemmes.";
  } else if (codePointLength(description) > MAX_TOPIC_DESCRIPTION_LENGTH) {
    fieldErrors.description = `Beskrivelsen må højst være ${MAX_TOPIC_DESCRIPTION_LENGTH} tegn.`;
  } else {
    const childFacingCopyError = getChildFacingCopyError(description);
    if (childFacingCopyError) {
      fieldErrors.description = childFacingCopyError;
    }
  }

  if (SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(values.icon)) {
    fieldErrors.icon = "Ikonet skal stå på én linje.";
  } else if (codePointLength(icon) > MAX_TOPIC_ICON_LENGTH) {
    fieldErrors.icon = `Ikonet må højst være ${MAX_TOPIC_ICON_LENGTH} tegn.`;
  }

  if (accentColor.length > 0 && !ACCENT_COLOR_PATTERN.test(accentColor)) {
    fieldErrors.accentColor =
      "Vælg en farve med seks hex-tegn, for eksempel #53C987.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: "Ret felterne, før emnekladden gemmes.",
    };
  }

  return {
    ok: true,
    value: {
      requestId,
      title,
      slug,
      description,
      icon: icon || null,
      accentColor: accentColor ? accentColor.toLocaleUpperCase("en-US") : null,
    },
  };
}
