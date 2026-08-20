type AuthStorage = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

/**
 * TypeScript fallback. Expo resolves storage.native.ts or storage.web.ts for
 * supported targets before this file is bundled.
 */
export function createMobileAuthStorage(_namespace: string): AuthStorage {
  throw new Error("Denne platform har ikke et understøttet login-lager.");
}
