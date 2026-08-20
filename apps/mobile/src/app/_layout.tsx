import { colors } from "@bare-traen/design";
import { Stack, usePathname, useRouter } from "expo-router";
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
  const pathname = usePathname();
  const { authStatus, retryAuth, session } = useAuth();
  const isLoginRoute = pathname === "/login";
  const isCallbackRoute = pathname === "/auth/callback";
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
