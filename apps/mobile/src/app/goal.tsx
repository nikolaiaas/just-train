import { colors, radii, spacing, typography } from "@bare-traen/design";
import {
  demoExercises,
  demoGoal,
  demoProgress,
  getExercisesForGoal,
  getGoalProgress,
} from "@bare-traen/domain";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/auth/auth-provider";

import {
  BackButton,
  ActionButton,
  Body,
  Kicker,
  ProgressBar,
  Screen,
  Title,
} from "@/components/bare-ui";

const exercises = getExercisesForGoal(demoExercises, demoGoal.id);
const progress = getGoalProgress(demoGoal, demoProgress);

export default function GoalScreen() {
  const router = useRouter();
  const { bootstrap, refreshParent, selectedChild } = useAuth();

  if (bootstrap.status === "idle" || bootstrap.status === "loading") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ActivityIndicator color={colors.primaryDeep} size="large" />
        <Title>Henter barnets mål…</Title>
      </Screen>
    );
  }

  if (bootstrap.status === "error") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Title style={styles.centerText}>Målet kunne ikke hentes</Title>
        <Body style={styles.centerText}>
          Kontrollér forbindelsen, og hent familiens oplysninger igen.
        </Body>
        <View style={styles.stateAction}>
          <ActionButton onPress={refreshParent}>Prøv igen</ActionButton>
        </View>
      </Screen>
    );
  }

  if (!selectedChild) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Title style={styles.centerText}>Vælg et barn først</Title>
        <Body style={styles.centerText}>
          Træningspreviewet åbnes først, når familien har en aktiv børneprofil.
        </Body>
        <View style={styles.stateAction}>
          <ActionButton onPress={() => router.replace("/")}>
            Gå til familien
          </ActionButton>
        </View>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton label="I dag" onPress={() => router.back()} />
      <Kicker>{selectedChild.displayName} · preview-mål</Kicker>
      <Title>{demoGoal.title}</Title>
      <Body>
        Hvert trin gør dig klar til det næste. Du træner i dit eget tempo.
      </Body>

      <View style={styles.summary}>
        <View style={styles.summaryTop}>
          <Text style={styles.summaryIcon}>⚽</Text>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryValue}>{progress.percentage}%</Text>
            <Kicker>på vej mod 10 jongleringer</Kicker>
          </View>
        </View>
        <ProgressBar value={progress.percentage} />
      </View>

      <View style={styles.journey}>
        {exercises.map((exercise) => {
          const isDone = demoProgress.completedExerciseIds.includes(
            exercise.id,
          );
          const isCurrent = demoProgress.currentExerciseId === exercise.id;

          return (
            <Pressable
              key={exercise.id}
              accessibilityRole={isCurrent ? "button" : undefined}
              accessibilityState={{ disabled: !isCurrent }}
              accessibilityLabel={
                isDone
                  ? `${exercise.title}, klaret`
                  : isCurrent
                    ? `${exercise.title}, nuværende trin`
                    : `${exercise.title}, låst`
              }
              disabled={!isCurrent}
              onPress={() => router.push("/training")}
              style={({ pressed }) => [
                styles.step,
                isCurrent && styles.stepCurrent,
                pressed && styles.stepPressed,
              ]}
            >
              <View
                style={[
                  styles.stepDot,
                  isDone && styles.stepDotDone,
                  isCurrent && styles.stepDotCurrent,
                ]}
              >
                <Text
                  style={[styles.stepDotText, isDone && styles.stepDotTextDone]}
                >
                  {isDone
                    ? "✓"
                    : exercise.order === exercises.length
                      ? "🏆"
                      : exercise.order}
                </Text>
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{exercise.title}</Text>
                <Text style={styles.stepMeta}>
                  {isDone
                    ? "Klaret 5 gange"
                    : isCurrent
                      ? "Dit næste lille skridt"
                      : "Åbner bagefter"}
                </Text>
              </View>
              <Text
                style={[styles.stepState, isCurrent && styles.stepStateCurrent]}
              >
                {isDone ? "Klaret" : isCurrent ? "Start ›" : "🔒"}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Kicker style={styles.previewNote}>
        Målet og fremskridtet er fortsat fixture-indhold i denne slice.
      </Kicker>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.sm },
  stateScreen: {
    minHeight: 460,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  centerText: { maxWidth: 360, textAlign: "center" },
  stateAction: { width: "100%", maxWidth: 320 },
  previewNote: { marginTop: spacing.lg, textAlign: "center" },
  summary: {
    gap: spacing.md,
    marginVertical: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  summaryTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  summaryIcon: { fontSize: 32 },
  summaryCopy: { flex: 1 },
  summaryValue: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  journey: { gap: spacing.sm },
  step: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  stepCurrent: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  stepPressed: { opacity: 0.72 },
  stepDot: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    backgroundColor: colors.locked,
  },
  stepDotDone: { backgroundColor: colors.success },
  stepDotCurrent: { backgroundColor: colors.yellow },
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
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold,
  },
  stepStateCurrent: { color: colors.primaryDeep },
});
