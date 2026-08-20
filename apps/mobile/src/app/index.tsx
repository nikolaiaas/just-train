import { colors, radii, spacing, typography } from "@bare-traen/design";
import {
  demoChild,
  demoExercises,
  demoGoal,
  demoProgress,
  demoTopics,
  getCurrentExercise,
  getGoalProgress,
} from "@bare-traen/domain";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ActionButton,
  Body,
  Kicker,
  ProgressBar,
  Screen,
  SurfaceCard,
  Title,
} from "@/components/bare-ui";

const goalProgress = getGoalProgress(demoGoal, demoProgress);
const currentExercise = getCurrentExercise(demoExercises, demoProgress);
const football = demoTopics.find((topic) => topic.id === demoGoal.topicId)!;

export default function TodayScreen() {
  const router = useRouter();

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View>
          <Kicker>God eftermiddag</Kicker>
          <Title>Hej, {demoChild.name}!</Title>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={demoChild.avatarAlt}
          style={styles.avatar}
        >
          <Text style={styles.avatarEmoji}>👧</Text>
        </View>
      </View>

      <View style={styles.utilityRow}>
        <View style={styles.pointsPill}>
          <Text style={styles.pointsText}>⭐ {demoChild.points} point</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/goal")}
          hitSlop={10}
        >
          <Text style={styles.utilityLink}>Se hele målet ›</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Åbn målet ${demoGoal.title}`}
        onPress={() => router.push("/goal")}
        style={({ pressed }) => [pressed && styles.cardPressed]}
      >
        <SurfaceCard style={styles.goalCard}>
          <View style={styles.goalHeading}>
            <Text style={styles.goalIcon}>{football.icon}</Text>
            <View style={styles.goalHeadingCopy}>
              <Text style={styles.goalLabel}>{football.name}</Text>
              <Text style={styles.goalTitle}>{demoGoal.title}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
          <ProgressBar value={goalProgress.percentage} />
          <Kicker style={styles.progressCopy}>
            {goalProgress.currentExerciseNumber} af{" "}
            {goalProgress.totalExercises} trin · {goalProgress.percentage}% på
            vej
          </Kicker>
        </SurfaceCard>
      </Pressable>

      <View style={styles.sectionHeading}>
        <Kicker>Dagens mission</Kicker>
        <Text style={styles.timePill}>
          ⏱ Cirka {currentExercise?.recommendedMinutes ?? 10} min.
        </Text>
      </View>

      <View style={styles.missionCard}>
        <View style={styles.ballHalo}>
          <Text style={styles.ball}>⚽</Text>
        </View>
        <Title style={styles.missionTitle}>{currentExercise?.title}</Title>
        <Body style={styles.missionCopy}>{currentExercise?.instruction}</Body>
        <View style={styles.encouragement}>
          <Text style={styles.encouragementText}>
            Det behøver ikke være perfekt — bare prøv.
          </Text>
        </View>
        <ActionButton onPress={() => router.push("/training")}>
          Start dagens træning
        </ActionButton>
      </View>

      <View style={styles.weekCard}>
        <Text style={styles.weekIcon}>🌟</Text>
        <View style={styles.weekCopy}>
          <Text style={styles.weekTitle}>Godt i gang</Text>
          <Body>Du har allerede øvet dig 2 gange i denne uge.</Body>
        </View>
      </View>

      <View style={styles.previewNote}>
        <Text style={styles.previewNoteText}>
          Fixture-preview · backend kobles på i næste slice
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  avatar: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.yellow,
    borderRadius: radii.full,
    backgroundColor: colors.softWarm,
  },
  avatarEmoji: { fontSize: 31 },
  utilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pointsPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.softWarm,
  },
  pointsText: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.label,
    fontWeight: typography.weights.bold,
  },
  utilityLink: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.label,
    fontWeight: typography.weights.bold,
  },
  cardPressed: { opacity: 0.75 },
  goalCard: { gap: spacing.md },
  goalHeading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  goalIcon: { fontSize: 28 },
  goalHeadingCopy: { flex: 1, gap: 1 },
  goalLabel: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  goalTitle: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  chevron: { color: colors.primaryDeep, fontSize: 28 },
  progressCopy: { marginTop: -spacing.xs },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  timePill: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold,
  },
  missionCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii["2xl"],
    backgroundColor: colors.soft,
    padding: spacing.xl,
  },
  ballHalo: {
    width: 78,
    height: 78,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    backgroundColor: colors.softWarm,
  },
  ball: { fontSize: 43 },
  missionTitle: { textAlign: "center" },
  missionCopy: { textAlign: "center" },
  encouragement: {
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  encouragementText: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.label,
    fontWeight: typography.weights.semibold,
    textAlign: "center",
  },
  weekCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.softWarm,
    padding: spacing.lg,
  },
  weekIcon: { fontSize: 30 },
  weekCopy: { flex: 1, gap: spacing.xxs },
  weekTitle: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  previewNote: { alignItems: "center", marginTop: spacing.sm },
  previewNoteText: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.micro,
  },
});
