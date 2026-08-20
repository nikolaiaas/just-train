import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "@bare-traen/design";
import type { PropsWithChildren, ReactNode } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const softShadow: ViewStyle = Platform.select({
  web: { boxShadow: shadows.soft.web },
  default: {
    shadowColor: shadows.soft.color,
    shadowOpacity: shadows.soft.opacity,
    shadowOffset: shadows.soft.offset,
    shadowRadius: shadows.soft.radius,
    elevation: shadows.soft.elevation,
  },
});

type ScreenProps = PropsWithChildren<{
  contentStyle?: ViewStyle;
  footer?: ReactNode;
}>;

export function Screen({ children, contentStyle, footer }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.screen, contentStyle]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

export function Kicker({
  children,
  style,
}: PropsWithChildren<{ style?: TextStyle }>) {
  return <Text style={[styles.kicker, style]}>{children}</Text>;
}

export function Title({
  children,
  style,
}: PropsWithChildren<{ style?: TextStyle }>) {
  return (
    <Text accessibilityRole="header" style={[styles.title, style]}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  style,
}: PropsWithChildren<{ style?: TextStyle }>) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

type ButtonProps = {
  children: ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  accessibilityLabel?: string;
};

export function ActionButton({
  children,
  onPress,
  variant = "primary",
  accessibilityLabel,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        variant === "secondary" && styles.actionSecondary,
        variant === "danger" && styles.actionDanger,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.actionText,
          variant === "secondary" && styles.actionTextSecondary,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: safeValue }}
      style={styles.progressTrack}
    >
      <View style={[styles.progressFill, { width: `${safeValue}%` }]} />
    </View>
  );
}

export function SurfaceCard({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle }>) {
  return (
    <View style={[styles.surfaceCard, softShadow, style]}>{children}</View>
  );
}

export function BackButton({
  onPress,
  label = "Tilbage",
}: {
  onPress: () => void;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Gå tilbage"
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
    >
      <Text style={styles.backText}>‹ {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.page,
  },
  scroll: { flex: 1 },
  screen: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing["5xl"],
  },
  kicker: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.kicker,
    fontWeight: typography.weights.semibold,
    letterSpacing: 0.2,
  },
  title: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    lineHeight: 28,
  },
  body: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    lineHeight: 19,
  },
  action: {
    minHeight: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  actionSecondary: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionDanger: { backgroundColor: colors.coral },
  actionText: {
    color: colors.onPrimary,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.bold,
  },
  actionTextSecondary: { color: colors.ink },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  progressTrack: {
    height: 8,
    overflow: "hidden",
    borderRadius: radii.full,
    backgroundColor: colors.border,
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.full,
    backgroundColor: colors.primary,
  },
  surfaceCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  backButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
  },
  backText: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
});
