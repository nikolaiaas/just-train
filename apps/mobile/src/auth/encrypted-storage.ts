import {
  parseEncryptedStorageEnvelope,
  serializeEncryptedStorageEnvelope,
} from "./core.ts";
import { decodeUtf8, encodeUtf8 } from "./utf8.ts";

const MAX_PLAINTEXT_BYTES = 524_288;
const AES256_KEY_SIZE = 256;

export type AuthEncryptionKey = {
  exportBase64(): Promise<string>;
  material: unknown;
  size: number;
};

export type EncryptedAuthStorageDependencies = {
  ciphertextStore: {
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
    setItem(key: string, value: string): Promise<void>;
  };
  crypto: {
    decrypt(
      combinedBase64: string,
      key: AuthEncryptionKey,
      additionalData: Uint8Array,
    ): Promise<Uint8Array>;
    encrypt(
      plaintext: Uint8Array,
      key: AuthEncryptionKey,
      additionalData: Uint8Array,
    ): Promise<string>;
    generateKey(): Promise<AuthEncryptionKey>;
    importKey(encodedBase64: string): Promise<AuthEncryptionKey>;
  };
  secureKeyStore: {
    deleteItem(key: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  };
};

export type AuthStorage = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

function assertStorageKey(key: string): void {
  if (!/^[A-Za-z0-9._:-]{1,240}$/.test(key)) {
    throw new Error("Login-lagerets nøgle er ugyldig.");
  }
}

function assertAes256Key(key: AuthEncryptionKey): void {
  if (key.size !== AES256_KEY_SIZE) {
    throw new Error("Login-lagerets krypteringsnøgle er ugyldig.");
  }
}

export function createEncryptedAuthStorage(
  namespace: string,
  dependencies: EncryptedAuthStorageDependencies,
): AuthStorage {
  assertStorageKey(namespace);

  const secureKeyName = `bt.aes.v1.${namespace}`;
  const dataPrefix = `bt.encrypted.v1:${namespace}:`;
  let keyPromise: Promise<AuthEncryptionKey | null> | null = null;
  let queue: Promise<void> = Promise.resolve();

  function dataKey(key: string): string {
    assertStorageKey(key);
    return `${dataPrefix}${key}`;
  }

  function runSerial<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function readKey(): Promise<AuthEncryptionKey | null> {
    keyPromise ??= (async () => {
      // SecureStore I/O remains outside the malformed-key catch: an unavailable
      // keychain must reject instead of silently converting into a sign-out.
      const encoded = await dependencies.secureKeyStore.getItem(secureKeyName);

      if (!encoded) {
        return null;
      }

      try {
        const imported = await dependencies.crypto.importKey(encoded);
        assertAes256Key(imported);
        return imported;
      } catch {
        await dependencies.secureKeyStore.deleteItem(secureKeyName);
        return null;
      }
    })();

    return keyPromise;
  }

  async function getOrCreateKey(): Promise<AuthEncryptionKey> {
    const existing = await readKey();

    if (existing) {
      return existing;
    }

    const generated = await dependencies.crypto.generateKey();
    assertAes256Key(generated);
    const encoded = await generated.exportBase64();

    await dependencies.secureKeyStore.setItem(secureKeyName, encoded);
    keyPromise = Promise.resolve(generated);
    return generated;
  }

  return {
    async getItem(key) {
      return runSerial(async () => {
        const storedKey = dataKey(key);
        const encrypted = await dependencies.ciphertextStore.getItem(storedKey);

        if (!encrypted) {
          return null;
        }

        const encryptionKey = await readKey();

        if (!encryptionKey) {
          await dependencies.ciphertextStore.removeItem(storedKey);
          return null;
        }

        try {
          const envelope = parseEncryptedStorageEnvelope(encrypted);
          const decrypted = await dependencies.crypto.decrypt(
            envelope.combined,
            encryptionKey,
            encodeUtf8(key),
          );
          return decodeUtf8(decrypted);
        } catch {
          await dependencies.ciphertextStore.removeItem(storedKey);
          return null;
        }
      });
    },

    async removeItem(key) {
      return runSerial(async () => {
        await dependencies.ciphertextStore.removeItem(dataKey(key));
      });
    },

    async setItem(key, value) {
      return runSerial(async () => {
        const plaintext = encodeUtf8(value);

        if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
          throw new Error(
            "Login-sessionen er for stor til sikkert lokalt lager.",
          );
        }

        const encryptionKey = await getOrCreateKey();
        const combined = await dependencies.crypto.encrypt(
          plaintext,
          encryptionKey,
          encodeUtf8(key),
        );

        await dependencies.ciphertextStore.setItem(
          dataKey(key),
          serializeEncryptedStorageEnvelope(combined),
        );
      });
    },
  };
}
