import { colors, radii, spacing, typography } from "@bare-traen/design";
import { Image } from "expo-image";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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
    getAiCartoonJob,
    getAiCartoonOutput,
    reconcileAiCartoonJob,
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
  const requestId = useRef<string | null>(null);
  const pollCount = useRef(0);
  const pollInFlight = useRef(false);
  const mounted = useRef(true);
  const imagePickRequest = useRef(0);
  const ownedImage = useRef<PreparedAiImage | null>(null);
  const currentJobId = useRef<string | null>(null);
  const outputRefreshInFlight = useRef<string | null>(null);
  const outputLinkRevision = useRef(0);

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

  const busy = picking || phase === "submitting" || phase === "processing";
  const controlsLocked = busy || phase === "succeeded";

  function replaceImage(nextImage: PreparedAiImage | null) {
    const previousImage = ownedImage.current;
    ownedImage.current = nextImage;

    if (previousImage !== nextImage) {
      disposePreparedAiImage(previousImage);
    }

    setImage(nextImage);
  }

  function resetForNewTest() {
    replaceImage(null);
    setError(null);
    updateJobId(null);
    clearOutputLink();
    setOutputLoadFailed(false);
    setRefreshingOutput(false);
    setPhase("idle");
    requestId.current = null;
    pollCount.current = 0;
  }

  async function chooseImage() {
    const pickRequest = imagePickRequest.current + 1;
    imagePickRequest.current = pickRequest;
    setPicking(true);
    setError(null);

    try {
      const prepared = await pickPreparedAiImage();

      if (prepared) {
        if (!mounted.current || imagePickRequest.current !== pickRequest) {
          disposePreparedAiImage(prepared);
          return;
        }

        replaceImage(prepared);
        updateJobId(null);
        clearOutputLink();
        setPhase("idle");
        requestId.current = randomUUID();
        pollCount.current = 0;
      }
    } catch (caught) {
      if (!mounted.current || imagePickRequest.current !== pickRequest) {
        return;
      }

      if (caught instanceof AiImageInputError && caught.code === "permission") {
        setError("Giv adgang til billedbiblioteket for at vælge et billede.");
      } else {
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

    setError(null);
    clearOutputLink();
    setOutputLoadFailed(false);
    setPhase("submitting");

    try {
      const prepared = await submitAiCartoon({
        bytes: image.bytes,
        childProfileId: selectedChild.id,
        clientRequestId: requestId.current,
        mimeType: image.mimeType,
      });

      if (!mounted.current) {
        return;
      }

      updateJobId(prepared.jobId);
      setPhase("processing");
    } catch (caught) {
      if (mounted.current) {
        setError(getAiMediaErrorMessage(caught));
        setPhase("failed");
      }
    }
  }

  if (!selectedChild) {
    return (
      <Screen contentStyle={styles.screen}>
        <BackButton onPress={() => router.back()} />
        <SurfaceCard style={styles.card}>
          <Kicker>Vælg et barn først</Kicker>
          <Title>Portrættet skal knyttes til en børneprofil</Title>
          <Body>
            Gå tilbage, opret eller vælg et barn, og åbn derefter
            tegneserieportrættet igen.
          </Body>
        </SurfaceCard>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton disabled={busy} onPress={() => router.back()} />
      <View style={styles.heading}>
        <Kicker>Privat familieprototype</Kicker>
        <Title>Lav {selectedChild.displayName} som tegneseriefigur</Title>
        <Body>
          Vælg et billede af {selectedChild.displayName}. Billedet og resultatet
          gemmes privat for jeres familie.
        </Body>
      </View>

      <SurfaceCard style={styles.card}>
        <Text style={styles.stepTitle}>
          Vælg ét billede af {selectedChild.displayName}
        </Text>
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

        {error && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <ActionButton
          disabled={controlsLocked || !image}
          onPress={() => void submit()}
        >
          {phase === "submitting"
            ? "Uploader sikkert…"
            : phase === "processing"
              ? "Laver tegneserieportræt…"
              : "Lav tegneserieportræt"}
        </ActionButton>

        {phase === "processing" && (
          <View style={styles.processing}>
            <ActivityIndicator color={colors.primaryDeep} />
            <Body>
              OpenAI GPT Image 2 laver billedet via OpenRouter. Det kan tage et
              par minutter; vi starter ikke en ny betalt generering automatisk.
            </Body>
            <ActionButton variant="secondary" onPress={() => void refreshJob()}>
              Tjek igen
            </ActionButton>
          </View>
        )}
      </SurfaceCard>

      {phase === "succeeded" && (
        <SurfaceCard style={styles.card}>
          <Kicker>Privat resultat</Kicker>
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
                Resultatlinket kunne ikke åbnes. Hent et nyt privat link til det
                samme resultat.
              </Text>
            </View>
          ) : (
            <ActivityIndicator color={colors.primaryDeep} />
          )}
          <Body>
            Resultatet er knyttet privat til {selectedChild.displayName}, men
            det ændrer ikke automatisk barnets avatar eller profilbillede.
          </Body>
          {outputLoadFailed && (
            <ActionButton
              disabled={refreshingOutput}
              variant="secondary"
              onPress={() => void refreshOutputUrl()}
            >
              {refreshingOutput ? "Henter link…" : "Hent resultat igen"}
            </ActionButton>
          )}
          <ActionButton variant="secondary" onPress={resetForNewTest}>
            Lav et nyt portræt
          </ActionButton>
        </SurfaceCard>
      )}
    </Screen>
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
