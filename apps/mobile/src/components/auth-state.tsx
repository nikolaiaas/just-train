import { colors, radii, spacing, typography } from "@bare-traen/design";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ActionButton, Body, Kicker, Screen, Title } from "./bare-ui";

export function LoadingAuthScreen({
  message = "Gør appen klar…",
}: {
  message?: string;
}) {
  return (
    <Screen contentStyle={styles.centered}>
      <View style={styles.icon}>
        <ActivityIndicator color={colors.primaryDeep} size="large" />
      </View>
      <Title style={styles.centerText}>Et øjeblik</Title>
      <Body style={styles.centerText}>{message}</Body>
    </Screen>
  );
}

export function AuthSetupErrorScreen() {
  return (
    <Screen contentStyle={styles.centered}>
      <View style={styles.icon}>
        <Text style={styles.emoji}>🛠️</Text>
      </View>
      <Kicker>Udviklingsopsætning</Kicker>
      <Title style={styles.centerText}>Appen mangler forbindelse</Title>
      <Body style={styles.centerText}>
        De offentlige Supabase-værdier eller app-varianten mangler. Ret den
        lokale opsætning, og genindlæs previewet.
      </Body>
    </Screen>
  );
}

export function AuthRestoreErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen contentStyle={styles.centered}>
      <View style={styles.icon}>
        <Text style={styles.emoji}>🌧️</Text>
      </View>
      <Title style={styles.centerText}>Login kunne ikke hentes</Title>
      <Body style={styles.centerText}>
        Kontrollér forbindelsen, og prøv at indlæse appen igen.
      </Body>
      <View style={styles.actionWidth}>
        <ActionButton onPress={onRetry}>Prøv igen</ActionButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  centerText: { maxWidth: 360, textAlign: "center" },
  icon: {
    width: 78,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    backgroundColor: colors.softWarm,
  },
  emoji: {
    fontFamily: typography.families.systemRounded,
    fontSize: 36,
  },
  actionWidth: { width: "100%", maxWidth: 320, marginTop: spacing.sm },
});
