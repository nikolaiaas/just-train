import {
  type ChildWardrobeEquipmentState,
  type ChildWardrobeItem,
} from "@bare-traen/api-client";
import { colors, radii, spacing, typography } from "@bare-traen/design";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/auth-provider";
import {
  ActionButton,
  BackButton,
  Body,
  Kicker,
  Screen,
  SurfaceCard,
  Title,
} from "@/components/bare-ui";
import {
  WARDROBE_CATEGORY_LABELS,
  WARDROBE_RARITY_LABELS,
  WARDROBE_SLOT_DETAILS,
  WARDROBE_SLOT_ORDER,
  applyWardrobeEquipmentState,
  getWardrobeErrorMessage,
  getWardrobeImageAccessibilityLabel,
  planWardrobeEquipment,
} from "@/wardrobe/core";

type WardrobeLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: ChildWardrobeItem[] };

type ReplacementConfirmation = {
  replacementName: string;
  targetId: string;
};

function WardrobeCatalogImage({ item }: { item: ChildWardrobeItem }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const accessibilityLabel = getWardrobeImageAccessibilityLabel(item);
  const canShowImage = Boolean(item.imageUrl && failedUrl !== item.imageUrl);

  return (
    <View style={styles.itemMedia}>
      {canShowImage ? (
        <Image
          accessible
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="image"
          contentFit="cover"
          onError={() => setFailedUrl(item.imageUrl)}
          source={{ uri: item.imageUrl ?? "" }}
          style={styles.itemImage}
        />
      ) : (
        <View
          accessible
          accessibilityLabel={`Billede mangler for ${item.name}`}
          accessibilityRole="image"
          style={styles.itemImageFallback}
        >
          <Text style={styles.itemImageFallbackText}>Billede mangler</Text>
        </View>
      )}
    </View>
  );
}

export default function WardrobeRoute() {
  const router = useRouter();
  const {
    bootstrap,
    loadSelectedChildWardrobe,
    selectedChild,
    session,
    setSelectedChildWardrobeItemEquipped,
  } = useAuth();

  if (bootstrap.status !== "ready" || !selectedChild || !session) {
    return (
      <Screen contentStyle={styles.centeredState}>
        <BackButton onPress={() => router.back()} />
        <Text style={styles.stateEmoji}>🧳</Text>
        <Title style={styles.centerText}>Vælg et barn først</Title>
        <Body style={styles.centerText}>
          Gå tilbage til I dag, og vælg det barn, hvis garderobe du vil se.
        </Body>
      </Screen>
    );
  }

  return (
    <ChildWardrobe
      key={`${session.user.id}:${selectedChild.id}`}
      childName={selectedChild.displayName}
      loadWardrobe={loadSelectedChildWardrobe}
      onBack={() => router.back()}
      saveEquipment={setSelectedChildWardrobeItemEquipped}
    />
  );
}

function ChildWardrobe({
  childName,
  loadWardrobe,
  onBack,
  saveEquipment,
}: {
  childName: string;
  loadWardrobe(): Promise<ChildWardrobeItem[]>;
  onBack(): void;
  saveEquipment(input: {
    equipped: boolean;
    wardrobeItemId: string;
  }): Promise<ChildWardrobeEquipmentState>;
}) {
  const [loadRevision, setLoadRevision] = useState(0);
  const [state, setState] = useState<WardrobeLoadState>({ status: "loading" });
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [confirmation, setConfirmation] =
    useState<ReplacementConfirmation | null>(null);

  useEffect(() => {
    let active = true;

    void loadWardrobe()
      .then((items) => {
        if (active) {
          setState({ status: "ready", items });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getWardrobeErrorMessage(error),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [loadRevision, loadWardrobe]);

  const sortedItems = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    return [...state.items].sort((first, second) => {
      const slotDifference =
        WARDROBE_SLOT_ORDER.indexOf(first.equipSlot) -
        WARDROBE_SLOT_ORDER.indexOf(second.equipSlot);

      return slotDifference || first.name.localeCompare(second.name, "da-DK");
    });
  }, [state]);

  function retry() {
    setMutationError(null);
    setConfirmation(null);
    setState({ status: "loading" });
    setLoadRevision((revision) => revision + 1);
  }

  async function save(item: ChildWardrobeItem, equipped: boolean) {
    setPendingItemId(item.wardrobeItemId);
    setMutationError(null);
    setConfirmation(null);

    try {
      const equipmentState = await saveEquipment({
        equipped,
        wardrobeItemId: item.wardrobeItemId,
      });

      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              items: applyWardrobeEquipmentState(current.items, equipmentState),
            }
          : current,
      );
    } catch (error) {
      setMutationError(getWardrobeErrorMessage(error));
    } finally {
      setPendingItemId(null);
    }
  }

  function requestEquipmentChange(item: ChildWardrobeItem) {
    const plan = planWardrobeEquipment(
      state.status === "ready" ? state.items : [],
      item,
    );

    if (plan.kind === "replace") {
      setMutationError(null);
      setConfirmation({
        replacementName: plan.replacement.name,
        targetId: item.wardrobeItemId,
      });
      return;
    }

    void save(item, plan.kind === "equip");
  }

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton disabled={pendingItemId !== null} onPress={onBack} />
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Text style={styles.headerEmoji}>🧳</Text>
        </View>
        <View style={styles.headerCopy}>
          <Kicker>{childName}s ting</Kicker>
          <Title>Min garderobe</Title>
        </View>
      </View>
      <Body>
        Vælg, hvad {childName} skal have på. Der kan kun bruges én ting på hver
        plads ad gangen, og sko vælges altid som et helt par.
      </Body>

      {mutationError && (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={styles.errorBox}
        >
          <Text style={styles.errorText}>{mutationError}</Text>
        </View>
      )}

      {state.status === "loading" && (
        <View accessibilityLiveRegion="polite" style={styles.loadingState}>
          <ActivityIndicator color={colors.primaryDeep} size="large" />
          <Body>Henter {childName}s garderobe…</Body>
        </View>
      )}

      {state.status === "error" && (
        <SurfaceCard style={styles.messageCard}>
          <Text style={styles.stateEmoji}>🌧️</Text>
          <Text style={styles.messageTitle}>Garderoben kunne ikke hentes</Text>
          <Body style={styles.centerText}>{state.message}</Body>
          <ActionButton onPress={retry}>Prøv igen</ActionButton>
        </SurfaceCard>
      )}

      {state.status === "ready" && state.items.length === 0 && (
        <SurfaceCard style={styles.messageCard}>
          <Text style={styles.stateEmoji}>🎁</Text>
          <Text style={styles.messageTitle}>Garderoben er tom endnu</Text>
          <Body style={styles.centerText}>
            Når {childName} får en belønning, dukker den op her og kan tages på.
          </Body>
        </SurfaceCard>
      )}

      {sortedItems.map((item) => {
        const slot = WARDROBE_SLOT_DETAILS[item.equipSlot];
        const isPending = pendingItemId === item.wardrobeItemId;
        const isConfirming = confirmation?.targetId === item.wardrobeItemId;

        return (
          <SurfaceCard key={item.wardrobeItemId} style={styles.itemCard}>
            <View style={styles.itemHeading}>
              <WardrobeCatalogImage item={item} />
              <View style={styles.itemCopy}>
                <View style={styles.itemTitleRow}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <View
                    accessibilityLabel={
                      item.isEquipped
                        ? "Har denne ting på"
                        : "Har ikke denne ting på"
                    }
                    style={[
                      styles.statusPill,
                      item.isEquipped && styles.statusPillEquipped,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        item.isEquipped && styles.statusTextEquipped,
                      ]}
                    >
                      {item.isEquipped ? "På nu" : "I skabet"}
                    </Text>
                  </View>
                </View>
                {item.description ? (
                  <Text style={styles.itemDescription}>{item.description}</Text>
                ) : null}
                <Text style={styles.catalogMeta}>
                  {WARDROBE_CATEGORY_LABELS[item.category]} ·{" "}
                  {WARDROBE_RARITY_LABELS[item.rarity]}
                </Text>
              </View>
            </View>

            <View style={styles.slotRow}>
              <Text
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.slotIcon}
              >
                {slot.icon}
              </Text>
              <View style={styles.slotCopy}>
                <Text style={styles.slotLabel}>{slot.label}</Text>
                <Body>{slot.description}</Body>
              </View>
            </View>

            {isConfirming ? (
              <View
                accessibilityLiveRegion="polite"
                style={styles.confirmationBox}
              >
                <Text style={styles.confirmationTitle}>Skift denne plads?</Text>
                <Body>
                  {confirmation.replacementName} er allerede valgt. Hvis du
                  tager {item.name} på, bliver {confirmation.replacementName}{" "}
                  taget af
                  {item.equipSlot === "feet" ? " som et helt par" : ""}.
                </Body>
                <View style={styles.confirmationActions}>
                  <ActionButton
                    disabled={pendingItemId !== null}
                    onPress={() => void save(item, true)}
                  >
                    Ja, tag {item.name} på
                  </ActionButton>
                  <ActionButton
                    disabled={pendingItemId !== null}
                    variant="secondary"
                    onPress={() => setConfirmation(null)}
                  >
                    Behold {confirmation.replacementName}
                  </ActionButton>
                </View>
              </View>
            ) : (
              <ActionButton
                accessibilityLabel={`${item.isEquipped ? "Tag af" : "Tag på"}: ${item.name}`}
                disabled={pendingItemId !== null}
                variant={item.isEquipped ? "secondary" : "primary"}
                onPress={() => requestEquipmentChange(item)}
              >
                {isPending ? "Gemmer…" : item.isEquipped ? "Tag af" : "Tag på"}
              </ActionButton>
            )}
          </SurfaceCard>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  centeredState: {
    minHeight: 520,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  centerText: { textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerIcon: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    backgroundColor: colors.softWarm,
  },
  headerEmoji: { fontSize: 32 },
  headerCopy: { flex: 1, gap: spacing.xxs },
  loadingState: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  messageCard: { alignItems: "center", gap: spacing.md },
  messageTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
    textAlign: "center",
  },
  stateEmoji: { fontSize: 42 },
  errorBox: {
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
  },
  errorText: {
    color: colors.coral,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  itemCard: { gap: spacing.md },
  itemHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  itemMedia: {
    width: 104,
    height: 104,
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: radii.lg,
    backgroundColor: colors.page,
  },
  itemImage: { width: "100%", height: "100%" },
  itemImageFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.page,
    padding: spacing.sm,
  },
  itemImageFallbackText: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold,
    textAlign: "center",
  },
  itemCopy: { flex: 1, gap: spacing.xxs },
  itemTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  itemName: {
    flexGrow: 1,
    flexShrink: 1,
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  itemDescription: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    lineHeight: 19,
  },
  catalogMeta: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.label,
    fontWeight: typography.weights.semibold,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: radii.full,
    backgroundColor: colors.page,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusPillEquipped: { backgroundColor: colors.soft },
  statusText: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold,
  },
  statusTextEquipped: { color: colors.primaryDeep },
  slotRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.page,
    padding: spacing.md,
  },
  slotIcon: { fontSize: 20 },
  slotCopy: { flex: 1, gap: spacing.xxs },
  slotLabel: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  confirmationBox: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.yellow,
    borderRadius: radii.md,
    backgroundColor: colors.softWarm,
    padding: spacing.md,
  },
  confirmationTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  confirmationActions: { gap: spacing.sm },
});
