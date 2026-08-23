import type {
  AssistantWardrobeItem,
  WardrobeGridPlanInput,
} from "./assistant-request";

type UnknownRecord = Record<string, unknown>;

export type WardrobeGridImageInput = {
  topic: WardrobeGridPlanInput["topic"];
  items: Array<{
    ordinal: number;
    name: string;
    visualDescription: string;
    equipSlot: AssistantWardrobeItem["equipSlot"];
  }>;
};

export type WardrobeGridImageOutput = {
  sheetPath: string;
  items: Array<{ ordinal: number; imagePath: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  );
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Derives one stable, operation-specific request id without trusting the browser. */
export async function deriveWardrobeGridImageRequestId(
  planRequestId: string,
): Promise<string> {
  if (!UUID_PATTERN.test(planRequestId)) {
    throw new Error("invalid_plan_request_id");
  }

  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        `bare-traen:wardrobe-grid-image:v1:${planRequestId.toLowerCase()}`,
      ),
    ),
  ).slice(0, 16);

  // Mark the deterministic digest as RFC 4122 version 5 + standard variant.
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;

  return formatUuid(digest);
}

export function createWardrobeGridImageInput(
  topic: WardrobeGridPlanInput["topic"],
  items: AssistantWardrobeItem[],
): WardrobeGridImageInput {
  if (
    items.length !== 16 ||
    items.some((item, index) => item.ordinal !== index + 1)
  ) {
    throw new Error("invalid_wardrobe_grid_plan");
  }

  return {
    topic: { title: topic.title, description: topic.description },
    items: items.map((item) => ({
      ordinal: item.ordinal,
      name: item.name,
      visualDescription: item.visualDescription,
      equipSlot: item.equipSlot,
    })),
  };
}

export function parseWardrobeGridImageOutput(
  value: unknown,
  jobId: string,
): WardrobeGridImageOutput | null {
  const normalizedJobId = jobId.toLowerCase();

  if (
    !UUID_PATTERN.test(normalizedJobId) ||
    !isRecord(value) ||
    !hasExactKeys(value, ["sheetPath", "items"]) ||
    value.sheetPath !== `${normalizedJobId}/sheet.png` ||
    !Array.isArray(value.items) ||
    value.items.length !== 16
  ) {
    return null;
  }

  const items: WardrobeGridImageOutput["items"] = [];

  for (const [index, candidate] of value.items.entries()) {
    const ordinal = index + 1;
    const expectedPath = `${normalizedJobId}/${String(ordinal).padStart(2, "0")}.png`;

    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ["ordinal", "imagePath"]) ||
      candidate.ordinal !== ordinal ||
      candidate.imagePath !== expectedPath
    ) {
      return null;
    }

    items.push({ ordinal, imagePath: expectedPath });
  }

  return { sheetPath: value.sheetPath, items };
}

export function attachWardrobeGridImages(
  plannedItems: AssistantWardrobeItem[],
  imageOutput: WardrobeGridImageOutput,
  publicUrlForPath: (path: string) => string,
): AssistantWardrobeItem[] | null {
  if (
    plannedItems.length !== 16 ||
    imageOutput.items.length !== 16 ||
    plannedItems.some((item, index) => item.ordinal !== index + 1)
  ) {
    return null;
  }

  const result = plannedItems.map((item, index) => {
    const image = imageOutput.items[index];
    if (!image || image.ordinal !== item.ordinal) return null;

    const imageUrl = publicUrlForPath(image.imagePath);
    if (!URL.canParse(imageUrl)) return null;

    return { ...item, imagePath: image.imagePath, imageUrl };
  });

  return result.every((item): item is AssistantWardrobeItem => item !== null)
    ? result
    : null;
}
