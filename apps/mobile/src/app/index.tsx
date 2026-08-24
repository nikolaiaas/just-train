import { colors, radii, spacing, typography } from "@bare-traen/design";
import type { ChildTrainingCatalog } from "@bare-traen/api-client";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
import {
  ActionButton,
  Body,
  Kicker,
  ProgressBar,
  Screen,
  SurfaceCard,
  Title,
} from "@/components/bare-ui";
import { ChildChooser } from "@/components/child-chooser";
import { ChildProfileAvatar } from "@/components/child-profile-avatar";
import {
  formatExerciseTarget,
  formatProgressCopy,
  getNextTrainingStep,
  groupTrainingSubjects,
} from "@/training/core";

const NEW_CHILD_ROUTE = "/child/new" as Href;
const PROFILE_ROUTE = "/profile" as Href;
const TOPICS_ROUTE = "/topics" as Href;
const TOPIC_ROUTE = "/topics/[topicId]" as Href;
const GOAL_ROUTE = "/goals/[goalId]" as Href;
const TRAINING_ROUTE = "/training/[exerciseId]" as Href;

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

  if (bootstrap.data.children.length === 0) {
    return (
      <NoChildren
        bootstrap={bootstrap.data}
        logoutError={logoutError}
        onLogout={logout}
      />
    );
  }

  if (!selectedChild) {
    return (
      <ChooseChild
        bootstrap={bootstrap.data}
        logoutError={logoutError}
        onLogout={logout}
        onSelectChild={selectChild}
      />
    );
  }

  return <LiveToday key={selectedChild.id} selectedChild={selectedChild} />;
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

function ChooseChild({
  bootstrap,
  logoutError,
  onLogout,
  onSelectChild,
}: {
  bootstrap: ParentBootstrap;
  logoutError: string | null;
  onLogout(): Promise<void>;
  onSelectChild(childId: string): void;
}) {
  const router = useRouter();

  return (
    <Screen contentStyle={styles.chooseChildScreen}>
      <View style={styles.stateIcon}>
        <Text style={styles.stateEmoji}>👋</Text>
      </View>
      <View style={styles.chooseChildHeading}>
        <Kicker>{bootstrap.family?.name}</Kicker>
        <Title style={styles.centerText}>Hvem skal træne?</Title>
        <Body style={styles.centerText}>
          Vælg én profil. Derefter åbner appen direkte for barnet. Du kan altid
          vælge en anden under Min profil.
        </Body>
      </View>

      <View style={styles.childChoiceList}>
        <ChildChooser onChoose={onSelectChild} profiles={bootstrap.children} />
      </View>

      <View style={styles.parentChoiceActions}>
        {bootstrap.family?.role === "owner" &&
          bootstrap.children.length < 10 && (
            <ActionButton
              variant="secondary"
              onPress={() => router.push(NEW_CHILD_ROUTE)}
            >
              ＋ Opret et barn mere
            </ActionButton>
          )}
        <ActionButton variant="secondary" onPress={() => void onLogout()}>
          Log ud
        </ActionButton>
        {logoutError && <AccountError message={logoutError} />}
      </View>
    </Screen>
  );
}

type TodayTrainingState =
  | { status: "loading"; catalog: null }
  | { status: "error"; catalog: null }
  | { status: "ready"; catalog: ChildTrainingCatalog };

function LiveToday({ selectedChild }: { selectedChild: ParentChild }) {
  const router = useRouter();
  const { loadSelectedChildTrainingCatalog } = useAuth();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<TodayTrainingState>({
    status: "loading",
    catalog: null,
  });

  useFocusEffect(
    useCallback(() => {
      void revision;
      let active = true;

      void loadSelectedChildTrainingCatalog()
        .then((catalog) => {
          if (active) setState({ status: "ready", catalog });
        })
        .catch(() => {
          if (active) setState({ status: "error", catalog: null });
        });

      return () => {
        active = false;
      };
    }, [loadSelectedChildTrainingCatalog, revision]),
  );

  function retry() {
    setState({ status: "loading", catalog: null });
    setRevision((current) => current + 1);
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Kicker>God eftermiddag</Kicker>
          <Title>Hej, {selectedChild.displayName}!</Title>
        </View>
        <Pressable
          accessibilityHint="Åbner profil og familiemenu"
          accessibilityLabel={`Åbn Min profil for ${selectedChild.displayName}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push(PROFILE_ROUTE)}
          style={({ pressed }) => [
            styles.avatarButton,
            pressed && styles.cardPressed,
          ]}
        >
          <ChildProfileAvatar child={selectedChild} decorative size={58} />
          <Text style={styles.avatarMenuText}>Min profil</Text>
        </Pressable>
      </View>

      {state.status === "loading" && (
        <SurfaceCard style={styles.trainingStateCard}>
          <ActivityIndicator color={colors.primaryDeep} size="large" />
          <Body>Finder din næste øvelse…</Body>
        </SurfaceCard>
      )}

      {state.status === "error" && (
        <SurfaceCard style={styles.trainingStateCard}>
          <Text style={styles.stateEmoji}>🌧️</Text>
          <Text style={styles.weekTitle}>Træningen kunne ikke hentes</Text>
          <Body style={styles.centerText}>
            Kontrollér forbindelsen, og prøv igen. Vi viser ikke et
            eksempel-forløb i stedet.
          </Body>
          <ActionButton onPress={retry}>Prøv igen</ActionButton>
        </SurfaceCard>
      )}

      {state.status === "ready" && (
        <TodayTraining
          catalog={state.catalog}
          childName={selectedChild.displayName}
        />
      )}

      <TopicsCard child={selectedChild} />
    </Screen>
  );
}

function TodayTraining({
  catalog,
  childName,
}: {
  catalog: ChildTrainingCatalog;
  childName: string;
}) {
  const router = useRouter();
  const next = getNextTrainingStep(catalog.subjects);

  if (catalog.subjects.length === 0) {
    return (
      <SurfaceCard style={styles.trainingStateCard}>
        <Text style={styles.stateEmoji}>🌱</Text>
        <Text style={styles.weekTitle}>Der kommer snart noget at øve</Text>
        <Body style={styles.centerText}>
          Der er ingen udgivne emner endnu. Prøv igen senere.
        </Body>
      </SurfaceCard>
    );
  }

  const { enrolled } = groupTrainingSubjects(catalog.subjects);
  if (enrolled.length === 0) {
    return (
      <SurfaceCard style={styles.trainingStateCard}>
        <Text style={styles.stateEmoji}>🌟</Text>
        <Text style={styles.weekTitle}>Vælg dit første emne</Text>
        <Body style={styles.centerText}>
          Du bestemmer selv, hvad du vil øve. Åbn et udgivet emne, og vælg det
          til dig selv.
        </Body>
        <ActionButton onPress={() => router.push(TOPICS_ROUTE)}>
          Vælg et emne
        </ActionButton>
      </SurfaceCard>
    );
  }

  const selectedGoals = enrolled.flatMap((subject) =>
    subject.goals
      .filter((goal) => goal.isSelected)
      .map((goal) => ({ goal, subject })),
  );
  if (selectedGoals.length === 0) {
    const firstSubject = enrolled[0];
    return (
      <SurfaceCard style={styles.trainingStateCard}>
        <Text style={styles.stateEmoji}>🎯</Text>
        <Text style={styles.weekTitle}>Vælg et mål</Text>
        <Body style={styles.centerText}>
          Du har valgt {firstSubject.title}. Vælg nu et mål, så vi kan finde din
          næste øvelse.
        </Body>
        <ActionButton
          onPress={() =>
            router.push({
              pathname: TOPIC_ROUTE,
              params: { topicId: firstSubject.id },
            } as Href)
          }
        >
          Se mål i {firstSubject.title}
        </ActionButton>
      </SurfaceCard>
    );
  }

  const selectedExercises = selectedGoals.flatMap(({ goal }) =>
    goal.exercises.map((exercise) => exercise),
  );
  if (selectedExercises.length === 0) {
    return (
      <SurfaceCard style={styles.trainingStateCard}>
        <Text style={styles.stateEmoji}>🌱</Text>
        <Text style={styles.weekTitle}>Øvelserne er på vej</Text>
        <Body style={styles.centerText}>
          Dit valgte mål har ingen øvelser endnu. Du kan vælge et andet mål,
          mens du venter.
        </Body>
        <ActionButton onPress={() => router.push(TOPICS_ROUTE)}>
          Se mine emner
        </ActionButton>
      </SurfaceCard>
    );
  }

  return (
    <>
      <SurfaceCard style={styles.goalCard}>
        <View style={styles.goalHeading}>
          <View style={styles.goalHeadingCopy}>
            <Kicker>Din fremgang</Kicker>
            <Text style={styles.goalTitle}>
              {formatProgressCopy(catalog.overallProgress)}
            </Text>
          </View>
          <Text style={styles.progressPercent}>
            {catalog.overallProgress.percentage}%
          </Text>
        </View>
        <ProgressBar value={catalog.overallProgress.percentage} />
      </SurfaceCard>

      {next ? (
        <View style={styles.missionCard}>
          <View
            style={[
              styles.ballHalo,
              next.subject.accentColor
                ? { backgroundColor: `${next.subject.accentColor}18` }
                : null,
            ]}
          >
            <Text style={styles.ball}>{next.subject.icon ?? "★"}</Text>
          </View>
          <Kicker>
            Næste øvelse · {next.subject.title} · {next.goal.title}
          </Kicker>
          <Title style={styles.missionTitle}>{next.exercise.title}</Title>
          <Body style={styles.missionCopy}>{next.exercise.instructions}</Body>
          <Text style={styles.timePill}>
            {formatExerciseTarget(next.exercise)}
            {next.exercise.estimatedMinutes
              ? ` · cirka ${next.exercise.estimatedMinutes} min.`
              : ""}
          </Text>
          <View style={styles.encouragement}>
            <Text style={styles.encouragementText}>
              Det behøver ikke være perfekt — bare prøv.
            </Text>
          </View>
          <ActionButton
            onPress={() =>
              router.push({
                pathname: TRAINING_ROUTE,
                params: {
                  exerciseId: next.exercise.id,
                  goalId: next.goal.id,
                  subjectId: next.subject.id,
                },
              } as Href)
            }
          >
            Start {next.exercise.title}
          </ActionButton>
          <ActionButton
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: GOAL_ROUTE,
                params: {
                  goalId: next.goal.id,
                  subjectId: next.subject.id,
                },
              } as Href)
            }
          >
            Se alle øvelser i målet
          </ActionButton>
        </View>
      ) : (
        <SurfaceCard style={styles.trainingStateCard}>
          <Text style={styles.stateEmoji}>🏆</Text>
          <Text style={styles.weekTitle}>Alle øvelser er klaret!</Text>
          <Body style={styles.centerText}>
            Flot trænet, {childName}. Du kan altid øve en favorit igen.
          </Body>
        </SurfaceCard>
      )}
    </>
  );
}

function TopicsCard({ child }: { child: ParentChild }) {
  const router = useRouter();

  return (
    <SurfaceCard style={styles.aiLabCard}>
      <View style={styles.aiLabCopy}>
        <Kicker>Vælg emne</Kicker>
        <Text style={styles.weekTitle}>Hvad vil {child.displayName} øve?</Text>
        <Body>
          Vælg mellem de udgivne emner. Til hvert emne kan du selv lave et
          privat billede, der passer til tøjet og udstyret.
        </Body>
      </View>
      <ActionButton onPress={() => router.push(TOPICS_ROUTE)}>
        Se alle emner
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
  chooseChildScreen: {
    minHeight: 590,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  chooseChildHeading: { alignItems: "center", gap: spacing.xs },
  childChoiceList: { width: "100%", maxWidth: 400 },
  parentChoiceActions: { width: "100%", maxWidth: 400, gap: spacing.sm },
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerCopy: { flex: 1 },
  avatarButton: {
    minWidth: 68,
    minHeight: 76,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  avatarMenuText: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.bold,
  },
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
  progressPercent: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.cardTitle,
    fontWeight: typography.weights.bold,
  },
  trainingStateCard: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
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
