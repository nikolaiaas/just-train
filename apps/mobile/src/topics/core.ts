import type {
  ChildPublishedTopicWithPhoto,
  ChildTopicPhotoError,
} from "@bare-traen/api-client";

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

export function canOpenFixtureTraining(
  topic: ChildPublishedTopicWithPhoto,
): boolean {
  return topic.slug === "fodbold";
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
