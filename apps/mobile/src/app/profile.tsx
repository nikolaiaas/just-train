import { colors, radii, spacing, typography } from "@bare-traen/design";
import { type Href, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

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
import { ChildChooser } from "@/components/child-chooser";
import { ChildProfileAvatar } from "@/components/child-profile-avatar";

const AI_CARTOON_ROUTE = "/ai/cartoon" as Href;
const NEW_CHILD_ROUTE = "/child/new" as Href;
const TOPICS_ROUTE = "/topics" as Href;

export default function ProfileScreen() {
  const router = useRouter();
  const {
    bootstrap,
    logout,
    logoutError,
    refreshParent,
    selectChild,
    selectedChild,
  } = useAuth();

  if (bootstrap.status === "idle" || bootstrap.status === "loading") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ActivityIndicator color={colors.primaryDeep} size="large" />
        <Title style={styles.centerText}>Henter profilen…</Title>
      </Screen>
    );
  }

  if (bootstrap.status === "error") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>🌧️</Text>
        <Title style={styles.centerText}>Profilen kunne ikke hentes</Title>
        <Body style={styles.centerText}>
          Kontrollér forbindelsen, og prøv at hente familien igen.
        </Body>
        <View style={styles.stateActions}>
          <ActionButton onPress={refreshParent}>Prøv igen</ActionButton>
          <ActionButton variant="secondary" onPress={() => router.replace("/")}>
            Gå til forsiden
          </ActionButton>
        </View>
      </Screen>
    );
  }

  if (!bootstrap.data.family || !selectedChild) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>👋</Text>
        <Title style={styles.centerText}>Vælg en profil først</Title>
        <Body style={styles.centerText}>
          Gå til familieoversigten, og vælg det barn, der skal bruge appen.
        </Body>
        <View style={styles.stateActions}>
          <ActionButton onPress={() => router.replace("/")}>
            Gå til familien
          </ActionButton>
        </View>
      </Screen>
    );
  }

  const canCreateChild =
    bootstrap.data.family.role === "owner" &&
    bootstrap.data.children.length < 10;

  function chooseChild(childId: string) {
    selectChild(childId);
    router.replace("/");
  }

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton label="I dag" onPress={() => router.replace("/")} />

      <SurfaceCard style={styles.profileCard}>
        <ChildProfileAvatar child={selectedChild} />
        <View style={styles.profileCopy}>
          <Kicker>Min profil</Kicker>
          <Title style={styles.centerText}>{selectedChild.displayName}</Title>
          <Body style={styles.centerText}>
            Her bor dit profilbillede og de ting, du har samlet.
          </Body>
        </View>
        <ActionButton onPress={() => router.push(AI_CARTOON_ROUTE)}>
          {selectedChild.avatarMediaAssetId
            ? "Skift profilbillede"
            : "Lav mit profilbillede"}
        </ActionButton>
      </SurfaceCard>

      <SurfaceCard style={styles.childMenuCard}>
        <View style={styles.menuCopy}>
          <Kicker>Mit sted</Kicker>
          <Text style={styles.menuTitle}>Mine emnegarderober</Text>
          <Body>
            Vælg først et emne. Så ved garderoben, hvilken emnefigur dit tøj og
            udstyr skal tegnes på.
          </Body>
        </View>
        <ActionButton onPress={() => router.push(TOPICS_ROUTE)}>
          Vælg emne og garderobe
        </ActionButton>
      </SurfaceCard>

      <View style={styles.adultCard}>
        <View style={styles.menuCopy}>
          <Kicker>For voksne</Kicker>
          <Text style={styles.menuTitle}>Familie og konto</Text>
          <Body>
            Her kan en voksen skifte barn, oprette en profil mere eller logge
            ud.
          </Body>
        </View>

        {bootstrap.data.children.length > 1 ? (
          <View style={styles.familySection}>
            <Text style={styles.sectionLabel}>Skift barn</Text>
            <ChildChooser
              onChoose={chooseChild}
              profiles={bootstrap.data.children}
              selectedChildId={selectedChild.id}
            />
          </View>
        ) : (
          <View style={styles.onlyChildNote}>
            <Body>{selectedChild.displayName} er familiens eneste profil.</Body>
          </View>
        )}

        <View style={styles.adultActions}>
          {canCreateChild && (
            <ActionButton
              variant="secondary"
              onPress={() => router.push(NEW_CHILD_ROUTE)}
            >
              ＋ Opret et barn mere
            </ActionButton>
          )}
          {bootstrap.data.family.role === "owner" &&
            bootstrap.data.children.length >= 10 && (
              <Body style={styles.centerText}>
                Familien har nået grænsen på 10 aktive børneprofiler.
              </Body>
            )}
          <ActionButton variant="secondary" onPress={() => void logout()}>
            Log ud
          </ActionButton>
          {logoutError && (
            <View accessibilityRole="alert" style={styles.errorBox}>
              <Text style={styles.errorText}>{logoutError}</Text>
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  stateScreen: {
    minHeight: 500,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  stateActions: { width: "100%", maxWidth: 360, gap: spacing.sm },
  stateEmoji: { fontSize: 42 },
  centerText: { textAlign: "center" },
  profileCard: { alignItems: "center", gap: spacing.md },
  profileCopy: { alignItems: "center", gap: spacing.xs },
  childMenuCard: { gap: spacing.md },
  menuCopy: { gap: spacing.xs },
  menuTitle: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  adultCard: {
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.softWarm,
    padding: spacing.lg,
  },
  familySection: { gap: spacing.sm },
  sectionLabel: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  onlyChildNote: {
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  adultActions: { gap: spacing.sm },
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
