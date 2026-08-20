import { colors, radii, spacing, typography } from "@bare-traen/design";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/auth/auth-provider";
import {
  ActionButton,
  Body,
  Kicker,
  Screen,
  Title,
} from "@/components/bare-ui";

type LoginAction = "send" | "verify" | "resend" | null;

export default function LoginScreen() {
  const router = useRouter();
  const {
    authNotice,
    clearAuthNotice,
    emailFlow,
    requestEmail,
    resendEmail,
    resetEmailFlow,
    secondsUntilEmailResend,
    verifyCode,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [action, setAction] = useState<LoginAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!emailFlow) {
      return;
    }

    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [emailFlow]);

  const resendSeconds = useMemo(
    () => secondsUntilEmailResend(now),
    [now, secondsUntilEmailResend],
  );

  async function sendEmail() {
    setAction("send");
    setError(null);
    clearAuthNotice();

    try {
      await requestEmail(email);
      setCode("");
      setNow(Date.now());
    } catch {
      setError("Vi kunne ikke sende loginmailen. Prøv igen om lidt.");
    } finally {
      setAction(null);
    }
  }

  async function submitCode() {
    setAction("verify");
    setError(null);

    try {
      await verifyCode(code);
      router.replace("/");
    } catch {
      setError(
        "Koden kunne ikke bruges. Kontrollér de seks cifre, og prøv igen.",
      );
    } finally {
      setAction(null);
    }
  }

  async function resend() {
    setAction("resend");
    setError(null);

    try {
      await resendEmail();
      setNow(Date.now());
    } catch {
      setError("Vi kunne ikke sende en ny mail. Prøv igen om lidt.");
    } finally {
      setAction(null);
    }
  }

  function changeEmail() {
    resetEmailFlow();
    setCode("");
    setError(null);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <Screen contentStyle={styles.screen}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="Stjerne"
          style={styles.logo}
        >
          <Text style={styles.logoText}>⭐</Text>
        </View>
        <View style={styles.heading}>
          <Kicker>Forælder-login</Kicker>
          <Title style={styles.centerText}>Velkommen til Bare Træn</Title>
          <Body style={styles.centerText}>
            Du behøver aldrig en adgangskode. Vi sender en sikker loginmail med
            både et link og en sekscifret engangskode.
          </Body>
        </View>

        <View style={styles.card}>
          {!emailFlow ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Din e-mail</Text>
                <TextInput
                  accessibilityLabel="Din e-mail"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={action === null}
                  enterKeyHint="send"
                  importantForAutofill="yes"
                  inputMode="email"
                  keyboardType="email-address"
                  onChangeText={(value) => {
                    setEmail(value);
                    setError(null);
                  }}
                  onSubmitEditing={() => void sendEmail()}
                  placeholder="navn@eksempel.dk"
                  placeholderTextColor={colors.muted}
                  returnKeyType="send"
                  style={styles.input}
                  textContentType="emailAddress"
                  value={email}
                />
              </View>
              <ActionButton
                disabled={action !== null || email.trim().length === 0}
                onPress={() => void sendEmail()}
              >
                {action === "send" ? "Sender loginmail…" : "Send loginmail"}
              </ActionButton>
              <Body style={styles.helpText}>
                Hvis e-mailen ikke har været brugt før, oprettes din
                forælderkonto automatisk. Børn får ikke deres egen login-konto i
                denne version.
              </Body>
            </>
          ) : (
            <>
              <View style={styles.sentBox}>
                <Text style={styles.sentTitle}>Mailen er sendt</Text>
                <Body>
                  Åbn loginlinket på denne enhed, eller skriv de seks cifre fra
                  mailen her.
                </Body>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Seks cifre</Text>
                <TextInput
                  accessibilityLabel="Seks cifre fra loginmailen"
                  autoComplete="one-time-code"
                  editable={action === null}
                  enterKeyHint="done"
                  importantForAutofill="yes"
                  inputMode="numeric"
                  keyboardType="number-pad"
                  maxLength={12}
                  onChangeText={(value) => {
                    setCode(value.replace(/[^0-9]/g, "").slice(0, 6));
                    setError(null);
                  }}
                  onSubmitEditing={() => void submitCode()}
                  placeholder="000000"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  style={[styles.input, styles.codeInput]}
                  textContentType="oneTimeCode"
                  value={code}
                />
              </View>
              <ActionButton
                disabled={action !== null || code.length !== 6}
                onPress={() => void submitCode()}
              >
                {action === "verify" ? "Logger ind…" : "Log ind med kode"}
              </ActionButton>
              <View style={styles.secondaryActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: action !== null || resendSeconds > 0,
                  }}
                  disabled={action !== null || resendSeconds > 0}
                  onPress={() => void resend()}
                  style={({ pressed }) => [
                    styles.textButton,
                    (action !== null || resendSeconds > 0) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.textButtonLabel}>
                    {resendSeconds > 0
                      ? `Send igen om ${resendSeconds} sek.`
                      : action === "resend"
                        ? "Sender igen…"
                        : "Send mailen igen"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={action !== null}
                  onPress={changeEmail}
                  style={({ pressed }) => [
                    styles.textButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.textButtonLabel}>
                    Brug en anden e-mail
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {(error || authNotice) && (
            <View
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              style={styles.errorBox}
            >
              <Text style={styles.errorText}>{error ?? authNotice}</Text>
            </View>
          )}

          {action !== null && (
            <ActivityIndicator
              accessibilityLabel="Arbejder"
              color={colors.primaryDeep}
            />
          )}
        </View>

        <Text style={styles.privacyNote}>
          Login gælder den voksne. Børneprofiler oprettes og vælges bagefter.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  screen: { minHeight: 610, justifyContent: "center", gap: spacing.lg },
  logo: {
    width: 76,
    height: 76,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    backgroundColor: colors.softWarm,
  },
  logoText: { fontSize: 38 },
  heading: { alignItems: "center", gap: spacing.sm },
  centerText: { textAlign: "center" },
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii["2xl"],
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  fieldGroup: { gap: spacing.xs },
  label: {
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
  codeInput: {
    fontSize: 24,
    fontVariant: ["tabular-nums"],
    letterSpacing: 8,
    textAlign: "center",
  },
  helpText: { fontSize: typography.sizes.caption, textAlign: "center" },
  sentBox: {
    gap: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.soft,
    padding: spacing.md,
  },
  sentTitle: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
  },
  secondaryActions: { alignItems: "center", gap: spacing.xs },
  textButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  textButtonLabel: {
    color: colors.primaryDeep,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.bold,
    textAlign: "center",
  },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.68 },
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
  privacyNote: {
    color: colors.muted,
    fontFamily: typography.families.systemRounded,
    fontSize: typography.sizes.caption,
    textAlign: "center",
  },
});
