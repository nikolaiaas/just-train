import { colors, radii, spacing, typography } from "@bare-traen/design";
import { Image } from "expo-image";
import { randomUUID } from "expo-crypto";
import { Stack, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getAiJobErrorMessage,
  getAiMediaErrorMessage,
  getAiPollDelay,
  shouldReconcileAiJob,
} from "@/ai/core";
import { shouldProtectAiCartoonNavigation } from "@/ai/cartoon-resume";
import {
  AiImageInputError,
  disposePreparedAiImage,
  pickPreparedAiImage,
  type PreparedAiImage,
} from "@/ai/image-input";
import { loadPrivateWebPng, revokePrivateWebImage } from "@/ai/private-output";
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

type Phase = "idle" | "submitting" | "processing" | "succeeded" | "failed";
type PrivateOutputLink = { revision: number; signedUrl: string };
type PrivateWebOutput = { revision: number; uri: string };

export default function AiCartoonScreen() {
  const { selectedChild, session } = useAuth();

  return (
    <AiCartoonSessionScreen
      key={`${session?.user.id ?? "signed-out-session"}:${selectedChild?.id ?? "no-child"}`}
    />
  );
}

function AiCartoonSessionScreen() {
  const router = useRouter();
  const {
    clearSelectedChildAiCartoonResume,
    getAiCartoonJob,
    getAiCartoonOutput,
    loadSelectedChildAiCartoonResume,
    reconcileAiCartoonJob,
    saveAiCartoonAsProfilePicture,
    saveSelectedChildAiCartoonResume,
    selectedChild,
    submitAiCartoon,
  } = useAuth();
  const [image, setImage] = useState<PreparedAiImage | null>(null);
  const [picking, setPicking] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [outputLink, setOutputLink] = useState<PrivateOutputLink | null>(null);
  const [webOutput, setWebOutput] = useState<PrivateWebOutput | null>(null);
  const [outputLoadFailed, setOutputLoadFailed] = useState(false);
  const [refreshingOutput, setRefreshingOutput] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [restoringResume, setRestoringResume] = useState(
    () => selectedChild !== null,
  );
  const requestId = useRef<string | null>(null);
  const pollCount = useRef(0);
  const pollInFlight = useRef(false);
  const mounted = useRef(true);
  const imagePickRequest = useRef(0);
  const ownedImage = useRef<PreparedAiImage | null>(null);
  const currentJobId = useRef<string | null>(null);
  const outputRefreshInFlight = useRef<string | null>(null);
  const outputLinkRevision = useRef(0);
  const resumeRestoreAttempted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      imagePickRequest.current += 1;
      disposePreparedAiImage(ownedImage.current);
      ownedImage.current = null;
    };
  }, []);

  const updateJobId = useCallback((nextJobId: string | null) => {
    currentJobId.current = nextJobId;
    setJobId(nextJobId);
  }, []);

  useEffect(() => {
    if (resumeRestoreAttempted.current) {
      return;
    }

    if (!selectedChild) {
      return;
    }

    resumeRestoreAttempted.current = true;
    let active = true;

    void loadSelectedChildAiCartoonResume()
      .then((resume) => {
        if (!active || !mounted.current || !resume) {
          return;
        }

        requestId.current = resume.requestId;
        pollCount.current = 0;
        setError(null);
        updateJobId(resume.jobId);
        setPhase("processing");
      })
      .catch(() => {
        if (active && mounted.current) {
          setError(
            "Et tidligere profilbillede kunne ikke hentes. Du kan vælge et nyt billede.",
          );
        }
      })
      .finally(() => {
        if (active && mounted.current) {
          setRestoringResume(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadSelectedChildAiCartoonResume, selectedChild, updateJobId]);

  const clearOutputLink = useCallback(() => {
    setOutputLink(null);
  }, []);

  const publishOutputLink = useCallback((signedUrl: string) => {
    outputLinkRevision.current += 1;
    setOutputLoadFailed(false);
    setOutputLink({
      revision: outputLinkRevision.current,
      signedUrl,
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !outputLink || phase !== "succeeded") {
      return;
    }

    const controller = new AbortController();
    let active = true;
    let ownedBlobUrl: string | null = null;

    void loadPrivateWebPng(outputLink.signedUrl, controller.signal)
      .then((blobUrl) => {
        ownedBlobUrl = blobUrl;

        if (!active) {
          revokePrivateWebImage(blobUrl);
          ownedBlobUrl = null;
          return;
        }

        setWebOutput({ revision: outputLink.revision, uri: blobUrl });
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setOutputLoadFailed(true);
        }
      });

    return () => {
      active = false;
      controller.abort();
      revokePrivateWebImage(ownedBlobUrl);
    };
  }, [outputLink, phase]);

  const outputDisplayUri =
    phase !== "succeeded"
      ? null
      : Platform.OS === "web"
        ? webOutput && webOutput.revision === outputLink?.revision
          ? webOutput.uri
          : null
        : (outputLink?.signedUrl ?? null);

  const outputImageSource = useMemo(
    () => (outputDisplayUri ? { uri: outputDisplayUri } : undefined),
    [outputDisplayUri],
  );

  const refreshOutputUrl = useCallback(async () => {
    const targetJobId = jobId;

    if (!targetJobId || outputRefreshInFlight.current === targetJobId) {
      return;
    }

    outputRefreshInFlight.current = targetJobId;
    setRefreshingOutput(true);
    setOutputLoadFailed(false);
    clearOutputLink();

    try {
      const output = await getAiCartoonOutput(targetJobId);

      if (mounted.current && currentJobId.current === targetJobId) {
        publishOutputLink(output.signedUrl);
      }
    } catch {
      if (mounted.current && currentJobId.current === targetJobId) {
        setOutputLoadFailed(true);
      }
    } finally {
      if (outputRefreshInFlight.current === targetJobId) {
        outputRefreshInFlight.current = null;

        if (mounted.current && currentJobId.current === targetJobId) {
          setRefreshingOutput(false);
        }
      }
    }
  }, [clearOutputLink, getAiCartoonOutput, jobId, publishOutputLink]);

  useEffect(() => {
    if (Platform.OS === "web" || phase !== "succeeded" || !jobId) {
      return;
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshOutputUrl();
      }
    });

    return () => subscription.remove();
  }, [jobId, phase, refreshOutputUrl]);

  const refreshJob = useCallback(async () => {
    if (!jobId) {
      return false;
    }

    if (pollInFlight.current) {
      return true;
    }

    pollInFlight.current = true;

    try {
      const job = await getAiCartoonJob(jobId);

      if (!mounted.current || currentJobId.current !== jobId) {
        return false;
      }

      if (shouldReconcileAiJob(job)) {
        await reconcileAiCartoonJob(jobId);
        return true;
      }

      if (job.status === "succeeded") {
        setError(null);
        setPhase("succeeded");

        try {
          const output = await getAiCartoonOutput(jobId);

          if (mounted.current && currentJobId.current === jobId) {
            publishOutputLink(output.signedUrl);
          }
        } catch {
          if (mounted.current && currentJobId.current === jobId) {
            clearOutputLink();
            setOutputLoadFailed(true);
          }
        }

        return false;
      }

      if (job.status === "failed" || job.status === "cancelled") {
        void clearSelectedChildAiCartoonResume().catch(() => undefined);
        setError(getAiJobErrorMessage(job.publicErrorCode));
        updateJobId(null);
        requestId.current = randomUUID();
        pollCount.current = 0;
        setPhase("failed");
        return false;
      }

      setPhase("processing");
      return true;
    } catch (caught) {
      if (mounted.current && currentJobId.current === jobId) {
        setError(getAiMediaErrorMessage(caught));
        setPhase("failed");
      }
      return false;
    } finally {
      pollInFlight.current = false;
    }
  }, [
    clearSelectedChildAiCartoonResume,
    getAiCartoonJob,
    getAiCartoonOutput,
    jobId,
    clearOutputLink,
    publishOutputLink,
    reconcileAiCartoonJob,
    updateJobId,
  ]);

  useEffect(() => {
    if (!jobId || (phase !== "processing" && phase !== "submitting")) {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const keepPolling = await refreshJob();

      if (!active || !keepPolling) {
        return;
      }

      const delay = getAiPollDelay(pollCount.current);
      pollCount.current += 1;
      timer = setTimeout(() => void poll(), delay);
    };

    void poll();

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [jobId, phase, refreshJob]);

  useEffect(() => {
    if (Platform.OS === "ios" && phase === "succeeded") {
      AccessibilityInfo.announceForAccessibility(
        "Dit nye profilbillede er klar.",
      );
    }
  }, [phase]);

  useEffect(() => {
    if (Platform.OS === "ios" && profileSaved) {
      AccessibilityInfo.announceForAccessibility(
        "Profilbilledet er gemt på din profil.",
      );
    }
  }, [profileSaved]);

  const busy = shouldProtectAiCartoonNavigation({
    phase,
    picking,
    restoring: restoringResume,
    savingProfile,
  });
  const controlsLocked = busy || phase === "succeeded";

  usePreventRemove(busy, () => undefined);

  function replaceImage(nextImage: PreparedAiImage | null) {
    const previousImage = ownedImage.current;
    ownedImage.current = nextImage;

    if (previousImage !== nextImage) {
      disposePreparedAiImage(previousImage);
    }

    setImage(nextImage);
  }

  async function resetForNewTest() {
    try {
      await clearSelectedChildAiCartoonResume();
    } catch {
      if (mounted.current) {
        setSaveError(
          "Det gamle billedjob kunne ikke afsluttes sikkert. Prøv igen.",
        );
      }
      return;
    }

    replaceImage(null);
    setError(null);
    updateJobId(null);
    clearOutputLink();
    setOutputLoadFailed(false);
    setRefreshingOutput(false);
    setSavingProfile(false);
    setProfileSaved(false);
    setSaveError(null);
    setPermissionDenied(false);
    setPhase("idle");
    requestId.current = null;
    pollCount.current = 0;
  }

  async function chooseImage() {
    const pickRequest = imagePickRequest.current + 1;
    imagePickRequest.current = pickRequest;
    setPicking(true);
    setError(null);
    setPermissionDenied(false);

    try {
      const prepared = await pickPreparedAiImage();

      if (prepared) {
        if (!mounted.current || imagePickRequest.current !== pickRequest) {
          disposePreparedAiImage(prepared);
          return;
        }

        try {
          await clearSelectedChildAiCartoonResume();
        } catch {
          disposePreparedAiImage(prepared);
          setError("Det tidligere billedjob kunne ikke afsluttes. Prøv igen.");
          return;
        }

        replaceImage(prepared);
        updateJobId(null);
        clearOutputLink();
        setPhase("idle");
        setProfileSaved(false);
        setSaveError(null);
        requestId.current = randomUUID();
        pollCount.current = 0;
      }
    } catch (caught) {
      if (!mounted.current || imagePickRequest.current !== pickRequest) {
        return;
      }

      if (caught instanceof AiImageInputError && caught.code === "permission") {
        setPermissionDenied(Platform.OS !== "web");
        setError("Giv adgang til billedbiblioteket for at vælge et billede.");
      } else {
        setPermissionDenied(false);
        setError("Billedet kunne ikke klargøres. Vælg et andet billede.");
      }
    } finally {
      if (mounted.current && imagePickRequest.current === pickRequest) {
        setPicking(false);
      }
    }
  }

  async function submit() {
    if (!image || !selectedChild || !requestId.current) {
      return;
    }

    const activeRequestId = requestId.current;

    setError(null);
    clearOutputLink();
    setOutputLoadFailed(false);
    setPhase("submitting");

    try {
      const prepared = await submitAiCartoon({
        bytes: image.bytes,
        childProfileId: selectedChild.id,
        clientRequestId: activeRequestId,
        mimeType: image.mimeType,
      });

      if (!mounted.current) {
        return;
      }

      updateJobId(prepared.jobId);
      setPhase("processing");

      try {
        await saveSelectedChildAiCartoonResume({
          jobId: prepared.jobId,
          requestId: activeRequestId,
        });
      } catch {
        if (mounted.current && currentJobId.current === prepared.jobId) {
          setError(
            "Billedet bliver lavet, men kan ikke genoptages endnu. Bliv på siden, til det er færdigt.",
          );
        }
      }
    } catch (caught) {
      if (mounted.current) {
        setError(getAiMediaErrorMessage(caught));
        setPhase("failed");
      }
    }
  }

  async function saveProfilePicture() {
    if (!jobId || profileSaved || savingProfile) {
      return;
    }

    setSaveError(null);
    setSavingProfile(true);

    try {
      await saveAiCartoonAsProfilePicture(jobId);
      await clearSelectedChildAiCartoonResume().catch(() => undefined);

      if (mounted.current && currentJobId.current === jobId) {
        setProfileSaved(true);
      }
    } catch {
      if (mounted.current && currentJobId.current === jobId) {
        setSaveError(
          "Profilbilledet kunne ikke gemmes. Prøv igen – vi bruger det samme billede.",
        );
      }
    } finally {
      if (mounted.current && currentJobId.current === jobId) {
        setSavingProfile(false);
      }
    }
  }

  async function openAppSettings() {
    try {
      await Linking.openSettings();
    } catch {
      if (mounted.current) {
        setError(
          "Indstillinger kunne ikke åbnes. Åbn dem manuelt og giv adgang til billeder.",
        );
      }
    }
  }

  if (!selectedChild) {
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: !busy }} />
        <Screen contentStyle={styles.screen}>
          <BackButton onPress={() => router.back()} />
          <SurfaceCard style={styles.card}>
            <Kicker>Vælg en profil først</Kicker>
            <Title>Profilbilledet skal høre til et barn</Title>
            <Body>Gå tilbage, vælg et barn, og åbn profilbilledet igen.</Body>
          </SurfaceCard>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <Screen contentStyle={styles.screen}>
        <BackButton
          disabled={busy}
          label="Min profil"
          onPress={() => router.back()}
        />
        <View style={styles.heading}>
          <Kicker>Profilbillede</Kicker>
          <Title>Lav et profilbillede til {selectedChild.displayName}</Title>
          <Body>
            Vælg et tydeligt billede af ansigtet. Få en voksen til at hjælpe.
            Kun din familie kan se billederne.
          </Body>
        </View>

        {restoringResume && (
          <SurfaceCard style={styles.card}>
            <ActivityIndicator color={colors.primaryDeep} />
            <Body>Finder dit seneste profilbillede…</Body>
          </SurfaceCard>
        )}

        {!restoringResume && phase === "processing" && !image && (
          <SurfaceCard style={styles.card}>
            <Kicker>Vi tegner videre</Kicker>
            <Title>Dit profilbillede er stadig på vej</Title>
            <View style={styles.processing}>
              <ActivityIndicator color={colors.primaryDeep} />
              <Body>
                Det kan tage et par minutter. Hvis appen lukker, finder vi
                billedet igen her.
              </Body>
              <ActionButton
                variant="secondary"
                onPress={() => void refreshJob()}
              >
                Tjek igen
              </ActionButton>
            </View>
          </SurfaceCard>
        )}

        {!restoringResume &&
          !(phase === "processing" && !image) &&
          (phase !== "succeeded" || image) && (
            <SurfaceCard style={styles.card}>
              <Text style={styles.stepTitle}>1. Vælg et billede</Text>
              {image && (
                <Image
                  accessibilityLabel={`Valgt billede af ${selectedChild.displayName}`}
                  contentFit="cover"
                  source={{ uri: image.previewUri }}
                  style={styles.image}
                />
              )}
              <ActionButton
                disabled={controlsLocked}
                variant="secondary"
                onPress={() => void chooseImage()}
              >
                {picking
                  ? "Klargør billede…"
                  : image
                    ? "Vælg et andet"
                    : "Vælg fra bibliotek"}
              </ActionButton>
              <Body>
                Originalen bruges kun til at lave tegneseriebilledet og bliver
                ikke dit profilbillede.
              </Body>

              {error && (
                <View accessibilityRole="alert" style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              {permissionDenied && Platform.OS !== "web" && (
                <ActionButton
                  variant="secondary"
                  onPress={() => void openAppSettings()}
                >
                  Åbn Indstillinger
                </ActionButton>
              )}

              <ActionButton
                disabled={controlsLocked || !image}
                onPress={() => void submit()}
              >
                {phase === "submitting"
                  ? "Uploader sikkert…"
                  : phase === "processing"
                    ? "Tegner profilbilledet…"
                    : "Lav mit profilbillede"}
              </ActionButton>

              {phase === "processing" && (
                <View style={styles.processing}>
                  <ActivityIndicator color={colors.primaryDeep} />
                  <Body>
                    Vi tegner dit billede. Det kan tage et par minutter. Hvis
                    appen lukker, finder vi billedet igen her.
                  </Body>
                  <ActionButton
                    variant="secondary"
                    onPress={() => void refreshJob()}
                  >
                    Tjek igen
                  </ActionButton>
                </View>
              )}
            </SurfaceCard>
          )}

        {phase === "succeeded" && (
          <SurfaceCard style={styles.card}>
            <Kicker>2. Se dit nye profilbillede</Kicker>
            {outputImageSource ? (
              <Image
                accessibilityLabel="Genereret 3D-tegneserieportræt"
                cachePolicy="none"
                contentFit="cover"
                onError={() => {
                  clearOutputLink();
                  setOutputLoadFailed(true);
                }}
                source={outputImageSource}
                style={styles.image}
              />
            ) : outputLoadFailed ? (
              <View accessibilityRole="alert" style={styles.errorBox}>
                <Text style={styles.errorText}>
                  Resultatlinket kunne ikke åbnes. Hent et nyt privat link til
                  det samme resultat.
                </Text>
              </View>
            ) : (
              <ActivityIndicator color={colors.primaryDeep} />
            )}
            <View accessibilityLiveRegion="polite">
              <Body>
                {profileSaved
                  ? `Profilbilledet er gemt på ${selectedChild.displayName}s profil.`
                  : "Dit nye profilbillede er klar. Gem det, når du er glad for billedet."}
              </Body>
            </View>
            {saveError && (
              <View accessibilityRole="alert" style={styles.errorBox}>
                <Text style={styles.errorText}>{saveError}</Text>
              </View>
            )}
            {outputLoadFailed && (
              <ActionButton
                disabled={refreshingOutput}
                variant="secondary"
                onPress={() => void refreshOutputUrl()}
              >
                {refreshingOutput ? "Henter link…" : "Hent resultat igen"}
              </ActionButton>
            )}
            {outputImageSource && !profileSaved && (
              <ActionButton
                disabled={savingProfile}
                onPress={() => void saveProfilePicture()}
              >
                {savingProfile ? "Gemmer…" : "Brug som profilbillede"}
              </ActionButton>
            )}
            {profileSaved && (
              <ActionButton onPress={() => router.replace("/profile")}>
                Gå til Min profil
              </ActionButton>
            )}
            <ActionButton
              disabled={savingProfile}
              variant="secondary"
              onPress={() => void resetForNewTest()}
            >
              Lav et andet billede
            </ActionButton>
          </SurfaceCard>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  heading: { gap: spacing.sm },
  card: { gap: spacing.md },
  stepTitle: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  image: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.xl,
    backgroundColor: colors.soft,
  },
  processing: { gap: spacing.md, alignItems: "stretch" },
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
});
