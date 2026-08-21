import type { AuthStorage } from "./encrypted-storage";

const tombstone = Symbol("removed");
const memoryOverrides = new Map<string, string | typeof tombstone>();

function assertStoragePart(value: string): void {
  if (!/^[A-Za-z0-9._:-]{1,240}$/.test(value)) {
    throw new Error("Login-lagerets nøgle er ugyldig.");
  }
}

/**
 * Browser sessions stay in this origin's localStorage so a PKCE verifier is
 * available when an email opens the callback in another tab. Native secure
 * storage is deliberately kept out of the web bundle.
 */
export function createMobileAuthStorage(namespace: string): AuthStorage {
  assertStoragePart(namespace);
  const prefix = `bt.browser.v1:${namespace}:`;

  function storageKey(key: string): string {
    assertStoragePart(key);
    return `${prefix}${key}`;
  }

  function browserStorage(): Storage | null {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  return {
    async getDurableItem(key) {
      const storage = browserStorage();

      if (!storage) {
        throw new Error("Det sikre lager kunne ikke læses.");
      }

      return storage.getItem(storageKey(key));
    },

    async getItem(key) {
      const scopedKey = storageKey(key);
      const override = memoryOverrides.get(scopedKey);

      if (override !== undefined) {
        return override === tombstone ? null : override;
      }

      const storage = browserStorage();

      if (!storage) {
        return null;
      }

      try {
        return storage.getItem(scopedKey);
      } catch {
        return null;
      }
    },

    async removeDurableItem(key) {
      const scopedKey = storageKey(key);
      const storage = browserStorage();

      if (!storage) {
        throw new Error("Det sikre lager kunne ikke opdateres.");
      }

      storage.removeItem(scopedKey);

      if (storage.getItem(scopedKey) !== null) {
        throw new Error("Det sikre lager kunne ikke opdateres.");
      }

      memoryOverrides.delete(scopedKey);
    },

    async removeItem(key) {
      const scopedKey = storageKey(key);
      memoryOverrides.set(scopedKey, tombstone);

      try {
        const storage = browserStorage();

        if (storage) {
          storage.removeItem(scopedKey);
          memoryOverrides.delete(scopedKey);
        }
      } catch (error) {
        // The shared tombstone wins for this runtime; propagating also stops a
        // logout from claiming persistence succeeded when a reload could
        // recover the stale browser value.
        throw error;
      }
    },

    async setDurableItem(key, value) {
      const scopedKey = storageKey(key);
      const storage = browserStorage();

      if (!storage) {
        throw new Error("Det sikre lager kunne ikke opdateres.");
      }

      storage.setItem(scopedKey, value);

      if (storage.getItem(scopedKey) !== value) {
        throw new Error("Det sikre lager kunne ikke opdateres.");
      }

      memoryOverrides.delete(scopedKey);
    },

    async setItem(key, value) {
      const scopedKey = storageKey(key);
      memoryOverrides.set(scopedKey, value);
      const storage = browserStorage();

      if (!storage) {
        return;
      }

      try {
        storage.setItem(scopedKey, value);
        memoryOverrides.delete(scopedKey);
      } catch (error) {
        // Never silently claim a new account session was persisted while an
        // older value remains in localStorage.
        throw error;
      }
    },
  };
}
