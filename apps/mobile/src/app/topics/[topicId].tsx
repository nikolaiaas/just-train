import type {
  ChildPublishedTopicWithPhoto,
  ChildTopicPortraitState,
  ChildTopicWardrobeRender,
  ChildTrainingSubject,
} from "@bare-traen/api-client";
import { colors, radii, spacing, typography } from "@bare-traen/design";
import { randomUUID } from "expo-crypto";
import { Image } from "expo-image";
import {
  type Href,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
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
  AiImageInputError,
  disposePreparedAiImage,
  pickPreparedAiImage,
  type PreparedAiImage,
} from "@/ai/image-input";
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
  ProgressBar,
  Screen,
  SurfaceCard,
  Title,
} from "@/components/bare-ui";
import {
  findChildTopic,
  getAutomaticWardrobeRenderKey,
  getCurrentTopicPortraitImage,
  getTopicPhotoErrorMessage,
  getTopicPortraitErrorMessage,
  isCurrentTopicPortraitImageFailure,
} from "@/topics/core";
import { formatProgressCopy, parseRouteUuid } from "@/training/core";
import { getWardrobeRenderErrorMessage } from "@/wardrobe/core";

const GOAL_ROUTE = "/goals/[goalId]" as Href;
const WARDROBE_ROUTE = "/topics/[topicId]/wardrobe" as Href;
const PHOTO_LOAD_ERROR = "Billedet kunne ikke åbnes. Hent emnet igen.";

type DetailState =
  | { status: "loading" | "error" | "missing" }
  | {
      status: "ready";
      subject: ChildTrainingSubject;
      topic: ChildPublishedTopicWithPhoto;
    };

type PortraitState =
  | { status: "loading" | "error"; portrait: null }
  | { status: "ready"; portrait: ChildTopicPortraitState };

export default function TopicScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ topicId?: string | string[] }>();
  const { selectedChild, session } = useAuth();
  const topicId = parseRouteUuid(params.topicId);

  if (!selectedChild || !topicId) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>{selectedChild ? "🌱" : "👋"}</Text>
        <Title style={styles.centerText}>
          {selectedChild
            ? "Emnet er ikke tilgængeligt"
            : "Vælg en profil først"}
        </Title>
        <ActionButton
          onPress={() => router.replace(selectedChild ? "/topics" : "/")}
        >
          {selectedChild ? "Se alle emner" : "Gå tilbage"}
        </ActionButton>
      </Screen>
    );
  }

  return (
    <SelectedTopic
      key={`${session?.user.id ?? "signed-out"}:${selectedChild.id}:${topicId}`}
      childName={selectedChild.displayName}
      topicId={topicId}
    />
  );
}

function SelectedTopic({
  childName,
  topicId,
}: {
  childName: string;
  topicId: string;
}) {
  const router = useRouter();
  const {
    getAiCartoonJob,
    loadSelectedChildTopicPortrait,
    loadSelectedChildTopics,
    loadSelectedChildTrainingSubject,
    prepareSelectedChildTopicBasePortrait,
    prepareSelectedChildTopicWardrobeRender,
    reconcileAiCartoonJob,
    removeSelectedChildTopicPhoto,
    saveSelectedChildTopicPhoto,
  } = useAuth();
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [portraitState, setPortraitState] = useState<PortraitState>({
    status: "loading",
    portrait: null,
  });
  const [revision, setRevision] = useState(0);
  const [portraitRevision, setPortraitRevision] = useState(0);
  const [pickedImage, setPickedImage] = useState<PreparedAiImage | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const [wardrobeRenderError, setWardrobeRenderError] = useState<string | null>(
    null,
  );
  const [wardrobePreparing, setWardrobePreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [libraryPermissionDenied, setLibraryPermissionDenied] = useState(false);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [failedPortraitSignedUrl, setFailedPortraitSignedUrl] = useState<
    string | null
  >(null);
  const [portraitImageReloading, setPortraitImageReloading] = useState(false);
  const [portraitJobId, setPortraitJobId] = useState<string | null>(null);
  const photoRequestId = useRef<string | null>(null);
  const portraitRequestId = useRef<string | null>(null);
  const mounted = useRef(true);
  const imagePickRevision = useRef(0);
  const ownedImage = useRef<PreparedAiImage | null>(null);
  const pollCount = useRef(0);
  const pollInFlight = useRef(false);
  const portraitJobKind = useRef<"base" | "wardrobe" | null>(null);
  const automaticWardrobeAttempts = useRef(new Set<string>());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      imagePickRevision.current += 1;
      disposePreparedAiImage(ownedImage.current);
      ownedImage.current = null;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void revision;
      let active = true;
      void Promise.all([
        loadSelectedChildTopics(),
        loadSelectedChildTrainingSubject(topicId),
      ])
        .then(([topics, subject]) => {
          if (!active) return;
          const topic = findChildTopic(topics, topicId);
          setState(
            topic && subject && topic.id === subject.id
              ? { status: "ready", subject, topic }
              : { status: "missing" },
          );
        })
        .catch(() => {
          if (active) setState({ status: "error" });
        });

      return () => {
        active = false;
      };
    }, [
      loadSelectedChildTopics,
      loadSelectedChildTrainingSubject,
      revision,
      topicId,
    ]),
  );

  useFocusEffect(
    useCallback(() => {
      void portraitRevision;
      let active = true;

      void loadSelectedChildTopicPortrait(topicId)
        .then((portrait) => {
          if (!active) return;
          setPortraitState({ status: "ready", portrait });
          if (
            portrait.pendingJob &&
            (portrait.pendingJob.status === "awaiting_upload" ||
              portrait.pendingJob.status === "processing")
          ) {
            portraitJobKind.current =
              !portrait.base || portrait.isBaseStale ? "base" : "wardrobe";
            setPortraitJobId(portrait.pendingJob.id);
          }
        })
        .catch(() => {
          if (active) setPortraitState({ status: "error", portrait: null });
        });

      return () => {
        active = false;
      };
    }, [loadSelectedChildTopicPortrait, portraitRevision, topicId]),
  );

  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        setRevision((current) => current + 1);
        setPortraitRevision((current) => current + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  const acceptWardrobeRender = useCallback(
    (render: ChildTopicWardrobeRender) => {
      if (render.mode === "base") {
        portraitJobKind.current = null;
        setPortraitJobId(null);
        setWardrobeRenderError(null);
        setNotice("Grundfiguren er klar uden garderobeting.");
        setPortraitRevision((current) => current + 1);
        return;
      }

      if (render.mode === "stale") {
        portraitJobKind.current = null;
        setPortraitJobId(null);
        setWardrobeRenderError(getWardrobeRenderErrorMessage(render.errorCode));
        return;
      }

      if (render.jobId) {
        portraitJobKind.current = "wardrobe";
        pollCount.current = 0;
        setWardrobeRenderError(null);
        setNotice(
          "Grundfiguren er klar. AI tegner nu alle dine aktive ting på den.",
        );
        setPortraitJobId(render.jobId);
      }
    },
    [],
  );

  const prepareWardrobeLook = useCallback(async () => {
    setWardrobePreparing(true);
    setWardrobeRenderError(null);

    try {
      const render = await prepareSelectedChildTopicWardrobeRender({
        clientRequestId: randomUUID(),
        topicId,
      });
      if (mounted.current) acceptWardrobeRender(render);
    } catch {
      if (mounted.current) {
        setWardrobeRenderError(
          "Din figur og dine valg er gemt, men garderobelooket kunne ikke startes. Prøv igen.",
        );
      }
    } finally {
      if (mounted.current) setWardrobePreparing(false);
    }
  }, [acceptWardrobeRender, prepareSelectedChildTopicWardrobeRender, topicId]);

  const refreshPortraitJob = useCallback(async () => {
    if (!portraitJobId || pollInFlight.current) return Boolean(portraitJobId);
    pollInFlight.current = true;

    try {
      const job = await getAiCartoonJob(portraitJobId);
      if (!mounted.current) return false;

      if (shouldReconcileAiJob(job)) {
        await reconcileAiCartoonJob(job.id);
        return true;
      }
      if (job.status === "succeeded") {
        const completedKind = portraitJobKind.current;
        portraitJobKind.current = null;
        setPortraitJobId(null);
        portraitRequestId.current = null;
        setPortraitError(null);
        setWardrobeRenderError(null);
        setNotice(
          completedKind === "wardrobe"
            ? "Dit nye garderobelook er klar."
            : "Din nye grundfigur er klar.",
        );
        setPortraitRevision((current) => current + 1);
        return false;
      }
      if (job.status === "failed" || job.status === "cancelled") {
        const failedKind = portraitJobKind.current;
        portraitJobKind.current = null;
        setPortraitJobId(null);
        portraitRequestId.current = null;
        if (failedKind === "wardrobe") {
          setWardrobeRenderError(
            `${getAiJobErrorMessage(job.publicErrorCode)} Dit seneste færdige billede bliver stående.`,
          );
        } else {
          setPortraitError(getAiJobErrorMessage(job.publicErrorCode));
        }
        setPortraitRevision((current) => current + 1);
        return false;
      }
      return true;
    } catch {
      if (mounted.current) {
        if (portraitJobKind.current === "wardrobe") {
          setWardrobeRenderError(
            "Vi kunne ikke tjekke garderobelooket lige nu. Grundfiguren er stadig gemt.",
          );
        } else {
          setPortraitError(
            "Vi kunne ikke tjekke billedet lige nu. Det gamle billede er stadig gemt.",
          );
        }
      }
      return false;
    } finally {
      pollInFlight.current = false;
    }
  }, [getAiCartoonJob, portraitJobId, reconcileAiCartoonJob]);

  useEffect(() => {
    if (!portraitJobId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const keepPolling = await refreshPortraitJob();
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
  }, [portraitJobId, refreshPortraitJob]);

  useEffect(() => {
    if (
      portraitState.status !== "ready" ||
      portraitJobId ||
      wardrobePreparing
    ) {
      return;
    }

    const renderKey = getAutomaticWardrobeRenderKey(portraitState.portrait);
    if (!renderKey || automaticWardrobeAttempts.current.has(renderKey)) return;

    automaticWardrobeAttempts.current.add(renderKey);
    void prepareWardrobeLook();
  }, [portraitJobId, portraitState, prepareWardrobeLook, wardrobePreparing]);

  const handlePortraitLoadError = useCallback((signedUrl: string) => {
    setFailedPortraitSignedUrl(signedUrl);
  }, []);
  const handlePortraitImageLoaded = useCallback(() => {
    setFailedPortraitSignedUrl(null);
  }, []);
  const handlePhotoLoadError = useCallback(() => {
    setPhotoLoadFailed(true);
    setError(PHOTO_LOAD_ERROR);
  }, []);
  const handlePhotoLoaded = useCallback(() => setPhotoLoadFailed(false), []);

  function replacePickedImage(nextImage: PreparedAiImage | null) {
    const previous = ownedImage.current;
    ownedImage.current = nextImage;
    if (previous !== nextImage) disposePreparedAiImage(previous);
    setPickedImage(nextImage);
  }

  function reloadAll() {
    setPhotoLoadFailed(false);
    setFailedPortraitSignedUrl(null);
    setPortraitState({ status: "loading", portrait: null });
    setRevision((current) => current + 1);
    setPortraitRevision((current) => current + 1);
  }

  async function retryPortraitImage() {
    const retrySignedUrl =
      portraitState.status === "ready"
        ? (getCurrentTopicPortraitImage(portraitState.portrait)?.signedUrl ??
          null)
        : null;
    if (!retrySignedUrl || portraitImageReloading) return;

    setPortraitImageReloading(true);
    try {
      const freshPortrait = await loadSelectedChildTopicPortrait(topicId);
      if (mounted.current) {
        setPortraitState({ status: "ready", portrait: freshPortrait });
        setFailedPortraitSignedUrl(null);
      }
    } catch {
      if (mounted.current) setFailedPortraitSignedUrl(retrySignedUrl);
    } finally {
      if (mounted.current) setPortraitImageReloading(false);
    }
  }

  async function chooseImage() {
    const pickRevision = imagePickRevision.current + 1;
    imagePickRevision.current = pickRevision;
    setConfirmingRemove(false);
    setPicking(true);
    setError(null);
    setPortraitError(null);
    setLibraryPermissionDenied(false);
    setNotice(null);

    try {
      const prepared = await pickPreparedAiImage();
      if (!prepared) return;
      if (!mounted.current || imagePickRevision.current !== pickRevision) {
        disposePreparedAiImage(prepared);
        return;
      }
      replacePickedImage(prepared);
      photoRequestId.current = randomUUID();
      portraitRequestId.current = randomUUID();
    } catch (caught) {
      if (!mounted.current || imagePickRevision.current !== pickRevision)
        return;
      const denied =
        caught instanceof AiImageInputError && caught.code === "permission";
      setLibraryPermissionDenied(denied);
      setError(
        denied
          ? "Giv adgang til billedbiblioteket for at vælge et emnebillede."
          : "Billedet kunne ikke klargøres. Vælg et andet billede.",
      );
    } finally {
      if (mounted.current && imagePickRevision.current === pickRevision) {
        setPicking(false);
      }
    }
  }

  async function makeBasePortrait() {
    if (!topicId || portraitJobId) return;
    const clientRequestId = portraitRequestId.current ?? randomUUID();
    portraitRequestId.current = clientRequestId;
    setPortraitError(null);
    setWardrobeRenderError(null);
    setNotice("Vi laver din emnefigur. Det kan tage et par minutter.");

    try {
      const prepared = await prepareSelectedChildTopicBasePortrait({
        clientRequestId,
        topicId,
      });
      if (!mounted.current) return;
      portraitJobKind.current = "base";
      pollCount.current = 0;
      setPortraitJobId(prepared.jobId);
      setPortraitRevision((current) => current + 1);
    } catch (caught) {
      if (mounted.current)
        setPortraitError(getTopicPortraitErrorMessage(caught));
    }
  }

  async function saveImage(topic: ChildPublishedTopicWithPhoto) {
    if (!pickedImage || !photoRequestId.current) return;
    const mimeType = pickedImage.mimeType;

    if (mimeType === "image/webp") {
      setError("Vælg et JPG- eller PNG-billede til emnet.");
      return;
    }

    setSaving(true);
    setError(null);
    setPortraitError(null);
    setNotice(null);

    try {
      await saveSelectedChildTopicPhoto({
        bytes: pickedImage.bytes,
        clientRequestId: photoRequestId.current,
        mimeType,
        topicId: topic.id,
      });
      if (!mounted.current) return;
      replacePickedImage(null);
      photoRequestId.current = null;
      setNotice("Billedet er gemt privat. Nu laver vi din emnefigur.");
      setRevision((current) => current + 1);
      await makeBasePortrait();
    } catch (caught) {
      if (mounted.current) setError(getTopicPhotoErrorMessage(caught));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  async function removeImage(topic: ChildPublishedTopicWithPhoto) {
    if (!topic.photo || removing) return;
    setRemoving(true);
    setError(null);
    setNotice(null);
    try {
      await removeSelectedChildTopicPhoto({
        mediaAssetId: topic.photo.mediaAssetId,
        topicId: topic.id,
      });
      if (mounted.current) {
        setConfirmingRemove(false);
        setNotice(
          "Kildebilledet er fjernet. Din allerede lavede emnefigur er ikke overskrevet.",
        );
        reloadAll();
      }
    } catch (caught) {
      if (mounted.current) setError(getTopicPhotoErrorMessage(caught));
    } finally {
      if (mounted.current) setRemoving(false);
    }
  }

  const busy = picking || saving || removing;

  if (state.status === "loading") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ActivityIndicator color={colors.primaryDeep} size="large" />
        <Body>Henter emnet…</Body>
      </Screen>
    );
  }

  if (state.status !== "ready") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>
          {state.status === "missing" ? "🌱" : "🌧️"}
        </Text>
        <Title style={styles.centerText}>
          {state.status === "missing"
            ? "Emnet findes ikke længere"
            : "Emnet kunne ikke hentes"}
        </Title>
        <Body style={styles.centerText}>
          Gå tilbage til emnerne, eller prøv at hente siden igen.
        </Body>
        {state.status === "error" && (
          <ActionButton onPress={reloadAll}>Prøv igen</ActionButton>
        )}
        <ActionButton
          variant="secondary"
          onPress={() => router.replace("/topics")}
        >
          Se alle emner
        </ActionButton>
      </Screen>
    );
  }

  const { subject, topic } = state;
  const portrait =
    portraitState.status === "ready" ? portraitState.portrait : null;
  const portraitImage = portrait
    ? getCurrentTopicPortraitImage(portrait)
    : null;
  const portraitImageFailed = isCurrentTopicPortraitImageFailure(
    failedPortraitSignedUrl,
    portraitImage?.signedUrl ?? null,
  );
  const pendingPortraitJob =
    portrait?.pendingJob?.status === "awaiting_upload" ||
    portrait?.pendingJob?.status === "processing";
  const wardrobeLookBusy = Boolean(
    wardrobePreparing ||
    (portraitJobId &&
      portrait &&
      !portrait.isBaseStale &&
      portrait.isLookStale &&
      portrait.liveWardrobeItemIds.length > 0) ||
    (pendingPortraitJob &&
      portrait &&
      !portrait.isBaseStale &&
      portrait.liveWardrobeItemIds.length > 0),
  );
  const portraitIsBusy = Boolean(
    portraitJobId || pendingPortraitJob || wardrobePreparing,
  );

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton
        disabled={busy}
        label="Alle emner"
        onPress={() => router.dismissTo("/topics")}
      />

      <View style={styles.heading}>
        <View
          accessible={false}
          style={[
            styles.topicIcon,
            subject.accentColor
              ? { backgroundColor: `${subject.accentColor}18` }
              : null,
          ]}
        >
          <Text style={styles.topicIconText}>{subject.icon ?? "★"}</Text>
        </View>
        <Kicker>Dit emne</Kicker>
        <Title>{subject.title}</Title>
        <Body>{subject.description || "Et nyt emne er klar til træning."}</Body>
      </View>

      <SurfaceCard style={styles.progressCard}>
        <View style={styles.progressHeading}>
          <View style={styles.progressCopy}>
            <Kicker>Din fremgang</Kicker>
            <Text style={styles.cardTitle}>
              {formatProgressCopy(subject.progress)}
            </Text>
          </View>
          <Text style={styles.progressPercent}>
            {subject.progress.percentage}%
          </Text>
        </View>
        <ProgressBar value={subject.progress.percentage} />
      </SurfaceCard>

      <SurfaceCard style={styles.portraitCard}>
        <View style={styles.cardCopy}>
          <Kicker>Din {subject.title}-figur</Kicker>
          <Text style={styles.cardTitle}>
            Et særligt billede kun til dette emne
          </Text>
          <Body>
            Få en voksen til at vælge et tydeligt helkropsbillede. Vi laver en
            tegneseriefigur, som garderoben altid bygger videre fra uden at
            overskrive grundfiguren.
          </Body>
        </View>

        {portraitImageFailed ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>
              Din emnefigur kunne ikke hentes. Figuren og dine valg er stadig
              gemt.
            </Text>
            <ActionButton
              disabled={portraitImageReloading}
              variant="secondary"
              onPress={() => void retryPortraitImage()}
            >
              {portraitImageReloading
                ? "Henter emnefiguren…"
                : "Hent emnefiguren igen"}
            </ActionButton>
          </View>
        ) : portraitImage ? (
          <PrivateImage
            accessibilityLabel={`${childName}s ${subject.title}-figur`}
            mimeType="image/png"
            onLoadError={handlePortraitLoadError}
            onLoadSuccess={handlePortraitImageLoaded}
            signedUrl={portraitImage.signedUrl}
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.placeholderIcon}>🧑‍🎨</Text>
            <Body style={styles.centerText}>
              Vælg et billede, så laver vi din figur.
            </Body>
          </View>
        )}

        {portraitState.status === "loading" && (
          <View accessibilityLiveRegion="polite" style={styles.inlineState}>
            <ActivityIndicator color={colors.primaryDeep} />
            <Body>Henter din emnefigur…</Body>
          </View>
        )}
        {portraitState.status === "error" && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>
              Din emnefigur kunne ikke hentes lige nu.
            </Text>
            <ActionButton
              variant="secondary"
              onPress={() => {
                setPortraitState({ status: "loading", portrait: null });
                setPortraitRevision((current) => current + 1);
              }}
            >
              Hent emnefiguren igen
            </ActionButton>
          </View>
        )}
        {portraitIsBusy && (
          <View accessibilityLiveRegion="polite" style={styles.processingBox}>
            <ActivityIndicator color={colors.primaryDeep} />
            <View style={styles.processingCopy}>
              <Text style={styles.processingTitle}>
                {wardrobeLookBusy
                  ? "AI tager dine aktive ting på"
                  : "AI tegner din nye grundfigur"}
              </Text>
              <Body>
                {wardrobeLookBusy
                  ? "Dit seneste færdige billede bliver stående, indtil garderobelooket er helt klar."
                  : "Det kan tage et par minutter. Dit tidligere billede bliver stående imens."}
              </Body>
            </View>
          </View>
        )}
        {portrait?.isBaseStale && !portraitIsBusy && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>Dit valgte billede er nyere</Text>
            <Body>
              Lav en ny grundfigur. Den gamle bliver stående, indtil den nye er
              klar.
            </Body>
          </View>
        )}
        {portrait?.isLookStale &&
          !portrait.isBaseStale &&
          portrait.liveWardrobeItemIds.length > 0 &&
          portrait.hasLiveEquipmentRenderAttempt &&
          !portraitIsBusy &&
          !wardrobeRenderError && (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>
                Garderobelooket er ikke helt opdateret
              </Text>
              <Body>
                Grundfiguren og dine valg er gemt. Du bestemmer selv, om AI skal
                prøve det samme look igen.
              </Body>
              <ActionButton
                variant="secondary"
                onPress={() => void prepareWardrobeLook()}
              >
                Prøv garderobelooket igen
              </ActionButton>
            </View>
          )}
        {portraitError && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{portraitError}</Text>
            {portraitJobId && (
              <ActionButton
                variant="secondary"
                onPress={() => {
                  setPortraitError(null);
                  void refreshPortraitJob();
                }}
              >
                Prøv billedet igen
              </ActionButton>
            )}
          </View>
        )}
        {wardrobeRenderError && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{wardrobeRenderError}</Text>
            <ActionButton
              disabled={wardrobePreparing}
              variant="secondary"
              onPress={() => {
                setWardrobeRenderError(null);
                if (portraitJobId && portraitJobKind.current === "wardrobe") {
                  void refreshPortraitJob();
                } else {
                  void prepareWardrobeLook();
                }
              }}
            >
              Prøv garderobelooket igen
            </ActionButton>
          </View>
        )}
        {topic.photo &&
          !portraitIsBusy &&
          (!portrait?.base || portrait.isBaseStale) && (
            <ActionButton
              onPress={() => {
                portraitRequestId.current = randomUUID();
                void makeBasePortrait();
              }}
            >
              {portrait?.base ? "Lav ny grundfigur" : "Lav min emnefigur"}
            </ActionButton>
          )}
        {portrait?.base && (
          <ActionButton
            disabled={portraitIsBusy}
            onPress={() =>
              router.push({
                pathname: WARDROBE_ROUTE,
                params: { topicId: subject.id },
              } as Href)
            }
          >
            Åbn garderoben til {subject.title}
          </ActionButton>
        )}
      </SurfaceCard>

      <SurfaceCard style={styles.photoCard}>
        <View style={styles.cardCopy}>
          <Kicker>Kildebillede</Kicker>
          <Text style={styles.cardTitle}>Vælg eller skift dit foto</Text>
          <Body>
            Kildebilledet er privat og adskilt fra dit almindelige
            profilbillede.
          </Body>
        </View>

        {pickedImage && (
          <Image
            accessibilityLabel={`Nyt valgt ${subject.title}-billede`}
            contentFit="contain"
            source={{ uri: pickedImage.previewUri }}
            style={styles.photo}
          />
        )}
        {!pickedImage && topic.photo && !portrait?.base && (
          <PrivateImage
            accessibilityLabel={`${subject.title}-kildebillede for ${childName}`}
            mimeType={topic.photo.mimeType}
            onLoadError={handlePhotoLoadError}
            onLoadSuccess={handlePhotoLoaded}
            signedUrl={topic.photo.signedUrl}
          />
        )}
        {!pickedImage && !topic.photo && (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.placeholderIcon}>📷</Text>
            <Body style={styles.centerText}>Intet billede valgt endnu.</Body>
          </View>
        )}

        {error && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {Platform.OS !== "web" && libraryPermissionDenied && (
          <ActionButton
            variant="secondary"
            onPress={() => void Linking.openSettings()}
          >
            Åbn Indstillinger
          </ActionButton>
        )}
        {photoLoadFailed && (
          <ActionButton variant="secondary" onPress={reloadAll}>
            Hent billedet igen
          </ActionButton>
        )}
        {notice && (
          <View accessibilityLiveRegion="polite" style={styles.successBox}>
            <Text style={styles.successText}>{notice}</Text>
          </View>
        )}

        {pickedImage ? (
          <View style={styles.actions}>
            <ActionButton disabled={busy} onPress={() => void saveImage(topic)}>
              {saving ? "Gemmer privat…" : "Gem og lav min figur"}
            </ActionButton>
            <ActionButton
              disabled={busy}
              variant="secondary"
              onPress={() => {
                replacePickedImage(null);
                photoRequestId.current = null;
                portraitRequestId.current = null;
                setError(null);
              }}
            >
              Fortryd
            </ActionButton>
          </View>
        ) : (
          <View style={styles.actions}>
            <ActionButton
              disabled={busy || portraitIsBusy}
              variant={topic.photo ? "secondary" : "primary"}
              onPress={() => void chooseImage()}
            >
              {picking
                ? "Klargør billede…"
                : topic.photo
                  ? "Vælg et nyt billede"
                  : "Vælg billede"}
            </ActionButton>
            {topic.photo && !confirmingRemove && (
              <ActionButton
                disabled={busy || portraitIsBusy}
                variant="secondary"
                onPress={() => setConfirmingRemove(true)}
              >
                Fjern kildebilledet
              </ActionButton>
            )}
          </View>
        )}

        {topic.photo && confirmingRemove && !pickedImage && (
          <View accessibilityRole="alert" style={styles.removeConfirmBox}>
            <Text style={styles.cardTitle}>Fjern kildebilledet?</Text>
            <Body>
              Den færdige grundfigur bliver bevaret og ikke overskrevet.
            </Body>
            <ActionButton
              disabled={busy}
              variant="danger"
              onPress={() => void removeImage(topic)}
            >
              {removing ? "Fjerner…" : "Ja, fjern kildebilledet"}
            </ActionButton>
            <ActionButton
              disabled={busy}
              variant="secondary"
              onPress={() => setConfirmingRemove(false)}
            >
              Behold billedet
            </ActionButton>
          </View>
        )}
      </SurfaceCard>

      <View style={styles.goalsHeading}>
        <Kicker>Mål i {subject.title}</Kicker>
        <Text style={styles.sectionTitle}>Hvad vil du øve?</Text>
      </View>
      {subject.goals.length === 0 ? (
        <SurfaceCard style={styles.emptyCard}>
          <Text style={styles.stateEmoji}>🌱</Text>
          <Text style={styles.cardTitle}>Der kommer snart mål</Text>
          <Body style={styles.centerText}>
            En voksen er stadig ved at gøre emnet klar.
          </Body>
        </SurfaceCard>
      ) : (
        <View style={styles.goalList}>
          {subject.goals.map((goal) => (
            <Pressable
              key={goal.id}
              accessibilityHint="Åbner alle øvelser i målet"
              accessibilityLabel={`${goal.title}. ${goal.progress.completedExercises} af ${goal.progress.totalExercises} øvelser klaret`}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: GOAL_ROUTE,
                  params: { goalId: goal.id, subjectId: subject.id },
                } as Href)
              }
              style={({ pressed }) => [
                styles.goalCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.goalCopy}>
                <Text style={styles.cardTitle}>{goal.title}</Text>
                <Body style={styles.goalSummary}>
                  {goal.summary || "Tag én øvelse ad gangen."}
                </Body>
                <ProgressBar value={goal.progress.percentage} />
                <Kicker>
                  {goal.progress.completedExercises} af{" "}
                  {goal.progress.totalExercises} øvelser klaret
                </Kicker>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

function PrivateImage({
  accessibilityLabel,
  mimeType,
  onLoadError,
  onLoadSuccess,
  signedUrl,
}: {
  accessibilityLabel: string;
  mimeType: "image/jpeg" | "image/png";
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
    void loadPrivateWebImage(signedUrl, controller.signal, [mimeType])
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
  }, [mimeType, onLoadError, onLoadSuccess, signedUrl]);

  if (Platform.OS === "web" && !webUri) {
    return (
      <View style={styles.photoPlaceholder}>
        <ActivityIndicator color={colors.primaryDeep} />
        <Body>Henter billedet…</Body>
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
      style={styles.photo}
    />
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  stateScreen: {
    minHeight: 460,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  stateEmoji: { fontSize: 42 },
  centerText: { textAlign: "center" },
  heading: { gap: spacing.sm },
  topicIcon: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.xl,
    backgroundColor: colors.softWarm,
  },
  topicIconText: { fontSize: 38 },
  progressCard: { gap: spacing.md },
  progressHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  progressCopy: { flex: 1, gap: spacing.xxs },
  progressPercent: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  portraitCard: { gap: spacing.md },
  photoCard: { gap: spacing.md },
  cardCopy: { gap: spacing.xs },
  cardTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  photo: {
    width: "100%",
    height: 320,
    borderRadius: radii.xl,
    backgroundColor: colors.page,
  },
  photoPlaceholder: {
    minHeight: 230,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.page,
    padding: spacing.xl,
  },
  placeholderIcon: { fontSize: 48 },
  inlineState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
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
  warningBox: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.yellow,
    borderRadius: radii.lg,
    backgroundColor: colors.softWarm,
    padding: spacing.md,
  },
  warningTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
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
  actions: { gap: spacing.sm },
  removeConfirmBox: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: radii.lg,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
  },
  goalsHeading: { gap: spacing.xs },
  sectionTitle: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  goalList: { gap: spacing.sm },
  goalCard: {
    minHeight: 124,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  goalCopy: { flex: 1, gap: spacing.sm },
  goalSummary: { color: colors.muted },
  chevron: { color: colors.primaryDeep, fontSize: 32 },
  emptyCard: { alignItems: "center", gap: spacing.md },
  pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
});
