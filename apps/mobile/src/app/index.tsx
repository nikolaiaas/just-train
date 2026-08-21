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
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/auth/auth-provider";
import type { ParentBootstrap, ParentChild } from "@/auth/parent-data";
import { resolveChildAvatar } from "@/children/child-setup";

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
const NEW_CHILD_ROUTE = "/child/new" as Href;
const AI_CARTOON_ROUTE = "/ai/cartoon" as Href;

export default function TodayScreen() {
  const {
    bootstrap,
    completeOnboarding,
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
        <Title>Henter din familie…</Title>
        <Body style={styles.centerText}>
          Vi finder kun de profiler, din forælderkonto har adgang til.
        </Body>
      </Screen>
    );
  }

  if (bootstrap.status === "error") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>🌧️</Text>
        <Title style={styles.centerText}>Familien kunne ikke hentes</Title>
        <Body style={styles.centerText}>
          Kontrollér forbindelsen, og prøv igen. Ingen eksempeldata vises som
          erstatning for din familie.
        </Body>
        <View style={styles.stateActions}>
          <ActionButton onPress={refreshParent}>Prøv igen</ActionButton>
          <ActionButton variant="secondary" onPress={() => void logout()}>
            Log ud
          </ActionButton>
          {logoutError && <AccountError message={logoutError} />}
        </View>
      </Screen>
    );
  }

  if (!bootstrap.data.family) {
    return (
      <ParentOnboarding
        initialDisplayName={bootstrap.data.profile.displayName}
        onComplete={completeOnboarding}
        onLogout={logout}
        logoutError={logoutError}
      />
    );
  }

  if (bootstrap.data.children.length === 0 || !selectedChild) {
    return (
      <NoChildren
        bootstrap={bootstrap.data}
        logoutError={logoutError}
        onLogout={logout}
      />
    );
  }

  return (
    <FixtureToday
      bootstrap={bootstrap.data}
      logoutError={logoutError}
      onLogout={logout}
      onSelectChild={selectChild}
      selectedChild={selectedChild}
    />
  );
}

function ParentOnboarding({
  initialDisplayName,
  logoutError,
  onComplete,
  onLogout,
}: {
  initialDisplayName: string;
  logoutError: string | null;
  onComplete(input: { displayName: string; familyName: string }): Promise<void>;
  onLogout(): Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [familyName, setFamilyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      await onComplete({ displayName, familyName });
    } catch {
      setError(
        "Familien kunne ikke oprettes. Kontrollér felterne, og prøv igen.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentStyle={styles.onboardingScreen}>
      <View style={styles.stateIcon}>
        <Text style={styles.stateEmoji}>🏡</Text>
      </View>
      <Kicker>Første opsætning</Kicker>
      <Title>Gør din familie klar</Title>
      <Body>
        Start med den voksnes navn og et navn til familien. Børneprofilen kommer
        som et særskilt næste trin.
      </Body>
      <View style={styles.formCard}>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Dit navn</Text>
          <TextInput
            accessibilityLabel="Dit navn"
            autoCapitalize="words"
            autoComplete="name"
            editable={!busy}
            maxLength={80}
            onChangeText={(value) => {
              setDisplayName(value);
              setError(null);
            }}
            placeholder="For eksempel Nikolaj"
            placeholderTextColor={colors.muted}
            style={styles.input}
            textContentType="name"
            value={displayName}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Familiens navn</Text>
          <TextInput
            accessibilityLabel="Familiens navn"
            autoCapitalize="words"
            editable={!busy}
            maxLength={80}
            onChangeText={(value) => {
              setFamilyName(value);
              setError(null);
            }}
            onSubmitEditing={() => void submit()}
            placeholder="For eksempel Familien Demo"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            style={styles.input}
            value={familyName}
          />
        </View>
        {error && (
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={styles.errorBox}
          >
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <ActionButton
          disabled={
            busy ||
            displayName.trim().length === 0 ||
            familyName.trim().length === 0
          }
          onPress={() => void submit()}
        >
          {busy ? "Gør familien klar…" : "Opret familien"}
        </ActionButton>
        <ActionButton
          disabled={busy}
          variant="secondary"
          onPress={() => void onLogout()}
        >
          Log ud
        </ActionButton>
        {logoutError && <AccountError message={logoutError} />}
      </View>
    </Screen>
  );
}

function NoChildren({
  bootstrap,
  logoutError,
  onLogout,
}: {
  bootstrap: ParentBootstrap;
  logoutError: string | null;
  onLogout(): Promise<void>;
}) {
  const router = useRouter();

  return (
    <Screen contentStyle={styles.stateScreen}>
      <View style={styles.stateIcon}>
        <Text style={styles.stateEmoji}>🌱</Text>
      </View>
      <Kicker>{bootstrap.family?.name}</Kicker>
      <Title style={styles.centerText}>Din familie er klar</Title>
      <Body style={styles.centerText}>
        Der er endnu ingen aktive børneprofiler. Opret den første med et navn
        eller kaldenavn og en foruddefineret avatar. Barnet får ikke sit eget
        login.
      </Body>
      <View style={styles.emptyNotice}>
        <Text style={styles.emptyNoticeTitle}>
          Kun de nødvendige oplysninger
        </Text>
        <Body>
          Vi beder ikke om alder, e-mail, adgangskode eller et billede af
          barnet.
        </Body>
      </View>
      <View style={styles.stateActions}>
        {bootstrap.family?.role === "owner" ? (
          <ActionButton onPress={() => router.push(NEW_CHILD_ROUTE)}>
            Opret barn
          </ActionButton>
        ) : (
          <Body style={styles.centerText}>
            Familiens ejer skal oprette den første børneprofil.
          </Body>
        )}
        <ActionButton variant="secondary" onPress={() => void onLogout()}>
          Log ud
        </ActionButton>
        {logoutError && <AccountError message={logoutError} />}
      </View>
    </Screen>
  );
}

function FixtureToday({
  bootstrap,
  logoutError,
  onLogout,
  onSelectChild,
  selectedChild,
}: {
  bootstrap: ParentBootstrap;
  logoutError: string | null;
  onLogout(): Promise<void>;
  onSelectChild(childId: string): void;
  selectedChild: ParentChild;
}) {
  const router = useRouter();
  const avatar = resolveChildAvatar(selectedChild.avatarSeed);

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.accountRow}>
        <View style={styles.accountCopy}>
          <Kicker>{bootstrap.family?.name}</Kicker>
          <Text style={styles.accountName}>
            {bootstrap.profile.displayName}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log forælderen ud"
          hitSlop={10}
          onPress={() => void onLogout()}
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.cardPressed,
          ]}
        >
          <Text style={styles.logoutText}>Log ud</Text>
        </Pressable>
      </View>
      {logoutError && <AccountError message={logoutError} />}

      {bootstrap.children.length > 1 && (
        <View style={styles.childPicker}>
          <Kicker>Vælg barn</Kicker>
          <View accessibilityRole="radiogroup" style={styles.childPickerRow}>
            {bootstrap.children.map((child) => (
              <Pressable
                key={child.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: child.id === selectedChild.id }}
                onPress={() => onSelectChild(child.id)}
                style={[
                  styles.childChoice,
                  child.id === selectedChild.id && styles.childChoiceSelected,
                ]}
              >
                <Text
                  style={[
                    styles.childChoiceText,
                    child.id === selectedChild.id &&
                      styles.childChoiceTextSelected,
                  ]}
                >
                  {child.displayName}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {bootstrap.family?.role === "owner" && bootstrap.children.length < 10 && (
        <ActionButton
          accessibilityLabel="Opret et barn mere i familien"
          variant="secondary"
          onPress={() => router.push(NEW_CHILD_ROUTE)}
        >
          ＋ Opret et barn mere
        </ActionButton>
      )}

      {bootstrap.family?.role === "owner" &&
        bootstrap.children.length >= 10 && (
          <Body style={styles.centerText}>
            Familien har nået grænsen på 10 aktive børneprofiler.
          </Body>
        )}

      <View style={styles.header}>
        <View>
          <Kicker>God eftermiddag</Kicker>
          <Title>Hej, {selectedChild.displayName}!</Title>
        </View>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${selectedChild.displayName}s avatar: ${avatar.label}`}
          style={styles.avatar}
        >
          <Text style={styles.avatarEmoji}>{avatar.symbol}</Text>
        </View>
      </View>

      <View style={styles.utilityRow}>
        <View style={styles.pointsPill}>
          <Text style={styles.pointsText}>
            Preview · ⭐ {demoChild.points} point
          </Text>
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

      <AiCartoonLabCard child={selectedChild} />

      <View style={styles.previewNote}>
        <Text style={styles.previewNoteText}>
          Valgt barn kommer fra Supabase · mål, øvelser og point er stadig
          preview
        </Text>
      </View>
    </Screen>
  );
}

function AiCartoonLabCard({ child }: { child: ParentChild }) {
  const router = useRouter();

  return (
    <SurfaceCard style={styles.aiLabCard}>
      <View style={styles.aiLabCopy}>
        <Kicker>Privat AI-portræt</Kicker>
        <Text style={styles.weekTitle}>
          Lav {child.displayName} som tegneseriefigur
        </Text>
        <Body>
          Vælg et billede. Portrættet gemmes privat og knyttes til{" "}
          {child.displayName}.
        </Body>
      </View>
      <ActionButton onPress={() => router.push(AI_CARTOON_ROUTE)}>
        Lav tegneserieportræt
      </ActionButton>
    </SurfaceCard>
  );
}

function AccountError({ message }: { message: string }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={styles.errorBox}
    >
      <Text style={styles.errorText}>{message}</Text>
    </View>
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
  onboardingScreen: {
    minHeight: 590,
    justifyContent: "center",
    gap: spacing.md,
  },
  centerText: { maxWidth: 380, textAlign: "center" },
  stateIcon: {
    width: 86,
    height: 86,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    backgroundColor: colors.softWarm,
  },
  stateEmoji: { fontSize: 42 },
  stateActions: { width: "100%", maxWidth: 360, gap: spacing.sm },
  formCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii["2xl"],
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  fieldGroup: { gap: spacing.xs },
  fieldLabel: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
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
  emptyNotice: {
    width: "100%",
    maxWidth: 380,
    gap: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.soft,
    padding: spacing.lg,
  },
  emptyNoticeTitle: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  accountCopy: { flex: 1 },
  accountName: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  logoutButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  logoutText: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  childPicker: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  childPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  childChoice: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
  },
  childChoiceSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  childChoiceText: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  childChoiceTextSelected: { color: colors.primaryDeep },
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
  aiLabCard: { gap: spacing.md },
  aiLabCopy: { gap: spacing.xs },
  previewNote: { alignItems: "center", marginTop: spacing.sm },
  previewNoteText: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.micro,
  },
});
