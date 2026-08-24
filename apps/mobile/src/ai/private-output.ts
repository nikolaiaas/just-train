import { AI_MEDIA_MAX_INPUT_BYTES } from "@bare-traen/api-client";

export async function loadPrivateWebImage(
  signedUrl: string,
  signal: AbortSignal,
  allowedMimeTypes: readonly string[],
): Promise<string> {
  const response = await fetch(signedUrl, {
    cache: "no-store",
    headers: { "Cache-Control": "no-store" },
    signal,
  });

  if (!response.ok) {
    throw new Error("private_output_unavailable");
  }

  const blob = await response.blob();

  if (
    blob.size <= 0 ||
    blob.size > AI_MEDIA_MAX_INPUT_BYTES ||
    !allowedMimeTypes.includes(blob.type)
  ) {
    throw new Error("invalid_private_output");
  }

  return URL.createObjectURL(blob);
}

export function loadPrivateWebPng(
  signedUrl: string,
  signal: AbortSignal,
): Promise<string> {
  return loadPrivateWebImage(signedUrl, signal, ["image/png"]);
}

export function revokePrivateWebImage(uri: string | null): void {
  if (uri?.startsWith("blob:")) {
    URL.revokeObjectURL(uri);
  }
}
