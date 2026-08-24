const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_NAMESPACE_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;

export function parseSelectedChildId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Det gemte valg af barn er ugyldigt.");
  }

  const normalized = value.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("Det gemte valg af barn er ugyldigt.");
  }

  return normalized;
}

export function serializeSelectedChildId(childId: string): string {
  return parseSelectedChildId(childId);
}

export function createSelectedChildStorageKey(input: {
  familyId: string;
  namespace: string;
  userId: string;
}): string {
  if (!STORAGE_NAMESPACE_PATTERN.test(input.namespace)) {
    throw new Error("Lagerområdet til valg af barn er ugyldigt.");
  }

  const key = `${input.namespace}.child-selection.${parseSelectedChildId(input.userId)}.${parseSelectedChildId(input.familyId)}`;

  if (key.length > 240) {
    throw new Error("Lagerområdet til valg af barn er ugyldigt.");
  }

  return key;
}

export function resolveSelectedChildId(input: {
  availableChildIds: readonly string[];
  currentChildId: string | null;
  storedChildId: string | null;
}): string | null {
  const available = new Set(input.availableChildIds);

  if (input.currentChildId && available.has(input.currentChildId)) {
    return input.currentChildId;
  }

  if (input.storedChildId && available.has(input.storedChildId)) {
    return input.storedChildId;
  }

  return input.availableChildIds.length === 1
    ? (input.availableChildIds[0] ?? null)
    : null;
}
