import { colors, radii, spacing, typography } from "@bare-traen/design";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ParentChild } from "@/auth/parent-data";
import { ChildProfileAvatar } from "@/components/child-profile-avatar";

export function ChildChooser({
  onChoose,
  profiles,
  selectedChildId = null,
}: {
  onChoose(childId: string): void;
  profiles: ParentChild[];
  selectedChildId?: string | null;
}) {
  return (
    <View style={styles.list}>
      {profiles.map((child) => {
        const selected = child.id === selectedChildId;

        return (
          <Pressable
            key={child.id}
            accessibilityHint={
              selected
                ? "Denne profil er allerede åben"
                : `Åbner ${child.displayName}s profil`
            }
            accessibilityLabel={
              selected
                ? `${child.displayName}, træner lige nu`
                : `${child.displayName}, åbn denne profil`
            }
            accessibilityRole="button"
            onPress={() => {
              if (!selected) {
                onChoose(child.id);
              }
            }}
            style={({ pressed }) => [
              styles.choice,
              selected && styles.choiceSelected,
              pressed && styles.pressed,
            ]}
          >
            <ChildProfileAvatar child={child} decorative size={48} />
            <View style={styles.copy}>
              <Text style={styles.name}>{child.displayName}</Text>
              <Text style={styles.meta}>
                {selected ? "Træner lige nu" : "Åbn denne profil"}
              </Text>
            </View>
            <Text style={[styles.action, selected && styles.actionSelected]}>
              {selected ? "✓" : "Åbn ›"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  choice: {
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
  choiceSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  copy: { flex: 1, gap: spacing.xxs },
  name: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  meta: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
  },
  action: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.label,
    fontWeight: typography.weights.bold,
  },
  actionSelected: { color: colors.success },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
