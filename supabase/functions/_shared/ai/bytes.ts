const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  );
}

export function detectSupportedImageMimeType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (startsWith(bytes, PNG_SIGNATURE)) {
    return "image/png";
  }

  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const modernBytes = bytes as Uint8Array & { toBase64?: () => string };

  if (typeof modernBytes.toBase64 === "function") {
    return modernBytes.toBase64();
  }

  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }

  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("invalid_base64");
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
