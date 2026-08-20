import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AESKeySize,
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import {
  createEncryptedAuthStorage,
  type AuthEncryptionKey,
  type AuthStorage,
} from "./encrypted-storage";

type NativeAuthEncryptionKey = AuthEncryptionKey & {
  material: AESEncryptionKey;
};

function wrapKey(key: AESEncryptionKey): NativeAuthEncryptionKey {
  return {
    exportBase64: () => key.encoded("base64"),
    material: key,
    size: key.size,
  };
}

export function createMobileAuthStorage(namespace: string): AuthStorage {
  return createEncryptedAuthStorage(namespace, {
    ciphertextStore: AsyncStorage,
    secureKeyStore: {
      deleteItem: (key) => SecureStore.deleteItemAsync(key),
      getItem: (key) => SecureStore.getItemAsync(key),
      setItem: (key, value) =>
        SecureStore.setItemAsync(key, value, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        }),
    },
    crypto: {
      async decrypt(combinedBase64, key, additionalData) {
        const sealed = AESSealedData.fromCombined(combinedBase64, {
          ivLength: 12,
          tagLength: 16,
        });
        return aesDecryptAsync(
          sealed,
          (key as NativeAuthEncryptionKey).material,
          { additionalData },
        );
      },
      async encrypt(plaintext, key, additionalData) {
        const sealed = await aesEncryptAsync(
          plaintext,
          (key as NativeAuthEncryptionKey).material,
          {
            additionalData,
            nonce: { length: 12 },
            tagLength: 16,
          },
        );
        return sealed.combined("base64");
      },
      async generateKey() {
        return wrapKey(
          (await AESEncryptionKey.generate(
            AESKeySize.AES256,
          )) as AESEncryptionKey,
        );
      },
      async importKey(encodedBase64) {
        return wrapKey(
          (await AESEncryptionKey.import(
            encodedBase64,
            "base64",
          )) as AESEncryptionKey,
        );
      },
    },
  });
}
