import type { ChildPublishedTopicWithPhoto } from "@bare-traen/api-client";
import { colors, radii, spacing, typography } from "@bare-traen/design";
import { randomUUID } from "expo-crypto";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

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
  Screen,
  SurfaceCard,
  Title,
} from "@/components/bare-ui";
import {
  canOpenFixtureTraining,
  findChildTopic,
  getTopicPhotoErrorMessage,
} from "@/topics/core";

type DetailState =
  | { status: "loading"; topic: null }
  | { status: "error"; topic: null }
  | { status: "missing"; topic: null }
  | { status: "ready"; topic: ChildPublishedTopicWithPhoto };

const PHOTO_LOAD_ERROR = "Billedet kunne ikke åbnes. Hent emnet igen.";

export default function TopicPhotoScreen() {
  const params = useLocalSearchParams<{ topicId?: string | string[] }>();
  const { selectedChild, session } = useAuth();
  const topicId = Array.isArray(params.topicId)
    ? null
    : (params.topicId ?? null);

  return (
    <TopicPhotoSessionScreen
      key={`${session?.user.id ?? "signed-out"}:${selectedChild?.id ?? "no-child"}:${topicId ?? "no-topic"}`}
      topicId={topicId}
    />
  );
}

function TopicPhotoSessionScreen({ topicId }: { topicId: string | null }) {
  const router = useRouter();
  const {
    loadSelectedChildTopics,
    removeSelectedChildTopicPhoto,
    saveSelectedChildTopicPhoto,
    selectedChild,
  } = useAuth();
  const [state, setState] = useState<DetailState>({
    status: "loading",
    topic: null,
  });
  const [revision, setRevision] = useState(0);
  const [pickedImage, setPickedImage] = useState<PreparedAiImage | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryPermissionDenied, setLibraryPermissionDenied] = useState(false);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const mounted = useRef(true);
  const imagePickRevision = useRef(0);
  const ownedImage = useRef<PreparedAiImage | null>(null);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      imagePickRevision.current += 1;
      disposePreparedAiImage(ownedImage.current);
      ownedImage.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedChild || !topicId) {
      return;
    }

    let active = true;

    void loadSelectedChildTopics()
      .then((topics) => {
        if (!active) {
          return;
        }

        const topic = findChildTopic(topics, topicId);
        setState(
          topic
            ? { status: "ready", topic }
            : { status: "missing", topic: null },
        );
      })
      .catch(() => {
        if (active) {
          setState({ status: "error", topic: null });
        }
      });

    return () => {
      active = false;
    };
  }, [loadSelectedChildTopics, revision, selectedChild, topicId]);

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        setRevision((current) => current + 1);
      }
    });

    return () => subscription.remove();
  }, []);

  const busy = picking || saving || removing;
  const handlePrivatePhotoError = useCallback(() => {
    setPhotoLoadFailed(true);
    setError(PHOTO_LOAD_ERROR);
  }, []);
  const handlePrivatePhotoLoaded = useCallback(() => {
    setPhotoLoadFailed(false);
    setError((current) => (current === PHOTO_LOAD_ERROR ? null : current));
  }, []);

  function replacePickedImage(nextImage: PreparedAiImage | null) {
    const previousImage = ownedImage.current;
    ownedImage.current = nextImage;

    if (previousImage !== nextImage) {
      disposePreparedAiImage(previousImage);
    }

    setPickedImage(nextImage);
  }

  function reload() {
    setPhotoLoadFailed(false);
    setState({ status: "loading", topic: null });
    setRevision((current) => current + 1);
  }

  async function chooseImage() {
    const pickRevision = imagePickRevision.current + 1;
    imagePickRevision.current = pickRevision;
    setConfirmingRemove(false);
    setPicking(true);
    setError(null);
    setLibraryPermissionDenied(false);
    setNotice(null);

    try {
      const prepared = await pickPreparedAiImage();

      if (!prepared) {
        return;
      }

      if (!mounted.current || imagePickRevision.current !== pickRevision) {
        disposePreparedAiImage(prepared);
        return;
      }

      replacePickedImage(prepared);
      requestId.current = randomUUID();
    } catch (caught) {
      if (!mounted.current || imagePickRevision.current !== pickRevision) {
        return;
      }

      const permissionDenied =
        caught instanceof AiImageInputError && caught.code === "permission";
      setLibraryPermissionDenied(permissionDenied);
      setError(
        permissionDenied
          ? "Giv adgang til billedbiblioteket for at vælge et emnebillede."
          : "Billedet kunne ikke klargøres. Vælg et andet billede.",
      );
    } finally {
      if (mounted.current && imagePickRevision.current === pickRevision) {
        setPicking(false);
      }
    }
  }

  async function saveImage(topic: ChildPublishedTopicWithPhoto) {
    if (
      !pickedImage ||
      !requestId.current ||
      (pickedImage.mimeType !== "image/jpeg" &&
        pickedImage.mimeType !== "image/png")
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await saveSelectedChildTopicPhoto({
        bytes: pickedImage.bytes,
        clientRequestId: requestId.current,
        mimeType: pickedImage.mimeType,
        topicId: topic.id,
      });

      if (!mounted.current) {
        return;
      }

      replacePickedImage(null);
      requestId.current = null;
      setNotice(`${topic.title}-billedet er gemt privat.`);
      reload();
    } catch (caught) {
      if (mounted.current) {
        setError(getTopicPhotoErrorMessage(caught));
      }
    } finally {
      if (mounted.current) {
        setSaving(false);
      }
    }
  }

  async function removeImage(topic: ChildPublishedTopicWithPhoto) {
    if (!topic.photo || removing) {
      return;
    }

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
        setNotice(`${topic.title}-billedet er fjernet.`);
        reload();
      }
    } catch (caught) {
      if (mounted.current) {
        setError(getTopicPhotoErrorMessage(caught));
      }
    } finally {
      if (mounted.current) {
        setRemoving(false);
      }
    }
  }

  if (!selectedChild) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Title style={styles.centerText}>Vælg en profil først</Title>
        <ActionButton onPress={() => router.replace("/")}>
          Gå tilbage
        </ActionButton>
      </Screen>
    );
  }

  if (state.status === "loading") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ActivityIndicator color={colors.primaryDeep} size="large" />
        <Body>Henter emnet…</Body>
      </Screen>
    );
  }

  if (state.status === "error" || state.status === "missing") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Title style={styles.centerText}>
          {state.status === "missing"
            ? "Emnet findes ikke længere"
            : "Emnet kunne ikke hentes"}
        </Title>
        <Body style={styles.centerText}>
          Gå tilbage til emnerne, eller prøv at hente siden igen.
        </Body>
        {state.status === "error" && (
          <ActionButton onPress={reload}>Prøv igen</ActionButton>
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

  const topic = state.topic;
  const trainingReady = canOpenFixtureTraining(topic);

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton
        disabled={busy}
        label="Alle emner"
        onPress={() => router.back()}
      />

      <View style={styles.heading}>
        <View
          accessible={false}
          style={[
            styles.topicIcon,
            topic.accentColor
              ? { backgroundColor: `${topic.accentColor}18` }
              : null,
          ]}
        >
          <Text style={styles.topicIconText}>{topic.icon ?? "★"}</Text>
        </View>
        <Kicker>Dit emne</Kicker>
        <Title>{topic.title}</Title>
        <Body>{topic.description || "Et nyt emne er klar til træning."}</Body>
      </View>

      <SurfaceCard style={styles.photoCard}>
        <View style={styles.photoCopy}>
          <Kicker>Emnebillede</Kicker>
          <Text style={styles.cardTitle}>Gør {topic.title} til dit</Text>
          <Body>
            Få en voksen til at vælge et billede, hvor tøjet og udstyret til
            {` ${topic.title}`} kan ses. Kun din familie kan se billedet.
          </Body>
        </View>

        {topic.photo && !pickedImage && (
          <PrivateTopicImage
            accessibilityLabel={`${topic.title}-billede for ${selectedChild.displayName}`}
            mimeType={topic.photo.mimeType}
            onLoadError={handlePrivatePhotoError}
            onLoadSuccess={handlePrivatePhotoLoaded}
            signedUrl={topic.photo.signedUrl}
          />
        )}

        {pickedImage && (
          <Image
            accessibilityLabel={`Nyt valgt ${topic.title}-billede`}
            contentFit="contain"
            source={{ uri: pickedImage.previewUri }}
            style={styles.photo}
          />
        )}

        {!topic.photo && !pickedImage && (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.placeholderIcon}>📷</Text>
            <Body style={styles.centerText}>
              Billedet er frivilligt. Du kan altid tilføje det senere.
            </Body>
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
          <ActionButton variant="secondary" onPress={reload}>
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
              {saving ? "Gemmer privat…" : `Gem ${topic.title}-billedet`}
            </ActionButton>
            <ActionButton
              disabled={busy}
              variant="secondary"
              onPress={() => {
                replacePickedImage(null);
                requestId.current = null;
                setError(null);
              }}
            >
              Fortryd
            </ActionButton>
          </View>
        ) : (
          <View style={styles.actions}>
            <ActionButton
              disabled={busy}
              variant={topic.photo ? "secondary" : "primary"}
              onPress={() => void chooseImage()}
            >
              {picking
                ? "Klargør billede…"
                : topic.photo
                  ? "Skift billede"
                  : `Vælg ${topic.title}-billede`}
            </ActionButton>
            {topic.photo && !confirmingRemove && (
              <ActionButton
                disabled={busy}
                variant="secondary"
                onPress={() => setConfirmingRemove(true)}
              >
                {removing ? "Fjerner…" : "Fjern billede"}
              </ActionButton>
            )}
          </View>
        )}

        {topic.photo && confirmingRemove && !pickedImage && (
          <View accessibilityRole="alert" style={styles.removeConfirmBox}>
            <Text style={styles.cardTitle}>Fjern {topic.title}-billedet?</Text>
            <Body>
              Billedet forsvinder med det samme fra emnet. Dit profilbillede
              ændres ikke.
            </Body>
            <View style={styles.actions}>
              <ActionButton
                disabled={busy}
                variant="danger"
                onPress={() => void removeImage(topic)}
              >
                {removing ? "Fjerner…" : "Ja, fjern billedet"}
              </ActionButton>
              <ActionButton
                disabled={busy}
                variant="secondary"
                onPress={() => setConfirmingRemove(false)}
              >
                Behold billedet
              </ActionButton>
            </View>
          </View>
        )}
      </SurfaceCard>

      <SurfaceCard style={styles.nextCard}>
        <Text style={styles.cardTitle}>
          {trainingReady ? "Klar til at træne?" : "Billedet er klar til senere"}
        </Text>
        <Body>
          {trainingReady
            ? "Emnebilledet er frivilligt og stopper aldrig træningen."
            : `Træningen til ${topic.title} kommer i en senere del af previewen. Emnebilledet er allerede gemt til emnet.`}
        </Body>
        <ActionButton
          disabled={busy}
          onPress={() =>
            trainingReady ? router.push("/goal") : router.replace("/topics")
          }
        >
          {trainingReady
            ? topic.photo
              ? "Fortsæt til Fodbold"
              : "Fortsæt uden billede"
            : "Færdig"}
        </ActionButton>
      </SurfaceCard>
    </Screen>
  );
}

function PrivateTopicImage({
  accessibilityLabel,
  mimeType,
  onLoadError,
  onLoadSuccess,
  signedUrl,
}: {
  accessibilityLabel: string;
  mimeType: "image/jpeg" | "image/png";
  onLoadError(): void;
  onLoadSuccess(): void;
  signedUrl: string;
}) {
  const [webUri, setWebUri] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

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
        if (active && !controller.signal.aborted) {
          onLoadError();
        }
      });

    return () => {
      active = false;
      controller.abort();
      revokePrivateWebImage(ownedBlobUrl);
    };
  }, [mimeType, onLoadError, onLoadSuccess, signedUrl]);

  const source = useMemo(
    () => ({ uri: Platform.OS === "web" ? (webUri ?? "") : signedUrl }),
    [signedUrl, webUri],
  );

  if (Platform.OS === "web" && !webUri) {
    return <ActivityIndicator color={colors.primaryDeep} />;
  }

  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      cachePolicy="none"
      contentFit="contain"
      onError={onLoadError}
      onLoad={onLoadSuccess}
      source={source}
      style={styles.photo}
    />
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  stateScreen: {
    minHeight: 500,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  centerText: { textAlign: "center" },
  heading: { alignItems: "flex-start", gap: spacing.sm },
  topicIcon: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.xl,
    backgroundColor: colors.softWarm,
  },
  topicIconText: { fontSize: 38 },
  photoCard: { gap: spacing.md },
  photoCopy: { gap: spacing.xs },
  cardTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  photo: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.soft,
  },
  photoPlaceholder: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.soft,
    padding: spacing.lg,
  },
  placeholderIcon: { fontSize: 42 },
  actions: { gap: spacing.sm },
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
  removeConfirmBox: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: radii.lg,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
  },
  nextCard: { gap: spacing.md },
});
