import { colors, radii, spacing, typography } from "@bare-traen/design";
import type {
  ChildTrainingCatalog,
  ChildTrainingSubject,
} from "@bare-traen/api-client";
import { useFocusEffect, useRouter } from "expo-router";
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
  Title,
} from "@/components/bare-ui";
import { groupTrainingSubjects } from "@/training/core";

type TopicState =
  | { status: "loading"; catalog: null }
  | { status: "error"; catalog: null }
  | { status: "ready"; catalog: ChildTrainingCatalog };

export default function TopicsScreen() {
  const { selectedChild, session } = useAuth();

  return (
    <TopicsSessionScreen
      key={`${session?.user.id ?? "signed-out"}:${selectedChild?.id ?? "no-child"}`}
    />
  );
}

function TopicsSessionScreen() {
  const router = useRouter();
  const { loadSelectedChildTrainingCatalog, selectedChild } = useAuth();
  const [state, setState] = useState<TopicState>({
    status: "loading",
    catalog: null,
  });
  const [revision, setRevision] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void revision;
      if (!selectedChild) return;

      let active = true;
      void loadSelectedChildTrainingCatalog()
        .then((catalog) => {
          if (active) {
            setState({ status: "ready", catalog });
          }
        })
        .catch(() => {
          if (active) {
            setState({ status: "error", catalog: null });
          }
        });

      return () => {
        active = false;
      };
    }, [loadSelectedChildTrainingCatalog, revision, selectedChild]),
  );

  function retry() {
    setState({ status: "loading", catalog: null });
    setRevision((current) => current + 1);
  }

  if (!selectedChild) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Title style={styles.centerText}>Vælg en profil først</Title>
        <Body style={styles.centerText}>
          Gå tilbage, og vælg det barn, der skal træne.
        </Body>
        <ActionButton onPress={() => router.replace("/")}>
          Gå tilbage
        </ActionButton>
      </Screen>
    );
  }

  const subjectGroups =
    state.status === "ready"
      ? groupTrainingSubjects(state.catalog.subjects)
      : { available: [], enrolled: [] };

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton label="I dag" onPress={() => router.replace("/")} />
      <View style={styles.heading}>
        <Kicker>Vælg emne</Kicker>
        <Title>Hvad vil {selectedChild.displayName} øve?</Title>
        <Body>
          Vælg et emne, og gå i gang. Du kan også selv lave et særligt billede,
          der passer til emnet.
        </Body>
      </View>

      {state.status === "loading" && (
        <View accessibilityLiveRegion="polite" style={styles.stateScreen}>
          <ActivityIndicator color={colors.primaryDeep} size="large" />
          <Body>Henter emner…</Body>
        </View>
      )}

      {state.status === "error" && (
        <View accessibilityRole="alert" style={styles.errorCard}>
          <Text style={styles.cardTitle}>Emnerne kunne ikke hentes</Text>
          <Body>Kontrollér forbindelsen, og prøv igen.</Body>
          <ActionButton onPress={retry}>Prøv igen</ActionButton>
        </View>
      )}

      {state.status === "ready" && state.catalog.subjects.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🌱</Text>
          <Text style={styles.cardTitle}>Ingen emner lige nu</Text>
          <Body>Der er ingen udgivne emner endnu. Prøv igen senere.</Body>
        </View>
      )}

      {state.status === "ready" && state.catalog.subjects.length > 0 && (
        <View style={styles.topicSections}>
          {subjectGroups.enrolled.length > 0 && (
            <View style={styles.topicSection}>
              <View style={styles.sectionHeading}>
                <Kicker>Mine emner</Kicker>
                <Body>Her er de emner, du har valgt.</Body>
              </View>
              <View style={styles.topicList}>
                {subjectGroups.enrolled.map((topic) => (
                  <TopicCard key={topic.id} router={router} topic={topic} />
                ))}
              </View>
            </View>
          )}

          {subjectGroups.available.length > 0 && (
            <View style={styles.topicSection}>
              <View style={styles.sectionHeading}>
                <Kicker>
                  {subjectGroups.enrolled.length > 0
                    ? "Flere emner"
                    : "Emner du kan vælge"}
                </Kicker>
                <Body>
                  Åbn et emne for at se det hele og vælge det til dig selv.
                </Body>
              </View>
              <View style={styles.topicList}>
                {subjectGroups.available.map((topic) => (
                  <TopicCard key={topic.id} router={router} topic={topic} />
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

function TopicCard({
  router,
  topic,
}: {
  router: ReturnType<typeof useRouter>;
  topic: ChildTrainingSubject;
}) {
  return (
    <Pressable
      accessibilityHint="Åbner emnets mål, fremgang, billede og garderobe"
      accessibilityLabel={`${topic.title}. ${topic.isEnrolled ? "Mit emne" : "Kan vælges"}. ${topic.progress.completedExercises} af ${topic.progress.totalExercises} øvelser klaret`}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: "/topics/[topicId]",
          params: { topicId: topic.id },
        })
      }
      style={({ pressed }) => [styles.topicCard, pressed && styles.pressed]}
    >
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
      <View style={styles.topicCopy}>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>{topic.title}</Text>
          <View
            style={[
              styles.statusPill,
              topic.isEnrolled ? styles.minePill : styles.availablePill,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                topic.isEnrolled
                  ? styles.mineStatusText
                  : styles.availableStatusText,
              ]}
            >
              {topic.isEnrolled ? "Mit emne" : "Kan vælges"}
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.description}>
          {topic.description || "Et nyt emne er klar til træning."}
        </Text>
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <ProgressBar value={topic.progress.percentage} />
          </View>
          <Text style={styles.photoState}>{topic.progress.percentage}%</Text>
        </View>
        <Text style={styles.progressCopy}>
          {topic.progress.totalExercises === 0
            ? "Målene er på vej"
            : `${topic.progress.completedExercises} af ${topic.progress.totalExercises} øvelser klaret`}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  heading: { gap: spacing.sm },
  stateScreen: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  centerText: { textAlign: "center" },
  topicSections: { gap: spacing.xl },
  topicSection: { gap: spacing.md },
  sectionHeading: { gap: spacing.xs },
  topicList: { gap: spacing.sm },
  topicCard: {
    minHeight: 108,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  topicIcon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.lg,
    backgroundColor: colors.softWarm,
  },
  topicIconText: { fontSize: 32 },
  topicCopy: { flex: 1, gap: spacing.xxs },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  cardTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  description: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    lineHeight: 19,
  },
  statusPill: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  minePill: { backgroundColor: colors.soft },
  availablePill: { backgroundColor: colors.softWarm },
  statusText: {
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.micro,
    fontWeight: typography.weights.bold,
  },
  mineStatusText: { color: colors.primaryDeep },
  availableStatusText: { color: colors.ink },
  photoState: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  progressBar: { flex: 1 },
  progressCopy: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
  },
  chevron: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: 34,
  },
  errorCard: {
    gap: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.dangerSoft,
    padding: spacing.lg,
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.soft,
    padding: spacing.xl,
  },
  emptyIcon: { fontSize: 42 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
});
