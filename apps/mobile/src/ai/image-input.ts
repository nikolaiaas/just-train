import {
  AI_MEDIA_MAX_INPUT_BYTES,
  detectAiMediaMimeType,
  type AiMediaMimeType,
} from "@bare-traen/api-client";
import { File } from "expo-file-system";
import {
  ImageManipulator,
  SaveFormat,
  type ImageRef,
} from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

const MAX_LONG_EDGE = 1_536;

export type PreparedAiImage = {
  bytes: Uint8Array;
  mimeType: AiMediaMimeType;
  previewUri: string;
};

export class AiImageInputError extends Error {
  constructor(readonly code: "permission" | "invalid" | "too_large") {
    super(code);
    this.name = "AiImageInputError";
  }
}

function disposeTemporaryImageUri(uri: string | null): void {
  if (!uri) {
    return;
  }

  if (Platform.OS === "web") {
    if (uri.startsWith("blob:")) {
      URL.revokeObjectURL(uri);
    }
    return;
  }

  try {
    new File(uri).delete();
  } catch {
    // The picker may already have released its app-scoped cache copy.
  }
}

export function disposePreparedAiImage(image: PreparedAiImage | null): void {
  if (image) {
    disposeTemporaryImageUri(image.previewUri);
  }
}

async function readTemporaryImage(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") {
    try {
      const response = await fetch(uri);

      if (!response.ok) {
        throw new AiImageInputError("invalid");
      }

      return await response.arrayBuffer();
    } finally {
      if (uri.startsWith("blob:")) {
        URL.revokeObjectURL(uri);
      }
    }
  }

  const temporaryFile = new File(uri);

  try {
    return await temporaryFile.arrayBuffer();
  } finally {
    try {
      temporaryFile.delete();
    } catch {
      // Expo may already have released the temporary native file.
    }
  }
}

function getWebImageReferenceUri(image: ImageRef): string | null {
  if (Platform.OS !== "web") {
    return null;
  }

  const uri = (image as ImageRef & { readonly uri?: unknown }).uri;
  return typeof uri === "string" && uri.startsWith("blob:") ? uri : null;
}

export async function pickPreparedAiImage(): Promise<PreparedAiImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new AiImageInputError("permission");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    allowsMultipleSelection: false,
    base64: false,
    mediaTypes: ["images"],
    selectionLimit: 1,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (!asset) {
    throw new AiImageInputError("invalid");
  }

  try {
    if (asset.width <= 0 || asset.height <= 0) {
      throw new AiImageInputError("invalid");
    }

    const resize =
      Math.max(asset.width, asset.height) > MAX_LONG_EDGE
        ? asset.width >= asset.height
          ? { width: MAX_LONG_EDGE }
          : { height: MAX_LONG_EDGE }
        : null;
    const context = ImageManipulator.manipulate(asset.uri);
    let image: ImageRef | null = null;
    let webImageReferenceUri: string | null = null;

    try {
      if (resize) {
        context.resize(resize);
      }

      image = await context.renderAsync();
      webImageReferenceUri = getWebImageReferenceUri(image);

      const transformed = await image.saveAsync({
        base64: false,
        compress: 0.86,
        format: SaveFormat.JPEG,
      });
      const buffer = await readTemporaryImage(transformed.uri);
      const bytes = new Uint8Array(buffer);
      const mimeType = detectAiMediaMimeType(bytes);

      if (mimeType !== "image/jpeg") {
        throw new AiImageInputError("invalid");
      }

      if (bytes.byteLength > AI_MEDIA_MAX_INPUT_BYTES) {
        throw new AiImageInputError("too_large");
      }

      return { bytes, mimeType, previewUri: asset.uri };
    } finally {
      disposeTemporaryImageUri(webImageReferenceUri);
      try {
        image?.release();
      } finally {
        context.release();
      }
    }
  } catch (error) {
    disposeTemporaryImageUri(asset.uri);
    throw error;
  }
}
