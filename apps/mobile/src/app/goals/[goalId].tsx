import type {
  ChildTrainingGoal,
  ChildTrainingSubject,
} from "@bare-traen/api-client";
import { colors, radii, spacing, typography } from "@bare-traen/design";
import {
  type Href,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

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
  findTrainingGoal,
  formatExerciseTarget,
  formatProgressCopy,
  parseRouteUuid,
} from "@/training/core";

const TRAINING_ROUTE = "/training/[exerciseId]" as Href;
const TOPIC_ROUTE = "/topics/[topicId]" as Href;

type GoalState =
  | { status: "loading"; subject: null; goal: null }
  | { status: "error"; subject: null; goal: null }
  | { status: "missing"; subject: null; goal: null }
  | {
      status: "ready";
      subject: ChildTrainingSubject;
      goal: ChildTrainingGoal;
    };

export default function GoalRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    goalId?: string | string[];
    subjectId?: string | string[];
  }>();
  const { selectedChild, session } = useAuth();
  const goalId = parseRouteUuid(params.goalId);
  const subjectId = parseRouteUuid(params.subjectId);

  if (!selectedChild || !subjectId || !goalId) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>{selectedChild ? "🌱" : "👋"}</Text>
        <Title style={styles.centerText}>
          {selectedChild
            ? "Målet er ikke tilgængeligt"
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
    <SelectedGoal
      key={`${session?.user.id ?? "signed-out"}:${selectedChild.id}:${subjectId}:${goalId}`}
      goalId={goalId}
      subjectId={subjectId}
    />
  );
}

function SelectedGoal({
  goalId,
  subjectId,
}: {
  goalId: string;
  subjectId: string;
}) {
  const router = useRouter();
  const { loadSelectedChildTrainingSubject } = useAuth();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<GoalState>({
    status: "loading",
    subject: null,
    goal: null,
  });

  useFocusEffect(
    useCallback(() => {
      void revision;
      let active = true;
      void loadSelectedChildTrainingSubject(subjectId)
        .then((subject) => {
          if (!active) return;
          const goal = subject ? findTrainingGoal(subject.goals, goalId) : null;
          setState(
            subject && goal && goal.subjectId === subject.id
              ? { status: "ready", subject, goal }
              : { status: "missing", subject: null, goal: null },
          );
        })
        .catch(() => {
          if (active) {
            setState({ status: "error", subject: null, goal: null });
          }
        });

      return () => {
        active = false;
      };
    }, [goalId, loadSelectedChildTrainingSubject, revision, subjectId]),
  );

  function retry() {
    setState({ status: "loading", subject: null, goal: null });
    setRevision((current) => current + 1);
  }

  if (state.status === "loading") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ActivityIndicator color={colors.primaryDeep} size="large" />
        <Body>Henter målet…</Body>
      </Screen>
    );
  }

  if (state.status === "error" || state.status === "missing") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>
          {state.status === "missing" ? "🌱" : "🌧️"}
        </Text>
        <Title style={styles.centerText}>
          {state.status === "missing"
            ? "Målet er ikke tilgængeligt"
            : "Målet kunne ikke hentes"}
        </Title>
        <Body style={styles.centerText}>
          Det kan være ændret af en voksen. Gå tilbage til emnerne, eller prøv
          igen.
        </Body>
        {state.status === "error" && (
          <ActionButton onPress={retry}>Prøv igen</ActionButton>
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

  const { goal, subject } = state;
  const difficulty =
    goal.difficulty === "beginner"
      ? "God at begynde med"
      : goal.difficulty === "intermediate"
        ? "Lidt udfordrende"
        : "En stor udfordring";

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton
        label={subject.title}
        onPress={() =>
          router.dismissTo({
            pathname: TOPIC_ROUTE,
            params: { topicId: subject.id },
          } as Href)
        }
      />

      <View style={styles.heading}>
        <View
          accessible={false}
          style={[
            styles.subjectIcon,
            subject.accentColor
              ? { backgroundColor: `${subject.accentColor}18` }
              : null,
          ]}
        >
          <Text style={styles.subjectIconText}>{subject.icon ?? "★"}</Text>
        </View>
        <Kicker>
          {subject.title} · {difficulty}
        </Kicker>
        <Title>{goal.title}</Title>
        <Body>{goal.summary || "Tag én øvelse ad gangen."}</Body>
      </View>

      <SurfaceCard style={styles.summary}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryCopy}>
            <Kicker>Din fremgang</Kicker>
            <Text style={styles.summaryTitle}>
              {formatProgressCopy(goal.progress)}
            </Text>
          </View>
          <Text style={styles.summaryValue}>{goal.progress.percentage}%</Text>
        </View>
        <ProgressBar value={goal.progress.percentage} />
      </SurfaceCard>

      {goal.equipment.length > 0 && (
        <View style={styles.equipmentBox}>
          <Kicker>Find det her frem</Kicker>
          <Body>{goal.equipment.join(" · ")}</Body>
        </View>
      )}

      <View style={styles.journeyHeading}>
        <Kicker>Alle øvelser</Kicker>
        <Body>Du må gerne vælge dem i den rækkefølge, der passer dig.</Body>
      </View>

      {goal.exercises.length === 0 ? (
        <SurfaceCard style={styles.emptyCard}>
          <Text style={styles.stateEmoji}>🌱</Text>
          <Text style={styles.stepTitle}>Der kommer snart øvelser</Text>
          <Body style={styles.centerText}>
            En voksen er stadig ved at gøre målet klar.
          </Body>
        </SurfaceCard>
      ) : (
        <View style={styles.journey}>
          {goal.exercises.map((exercise, index) => {
            const isDone = exercise.progress.state === "completed";

            return (
              <Pressable
                key={exercise.id}
                accessibilityHint="Åbner øvelsen"
                accessibilityLabel={`${exercise.title}. ${isDone ? "Klaret" : "Ikke klaret endnu"}. ${formatExerciseTarget(exercise)}`}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: TRAINING_ROUTE,
                    params: {
                      exerciseId: exercise.id,
                      goalId: goal.id,
                      subjectId: subject.id,
                    },
                  } as Href)
                }
                style={({ pressed }) => [
                  styles.step,
                  isDone && styles.stepDone,
                  pressed && styles.stepPressed,
                ]}
              >
                <View style={[styles.stepDot, isDone && styles.stepDotDone]}>
                  <Text
                    style={[
                      styles.stepDotText,
                      isDone && styles.stepDotTextDone,
                    ]}
                  >
                    {isDone ? "✓" : index + 1}
                  </Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{exercise.title}</Text>
                  <Text style={styles.stepMeta}>
                    {formatExerciseTarget(exercise)}
                    {exercise.estimatedMinutes
                      ? ` · cirka ${exercise.estimatedMinutes} min.`
                      : ""}
                  </Text>
                </View>
                <Text style={styles.stepState}>
                  {isDone ? "Øv igen ›" : "Start ›"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
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
  centerText: { maxWidth: 380, textAlign: "center" },
  stateEmoji: { fontSize: 42 },
  heading: { gap: spacing.sm },
  subjectIcon: {
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.xl,
    backgroundColor: colors.softWarm,
  },
  subjectIconText: { fontSize: 36 },
  summary: { gap: spacing.md },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  summaryCopy: { flex: 1, gap: spacing.xxs },
  summaryTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  summaryValue: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  equipmentBox: {
    gap: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.softWarm,
    padding: spacing.md,
  },
  journeyHeading: { gap: spacing.xs },
  journey: { gap: spacing.sm },
  emptyCard: { alignItems: "center", gap: spacing.md },
  step: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  stepDone: { borderColor: colors.success, backgroundColor: colors.soft },
  stepPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  stepDot: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    backgroundColor: colors.softWarm,
  },
  stepDotDone: { backgroundColor: colors.success },
  stepDotText: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  stepDotTextDone: { color: colors.onPrimary },
  stepCopy: { flex: 1, gap: spacing.xxs },
  stepTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  stepMeta: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
  },
  stepState: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold,
  },
});
