import { colors, radii, spacing, typography } from "@bare-traen/design";
import type { ChildPublishedTopicWithPhoto } from "@bare-traen/api-client";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
  Screen,
  Title,
} from "@/components/bare-ui";

type TopicState =
  | { status: "loading"; topics: null }
  | { status: "error"; topics: null }
  | { status: "ready"; topics: ChildPublishedTopicWithPhoto[] };

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
  const { loadSelectedChildTopics, selectedChild } = useAuth();
  const [state, setState] = useState<TopicState>({
    status: "loading",
    topics: null,
  });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!selectedChild) {
      return;
    }

    let active = true;

    void loadSelectedChildTopics()
      .then((topics) => {
        if (active) {
          setState({ status: "ready", topics });
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: "error", topics: null });
        }
      });

    return () => {
      active = false;
    };
  }, [loadSelectedChildTopics, revision, selectedChild]);

  function retry() {
    setState({ status: "loading", topics: null });
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

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton label="I dag" onPress={() => router.back()} />
      <View style={styles.heading}>
        <Kicker>Vælg emne</Kicker>
        <Title>Hvad vil {selectedChild.displayName} øve?</Title>
        <Body>
          Vælg et emne. Bagefter kan en voksen hjælpe med et særligt billede,
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

      {state.status === "ready" && state.topics.length === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🌱</Text>
          <Text style={styles.cardTitle}>Der kommer snart emner</Text>
          <Body>En voksen er stadig ved at gøre de første emner klar.</Body>
        </View>
      )}

      {state.status === "ready" && state.topics.length > 0 && (
        <View style={styles.topicList}>
          {state.topics.map((topic) => (
            <Pressable
              key={topic.id}
              accessibilityHint="Åbner emnet og det private emnebillede"
              accessibilityLabel={`${topic.title}. ${topic.photo ? "Emnebilledet er klar" : "Intet emnebillede endnu"}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/topics/[topicId]",
                  params: { topicId: topic.id },
                })
              }
              style={({ pressed }) => [
                styles.topicCard,
                pressed && styles.pressed,
              ]}
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
                <Text style={styles.cardTitle}>{topic.title}</Text>
                <Text numberOfLines={2} style={styles.description}>
                  {topic.description || "Et nyt emne er klar til træning."}
                </Text>
                <Text style={styles.photoState}>
                  {topic.photo
                    ? "✓ Dit emnebillede er klar"
                    : "Tilføj et emnebillede eller spring over"}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
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
  photoState: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold,
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
