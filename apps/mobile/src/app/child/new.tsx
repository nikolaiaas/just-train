import { colors, radii, spacing, typography } from "@bare-traen/design";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/auth/auth-provider";
import {
  CHILD_AVATAR_OPTIONS,
  acquireChildCreationAttempt,
  childSetupErrorMessage,
  normalizeChildSetup,
  normalizedSetupFromPending,
  pendingChildCreationMatchesContext,
  shouldRetainPendingChildCreation,
  type ChildAvatarPreset,
  type NormalizedChildSetup,
  type PendingChildCreation,
} from "@/children/child-setup";
import {
  ActionButton,
  BackButton,
  Body,
  Kicker,
  Screen,
  Title,
} from "@/components/bare-ui";

export default function NewChildScreen() {
  const router = useRouter();
  const {
    bootstrap,
    pendingChildCreation,
    pendingChildCreationStatus,
    refreshParent,
    retryPendingChildCreation,
  } = useAuth();

  if (bootstrap.status === "idle" || bootstrap.status === "loading") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ActivityIndicator color={colors.primaryDeep} size="large" />
        <Title style={styles.centerText}>Henter familien…</Title>
        <Body style={styles.centerText}>
          Vi kontrollerer, at din forælderkonto må oprette profilen.
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
          Kontrollér forbindelsen, og prøv at hente familien igen.
        </Body>
        <View style={styles.stateActions}>
          <ActionButton onPress={refreshParent}>Prøv igen</ActionButton>
          <ActionButton variant="secondary" onPress={() => router.replace("/")}>
            Gå til familien
          </ActionButton>
        </View>
      </Screen>
    );
  }

  if (!bootstrap.data.family) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>🏡</Text>
        <Title style={styles.centerText}>Opret familien først</Title>
        <Body style={styles.centerText}>
          En børneprofil skal altid høre til den indloggede voksnes familie.
        </Body>
        <View style={styles.stateActions}>
          <ActionButton onPress={() => router.replace("/")}>
            Gå til familieopsætning
          </ActionButton>
        </View>
      </Screen>
    );
  }

  if (bootstrap.data.family.role !== "owner") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>🛡️</Text>
        <Title style={styles.centerText}>Familiens ejer skal gøre det</Title>
        <Body style={styles.centerText}>
          Kun en ejer af familien kan oprette en ny børneprofil og give den
          nødvendige bekræftelse.
        </Body>
        <View style={styles.stateActions}>
          <ActionButton variant="secondary" onPress={() => router.replace("/")}>
            Gå tilbage
          </ActionButton>
        </View>
      </Screen>
    );
  }

  if (pendingChildCreationStatus === "loading") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <ActivityIndicator color={colors.primaryDeep} size="large" />
        <Title style={styles.centerText}>Kontrollerer tidligere forsøg…</Title>
        <Body style={styles.centerText}>
          Vi sikrer, at en afbrudt oprettelse ikke bliver gentaget.
        </Body>
      </Screen>
    );
  }

  if (pendingChildCreationStatus === "error") {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>🔐</Text>
        <Title style={styles.centerText}>
          Det sikre lager kunne ikke læses
        </Title>
        <Body style={styles.centerText}>
          Vi starter ikke en ny oprettelse, før et tidligere forsøg kan
          kontrolleres sikkert.
        </Body>
        <View style={styles.stateActions}>
          <ActionButton onPress={retryPendingChildCreation}>
            Prøv igen
          </ActionButton>
          <ActionButton variant="secondary" onPress={() => router.replace("/")}>
            Gå til familien
          </ActionButton>
        </View>
      </Screen>
    );
  }

  const family = bootstrap.data.family;
  const profileId = bootstrap.data.profile.id;
  const pendingMatchesContext = pendingChildCreationMatchesContext(
    pendingChildCreation,
    { familyId: family.id, userId: profileId },
  );

  if (!pendingMatchesContext) {
    return (
      <Screen contentStyle={styles.stateScreen}>
        <Text style={styles.stateEmoji}>🛡️</Text>
        <Title style={styles.centerText}>
          Et tidligere forsøg skal afklares
        </Title>
        <Body style={styles.centerText}>
          Vi bruger ikke oplysninger fra en anden konto eller familie til en ny
          børneprofil. Gå tilbage til familien, og prøv igen senere.
        </Body>
        <View style={styles.stateActions}>
          <ActionButton variant="secondary" onPress={() => router.replace("/")}>
            Gå til familien
          </ActionButton>
        </View>
      </Screen>
    );
  }

  const compatiblePending =
    pendingChildCreation?.userId === profileId &&
    pendingChildCreation.familyId === family.id
      ? pendingChildCreation
      : null;

  return (
    <NewChildForm
      key={`${profileId}:${family.id}`}
      familyName={family.name}
      pending={compatiblePending}
    />
  );
}

function NewChildForm({
  familyName,
  pending,
}: {
  familyName: string;
  pending: PendingChildCreation | null;
}) {
  const router = useRouter();
  const { createChild } = useAuth();
  const [creationRequestId] = useState(
    () => pending?.creationRequestId ?? randomUUID(),
  );
  const [displayName, setDisplayName] = useState(
    () => pending?.displayName ?? "",
  );
  const [avatarSeed, setAvatarSeed] = useState<ChildAvatarPreset | null>(
    () => pending?.avatarSeed ?? null,
  );
  const [consentGranted, setConsentGranted] = useState(
    () => pending?.consentGranted ?? false,
  );
  const [submittedInput, setSubmittedInput] =
    useState<NormalizedChildSetup | null>(() =>
      normalizedSetupFromPending(pending),
    );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitInFlight = useRef(false);
  const formLocked = busy || submittedInput !== null;

  async function submit() {
    const releaseAttempt = acquireChildCreationAttempt(submitInFlight);

    if (!releaseAttempt) {
      return;
    }
    setError(null);

    try {
      let normalized = submittedInput;

      if (!normalized) {
        try {
          normalized = normalizeChildSetup({
            avatarSeed,
            consentGranted,
            displayName,
          });
        } catch (validationError) {
          setError(childSetupErrorMessage(validationError));
          return;
        }

        setSubmittedInput(normalized);
      }

      setBusy(true);

      try {
        await createChild({
          ...normalized,
          creationRequestId,
        });
        router.replace("/");
      } catch (creationError) {
        if (!shouldRetainPendingChildCreation(creationError)) {
          setSubmittedInput(null);
        }

        setError(childSetupErrorMessage(creationError));
      } finally {
        setBusy(false);
      }
    } finally {
      releaseAttempt();
    }
  }

  return (
    <Screen contentStyle={styles.screen}>
      <BackButton disabled={busy} onPress={() => router.back()} />
      <Kicker>Nyt barn · {familyName}</Kicker>
      <Title>Opret en børneprofil</Title>
      <Body>
        Tilføj kun det navn, I vil se i appen. Barnet får hverken e-mail,
        adgangskode eller sit eget login.
      </Body>

      <View style={styles.formCard}>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Barnets fornavn eller kaldenavn</Text>
          <TextInput
            accessibilityLabel="Barnets fornavn eller kaldenavn"
            autoCapitalize="words"
            autoComplete="off"
            editable={!formLocked}
            onChangeText={(value) => {
              setDisplayName(value);
              setError(null);
            }}
            onSubmitEditing={() => void submit()}
            placeholder="For eksempel Alex"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            style={styles.input}
            textContentType="none"
            value={displayName}
          />
          <Text style={styles.fieldHelp}>
            Brug kun det navn eller kaldenavn, I vil vise under træningen.
          </Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Vælg en avatar</Text>
          <Text style={styles.fieldHelp}>
            Vælg mellem fire symboler. Vi bruger ikke et foto.
          </Text>
          <View
            accessibilityLabel="Vælg en avatar til barnet"
            accessibilityRole="radiogroup"
            style={styles.avatarGrid}
          >
            {CHILD_AVATAR_OPTIONS.map((option) => {
              const selected = avatarSeed === option.id;

              return (
                <Pressable
                  key={option.id}
                  accessibilityHint={`Vælger ${option.label} som barnets avatar`}
                  accessibilityLabel={`${option.label}-avatar`}
                  accessibilityRole="radio"
                  accessibilityState={{ disabled: formLocked, selected }}
                  disabled={formLocked}
                  onPress={() => {
                    setAvatarSeed(option.id);
                    setError(null);
                  }}
                  style={({ pressed }) => [
                    styles.avatarOption,
                    selected && styles.avatarOptionSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.avatarSymbol}>{option.symbol}</Text>
                  <Text
                    style={[
                      styles.avatarLabel,
                      selected && styles.avatarLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.avatarCheck}>
                    {selected ? "Valgt ✓" : "Vælg"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>Det gemmer vi</Text>
          <Body>
            Navn eller kaldenavn, valgt avatar, familie og hvem der oprettede
            profilen. Bekræftelsen omfatter ikke foto, video, mikrofon,
            AI-behandling eller et selvstændigt login.
          </Body>
        </View>

        <Pressable
          accessibilityLabel="Jeg bekræfter, at jeg er forælder eller værge, og at denne børneprofil må oprettes med navn eller kaldenavn og valgt avatar"
          accessibilityRole="checkbox"
          accessibilityState={{
            checked: consentGranted,
            disabled: formLocked,
          }}
          disabled={formLocked}
          onPress={() => {
            setConsentGranted((current) => !current);
            setError(null);
          }}
          style={({ pressed }) => [
            styles.consentRow,
            consentGranted && styles.consentRowChecked,
            pressed && styles.pressed,
          ]}
        >
          <View
            importantForAccessibility="no-hide-descendants"
            style={[styles.checkbox, consentGranted && styles.checkboxChecked]}
          >
            <Text style={styles.checkboxMark}>{consentGranted ? "✓" : ""}</Text>
          </View>
          <Text style={styles.consentText}>
            Jeg bekræfter, at jeg er forælder eller værge, og at denne
            børneprofil må oprettes med navn eller kaldenavn og valgt avatar.
          </Text>
        </Pressable>

        {submittedInput && (
          <View style={styles.retryNotice}>
            <Text style={styles.retryNoticeTitle}>Samme sikre forsøg</Text>
            <Body>
              Hvis forbindelsen afbrydes, genbruger vi de samme oplysninger og
              den samme anmodning, så der ikke oprettes en dublet.
            </Body>
          </View>
        )}

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
          accessibilityLabel={
            busy
              ? "Opretter børneprofil"
              : submittedInput
                ? "Prøv at oprette børneprofilen igen"
                : "Opret børneprofil"
          }
          disabled={busy}
          onPress={() => void submit()}
        >
          {busy
            ? "Opretter børneprofil…"
            : submittedInput
              ? "Prøv oprettelsen igen"
              : "Opret børneprofil"}
        </ActionButton>
        <ActionButton
          disabled={busy}
          variant="secondary"
          onPress={() => router.back()}
        >
          Annuller
        </ActionButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    minHeight: 690,
    justifyContent: "center",
    gap: spacing.md,
  },
  stateScreen: {
    minHeight: 500,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  centerText: { maxWidth: 380, textAlign: "center" },
  stateEmoji: { fontSize: 42 },
  stateActions: { width: "100%", maxWidth: 360, gap: spacing.sm },
  formCard: {
    gap: spacing.lg,
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
  fieldHelp: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.label,
    lineHeight: 16,
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
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  avatarOption: {
    minWidth: 118,
    minHeight: 112,
    flexGrow: 1,
    flexBasis: "46%",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.page,
    padding: spacing.md,
  },
  avatarOptionSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  avatarSymbol: { fontSize: 36 },
  avatarLabel: {
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  avatarLabelSelected: { color: colors.primaryDeep },
  avatarCheck: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    fontWeight: typography.weights.semibold,
  },
  noticeBox: {
    gap: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.softWarm,
    padding: spacing.md,
  },
  noticeTitle: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  retryNotice: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.page,
    padding: spacing.md,
  },
  retryNoticeTitle: {
    color: colors.navy,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  consentRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  consentRowChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  checkbox: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.muted,
    borderRadius: radii.xs,
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkboxMark: {
    color: colors.onPrimary,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.bold,
  },
  consentText: {
    flex: 1,
    color: colors.ink,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
    lineHeight: 19,
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
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
