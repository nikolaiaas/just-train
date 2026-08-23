import {
  WARDROBE_EQUIP_SLOTS,
  hasExclusiveWardrobeEquipSlots,
  type WardrobeEquipSlot,
} from "@bare-traen/domain";

import type { BareTraenClient } from "./index.ts";

export type ChildWardrobeItemCategory = "clothing" | "equipment" | "effect";
export type ChildWardrobeItemRarity = "common" | "rare" | "special";

export type ChildWardrobeEquipmentState = {
  acquiredAt: string;
  childProfileId: string;
  equipSlot: WardrobeEquipSlot;
  equippedAt: string | null;
  isEquipped: boolean;
  wardrobeItemId: string;
};

export type ChildWardrobeItem = ChildWardrobeEquipmentState & {
  category: ChildWardrobeItemCategory;
  description: string;
  icon: string;
  imagePath: string | null;
  imageUrl: string | null;
  name: string;
  rarity: ChildWardrobeItemRarity;
  topicId: string;
};

export type LoadChildWardrobeInput = {
  childProfileId: string;
};

export type SetChildWardrobeItemEquippedInput = {
  childProfileId: string;
  equipped: boolean;
  wardrobeItemId: string;
};

export type WardrobeErrorCode =
  | "child_wardrobe_access_denied"
  | "child_wardrobe_load_failed"
  | "child_wardrobe_mutation_failed"
  | "invalid_child_profile_id"
  | "invalid_child_wardrobe_result"
  | "invalid_equipped_state"
  | "invalid_wardrobe_item_id";

const ERROR_MESSAGES: Record<WardrobeErrorCode, string> = {
  child_wardrobe_access_denied:
    "The child wardrobe is not available to this account.",
  child_wardrobe_load_failed: "The child wardrobe could not be loaded.",
  child_wardrobe_mutation_failed:
    "The wardrobe equipment choice could not be saved.",
  invalid_child_profile_id: "The child profile id is invalid.",
  invalid_child_wardrobe_result: "The child wardrobe returned invalid data.",
  invalid_equipped_state: "The wardrobe equipment state is invalid.",
  invalid_wardrobe_item_id: "The wardrobe item id is invalid.",
};

export class WardrobeError extends Error {
  readonly code: WardrobeErrorCode;

  constructor(code: WardrobeErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "WardrobeError";
    this.code = code;
  }
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EQUIP_SLOTS = new Set<WardrobeEquipSlot>(WARDROBE_EQUIP_SLOTS);
const ITEM_CATEGORIES = new Set<ChildWardrobeItemCategory>([
  "clothing",
  "equipment",
  "effect",
]);
const ITEM_RARITIES = new Set<ChildWardrobeItemRarity>([
  "common",
  "rare",
  "special",
]);
const SINGLE_LINE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const WARDROBE_IMAGE_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:0[1-9]|1[0-6])\.png$/i;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUuid(
  value: unknown,
  code: "invalid_child_profile_id" | "invalid_wardrobe_item_id",
): string {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value) ||
    value.toLowerCase() === NIL_UUID
  ) {
    throw new WardrobeError(code);
  }

  return value.toLowerCase();
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value))
  );
}

function isBoundedSingleLineText(
  value: unknown,
  maximumLength: number,
): value is string {
  const length = typeof value === "string" ? Array.from(value).length : 0;

  return (
    typeof value === "string" &&
    value === value.trim() &&
    length >= 1 &&
    length <= maximumLength &&
    !SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isOptionalBoundedDescription(value: unknown): value is string | null {
  if (value === null) return true;
  const length = typeof value === "string" ? Array.from(value).length : 0;

  return (
    typeof value === "string" &&
    value === value.trim() &&
    length >= 1 &&
    length <= 240 &&
    !DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function parseChildWardrobeEquipmentState(
  value: unknown,
): ChildWardrobeEquipmentState | null {
  if (
    !isRecord(value) ||
    typeof value.child_profile_id !== "string" ||
    !UUID_PATTERN.test(value.child_profile_id) ||
    value.child_profile_id.toLowerCase() === NIL_UUID ||
    typeof value.wardrobe_item_id !== "string" ||
    !UUID_PATTERN.test(value.wardrobe_item_id) ||
    value.wardrobe_item_id.toLowerCase() === NIL_UUID ||
    typeof value.equip_slot !== "string" ||
    !EQUIP_SLOTS.has(value.equip_slot as WardrobeEquipSlot) ||
    typeof value.is_equipped !== "boolean" ||
    !isTimestamp(value.acquired_at) ||
    (value.is_equipped
      ? !isTimestamp(value.equipped_at)
      : value.equipped_at !== null)
  ) {
    return null;
  }

  return {
    acquiredAt: value.acquired_at,
    childProfileId: value.child_profile_id.toLowerCase(),
    equipSlot: value.equip_slot as WardrobeEquipSlot,
    equippedAt: value.equipped_at as string | null,
    isEquipped: value.is_equipped,
    wardrobeItemId: value.wardrobe_item_id.toLowerCase(),
  };
}

function parseChildWardrobeItem(
  value: unknown,
  publicUrlForPath: (path: string) => string,
): ChildWardrobeItem | null {
  const equipmentState = parseChildWardrobeEquipmentState(value);

  if (
    !equipmentState ||
    !isRecord(value) ||
    typeof value.catalog_item_id !== "string" ||
    !UUID_PATTERN.test(value.catalog_item_id) ||
    value.catalog_item_id.toLowerCase() !== equipmentState.wardrobeItemId ||
    typeof value.topic_id !== "string" ||
    !UUID_PATTERN.test(value.topic_id) ||
    value.topic_id.toLowerCase() === NIL_UUID ||
    !isBoundedSingleLineText(value.name, 80) ||
    !isBoundedSingleLineText(value.icon, 16) ||
    !isOptionalBoundedDescription(value.description) ||
    !(
      value.image_path === null ||
      (typeof value.image_path === "string" &&
        WARDROBE_IMAGE_PATH_PATTERN.test(value.image_path))
    ) ||
    typeof value.category !== "string" ||
    !ITEM_CATEGORIES.has(value.category as ChildWardrobeItemCategory) ||
    typeof value.catalog_equip_slot !== "string" ||
    !EQUIP_SLOTS.has(value.catalog_equip_slot as WardrobeEquipSlot) ||
    value.catalog_equip_slot !== equipmentState.equipSlot ||
    typeof value.rarity !== "string" ||
    !ITEM_RARITIES.has(value.rarity as ChildWardrobeItemRarity)
  ) {
    return null;
  }

  const imagePath = (value.image_path as string | null)?.toLowerCase() ?? null;
  const imageUrl = imagePath ? publicUrlForPath(imagePath) : null;

  if (imageUrl !== null && !URL.canParse(imageUrl)) return null;

  return {
    ...equipmentState,
    category: value.category as ChildWardrobeItemCategory,
    description: (value.description as string | null) ?? "",
    icon: value.icon,
    imagePath,
    imageUrl,
    name: value.name,
    rarity: value.rarity as ChildWardrobeItemRarity,
    topicId: value.topic_id.toLowerCase(),
  };
}

function parseChildWardrobeItems(
  value: unknown,
  expectedChildProfileId: string,
  publicUrlForPath: (path: string) => string,
): ChildWardrobeItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const items: ChildWardrobeItem[] = [];
  const itemIds = new Set<string>();

  for (const candidate of value) {
    const item = parseChildWardrobeItem(candidate, publicUrlForPath);

    if (
      !item ||
      item.childProfileId !== expectedChildProfileId ||
      itemIds.has(item.wardrobeItemId)
    ) {
      return null;
    }

    itemIds.add(item.wardrobeItemId);
    items.push(item);
  }

  if (
    !hasExclusiveWardrobeEquipSlots(
      items
        .filter((item) => item.isEquipped)
        .map((item) => ({
          id: item.wardrobeItemId,
          equipSlot: item.equipSlot,
        })),
    )
  ) {
    return null;
  }

  return items;
}

function parseChildWardrobeEquipmentStates(
  value: unknown,
  expectedChildProfileId: string,
): ChildWardrobeEquipmentState[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const items: ChildWardrobeEquipmentState[] = [];
  const itemIds = new Set<string>();

  for (const candidate of value) {
    const item = parseChildWardrobeEquipmentState(candidate);

    if (
      !item ||
      item.childProfileId !== expectedChildProfileId ||
      itemIds.has(item.wardrobeItemId)
    ) {
      return null;
    }

    itemIds.add(item.wardrobeItemId);
    items.push(item);
  }

  return items;
}

function databaseErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function mapDatabaseError(
  error: unknown,
  fallback: "child_wardrobe_load_failed" | "child_wardrobe_mutation_failed",
): WardrobeError {
  return new WardrobeError(
    databaseErrorCode(error) === "42501"
      ? "child_wardrobe_access_denied"
      : fallback,
  );
}

function queryChildWardrobe(client: BareTraenClient, childProfileId: string) {
  return client.rpc("list_child_wardrobe", {
    p_child_profile_id: childProfileId,
  });
}

function mutateChildWardrobeItem(
  client: BareTraenClient,
  childProfileId: string,
  wardrobeItemId: string,
  equipped: boolean,
) {
  return client.rpc("set_child_wardrobe_item_equipped", {
    p_child_profile_id: childProfileId,
    p_equipped: equipped,
    p_wardrobe_item_id: wardrobeItemId,
  });
}

/** Loads only the selected family's RLS-filtered child wardrobe state. */
export async function loadChildWardrobe(
  client: BareTraenClient,
  input: LoadChildWardrobeInput,
): Promise<ChildWardrobeItem[]> {
  const childProfileId = normalizeUuid(
    input.childProfileId,
    "invalid_child_profile_id",
  );
  let response: Awaited<ReturnType<typeof queryChildWardrobe>>;

  try {
    response = await queryChildWardrobe(client, childProfileId);
  } catch {
    throw new WardrobeError("child_wardrobe_load_failed");
  }

  if (response.error) {
    throw mapDatabaseError(response.error, "child_wardrobe_load_failed");
  }

  const items = parseChildWardrobeItems(
    response.data,
    childProfileId,
    (path) =>
      client.storage.from("wardrobe-images").getPublicUrl(path).data.publicUrl,
  );

  if (!items) {
    throw new WardrobeError("invalid_child_wardrobe_result");
  }

  return items;
}

/**
 * Equips or unequips one owned item through the database's atomic slot swap.
 * Equipping a pair of shoes replaces the current `feet` item as one unit.
 */
export async function setChildWardrobeItemEquipped(
  client: BareTraenClient,
  input: SetChildWardrobeItemEquippedInput,
): Promise<ChildWardrobeEquipmentState> {
  const childProfileId = normalizeUuid(
    input.childProfileId,
    "invalid_child_profile_id",
  );
  const wardrobeItemId = normalizeUuid(
    input.wardrobeItemId,
    "invalid_wardrobe_item_id",
  );

  if (typeof input.equipped !== "boolean") {
    throw new WardrobeError("invalid_equipped_state");
  }

  let response: Awaited<ReturnType<typeof mutateChildWardrobeItem>>;

  try {
    response = await mutateChildWardrobeItem(
      client,
      childProfileId,
      wardrobeItemId,
      input.equipped,
    );
  } catch {
    throw new WardrobeError("child_wardrobe_mutation_failed");
  }

  if (response.error) {
    throw mapDatabaseError(response.error, "child_wardrobe_mutation_failed");
  }

  const items = parseChildWardrobeEquipmentStates(
    response.data,
    childProfileId,
  );

  if (
    !items ||
    items.length !== 1 ||
    items[0]?.wardrobeItemId !== wardrobeItemId ||
    items[0].isEquipped !== input.equipped
  ) {
    throw new WardrobeError("invalid_child_wardrobe_result");
  }

  return items[0];
}
