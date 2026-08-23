import {
  WardrobeError,
  type ChildWardrobeEquipmentState,
  type ChildWardrobeItem,
} from "@bare-traen/api-client";
import type { WardrobeEquipSlot } from "@bare-traen/domain";

export const WARDROBE_SLOT_ORDER = [
  "head",
  "body",
  "held",
  "feet",
  "accessory",
] as const satisfies readonly WardrobeEquipSlot[];

export const WARDROBE_SLOT_DETAILS: Record<
  WardrobeEquipSlot,
  { description: string; icon: string; label: string }
> = {
  head: {
    description: "Der kan være én ting på hovedet ad gangen.",
    icon: "🧢",
    label: "Hoved",
  },
  body: {
    description: "Der kan være én ting på kroppen ad gangen.",
    icon: "👕",
    label: "Krop",
  },
  held: {
    description: "Der kan være én ting i hånden ad gangen.",
    icon: "🪄",
    label: "I hånden",
  },
  feet: {
    description: "Sko er ét samlet par. Der kan være ét par på ad gangen.",
    icon: "👟",
    label: "Sko (et par)",
  },
  accessory: {
    description: "Der kan være ét tilbehør på ad gangen.",
    icon: "✨",
    label: "Tilbehør",
  },
};

export const WARDROBE_CATEGORY_LABELS: Record<
  ChildWardrobeItem["category"],
  string
> = {
  clothing: "Tøj",
  equipment: "Udstyr",
  effect: "Effekt",
};

export const WARDROBE_RARITY_LABELS: Record<
  ChildWardrobeItem["rarity"],
  string
> = {
  common: "Almindelig",
  rare: "Sjælden",
  special: "Særlig",
};

export type WardrobeEquipmentPlan =
  | { kind: "equip"; replacement: null }
  | { kind: "replace"; replacement: ChildWardrobeItem }
  | { kind: "unequip"; replacement: null };

export function planWardrobeEquipment(
  items: readonly ChildWardrobeItem[],
  target: ChildWardrobeItem,
): WardrobeEquipmentPlan {
  if (target.isEquipped) {
    return { kind: "unequip", replacement: null };
  }

  const replacement = items.find(
    (item) =>
      item.childProfileId === target.childProfileId &&
      item.equipSlot === target.equipSlot &&
      item.isEquipped,
  );

  return replacement
    ? { kind: "replace", replacement }
    : { kind: "equip", replacement: null };
}

/** Reconciles the atomic database result without ever dropping catalog identity. */
export function applyWardrobeEquipmentState(
  items: readonly ChildWardrobeItem[],
  equipmentState: ChildWardrobeEquipmentState,
): ChildWardrobeItem[] {
  const target = items.find(
    (item) => item.wardrobeItemId === equipmentState.wardrobeItemId,
  );

  if (
    !target ||
    target.childProfileId !== equipmentState.childProfileId ||
    target.equipSlot !== equipmentState.equipSlot
  ) {
    throw new Error("Garderobens gemte svar matcher ikke den valgte ting.");
  }

  return items.map((item) => {
    if (item.wardrobeItemId === equipmentState.wardrobeItemId) {
      return { ...item, ...equipmentState };
    }

    if (
      equipmentState.isEquipped &&
      item.childProfileId === equipmentState.childProfileId &&
      item.equipSlot === equipmentState.equipSlot &&
      item.isEquipped
    ) {
      return { ...item, equippedAt: null, isEquipped: false };
    }

    return item;
  });
}

export function resolveSelectedChildWardrobeId(input: {
  availableChildIds: readonly string[];
  bootstrapProfileId: string | null;
  currentSessionUserId: string | null;
  selectedChildId: string | null;
  sessionUserId: string | null;
}): string {
  if (
    !input.sessionUserId ||
    input.currentSessionUserId !== input.sessionUserId ||
    input.bootstrapProfileId !== input.sessionUserId ||
    !input.selectedChildId ||
    !input.availableChildIds.includes(input.selectedChildId)
  ) {
    throw new Error("Garderoben kræver et aktivt barn i din familie.");
  }

  return input.selectedChildId;
}

export function getWardrobeErrorMessage(error: unknown): string {
  if (!(error instanceof WardrobeError)) {
    return "Garderoben kunne ikke opdateres. Prøv igen.";
  }

  switch (error.code) {
    case "child_wardrobe_access_denied":
      return "Du har ikke adgang til dette barns garderobe.";
    case "child_wardrobe_load_failed":
      return "Garderoben kunne ikke hentes. Kontrollér forbindelsen og prøv igen.";
    case "child_wardrobe_mutation_failed":
      return "Valget kunne ikke gemmes. Garderoben er ikke blevet ændret.";
    default:
      return "Garderoben sendte et svar, som appen ikke kunne bruge. Prøv igen.";
  }
}
