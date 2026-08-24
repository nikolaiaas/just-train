import type {
  ChildTopicPortraitState,
  ChildTopicWardrobeRender,
  ChildTrainingSubject,
  ChildWardrobeItem,
} from "@bare-traen/api-client";
import { colors, radii, spacing, typography } from "@bare-traen/design";
import { randomUUID } from "expo-crypto";
import { Image } from "expo-image";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getAiJobErrorMessage,
  getAiPollDelay,
  shouldReconcileAiJob,
} from "@/ai/core";
import {
  loadPrivateWebImage,
  revokePrivateWebImage,
} from "@/ai/private-output";
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
import { parseRouteUuid } from "@/training/core";
import {
  WARDROBE_CATEGORY_LABELS,
  WARDROBE_RARITY_LABELS,
  WARDROBE_SLOT_DETAILS,
  WARDROBE_SLOT_ORDER,
  applyWardrobeEquipmentState,
  getWardrobeErrorMessage,
  getWardrobeImageAccessibilityLabel,
  getWardrobeRenderErrorMessage,
  isCurrentWardrobePortraitImageFailure,
  planWardrobeEquipment,
} from "@/wardrobe/core";

const TOPIC_ROUTE = "/topics/[topicId]" as Href;

type WardrobeState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      items: ChildWardrobeItem[];
      portrait: ChildTopicPortraitState;
      subject: ChildTrainingSubject;
    };

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
  const params = useLocalSearchParams<{ topicId?: string | string[] }>();
  const { selectedChild, session } = useAuth();
  const topicId = parseRouteUuid(params.topicId);

  return (
    <ChildWardrobe
      key={`${session?.user.id ?? "signed-out"}:${selectedChild?.id ?? "no-child"}:${topicId ?? "bad-topic"}`}
      topicId={topicId}
    />
  );
}

function ChildWardrobe({ topicId }: { topicId: string | null }) {
  const router = useRouter();
  const {
    getAiCartoonJob,
    loadSelectedChildTopicPortrait,
    loadSelectedChildTrainingSubject,
    loadSelectedChildWardrobe,
    prepareSelectedChildTopicWardrobeRender,
    reconcileAiCartoonJob,
    selectedChild,
    setSelectedChildTopicWardrobeItemAndRender,
  } = useAuth();
  const [loadRevision, setLoadRevision] = useState(0);
  const [state, setState] = useState<WardrobeState>({ status: "loading" });
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [failedPortraitSignedUrl, setFailedPortraitSignedUrl] = useState<
    string | null
  >(null);
  const [portraitImageReloading, setPortraitImageReloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] =
    useState<ReplacementConfirmation | null>(null);
  const mounted = useRef(true);
  const pollCount = useRef(0);
  const pollInFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedChild || !topicId) return;
    let active = true;

    void Promise.all([
      loadSelectedChildWardrobe(),
      loadSelectedChildTrainingSubject(topicId),
      loadSelectedChildTopicPortrait(topicId),
    ])
      .then(([items, subject, portrait]) => {
        if (!active) return;
        if (!subject || portrait.topicId !== subject.id) {
          setState({
            status: "error",
            message: "Emnet er ikke længere tilgængeligt.",
          });
          return;
        }
        setState({ status: "ready", items, portrait, subject });
        if (
          portrait.pendingJob &&
          (portrait.pendingJob.status === "awaiting_upload" ||
            portrait.pendingJob.status === "processing")
        ) {
          setRenderJobId(portrait.pendingJob.id);
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
  }, [
    loadRevision,
    loadSelectedChildTopicPortrait,
    loadSelectedChildTrainingSubject,
    loadSelectedChildWardrobe,
    selectedChild,
    topicId,
  ]);

  const refreshPortrait = useCallback(async () => {
    if (!topicId) return;
    const portrait = await loadSelectedChildTopicPortrait(topicId);
    if (!mounted.current) return;
    setState((current) =>
      current.status === "ready" ? { ...current, portrait } : current,
    );
  }, [loadSelectedChildTopicPortrait, topicId]);

  const handlePortraitImageError = useCallback((signedUrl: string) => {
    setFailedPortraitSignedUrl(signedUrl);
  }, []);

  const handlePortraitImageLoaded = useCallback(() => {
    setFailedPortraitSignedUrl(null);
  }, []);

  const refreshRenderJob = useCallback(async () => {
    if (!renderJobId || pollInFlight.current) return Boolean(renderJobId);
    pollInFlight.current = true;

    try {
      const job = await getAiCartoonJob(renderJobId);
      if (!mounted.current) return false;

      if (shouldReconcileAiJob(job)) {
        await reconcileAiCartoonJob(job.id);
        return true;
      }
      if (job.status === "succeeded") {
        setRenderJobId(null);
        setRenderError(null);
        setNotice("Dit nye garderobelook er klar.");
        await refreshPortrait();
        return false;
      }
      if (job.status === "failed" || job.status === "cancelled") {
        setRenderJobId(null);
        setRenderError(
          `Valget er gemt. ${getAiJobErrorMessage(job.publicErrorCode)} Dit tidligere look bliver stående.`,
        );
        await refreshPortrait();
        return false;
      }
      return true;
    } catch {
      if (mounted.current) {
        setRenderError(
          "Valget er gemt, men vi kunne ikke tjekke det nye look. Dit tidligere look bliver stående.",
        );
      }
      return false;
    } finally {
      pollInFlight.current = false;
    }
  }, [getAiCartoonJob, reconcileAiCartoonJob, refreshPortrait, renderJobId]);

  useEffect(() => {
    if (!renderJobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const keepPolling = await refreshRenderJob();
      if (!active || !keepPolling) return;
      timer = setTimeout(
        () => void poll(),
        getAiPollDelay(pollCount.current++),
      );
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [refreshRenderJob, renderJobId]);

  const sortedItems = useMemo(() => {
    if (state.status !== "ready") return [];
    return [...state.items].sort((first, second) => {
      const slotDifference =
        WARDROBE_SLOT_ORDER.indexOf(first.equipSlot) -
        WARDROBE_SLOT_ORDER.indexOf(second.equipSlot);
      return slotDifference || first.name.localeCompare(second.name, "da-DK");
    });
  }, [state]);

  function goBackToTopic() {
    if (!topicId) {
      router.dismissTo("/topics");
      return;
    }
    router.dismissTo({
      pathname: TOPIC_ROUTE,
      params: { topicId },
    } as Href);
  }

  function retryLoad() {
    setMutationError(null);
    setRenderError(null);
    setConfirmation(null);
    setState({ status: "loading" });
    setLoadRevision((revision) => revision + 1);
  }

  async function applyRender(render: ChildTopicWardrobeRender) {
    if (render.mode === "base") {
      setRenderJobId(null);
      setNotice("Alle ting er taget af. Grundfiguren er tilbage.");
      await refreshPortrait();
      return;
    }

    if (render.mode === "stale") {
      setRenderJobId(null);
      setRenderError(getWardrobeRenderErrorMessage(render.errorCode));
      await refreshPortrait();
      return;
    }

    if (render.jobId) {
      pollCount.current = 0;
      setRenderJobId(render.jobId);
      setNotice(
        "Valget er gemt. AI tegner alle de ting, du har på, på grundfiguren.",
      );
    }
  }

  async function save(item: ChildWardrobeItem, equipped: boolean) {
    if (!topicId) return;
    setPendingItemId(item.wardrobeItemId);
    setMutationError(null);
    setRenderError(null);
    setNotice(null);
    setConfirmation(null);

    try {
      const result = await setSelectedChildTopicWardrobeItemAndRender({
        clientRequestId: randomUUID(),
        equipped,
        topicId,
        wardrobeItemId: item.wardrobeItemId,
      });
      if (!mounted.current) return;
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              items: applyWardrobeEquipmentState(
                current.items,
                result.equipment,
              ),
            }
          : current,
      );
      await applyRender(result.render);
    } catch (error) {
      if (mounted.current) {
        setMutationError(
          `${getWardrobeErrorMessage(error)} Vi henter garderoben igen, så intet vises forkert.`,
        );
        setLoadRevision((revision) => revision + 1);
      }
    } finally {
      if (mounted.current) setPendingItemId(null);
    }
  }

  async function retryRender() {
    if (!topicId) return;
    setRenderError(null);

    if (renderJobId) {
      setNotice("Vi prøver at starte den samme sikre billedopgave igen.");
      void refreshRenderJob();
      return;
    }

    setNotice("AI prøver igen med grundfiguren og alle aktive ting.");
    try {
      const render = await prepareSelectedChildTopicWardrobeRender({
        clientRequestId: randomUUID(),
        topicId,
      });
      if (mounted.current) await applyRender(render);
    } catch {
      if (mounted.current) {
        setRenderError(
          "Dit valg er stadig gemt, men looket kunne ikke startes. Det tidligere billede bliver stående.",
        );
      }
    }
  }

  async function retryPortraitImage() {
    const retrySignedUrl =
      state.status === "ready"
        ? ((state.portrait.currentLook ?? state.portrait.base)?.signedUrl ??
          null)
        : null;
    if (!retrySignedUrl || portraitImageReloading) return;

    setFailedPortraitSignedUrl(null);
    setPortraitImageReloading(true);
    try {
      await refreshPortrait();
    } catch {
      if (mounted.current) setFailedPortraitSignedUrl(retrySignedUrl);
    } finally {
      if (mounted.current) setPortraitImageReloading(false);
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

  if (!selectedChild || !topicId) {
    return (
      <Screen contentStyle={styles.centeredState}>
        <Text style={styles.stateEmoji}>🧳</Text>
        <Title style={styles.centerText}>Vælg et emne først</Title>
        <Body style={styles.centerText}>
          Garderoben skal vide, hvilken emnefigur tingene skal tegnes på.
        </Body>
        <ActionButton onPress={() => router.replace("/topics")}>
          Se alle emner
        </ActionButton>
      </Screen>
    );
  }

  if (state.status === "loading") {
    return (
      <Screen contentStyle={styles.centeredState}>
        <ActivityIndicator color={colors.primaryDeep} size="large" />
        <Body>Henter garderoben og din emnefigur…</Body>
      </Screen>
    );
  }

  if (state.status === "error") {
    return (
      <Screen contentStyle={styles.centeredState}>
        <Text style={styles.stateEmoji}>🌧️</Text>
        <Title style={styles.centerText}>Garderoben kunne ikke hentes</Title>
        <Body style={styles.centerText}>{state.message}</Body>
        <ActionButton onPress={retryLoad}>Prøv igen</ActionButton>
        <ActionButton variant="secondary" onPress={goBackToTopic}>
          Tilbage til emnet
        </ActionButton>
      </Screen>
    );
  }

  const { items, portrait, subject } = state;
  const currentImage = portrait.currentLook ?? portrait.base;
  const portraitImageFailed = isCurrentWardrobePortraitImageFailure(
    failedPortraitSignedUrl,
    currentImage?.signedUrl ?? null,
  );
  const equippedItems = items.filter((item) => item.isEquipped);
  const controlsBusy = pendingItemId !== null || renderJobId !== null;

  if (!portrait.base) {
    return (
      <Screen contentStyle={styles.centeredState}>
        <Text style={styles.stateEmoji}>🧑‍🎨</Text>
        <Title style={styles.centerText}>
          Lav din {subject.title}-figur først
        </Title>
        <Body style={styles.centerText}>
          Garderoben bruger altid den samme gemte grundfigur. Gå tilbage, vælg
          et billede, og lad AI lave figuren.
        </Body>
        <ActionButton onPress={goBackToTopic}>
          Tilbage til {subject.title}
        </ActionButton>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton
        disabled={pendingItemId !== null}
        label={subject.title}
        onPress={goBackToTopic}
      />
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Text style={styles.headerEmoji}>🧳</Text>
        </View>
        <View style={styles.headerCopy}>
          <Kicker>{selectedChild.displayName}s ting</Kicker>
          <Title>Garderobe til {subject.title}</Title>
        </View>
      </View>
      <Body>
        Hver ændring bruger den gemte grundfigur og alle ting, der er aktive.
        Det forrige AI-look bliver aldrig brugt som nyt grundlag.
      </Body>

      <SurfaceCard style={styles.lookCard}>
        <Kicker>Dit look lige nu</Kicker>
        {portraitImageFailed ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>
              Dit look kunne ikke hentes. Dine garderobevalg er stadig gemt.
            </Text>
            <ActionButton
              disabled={portraitImageReloading}
              variant="secondary"
              onPress={() => void retryPortraitImage()}
            >
              {portraitImageReloading ? "Henter looket…" : "Hent looket igen"}
            </ActionButton>
          </View>
        ) : currentImage ? (
          <PrivatePortraitImage
            accessibilityLabel={`${selectedChild.displayName}s garderobelook til ${subject.title}`}
            onLoadError={handlePortraitImageError}
            onLoadSuccess={handlePortraitImageLoaded}
            signedUrl={currentImage.signedUrl}
          />
        ) : (
          <View style={styles.lookPlaceholder}>
            <Body>Grundfiguren er gemt. Hent siden igen for at se den.</Body>
          </View>
        )}

        {renderJobId && (
          <View accessibilityLiveRegion="polite" style={styles.processingBox}>
            <ActivityIndicator color={colors.primaryDeep} />
            <View style={styles.processingCopy}>
              <Text style={styles.processingTitle}>
                AI tegner alle aktive ting
              </Text>
              <Body>
                Dit nuværende billede bliver stående, indtil det nye er helt
                klar.
              </Body>
            </View>
          </View>
        )}

        <View style={styles.activeBox}>
          <Kicker>Aktive ting</Kicker>
          <Body>
            {equippedItems.length === 0
              ? "Ingen ting på – grundfiguren vises."
              : equippedItems.map((item) => item.name).join(" · ")}
          </Body>
        </View>

        {portrait.isLookStale && !renderJobId && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>
              Looket mangler den nyeste ændring
            </Text>
            <Body>
              Dit garderobevalg er gemt. Prøv at tegne alle aktive ting igen.
            </Body>
            <ActionButton
              disabled={controlsBusy}
              variant="secondary"
              onPress={() => void retryRender()}
            >
              Tegn alle aktive ting
            </ActionButton>
          </View>
        )}
        {notice && (
          <View accessibilityLiveRegion="polite" style={styles.successBox}>
            <Text style={styles.successText}>{notice}</Text>
          </View>
        )}
        {renderError && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{renderError}</Text>
            <ActionButton
              variant="secondary"
              onPress={() => void retryRender()}
            >
              Prøv at tegne looket igen
            </ActionButton>
          </View>
        )}
      </SurfaceCard>

      {mutationError && (
        <View accessibilityRole="alert" style={styles.errorBox}>
          <Text style={styles.errorText}>{mutationError}</Text>
        </View>
      )}

      {items.length === 0 && (
        <SurfaceCard style={styles.messageCard}>
          <Text style={styles.stateEmoji}>🎁</Text>
          <Text style={styles.messageTitle}>Garderoben er tom endnu</Text>
          <Body style={styles.centerText}>
            Når {selectedChild.displayName} får en ting, dukker den op her.
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
              <Text accessible={false} style={styles.slotIcon}>
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
                  {confirmation.replacementName} er allerede valgt. {item.name}{" "}
                  erstatter den
                  {item.equipSlot === "feet" ? " som et helt par" : ""}.
                </Body>
                <ActionButton
                  disabled={controlsBusy}
                  onPress={() => void save(item, true)}
                >
                  Ja, tag {item.name} på
                </ActionButton>
                <ActionButton
                  disabled={controlsBusy}
                  variant="secondary"
                  onPress={() => setConfirmation(null)}
                >
                  Behold {confirmation.replacementName}
                </ActionButton>
              </View>
            ) : (
              <ActionButton
                accessibilityLabel={`${item.isEquipped ? "Tag af" : "Tag på"}: ${item.name}`}
                disabled={controlsBusy}
                variant={item.isEquipped ? "secondary" : "primary"}
                onPress={() => requestEquipmentChange(item)}
              >
                {isPending
                  ? "Gemmer og starter AI…"
                  : item.isEquipped
                    ? "Tag af"
                    : "Tag på"}
              </ActionButton>
            )}
          </SurfaceCard>
        );
      })}
    </Screen>
  );
}

function PrivatePortraitImage({
  accessibilityLabel,
  onLoadError,
  onLoadSuccess,
  signedUrl,
}: {
  accessibilityLabel: string;
  onLoadError(signedUrl: string): void;
  onLoadSuccess(): void;
  signedUrl: string;
}) {
  const [webUri, setWebUri] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const controller = new AbortController();
    let active = true;
    let ownedBlobUrl: string | null = null;
    void loadPrivateWebImage(signedUrl, controller.signal, ["image/png"])
      .then((uri) => {
        ownedBlobUrl = uri;
        if (!active) {
          revokePrivateWebImage(uri);
          ownedBlobUrl = null;
          return;
        }
        setWebUri(uri);
        onLoadSuccess();
      })
      .catch(() => {
        if (active && !controller.signal.aborted) onLoadError(signedUrl);
      });
    return () => {
      active = false;
      controller.abort();
      revokePrivateWebImage(ownedBlobUrl);
    };
  }, [onLoadError, onLoadSuccess, signedUrl]);

  if (Platform.OS === "web" && !webUri) {
    return (
      <View style={styles.lookPlaceholder}>
        <ActivityIndicator color={colors.primaryDeep} />
        <Body>Henter dit look…</Body>
      </View>
    );
  }

  return (
    <Image
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      contentFit="contain"
      onError={() => onLoadError(signedUrl)}
      onLoad={onLoadSuccess}
      source={{ uri: webUri ?? signedUrl }}
      style={styles.lookImage}
    />
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
  stateEmoji: { fontSize: 42 },
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
  lookCard: { gap: spacing.md },
  lookImage: {
    width: "100%",
    height: 340,
    borderRadius: radii.xl,
    backgroundColor: colors.page,
  },
  lookPlaceholder: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.page,
    padding: spacing.lg,
  },
  processingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.soft,
    padding: spacing.md,
  },
  processingCopy: { flex: 1, gap: spacing.xxs },
  processingTitle: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  activeBox: {
    gap: spacing.xxs,
    borderRadius: radii.md,
    backgroundColor: colors.page,
    padding: spacing.md,
  },
  warningBox: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.yellow,
    borderRadius: radii.md,
    backgroundColor: colors.softWarm,
    padding: spacing.md,
  },
  warningTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  successBox: {
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    padding: spacing.md,
  },
  successText: {
    color: colors.success,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  errorBox: {
    gap: spacing.md,
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
  messageCard: { alignItems: "center", gap: spacing.md },
  messageTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
    textAlign: "center",
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
  itemTitleRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
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
});
