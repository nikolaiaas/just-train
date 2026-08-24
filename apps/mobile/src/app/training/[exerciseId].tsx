import type {
  ChildTrainingCompletion,
  ChildTrainingExercise,
  ChildTrainingGoal,
  ChildTrainingPerceivedDifficulty,
  ChildTrainingSubject,
} from "@bare-traen/api-client";
import { colors, radii, spacing, typography } from "@bare-traen/design";
import { randomUUID } from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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
  buildTrainingCompletionPayload,
  classifyTrainingSaveFailure,
  clampRepetitions,
  findTrainingExercise,
  findTrainingGoal,
  formatExerciseTarget,
  initialTrainingRepetitions,
  lockTrainingCompletionPayload,
  parseRouteUuid,
  type TrainingCompletionPayload,
} from "@/training/core";

const GOAL_ROUTE = "/goals/[goalId]" as Href;

type TrainingContentState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | {
      status: "ready";
      exercise: ChildTrainingExercise;
      goal: ChildTrainingGoal;
      subject: ChildTrainingSubject;
    };

type TrainingPhase = "active" | "review" | "saving" | "saved";

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function TrainingRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    exerciseId?: string | string[];
    goalId?: string | string[];
    subjectId?: string | string[];
  }>();
  const { selectedChild, session } = useAuth();
  const exerciseId = parseRouteUuid(params.exerciseId);
  const goalId = parseRouteUuid(params.goalId);
  const subjectId = parseRouteUuid(params.subjectId);

  if (!selectedChild || !subjectId || !goalId || !exerciseId) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>{selectedChild ? "🌱" : "👋"}</Text>
        <Title style={styles.centerText}>
          {selectedChild
            ? "Øvelsen er ikke tilgængelig"
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
    <SelectedExercise
      key={`${session?.user.id ?? "signed-out"}:${selectedChild.id}:${subjectId}:${goalId}:${exerciseId}`}
      childName={selectedChild.displayName}
      exerciseId={exerciseId}
      goalId={goalId}
      subjectId={subjectId}
    />
  );
}

function SelectedExercise({
  childName,
  exerciseId,
  goalId,
  subjectId,
}: {
  childName: string;
  exerciseId: string;
  goalId: string;
  subjectId: string;
}) {
  const router = useRouter();
  const {
    completeSelectedChildTrainingExercise,
    loadSelectedChildTrainingSubject,
  } = useAuth();
  const [revision, setRevision] = useState(0);
  const [content, setContent] = useState<TrainingContentState>({
    status: "loading",
  });
  const [phase, setPhase] = useState<TrainingPhase>("active");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [repetitions, setRepetitions] = useState(initialTrainingRepetitions);
  const [difficulty, setDifficulty] =
    useState<ChildTrainingPerceivedDifficulty>(3);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [contentNotice, setContentNotice] = useState<string | null>(null);
  const [completion, setCompletion] = useState<ChildTrainingCompletion | null>(
    null,
  );
  const [completionPayload, setCompletionPayload] =
    useState<TrainingCompletionPayload | null>(null);
  const startedAt = useRef<number | null>(null);
  const requestId = useRef(randomUUID());

  useEffect(() => {
    let active = true;
    void loadSelectedChildTrainingSubject(subjectId)
      .then((subject) => {
        if (!active) return;
        const goal = subject ? findTrainingGoal(subject.goals, goalId) : null;
        const exercise = goal
          ? findTrainingExercise(goal.exercises, exerciseId)
          : null;

        if (
          !subject ||
          !goal ||
          !exercise ||
          goal.subjectId !== subject.id ||
          exercise.goalId !== goal.id
        ) {
          setContent({ status: "missing" });
          return;
        }

        setRepetitions(initialTrainingRepetitions());
        setContent({ status: "ready", exercise, goal, subject });
      })
      .catch(() => {
        if (active) setContent({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, [
    exerciseId,
    goalId,
    loadSelectedChildTrainingSubject,
    revision,
    subjectId,
  ]);

  useEffect(() => {
    if (content.status !== "ready" || phase !== "active") return;
    startedAt.current ??= Date.now();

    const updateElapsed = () => {
      if (startedAt.current !== null) {
        setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1_000));
      }
    };
    const interval = setInterval(updateElapsed, 250);
    updateElapsed();

    return () => clearInterval(interval);
  }, [content.status, phase]);

  function beginFreshLoad(notice: string | null) {
    startedAt.current = null;
    requestId.current = randomUUID();
    setCompletion(null);
    setCompletionPayload(null);
    setContentNotice(notice);
    setContent({ status: "loading" });
    setDifficulty(3);
    setElapsedSeconds(0);
    setPhase("active");
    setRepetitions(initialTrainingRepetitions());
    setSaveError(null);
    setRevision((current) => current + 1);
  }

  function retryLoad() {
    beginFreshLoad(null);
  }

  function openGoal() {
    if (!goalId || !subjectId) {
      router.dismissTo("/topics");
      return;
    }

    router.dismissTo({
      pathname: GOAL_ROUTE,
      params: { goalId, subjectId },
    } as Href);
  }

  function stopTraining() {
    if (startedAt.current !== null) {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1_000));
    }
    setPhase("review");
  }

  async function saveTraining() {
    if (content.status !== "ready" || phase === "saving") return;
    const { exercise } = content;
    const target = exercise.targetValue ?? 0;

    if (
      !completionPayload &&
      ((exercise.measurement === "repetitions" && repetitions < target) ||
        (exercise.measurement === "duration" && elapsedSeconds < target))
    ) {
      setSaveError(
        "Du er ikke helt ved målet endnu. Fortsæt lidt mere, og gem bagefter.",
      );
      return;
    }

    setSaveError(null);
    setPhase("saving");

    try {
      const proposedPayload = buildTrainingCompletionPayload({
        clientRequestId: requestId.current,
        difficulty,
        durationMs: elapsedSeconds * 1_000,
        exerciseId: exercise.id,
        goalId: content.goal.id,
        measurement: exercise.measurement,
        repetitions,
        subjectId: content.subject.id,
      });
      const lockedPayload = lockTrainingCompletionPayload(
        completionPayload,
        proposedPayload,
      );
      if (!completionPayload) setCompletionPayload(lockedPayload);

      const saved = await completeSelectedChildTrainingExercise(lockedPayload);
      setCompletion(saved);
      setPhase("saved");
    } catch (error) {
      const decision = classifyTrainingSaveFailure(error);
      if (decision.action === "retry") {
        setSaveError(decision.message);
        setPhase("review");
        return;
      }

      if (decision.action === "reload") {
        beginFreshLoad(decision.message);
        return;
      }

      router.replace("/topics");
    }
  }

  if (content.status === "loading") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ActivityIndicator color={colors.primaryDeep} size="large" />
        <Body>Henter øvelsen…</Body>
        {contentNotice && (
          <View accessibilityRole="alert" style={styles.noticeBox}>
            <Text style={styles.noticeText}>{contentNotice}</Text>
          </View>
        )}
      </Screen>
    );
  }

  if (content.status === "error" || content.status === "missing") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>
          {content.status === "missing" ? "🌱" : "🌧️"}
        </Text>
        <Title style={styles.centerText}>
          {content.status === "missing"
            ? "Øvelsen er ikke tilgængelig"
            : "Øvelsen kunne ikke hentes"}
        </Title>
        <Body style={styles.centerText}>
          {contentNotice ??
            "Øvelsen kan være blevet opdateret. Gå tilbage til emnerne, eller prøv igen."}
        </Body>
        {content.status === "error" && (
          <ActionButton onPress={retryLoad}>Prøv igen</ActionButton>
        )}
        <ActionButton variant="secondary" onPress={openGoal}>
          Tilbage til målet
        </ActionButton>
      </Screen>
    );
  }

  const { exercise, goal, subject } = content;
  const targetReached =
    exercise.measurement === "completion" ||
    (exercise.measurement === "repetitions" &&
      repetitions >= (exercise.targetValue ?? 0)) ||
    (exercise.measurement === "duration" &&
      elapsedSeconds >= (exercise.targetValue ?? 0));
  const completionRetryLocked = completionPayload !== null;

  if (phase === "saved" && completion) {
    return (
      <Screen contentStyle={styles.screen}>
        <View style={styles.celebrationIcon}>
          <Text style={styles.celebrationEmoji}>🙌</Text>
        </View>
        <View style={styles.centerCopy}>
          <Kicker>Øvelsen er gemt</Kicker>
          <Title style={styles.centerText}>Flot trænet!</Title>
          <Body style={styles.centerText}>
            {completion.created
              ? "Din fremgang er opdateret."
              : "Dette forsøg var allerede gemt, så vi har ikke talt det to gange."}
          </Body>
        </View>

        <View style={styles.statsRow}>
          {completion.repetitions !== null && (
            <View style={styles.stat}>
              <Text style={styles.statValue}>{completion.repetitions}</Text>
              <Text style={styles.statLabel}>gentagelser</Text>
            </View>
          )}
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {formatElapsed(elapsedSeconds)}
            </Text>
            <Text style={styles.statLabel}>træningstid</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {completion.progress.completedCount}
            </Text>
            <Text style={styles.statLabel}>gange klaret</Text>
          </View>
        </View>

        <SurfaceCard style={styles.savedCard}>
          <Kicker>{subject.title}</Kicker>
          <Text style={styles.savedTitle}>{exercise.title} er klaret</Text>
          <Body>Du kan øve den igen eller vælge næste lille skridt.</Body>
        </SurfaceCard>

        <ActionButton onPress={openGoal}>Se alle øvelser</ActionButton>
        <ActionButton variant="secondary" onPress={() => router.replace("/")}>
          Gå til I dag
        </ActionButton>
      </Screen>
    );
  }

  if (phase === "review" || phase === "saving") {
    return (
      <Screen contentStyle={styles.screen}>
        <BackButton
          disabled={phase === "saving"}
          label={goal.title}
          onPress={openGoal}
        />
        <View style={styles.centerCopy}>
          <Kicker>Hvordan gik det?</Kicker>
          <Title style={styles.centerText}>{exercise.title}</Title>
          <Body style={styles.centerText}>
            Det vigtigste var, at du prøvede.
          </Body>
        </View>

        {exercise.measurement === "repetitions" && (
          <SurfaceCard style={styles.resultCard}>
            <Kicker>Hvor mange klarede du?</Kicker>
            <View style={styles.stepperRow}>
              <Pressable
                accessibilityLabel="Træk én gentagelse fra"
                accessibilityRole="button"
                disabled={phase === "saving" || completionRetryLocked}
                onPress={() =>
                  setRepetitions((value) => clampRepetitions(value - 1))
                }
                style={styles.stepperButton}
              >
                <Text style={styles.stepperButtonText}>−</Text>
              </Pressable>
              <TextInput
                accessibilityLabel="Antal gentagelser"
                editable={phase !== "saving" && !completionRetryLocked}
                inputMode="numeric"
                keyboardType="number-pad"
                maxLength={5}
                onChangeText={(value) =>
                  setRepetitions(
                    clampRepetitions(Number.parseInt(value || "0", 10)),
                  )
                }
                selectTextOnFocus
                style={styles.repetitionInput}
                value={String(repetitions)}
              />
              <Pressable
                accessibilityLabel="Læg én gentagelse til"
                accessibilityRole="button"
                disabled={phase === "saving" || completionRetryLocked}
                onPress={() =>
                  setRepetitions((value) => clampRepetitions(value + 1))
                }
                style={styles.stepperButton}
              >
                <Text style={styles.stepperButtonText}>+</Text>
              </Pressable>
            </View>
          </SurfaceCard>
        )}

        {exercise.measurement === "duration" && (
          <SurfaceCard style={styles.resultCard}>
            <Kicker>Din træningstid</Kicker>
            <Text style={styles.timer}>{formatElapsed(elapsedSeconds)}</Text>
          </SurfaceCard>
        )}

        <SurfaceCard style={styles.ratingCard}>
          <Body style={styles.centerText}>Hvordan føltes øvelsen?</Body>
          <View accessibilityRole="radiogroup" style={styles.ratingRow}>
            {(
              [
                [1, "For let"],
                [3, "Lige tilpas"],
                [5, "For svær"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityLabel={label}
                accessibilityRole="radio"
                accessibilityState={{ checked: difficulty === value }}
                disabled={phase === "saving" || completionRetryLocked}
                onPress={() => setDifficulty(value)}
                style={[
                  styles.rating,
                  difficulty === value && styles.ratingSelected,
                ]}
              >
                <Text
                  style={[
                    styles.ratingText,
                    difficulty === value && styles.ratingTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </SurfaceCard>

        {saveError && (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        )}

        {completionRetryLocked && phase !== "saving" && (
          <View accessibilityLiveRegion="polite" style={styles.noticeBox}>
            <Text style={styles.noticeText}>
              Vi prøver at gemme præcis det samme forsøg igen. Resultat og
              sværhedsgrad er derfor låst.
            </Text>
          </View>
        )}

        {!targetReached && (
          <View accessibilityLiveRegion="polite" style={styles.tipCard}>
            <Kicker>Lidt mere endnu</Kicker>
            <Body>
              Nå {formatExerciseTarget(exercise)}, før øvelsen kan markeres som
              klaret.
            </Body>
          </View>
        )}

        <ActionButton
          disabled={phase === "saving" || !targetReached}
          onPress={() => void saveTraining()}
        >
          {phase === "saving"
            ? "Gemmer fremgang…"
            : completionRetryLocked
              ? "Prøv at gemme samme forsøg igen"
              : "Gem min træning"}
        </ActionButton>
        <ActionButton
          disabled={phase === "saving" || completionRetryLocked}
          variant="secondary"
          onPress={() => {
            startedAt.current = Date.now() - elapsedSeconds * 1_000;
            setPhase("active");
          }}
        >
          Fortsæt lidt endnu
        </ActionButton>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton label={goal.title} onPress={openGoal} />
      {contentNotice && (
        <View accessibilityRole="alert" style={styles.noticeBox}>
          <Text style={styles.noticeText}>{contentNotice}</Text>
        </View>
      )}
      <Kicker>
        {childName} · {subject.title} · {goal.title}
      </Kicker>
      <Title>{exercise.title}</Title>

      <View style={styles.liveRow}>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Træningen er i gang</Text>
        </View>
        <Text style={styles.smallTimer}>{formatElapsed(elapsedSeconds)}</Text>
      </View>

      <View style={styles.timerCard}>
        <Kicker>Samlet træningstid</Kicker>
        <Text
          accessibilityLabel={`${elapsedSeconds} sekunder`}
          style={styles.timer}
        >
          {formatElapsed(elapsedSeconds)}
        </Text>
        <Body style={styles.centerText}>{formatExerciseTarget(exercise)}</Body>
      </View>

      <View style={styles.instructionCard}>
        <View style={styles.instructionCopy}>
          <Kicker>Sådan gør du</Kicker>
          <Text style={styles.instructionTitle}>{exercise.instructions}</Text>
        </View>
      </View>

      {exercise.equipment.length > 0 && (
        <View style={styles.tipCard}>
          <Kicker>Du skal bruge</Kicker>
          <Body>{exercise.equipment.join(" · ")}</Body>
        </View>
      )}

      {exercise.safetyNotes && (
        <View style={styles.tipCard}>
          <Kicker>Pas godt på dig selv</Kicker>
          <Body>{exercise.safetyNotes}</Body>
        </View>
      )}

      <ActionButton variant="danger" onPress={stopTraining}>
        ■ Stop og gem resultat
      </ActionButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  stateScreen: {
    minHeight: 460,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  stateEmoji: { fontSize: 42 },
  centerText: { textAlign: "center" },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.soft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.success,
  },
  liveText: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold,
  },
  smallTimer: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
    fontVariant: ["tabular-nums"],
  },
  timerCard: {
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii["2xl"],
    backgroundColor: colors.surface,
    padding: spacing["2xl"],
  },
  timer: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.display,
    fontWeight: typography.weights.bold,
    fontVariant: ["tabular-nums"],
    letterSpacing: 1.5,
  },
  instructionCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.soft,
    padding: spacing.lg,
  },
  instructionCopy: { gap: spacing.sm },
  instructionTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
    lineHeight: 27,
  },
  tipCard: {
    gap: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.softWarm,
    padding: spacing.md,
  },
  centerCopy: { alignItems: "center", gap: spacing.xs },
  resultCard: { alignItems: "center", gap: spacing.md },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepperButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    backgroundColor: colors.soft,
  },
  stepperButtonText: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: 28,
    fontWeight: typography.weights.bold,
  },
  repetitionInput: {
    width: 94,
    minHeight: 60,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
    textAlign: "center",
  },
  ratingCard: { gap: spacing.md },
  ratingRow: { flexDirection: "row", gap: spacing.xs },
  rating: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
  },
  ratingSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  ratingText: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.semibold,
    textAlign: "center",
  },
  ratingTextSelected: { color: colors.primaryDeep },
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
  noticeBox: {
    borderRadius: radii.md,
    backgroundColor: colors.softWarm,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
    textAlign: "center",
  },
  celebrationIcon: {
    width: 98,
    height: 98,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
    borderRadius: radii.full,
    backgroundColor: colors.softWarm,
  },
  celebrationEmoji: { fontSize: 48 },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  statValue: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    textAlign: "center",
  },
  savedCard: { gap: spacing.sm },
  savedTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
});
