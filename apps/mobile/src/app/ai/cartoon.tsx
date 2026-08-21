import { colors, radii, spacing, typography } from "@bare-traen/design";
import type { SafeAiMediaSubject } from "@bare-traen/api-client";
import { Image } from "expo-image";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  getAiJobErrorMessage,
  getAiMediaErrorMessage,
  getAiPollDelay,
  isAiCartoonLabEnabled,
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

const LAB_ENABLED = isAiCartoonLabEnabled(
  process.env.EXPO_PUBLIC_AI_CARTOON_LAB_ENABLED,
);

type Phase = "idle" | "submitting" | "processing" | "succeeded" | "failed";
type PrivateOutputLink = { revision: number; signedUrl: string };
type PrivateWebOutput = { revision: number; uri: string };

export default function AiCartoonScreen() {
  const { session } = useAuth();

  return (
    <AiCartoonSessionScreen key={session?.user.id ?? "signed-out-session"} />
  );
}

function AiCartoonSessionScreen() {
  const router = useRouter();
  const {
    getAiCartoonJob,
    getAiCartoonOutput,
    reconcileAiCartoonJob,
    submitAiCartoon,
  } = useAuth();
  const [image, setImage] = useState<PreparedAiImage | null>(null);
  const [subjectKind, setSubjectKind] = useState<SafeAiMediaSubject | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState(false);
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
    if (!LAB_ENABLED) {
      router.replace("/");
    }
  }, [router]);

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

  if (!LAB_ENABLED) {
    return null;
  }

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
    setSubjectKind(null);
    setConfirmed(false);
    setError(null);
    updateJobId(null);
    clearOutputLink();
    setOutputLoadFailed(false);
    setRefreshingOutput(false);
    setPhase("idle");
    requestId.current = null;
    pollCount.current = 0;
  }

  function selectSubject(nextSubject: SafeAiMediaSubject) {
    if (subjectKind === nextSubject) {
      return;
    }

    setSubjectKind(nextSubject);
    setConfirmed(false);
    setError(null);
    updateJobId(null);
    clearOutputLink();
    setPhase("idle");
    requestId.current = randomUUID();
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
        setSubjectKind(null);
        setConfirmed(false);
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
        setError(
          "Giv adgang til billedbiblioteket for at vælge et testbillede.",
        );
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
    if (!image || !subjectKind || !confirmed || !requestId.current) {
      return;
    }

    setError(null);
    clearOutputLink();
    setOutputLoadFailed(false);
    setPhase("submitting");

    try {
      const prepared = await submitAiCartoon({
        bytes: image.bytes,
        clientRequestId: requestId.current,
        mimeType: image.mimeType,
        subjectKind,
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

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton disabled={busy} onPress={() => router.back()} />
      <View style={styles.heading}>
        <Kicker>Lukket teknisk test</Kicker>
        <Title>Lav et 3D-tegneserieportræt</Title>
        <Body>
          Vælg kun en voksen testperson eller en syntetisk person. Resultatet
          gemmes privat og bliver ikke sat på en børneprofil.
        </Body>
      </View>

      <SurfaceCard style={styles.card}>
        <Text style={styles.stepTitle}>1. Hvem viser billedet?</Text>
        <View accessibilityRole="radiogroup" style={styles.choiceRow}>
          <SubjectChoice
            disabled={controlsLocked}
            label="Syntetisk person"
            selected={subjectKind === "synthetic"}
            onPress={() => selectSubject("synthetic")}
          />
          <SubjectChoice
            disabled={controlsLocked}
            label="Voksen testperson"
            selected={subjectKind === "adult_test"}
            onPress={() => selectSubject("adult_test")}
          />
        </View>

        <Text style={styles.stepTitle}>2. Vælg ét billede</Text>
        {image && (
          <Image
            accessibilityLabel="Valgt lokalt testbillede"
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

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed, disabled: controlsLocked }}
          disabled={controlsLocked}
          onPress={() => setConfirmed((value) => !value)}
          style={({ pressed }) => [
            styles.confirmation,
            confirmed && styles.confirmationSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.checkbox}>{confirmed ? "✓" : ""}</Text>
          <Text style={styles.confirmationText}>
            Jeg bekræfter, at billedet ikke viser et barn, og at jeg må bruge
            det til denne tekniske test.
          </Text>
        </Pressable>

        {error && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <ActionButton
          disabled={controlsLocked || !image || !subjectKind || !confirmed}
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
              OpenAI laver billedet via OpenRouter. Det kan tage et par
              minutter; vi genstarter aldrig billedgenereringen automatisk.
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
            Resultatet er kun en separat testfil. Det ændrer ikke barnets avatar
            eller profil.
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
            Start en ny test
          </ActionButton>
        </SurfaceCard>
      )}
    </Screen>
  );
}

function SubjectChoice({
  disabled,
  label,
  onPress,
  selected,
}: {
  disabled: boolean;
  label: string;
  onPress(): void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.subjectChoice,
        selected && styles.subjectChoiceSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.subjectChoiceText,
          selected && styles.subjectChoiceTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  subjectChoice: {
    minHeight: 48,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
  },
  subjectChoiceSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  subjectChoiceText: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.label,
    fontWeight: typography.weights.semibold,
  },
  subjectChoiceTextSelected: { color: colors.primaryDeep },
  image: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.xl,
    backgroundColor: colors.soft,
  },
  confirmation: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  confirmationSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  checkbox: {
    width: 24,
    height: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.primaryDeep,
    borderRadius: radii.sm,
    color: colors.primaryDeep,
    fontWeight: typography.weights.bold,
    textAlign: "center",
    lineHeight: 22,
  },
  confirmationText: {
    flex: 1,
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.label,
    lineHeight: 18,
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
  pressed: { opacity: 0.72 },
});
