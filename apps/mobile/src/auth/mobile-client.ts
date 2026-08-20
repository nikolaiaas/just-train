import "react-native-url-polyfill/auto";

import {
  createAuthStorageKey,
  createBareTraenClient,
  parsePublicSupabaseConfig,
  type BareTraenClient,
} from "@bare-traen/api-client";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

import {
  createAuthRedirect,
  resolveMobileAuthBackend,
  resolveMobileAppVariant,
  type MobilePlatform,
} from "./core";
import { createMobileAuthStorage } from "./storage";

export type MobileAuthClient = {
  clearStoredSession(): Promise<void>;
  client: BareTraenClient;
  redirectTo: string;
};

export function createMobileAuthClient(): MobileAuthClient {
  const platform: MobilePlatform = Platform.OS === "web" ? "web" : "native";
  const variant = resolveMobileAppVariant({
    updatesChannel: Updates.channel,
    extraVariant: Constants.expoConfig?.extra?.appVariant,
    allowExtraVariantFallback: __DEV__ || platform === "web",
  });
  const config = parsePublicSupabaseConfig({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  const backend = resolveMobileAuthBackend({
    platform,
    url: config.url,
    variant,
  });

  const storageKey = createAuthStorageKey({
    surface: "mobile",
    appVariant: variant,
    backend,
  });
  const redirectTo = createAuthRedirect(
    variant,
    platform,
    platform === "web" && typeof window !== "undefined"
      ? window.location.origin
      : undefined,
  );
  const storage = createMobileAuthStorage(storageKey);
  const client = createBareTraenClient(config, {
    auth: {
      storage,
      storageKey,
    },
  });

  return {
    clearStoredSession: () => storage.removeItem(storageKey),
    client,
    redirectTo,
  };
}
