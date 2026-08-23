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
import {
  parsePendingChildCreation,
  serializePendingChildCreation,
  type PendingChildCreation,
} from "@/children/child-setup";

export type MobileAuthClient = {
  clearPendingChildCreation(userId: string): Promise<void>;
  clearStoredSession(): Promise<void>;
  client: BareTraenClient;
  loadPendingChildCreation(
    userId: string,
  ): Promise<PendingChildCreation | null>;
  redirectTo: string;
  savePendingChildCreation(pending: PendingChildCreation): Promise<void>;
};

export function createMobileAuthClient(): MobileAuthClient {
  const platform: MobilePlatform = Platform.OS === "web" ? "web" : "native";
  const variant = resolveMobileAppVariant({
    updatesChannel: Updates.channel,
    extraVariant: Constants.expoConfig?.extra?.appVariant,
    allowExtraVariantFallback: __DEV__ || platform === "web",
  });
  const config = parsePublicSupabaseConfig({
    url:
      process.env.EXPO_PUBLIC_SUPABASE_URL_OVERRIDE ??
      process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY_OVERRIDE ??
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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
  const pendingStorageKey = (userId: string) =>
    `${storageKey}.child-create.${userId.toLowerCase()}`;
  const client = createBareTraenClient(config, {
    auth: {
      storage,
      storageKey,
    },
  });

  return {
    clearPendingChildCreation: (userId) =>
      storage.removeDurableItem(pendingStorageKey(userId)),
    clearStoredSession: () => storage.removeItem(storageKey),
    client,
    async loadPendingChildCreation(userId) {
      const key = pendingStorageKey(userId);
      const serialized = await storage.getDurableItem(key);

      if (serialized === null) {
        return null;
      }

      return parsePendingChildCreation(serialized, userId);
    },
    redirectTo,
    savePendingChildCreation: (pending) =>
      storage.setDurableItem(
        pendingStorageKey(pending.userId),
        serializePendingChildCreation(pending),
      ),
  };
}
