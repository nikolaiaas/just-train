import type {
  AdminWardrobeCategory,
  AdminWardrobeEditorialStatus,
  AdminWardrobeEquipSlot,
  AdminWardrobeRarity,
} from "@bare-traen/api-client";

export const MAX_WARDROBE_NAME_LENGTH = 80;
export const MAX_WARDROBE_ICON_LENGTH = 16;
export const MAX_WARDROBE_DESCRIPTION_LENGTH = 240;
export const MAX_WARDROBE_UNLOCK_RULE_LENGTH = 200;
export const MAX_WARDROBE_EDITORIAL_NOTE_LENGTH = 300;
export const MAX_WARDROBE_POINTS = 1_000;
export const MAX_WARDROBE_SORT_ORDER = 2_147_483_647;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const SINGLE_LINE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const UNSIGNED_INTEGER_PATTERN = /^\d+$/u;
const WARDROBE_IMAGE_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:0[1-9]|1[0-6])\.png$/i;
const CATEGORIES = new Set<AdminWardrobeCategory>([
  "clothing",
  "equipment",
  "effect",
]);
const RARITIES = new Set<AdminWardrobeRarity>(["common", "rare", "special"]);
const EQUIP_SLOTS = new Set<AdminWardrobeEquipSlot>([
  "head",
  "body",
  "held",
  "feet",
  "accessory",
]);
const DECISIONS = new Set<AdminWardrobeEditorialStatus>([
  "approved",
  "rejected",
]);

export type WardrobeItemDraftInput = {
  requestId: string;
  topicId: string;
  name: string;
  icon: string;
  description: string;
  imagePath: string;
  category: AdminWardrobeCategory;
  equipSlot: AdminWardrobeEquipSlot;
  rarity: AdminWardrobeRarity;
  points: number;
  unlockRule: string;
  editorialNote: string;
  sortOrder: number;
};

export type WardrobeItemDraftFieldErrors = Partial<
  Record<
    | "requestId"
    | "topicId"
    | "name"
    | "icon"
    | "description"
    | "imagePath"
    | "category"
    | "equipSlot"
    | "rarity"
    | "points"
    | "unlockRule"
    | "editorialNote"
    | "sortOrder",
    string
  >
>;

export type WardrobeItemDraftValidation =
  | { ok: true; value: WardrobeItemDraftInput }
  | {
      ok: false;
      fieldErrors: WardrobeItemDraftFieldErrors;
      message: string;
    };

export type WardrobeDecisionInput = {
  itemId: string;
  topicId: string;
  expectedUpdatedAt: string;
  decision: "approved" | "rejected";
};

export type WardrobeDecisionValidation =
  { ok: true; value: WardrobeDecisionInput } | { ok: false; message: string };

export type WardrobeFormDataLike = {
  getAll(name: string): readonly unknown[];
};

const DRAFT_FIELDS = [
  "requestId",
  "topicId",
  "name",
  "icon",
  "description",
  "imagePath",
  "category",
  "equipSlot",
  "rarity",
  "points",
  "unlockRule",
  "editorialNote",
  "sortOrder",
] as const;

const DECISION_FIELDS = [
  "itemId",
  "topicId",
  "expectedUpdatedAt",
  "decision",
] as const;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function normalizeUuid(value: string): string | null {
  const normalized = value.toLocaleLowerCase("en-US");
  return UUID_PATTERN.test(normalized) && normalized !== NIL_UUID
    ? normalized
    : null;
}

function readUniqueStrings<Field extends string>(
  formData: WardrobeFormDataLike,
  fields: readonly Field[],
): { values: Record<Field, string>; unreadable: Field[] } {
  const values = {} as Record<Field, string>;
  const unreadable: Field[] = [];

  for (const field of fields) {
    const entries = formData.getAll(field);
    if (entries.length !== 1 || typeof entries[0] !== "string") {
      unreadable.push(field);
    } else {
      values[field] = entries[0];
    }
  }

  return { values, unreadable };
}

function parseInteger(
  value: string,
  minimum: number,
  maximum: number,
): number | null {
  const normalized = value.trim();
  if (!UNSIGNED_INTEGER_PATTERN.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

export function validateWardrobeItemDraftForm(
  formData: WardrobeFormDataLike,
): WardrobeItemDraftValidation {
  const { values, unreadable } = readUniqueStrings(formData, DRAFT_FIELDS);
  const fieldErrors: WardrobeItemDraftFieldErrors = {};

  for (const field of unreadable) {
    fieldErrors[field] =
      "Feltet kunne ikke læses. Genindlæs siden og prøv igen.";
  }

  if (unreadable.length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: "Formularen kunne ikke valideres. Ret felterne og prøv igen.",
    };
  }

  const requestId = normalizeUuid(values.requestId);
  const topicId = normalizeUuid(values.topicId);
  const name = values.name.trim();
  const icon = values.icon.trim();
  const description = values.description.replace(/\r\n?/gu, "\n").trim();
  const imagePath = values.imagePath.trim().toLocaleLowerCase("en-US");
  const unlockRule = values.unlockRule.replace(/\s+/gu, " ").trim();
  const editorialNote = values.editorialNote.replace(/\r\n?/gu, "\n").trim();
  const points = parseInteger(values.points, 0, MAX_WARDROBE_POINTS);
  const sortOrder = parseInteger(values.sortOrder, 0, MAX_WARDROBE_SORT_ORDER);

  if (!requestId) {
    fieldErrors.requestId =
      "Kladdeanmodningen er ugyldig. Genindlæs siden og prøv igen.";
  }
  if (!topicId) {
    fieldErrors.topicId =
      "Emnekladden er ugyldig. Genindlæs siden og prøv igen.";
  }
  if (!name) {
    fieldErrors.name = "Skriv et navn på garderobetinget.";
  } else if (
    codePointLength(name) > MAX_WARDROBE_NAME_LENGTH ||
    SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(values.name)
  ) {
    fieldErrors.name = `Navnet skal stå på én linje og må højst være ${MAX_WARDROBE_NAME_LENGTH} tegn.`;
  }
  if (!icon) {
    fieldErrors.icon = "Det tekniske reserveikon mangler.";
  } else if (
    codePointLength(icon) > MAX_WARDROBE_ICON_LENGTH ||
    SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(values.icon)
  ) {
    fieldErrors.icon = `Ikonet skal stå på én linje og må højst være ${MAX_WARDROBE_ICON_LENGTH} tegn.`;
  }
  if (
    codePointLength(description) > MAX_WARDROBE_DESCRIPTION_LENGTH ||
    DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(values.description)
  ) {
    fieldErrors.description = `Beskrivelsen må højst være ${MAX_WARDROBE_DESCRIPTION_LENGTH} tegn og må ikke indeholde skjulte kontroltegn.`;
  }
  if (
    imagePath.length > 0 &&
    (!WARDROBE_IMAGE_PATH_PATTERN.test(imagePath) ||
      SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(values.imagePath))
  ) {
    fieldErrors.imagePath =
      "Billedet tilhører ikke et gyldigt garderobe-billedark.";
  }
  if (!CATEGORIES.has(values.category as AdminWardrobeCategory)) {
    fieldErrors.category = "Vælg en gyldig type.";
  }
  if (!EQUIP_SLOTS.has(values.equipSlot as AdminWardrobeEquipSlot)) {
    fieldErrors.equipSlot = "Vælg, hvor barnet kan have tinget på.";
  }
  if (!RARITIES.has(values.rarity as AdminWardrobeRarity)) {
    fieldErrors.rarity = "Vælg en gyldig sjældenhed.";
  }
  if (points === null) {
    fieldErrors.points = `Point skal være et helt tal mellem 0 og ${MAX_WARDROBE_POINTS}.`;
  }
  if (
    codePointLength(unlockRule) > MAX_WARDROBE_UNLOCK_RULE_LENGTH ||
    SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(values.unlockRule)
  ) {
    fieldErrors.unlockRule = `Oplåsningsreglen skal stå på én linje og må højst være ${MAX_WARDROBE_UNLOCK_RULE_LENGTH} tegn.`;
  }
  if (
    codePointLength(editorialNote) > MAX_WARDROBE_EDITORIAL_NOTE_LENGTH ||
    DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(values.editorialNote)
  ) {
    fieldErrors.editorialNote = `Noten må højst være ${MAX_WARDROBE_EDITORIAL_NOTE_LENGTH} tegn og må ikke indeholde skjulte kontroltegn.`;
  }
  if (sortOrder === null) {
    fieldErrors.sortOrder =
      "Placeringen er ugyldig. Genindlæs siden og prøv igen.";
  }

  if (points !== null) {
    if (points === 0 && !unlockRule) {
      fieldErrors.unlockRule =
        "Skriv en oplåsningsregel, når tinget ikke har en pointpris.";
    } else if (points > 0 && unlockRule) {
      fieldErrors.points =
        "Vælg enten en pointpris eller en oplåsningsregel – ikke begge dele.";
      fieldErrors.unlockRule =
        "Fjern oplåsningsreglen, eller sæt pointprisen til 0.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: "Ret felterne, før garderobetinget gemmes.",
    };
  }

  return {
    ok: true,
    value: {
      requestId: requestId!,
      topicId: topicId!,
      name,
      icon,
      description,
      imagePath,
      category: values.category as AdminWardrobeCategory,
      equipSlot: values.equipSlot as AdminWardrobeEquipSlot,
      rarity: values.rarity as AdminWardrobeRarity,
      points: points!,
      unlockRule,
      editorialNote,
      sortOrder: sortOrder!,
    },
  };
}

export function validateWardrobeDecisionForm(
  formData: WardrobeFormDataLike,
): WardrobeDecisionValidation {
  const { values, unreadable } = readUniqueStrings(formData, DECISION_FIELDS);
  const itemId = unreadable.length === 0 ? normalizeUuid(values.itemId) : null;
  const topicId =
    unreadable.length === 0 ? normalizeUuid(values.topicId) : null;
  const expectedUpdatedAt =
    unreadable.length === 0 ? values.expectedUpdatedAt.trim() : "";
  const decision =
    unreadable.length === 0
      ? (values.decision as AdminWardrobeEditorialStatus)
      : "draft";

  if (
    unreadable.length > 0 ||
    !itemId ||
    !topicId ||
    !DECISIONS.has(decision) ||
    !expectedUpdatedAt ||
    expectedUpdatedAt.length > 64 ||
    !Number.isFinite(Date.parse(expectedUpdatedAt)) ||
    SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(expectedUpdatedAt)
  ) {
    return {
      ok: false,
      message:
        "Godkendelsen kunne ikke valideres. Genindlæs siden og prøv igen.",
    };
  }

  return {
    ok: true,
    value: {
      itemId,
      topicId,
      expectedUpdatedAt,
      decision: decision as "approved" | "rejected",
    },
  };
}
