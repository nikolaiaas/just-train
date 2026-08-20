import { colors } from "@bare-traen/design";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { AuthProvider, useAuth } from "@/auth/auth-provider";
import {
  AuthRestoreErrorScreen,
  AuthSetupErrorScreen,
  LoadingAuthScreen,
} from "@/components/auth-state";

function ProtectedStack() {
  const router = useRouter();
  const segments = useSegments();
  const { authStatus, retryAuth, session } = useAuth();
  const firstSegment = segments[0];
  const isLoginRoute = firstSegment === "login" && segments.length === 1;
  const isCallbackRoute =
    firstSegment === "auth" &&
    segments[1] === "callback" &&
    segments.length === 2;
  const isPublicRoute = isLoginRoute || isCallbackRoute;

  useEffect(() => {
    if (authStatus !== "ready") {
      return;
    }

    if (!session && !isPublicRoute) {
      router.replace("/login");
    } else if (session && isLoginRoute) {
      router.replace("/");
    }
  }, [authStatus, isLoginRoute, isPublicRoute, router, session]);

  if (authStatus === "configuration-error") {
    return <AuthSetupErrorScreen />;
  }

  if (authStatus === "error") {
    return <AuthRestoreErrorScreen onRetry={retryAuth} />;
  }

  if (
    authStatus === "loading" ||
    (!session && !isPublicRoute) ||
    (session && isLoginRoute)
  ) {
    return <LoadingAuthScreen />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.page },
        animation: "slide_from_right",
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <ProtectedStack />
    </AuthProvider>
  );
}
