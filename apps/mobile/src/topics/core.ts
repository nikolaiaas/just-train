import type {
  ChildPublishedTopicWithPhoto,
  ChildTopicPhotoError,
  ChildTopicPortraitState,
} from "@bare-traen/api-client";
import { ChildTopicPortraitError } from "@bare-traen/api-client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function findChildTopic(
  topics: ChildPublishedTopicWithPhoto[],
  topicId: unknown,
): ChildPublishedTopicWithPhoto | null {
  if (typeof topicId !== "string" || !UUID_PATTERN.test(topicId)) {
    return null;
  }

  const normalizedId = topicId.toLowerCase();
  return topics.find((topic) => topic.id === normalizedId) ?? null;
}

export function getAutomaticWardrobeRenderKey(
  portrait: ChildTopicPortraitState,
): string | null {
  if (
    !portrait.base ||
    portrait.isBaseStale ||
    !portrait.isLookStale ||
    portrait.liveWardrobeItemIds.length === 0 ||
    portrait.hasLiveEquipmentRenderAttempt ||
    portrait.pendingJob
  ) {
    return null;
  }

  return `${portrait.base.mediaAssetId}:${portrait.liveEquipmentFingerprint}`;
}

export function getCurrentTopicPortraitImage(
  portrait: ChildTopicPortraitState,
): ChildTopicPortraitState["currentLook"] {
  return portrait.currentLook ?? portrait.base;
}

export function isCurrentTopicPortraitImageFailure(
  failedSignedUrl: string | null,
  currentSignedUrl: string | null,
): boolean {
  return Boolean(
    failedSignedUrl && currentSignedUrl && failedSignedUrl === currentSignedUrl,
  );
}

export function getTopicPhotoErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as Pick<ChildTopicPhotoError, "code">).code
      : null;

  if (code === "session_changed" || code === "child_access_denied") {
    return "Profilen skiftede. Gå tilbage, og åbn emnet igen.";
  }

  if (code === "topic_unavailable") {
    return "Emnet er ikke længere tilgængeligt. Gå tilbage til emnerne.";
  }

  if (code === "photo_changed") {
    return "Billedet blev ændret et andet sted. Hent emnet igen.";
  }

  if (code === "invalid_image_bytes" || code === "invalid_mime_type") {
    return "Billedet kunne ikke bruges. Vælg et andet billede.";
  }

  if (code === "input_too_large") {
    return "Billedet er for stort. Vælg et andet billede.";
  }

  if (code === "upload_limit_reached") {
    return "Der er lavet mange emnebilleder. Vent lidt, eller spørg en voksen.";
  }

  return "Emnebilledet kunne ikke gemmes. Prøv igen.";
}

export function getTopicPortraitErrorMessage(error: unknown): string {
  if (!(error instanceof ChildTopicPortraitError)) {
    return "Tegneseriebilledet kunne ikke laves. Prøv igen.";
  }

  if (
    error.code === "session_changed" ||
    error.code === "family_access_denied"
  ) {
    return "Profilen skiftede. Gå tilbage, og åbn emnet igen.";
  }

  if (error.code === "portrait_unavailable") {
    return "Vælg og gem først et billede til dette emne.";
  }

  if (error.code === "daily_limit_reached") {
    return "Der er lavet mange billeder i dag. Prøv igen i morgen.";
  }

  if (error.code === "portrait_load_failed") {
    return "Billedet kunne ikke hentes. Kontrollér forbindelsen og prøv igen.";
  }

  return "Tegneseriebilledet kunne ikke laves. Prøv igen senere.";
}
