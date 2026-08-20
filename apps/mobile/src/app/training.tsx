import { colors, radii, spacing, typography } from "@bare-traen/design";
import {
  demoExercises,
  demoProgress,
  getCurrentExercise,
} from "@bare-traen/domain";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ActionButton,
  BackButton,
  Body,
  Kicker,
  Screen,
  Title,
} from "@/components/bare-ui";

const currentExercise = getCurrentExercise(demoExercises, demoProgress)!;

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function TrainingScreen() {
  const router = useRouter();
  const startedAt = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [finished, setFinished] = useState(false);
  const [difficulty, setDifficulty] = useState<"let" | "passende" | "svær">(
    "passende",
  );

  useEffect(() => {
    if (finished) return;

    startedAt.current ??= Date.now();

    const updateElapsed = () => {
      if (startedAt.current !== null) {
        setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      }
    };
    const interval = setInterval(updateElapsed, 250);
    updateElapsed();

    return () => clearInterval(interval);
  }, [finished]);

  function finishTraining() {
    if (startedAt.current !== null) {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }
    setFinished(true);
  }

  if (finished) {
    return (
      <Screen contentStyle={styles.screen}>
        <View style={styles.celebrationIcon}>
          <Text style={styles.celebrationEmoji}>🙌</Text>
        </View>
        <View style={styles.centerCopy}>
          <Kicker>Dagens træning er færdig</Kicker>
          <Title style={styles.centerText}>Flot trænet!</Title>
          <Body style={styles.centerText}>
            Det vigtigste var, at du øvede dig.
          </Body>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>2</Text>
            <Text style={styles.statLabel}>bedste antal</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {formatElapsed(elapsedSeconds)}
            </Text>
            <Text style={styles.statLabel}>træningstid</Text>
          </View>
        </View>

        <View style={styles.rewardCard}>
          <Kicker>Nyt bedste forsøg</Kicker>
          <Text style={styles.rewardTitle}>Du nåede dagens mål!</Text>
          <Text style={styles.rewardPoints}>+ 20 point ⭐</Text>
        </View>

        <View style={styles.ratingCard}>
          <Body style={styles.centerText}>Hvordan føltes øvelsen?</Body>
          <View accessibilityRole="radiogroup" style={styles.ratingRow}>
            {(["let", "passende", "svær"] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: difficulty === value }}
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
                  {value === "let"
                    ? "For let"
                    : value === "passende"
                      ? "Lige tilpas"
                      : "For svær"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <ActionButton onPress={() => router.replace("/")}>
          Gem træningen
        </ActionButton>
        <Kicker style={styles.fixtureNote}>
          Gem er kun lokal i denne første UI-preview.
        </Kicker>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton label="Målet" onPress={() => router.back()} />
      <Kicker>Fodbold · Trin 3 af 6</Kicker>
      <Title>{currentExercise.title}</Title>

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
        <Body style={styles.centerText}>
          Uret beregnes fra starttidspunktet og følger med, hvis appen
          kortvarigt er i baggrunden.
        </Body>
      </View>

      <View style={styles.instructionCard}>
        <Text style={styles.ball}>⚽</Text>
        <View style={styles.instructionCopy}>
          <Kicker>Prøv fem gode gange</Kicker>
          <Text style={styles.instructionTitle}>
            {currentExercise.instruction}
          </Text>
          <Body>
            Når du er klar, kan du stoppe og registrere dit bedste forsøg.
          </Body>
        </View>
      </View>

      <View style={styles.actions}>
        <ActionButton variant="secondary" onPress={finishTraining}>
          Skriv resultat
        </ActionButton>
        <ActionButton variant="danger" onPress={finishTraining}>
          ■ Stop træningen
        </ActionButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  centerText: { textAlign: "center" },
  instructionCard: {
    flexDirection: "row",
    gap: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.soft,
    padding: spacing.lg,
  },
  ball: { fontSize: 33 },
  instructionCopy: { flex: 1, gap: spacing.sm },
  instructionTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
    lineHeight: 22,
  },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
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
  centerCopy: { alignItems: "center", gap: spacing.xs },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  statValue: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
  },
  rewardCard: {
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.xl,
    backgroundColor: colors.soft,
    padding: spacing.lg,
  },
  rewardTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  rewardPoints: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  ratingCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  ratingRow: { flexDirection: "row", gap: spacing.xs },
  rating: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
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
  },
  ratingTextSelected: { color: colors.primaryDeep },
  fixtureNote: { textAlign: "center" },
});
