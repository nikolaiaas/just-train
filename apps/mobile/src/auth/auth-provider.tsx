import {
  completeAuthCallback,
  completeParentOnboarding,
  logout as logoutSession,
  onAuthSessionChange,
  requestEmailSignIn,
  restoreSession,
  verifyEmailOtp,
  type BareTraenAuthSession,
} from "@bare-traen/api-client";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import { parseMobileAuthCallbackUrl } from "./callback";
import { normalizeParentOnboarding, secondsUntilResend } from "./core";
import { attemptLogout } from "./logout";
import { createMobileAuthClient, type MobileAuthClient } from "./mobile-client";
import {
  loadParentBootstrap,
  type ParentBootstrap,
  type ParentChild,
} from "./parent-data";
import {
  canAcceptBootstrapResult,
  isCurrentBootstrapRequest,
  shouldApplyAuthSessionEvent,
  transitionSessionIdentity,
} from "./session-transition";

type AuthStatus = "loading" | "ready" | "configuration-error" | "error";
type BootstrapState =
  | { status: "idle"; data: null }
  | { status: "loading"; data: null }
  | { status: "error"; data: null }
  | { status: "ready"; data: ParentBootstrap };

type EmailFlow = {
  email: string;
  sentAt: number;
};

type AuthContextValue = {
  authNotice: string | null;
  authStatus: AuthStatus;
  bootstrap: BootstrapState;
  clearAuthNotice(): void;
  completeMagicLink(callbackUrl: string): Promise<void>;
  completeOnboarding(input: {
    displayName: string;
    familyName: string;
  }): Promise<void>;
  emailFlow: EmailFlow | null;
  logout(): Promise<void>;
  logoutError: string | null;
  refreshParent(): void;
  retryAuth(): void;
  requestEmail(email: string): Promise<void>;
  resendEmail(): Promise<void>;
  resetEmailFlow(): void;
  secondsUntilEmailResend(now?: number): number;
  selectChild(childId: string): void;
  selectedChild: ParentChild | null;
  session: BareTraenAuthSession | null;
  verifyCode(code: string): Promise<void>;
};

const GENERIC_CALLBACK_ERROR =
  "Loginlinket kunne ikke bruges. Prøv den sekscifrede kode eller bed om en ny mail.";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [mobileClient, setMobileClient] = useState<MobileAuthClient | null>(
    null,
  );
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<BareTraenAuthSession | null>(null);
  const [emailFlow, setEmailFlow] = useState<EmailFlow | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapState>({
    status: "idle",
    data: null,
  });
  const [bootstrapRevision, setBootstrapRevision] = useState(0);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [runtimeRevision, setRuntimeRevision] = useState(0);
  const emailRequestInFlight = useRef(false);
  const otpVerificationInFlight = useRef(false);
  const callbackState = useRef<"idle" | "processing" | "done">("idle");
  const bootstrapRequest = useRef(0);
  const currentSessionUserId = useRef<string | null>(null);
  const logoutAttemptInFlight = useRef(false);

  const applySession = useCallback(
    (nextSession: BareTraenAuthSession | null) => {
      const nextUserId = nextSession?.user.id ?? null;
      const transition = transitionSessionIdentity(
        {
          bootstrapRequestId: bootstrapRequest.current,
          userId: currentSessionUserId.current,
        },
        nextUserId,
      );

      bootstrapRequest.current = transition.bootstrapRequestId;
      currentSessionUserId.current = transition.userId;

      if (transition.userChanged) {
        setBootstrap({ status: "idle", data: null });
        setSelectedChildId(null);
      }

      setSession(nextSession);
    },
    [],
  );
  const sessionUserId = session?.user.id ?? null;

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (!active) {
        return;
      }

      try {
        setMobileClient(createMobileAuthClient());
      } catch {
        setAuthStatus("configuration-error");
      }
    });

    return () => {
      active = false;
    };
  }, [runtimeRevision]);

  useEffect(() => {
    if (!mobileClient) {
      return;
    }

    const client = mobileClient.client;
    let active = true;
    let authRevision = 0;
    let restorePending = true;
    const unsubscribe = onAuthSessionChange(client, (event, nextSession) => {
      if (
        !active ||
        logoutAttemptInFlight.current ||
        !shouldApplyAuthSessionEvent({ event, restorePending })
      ) {
        return;
      }

      authRevision += 1;
      applySession(nextSession);
      setAuthStatus("ready");
    });
    const restoreRevision = authRevision;

    void restoreSession(client)
      .then((restoredSession) => {
        restorePending = false;

        if (active && restoreRevision === authRevision) {
          applySession(restoredSession);
          setAuthStatus("ready");
        }
      })
      .catch(() => {
        restorePending = false;

        if (active && restoreRevision === authRevision) {
          applySession(null);
          setAuthStatus("error");
        }
      });

    let appStateSubscription: { remove(): void } | null = null;

    if (Platform.OS !== "web") {
      if (AppState.currentState === "active") {
        client.auth.startAutoRefresh();
      } else {
        client.auth.stopAutoRefresh();
      }

      appStateSubscription = AppState.addEventListener("change", (state) => {
        if (state === "active") {
          client.auth.startAutoRefresh();
        } else {
          client.auth.stopAutoRefresh();
        }
      });
    }

    return () => {
      active = false;
      unsubscribe();
      appStateSubscription?.remove();
      void client.auth
        .stopAutoRefresh()
        .catch(() => undefined)
        .then(() => client.auth.dispose())
        .catch(() => undefined);
    };
  }, [applySession, mobileClient]);

  useEffect(() => {
    const client = mobileClient?.client;

    if (authStatus !== "ready" || !client || !sessionUserId) {
      bootstrapRequest.current += 1;
      return;
    }

    const requestedUserId = sessionUserId;
    const requestId = bootstrapRequest.current + 1;
    bootstrapRequest.current = requestId;

    void Promise.resolve()
      .then(() => {
        if (
          isCurrentBootstrapRequest({
            activeRequestId: bootstrapRequest.current,
            currentUserId: currentSessionUserId.current,
            requestId,
            requestedUserId,
          })
        ) {
          setBootstrap({ status: "loading", data: null });
        }

        return loadParentBootstrap(client);
      })
      .then((data) => {
        if (
          canAcceptBootstrapResult({
            activeRequestId: bootstrapRequest.current,
            currentUserId: currentSessionUserId.current,
            profileId: data.profile.id,
            requestId,
            requestedUserId,
          })
        ) {
          setBootstrap({ status: "ready", data });
          setSelectedChildId((current) =>
            current && data.children.some((child) => child.id === current)
              ? current
              : (data.children[0]?.id ?? null),
          );
        } else if (
          isCurrentBootstrapRequest({
            activeRequestId: bootstrapRequest.current,
            currentUserId: currentSessionUserId.current,
            requestId,
            requestedUserId,
          })
        ) {
          setBootstrap({ status: "error", data: null });
        }
      })
      .catch(() => {
        if (
          isCurrentBootstrapRequest({
            activeRequestId: bootstrapRequest.current,
            currentUserId: currentSessionUserId.current,
            requestId,
            requestedUserId,
          })
        ) {
          setBootstrap({ status: "error", data: null });
        }
      });
  }, [authStatus, bootstrapRevision, mobileClient, sessionUserId]);

  const getClient = useCallback(() => {
    if (!mobileClient) {
      throw new Error("Login er ikke klar endnu.");
    }

    return mobileClient.client;
  }, [mobileClient]);

  const requestEmail = useCallback(
    async (email: string) => {
      if (emailRequestInFlight.current) {
        throw new Error("En loginmail er allerede ved at blive sendt.");
      }

      if (
        emailFlow &&
        email.trim().toLocaleLowerCase("da-DK") !==
          emailFlow.email.toLocaleLowerCase("da-DK")
      ) {
        throw new Error("Afslut den nuværende loginmail først.");
      }

      emailRequestInFlight.current = true;

      try {
        const result = await requestEmailSignIn(getClient(), {
          accountPolicy: "create-if-needed",
          email,
          redirectTo: mobileClient?.redirectTo ?? "",
        });

        callbackState.current = "idle";
        setAuthNotice(null);
        setEmailFlow({ email: result.email, sentAt: Date.now() });
      } finally {
        emailRequestInFlight.current = false;
      }
    },
    [emailFlow, getClient, mobileClient],
  );

  const resendEmail = useCallback(async () => {
    if (!emailFlow || secondsUntilResend(emailFlow.sentAt, Date.now()) > 0) {
      throw new Error("Loginmailen kan ikke sendes igen endnu.");
    }

    await requestEmail(emailFlow.email);
  }, [emailFlow, requestEmail]);

  const verifyCode = useCallback(
    async (code: string) => {
      if (!emailFlow || otpVerificationInFlight.current) {
        throw new Error("Engangskoden kan ikke kontrolleres endnu.");
      }

      otpVerificationInFlight.current = true;

      try {
        const verifiedSession = await verifyEmailOtp(getClient(), {
          code,
          email: emailFlow.email,
        });
        setAuthNotice(null);
        setLogoutError(null);
        setEmailFlow(null);
        applySession(verifiedSession);
        setAuthStatus("ready");
      } finally {
        otpVerificationInFlight.current = false;
      }
    },
    [applySession, emailFlow, getClient],
  );

  const completeMagicLink = useCallback(
    async (callbackUrl: string) => {
      if (callbackState.current !== "idle") {
        throw new Error("Loginlinket er allerede behandlet.");
      }

      callbackState.current = "processing";

      try {
        const parsed = parseMobileAuthCallbackUrl({
          callbackUrl,
          expectedRedirectTo: mobileClient?.redirectTo ?? "",
        });
        const completedSession = await completeAuthCallback(
          getClient(),
          parsed,
        );

        callbackState.current = "done";
        setAuthNotice(null);
        setLogoutError(null);
        setEmailFlow(null);
        applySession(completedSession);
        setAuthStatus("ready");
      } catch (error) {
        callbackState.current = "done";
        setAuthNotice(GENERIC_CALLBACK_ERROR);
        throw error;
      }
    },
    [applySession, getClient, mobileClient],
  );

  const completeOnboarding = useCallback(
    async (input: { displayName: string; familyName: string }) => {
      const normalized = normalizeParentOnboarding(input);

      await completeParentOnboarding(getClient(), normalized);
      setBootstrapRevision((revision) => revision + 1);
    },
    [getClient],
  );

  const logout = useCallback(async () => {
    setLogoutError(null);

    if (!mobileClient || logoutAttemptInFlight.current) {
      setLogoutError("Vi kunne ikke logge dig sikkert ud. Prøv igen.");
      return;
    }

    const client = mobileClient.client;
    logoutAttemptInFlight.current = true;
    const result = await attemptLogout({
      clearStoredSession: mobileClient.clearStoredSession,
      pausePersistence: () => client.auth.stopAutoRefresh(),
      resumePersistence: () => {
        if (Platform.OS === "web" || AppState.currentState === "active") {
          return client.auth.startAutoRefresh();
        }

        return Promise.resolve();
      },
      signOut: () => logoutSession(client),
    });
    logoutAttemptInFlight.current = false;

    if (result === "failed") {
      setLogoutError("Vi kunne ikke logge dig sikkert ud. Prøv igen.");
      return;
    }

    const logoutWarning =
      result === "local-only"
        ? "Du er logget ud på denne enhed. Vi kunne ikke bekræfte log ud hos serveren."
        : null;

    if (result === "local-only") {
      await client.auth.dispose().catch(() => undefined);
      setAuthStatus("loading");
      setMobileClient(null);
      setRuntimeRevision((revision) => revision + 1);
    }

    setEmailFlow(null);
    setAuthNotice(logoutWarning);
    setLogoutError(null);
    callbackState.current = "idle";
    applySession(null);

    if (result === "signed-out") {
      setAuthStatus("ready");
    }
  }, [applySession, mobileClient]);

  const retryAuth = useCallback(() => {
    setAuthStatus("loading");
    setMobileClient(null);
    applySession(null);
    setRuntimeRevision((revision) => revision + 1);
  }, [applySession]);

  const selectChild = useCallback(
    (childId: string) => {
      if (
        bootstrap.status !== "ready" ||
        !bootstrap.data.children.some((child) => child.id === childId)
      ) {
        return;
      }

      setSelectedChildId(childId);
    },
    [bootstrap],
  );

  const selectedChild = useMemo(() => {
    if (bootstrap.status !== "ready") {
      return null;
    }

    return (
      bootstrap.data.children.find((child) => child.id === selectedChildId) ??
      null
    );
  }, [bootstrap, selectedChildId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authNotice,
      authStatus,
      bootstrap,
      clearAuthNotice: () => setAuthNotice(null),
      completeMagicLink,
      completeOnboarding,
      emailFlow,
      logout,
      logoutError,
      refreshParent: () => setBootstrapRevision((revision) => revision + 1),
      retryAuth,
      requestEmail,
      resendEmail,
      resetEmailFlow: () => {
        setEmailFlow(null);
        setAuthNotice(null);
      },
      secondsUntilEmailResend: (now = Date.now()) =>
        emailFlow ? secondsUntilResend(emailFlow.sentAt, now) : 0,
      selectChild,
      selectedChild,
      session,
      verifyCode,
    }),
    [
      authNotice,
      authStatus,
      bootstrap,
      completeMagicLink,
      completeOnboarding,
      emailFlow,
      logout,
      logoutError,
      requestEmail,
      resendEmail,
      retryAuth,
      selectChild,
      selectedChild,
      session,
      verifyCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
