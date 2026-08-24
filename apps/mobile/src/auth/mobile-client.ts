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
  createAiCartoonResumeStorageKey,
  parseAiCartoonResume,
  serializeAiCartoonResume,
  type AiCartoonResume,
  type AiCartoonResumeScope,
} from "@/ai/cartoon-resume";
import {
  createSelectedChildStorageKey,
  parseSelectedChildId,
  serializeSelectedChildId,
} from "@/children/child-selection";
import {
  parsePendingChildCreation,
  serializePendingChildCreation,
  type PendingChildCreation,
} from "@/children/child-setup";

import {
  createAuthRedirect,
  resolveMobileAuthBackend,
  resolveMobileAppVariant,
  type MobilePlatform,
} from "./core";
import { createMobileAuthStorage } from "./storage";

type SelectedChildStorageContext = {
  familyId: string;
  userId: string;
};

export type MobileAuthClient = {
  clearAiCartoonResume(input: AiCartoonResumeScope): Promise<void>;
  clearPendingChildCreation(userId: string): Promise<void>;
  clearSelectedChildId(input: SelectedChildStorageContext): Promise<void>;
  clearStoredSession(): Promise<void>;
  client: BareTraenClient;
  loadAiCartoonResume(
    input: AiCartoonResumeScope,
  ): Promise<AiCartoonResume | null>;
  loadPendingChildCreation(
    userId: string,
  ): Promise<PendingChildCreation | null>;
  loadSelectedChildId(
    input: SelectedChildStorageContext,
  ): Promise<string | null>;
  redirectTo: string;
  saveAiCartoonResume(resume: AiCartoonResume): Promise<void>;
  savePendingChildCreation(pending: PendingChildCreation): Promise<void>;
  saveSelectedChildId(
    input: SelectedChildStorageContext & { childId: string },
  ): Promise<void>;
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
  const aiCartoonResumeStorageKey = (input: AiCartoonResumeScope) =>
    createAiCartoonResumeStorageKey({ ...input, namespace: storageKey });
  const selectedChildStorageKey = (input: SelectedChildStorageContext) =>
    createSelectedChildStorageKey({ ...input, namespace: storageKey });
  const client = createBareTraenClient(config, {
    auth: {
      storage,
      storageKey,
    },
  });

  return {
    clearAiCartoonResume: (input) =>
      storage.removeDurableItem(aiCartoonResumeStorageKey(input)),
    clearPendingChildCreation: (userId) =>
      storage.removeDurableItem(pendingStorageKey(userId)),
    clearSelectedChildId: (input) =>
      storage.removeDurableItem(selectedChildStorageKey(input)),
    clearStoredSession: () => storage.removeItem(storageKey),
    client,
    async loadAiCartoonResume(input) {
      const key = aiCartoonResumeStorageKey(input);
      const serialized = await storage.getDurableItem(key);

      if (serialized === null) {
        return null;
      }

      try {
        return parseAiCartoonResume(serialized, input);
      } catch {
        await storage.removeDurableItem(key);
        return null;
      }
    },
    async loadPendingChildCreation(userId) {
      const key = pendingStorageKey(userId);
      const serialized = await storage.getDurableItem(key);

      if (serialized === null) {
        return null;
      }

      return parsePendingChildCreation(serialized, userId);
    },
    async loadSelectedChildId(input) {
      const key = selectedChildStorageKey(input);
      const serialized = await storage.getDurableItem(key);

      if (serialized === null) {
        return null;
      }

      try {
        return parseSelectedChildId(serialized);
      } catch {
        await storage.removeDurableItem(key);
        return null;
      }
    },
    redirectTo,
    saveAiCartoonResume: (resume) =>
      storage.setDurableItem(
        aiCartoonResumeStorageKey(resume),
        serializeAiCartoonResume(resume),
      ),
    savePendingChildCreation: (pending) =>
      storage.setDurableItem(
        pendingStorageKey(pending.userId),
        serializePendingChildCreation(pending),
      ),
    saveSelectedChildId: (input) =>
      storage.setDurableItem(
        selectedChildStorageKey(input),
        serializeSelectedChildId(input.childId),
      ),
  };
}
