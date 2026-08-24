import { AI_MEDIA_MAX_INPUT_BYTES, detectAiMediaMimeType } from "./ai-media.ts";
import type { BareTraenClient } from "./index.ts";

export const CHILD_TOPIC_PHOTO_MAX_INPUT_BYTES = AI_MEDIA_MAX_INPUT_BYTES;

export type ChildTopicPhotoMimeType = "image/jpeg" | "image/png";
export type ChildTopicPhotoRequestStatus =
  "awaiting_upload" | "current" | "superseded" | "removed";

export type PrepareChildTopicReferencePhotoInput = {
  childProfileId: string;
  clientRequestId: string;
  expectedUserId: string;
  familyId: string;
  inputMimeType: ChildTopicPhotoMimeType;
  topicId: string;
};

export type PreparedChildTopicReferencePhoto =
  PrepareChildTopicReferencePhotoInput & {
    created: boolean;
    mediaAssetId: string;
    requestId: string;
    requestStatus: ChildTopicPhotoRequestStatus;
    storageBucket: "ai-media-private";
    storageObjectPath: string;
  };

export type FinalizedChildTopicReferencePhoto = {
  changed: boolean;
  currentMediaAssetId: string | null;
  previousMediaAssetId: string | null;
  requestMediaAssetId: string;
  requestStatus: Exclude<ChildTopicPhotoRequestStatus, "awaiting_upload">;
  updatedAt: string | null;
};

export type RemoveChildTopicReferencePhotoInput = {
  childProfileId: string;
  expectedMediaAssetId: string;
  expectedUserId: string;
  familyId: string;
  topicId: string;
};

export type RemovedChildTopicReferencePhoto = {
  deleteAfter: string;
  mediaAssetId: string;
  removed: boolean;
};

export type ListChildPublishedTopicsWithPhotoInput = {
  childProfileId: string;
  expectedUserId: string;
  familyId: string;
  signedUrlExpiresInSeconds?: number;
};

export type ChildTopicReferencePhoto = {
  expiresInSeconds: number;
  mediaAssetId: string;
  mimeType: ChildTopicPhotoMimeType;
  signedUrl: string;
  updatedAt: string;
};

export type ChildPublishedTopicWithPhoto = {
  accentColor: string | null;
  description: string;
  icon: string | null;
  id: string;
  photo: ChildTopicReferencePhoto | null;
  slug: string;
  sortOrder: number;
  title: string;
};

export type ChildTopicPhotoErrorCode =
  | "child_access_denied"
  | "finalization_failed"
  | "input_too_large"
  | "invalid_child_profile_id"
  | "invalid_client_request_id"
  | "invalid_expected_media_asset_id"
  | "invalid_expected_user_id"
  | "invalid_family_id"
  | "invalid_finalization_result"
  | "invalid_image_bytes"
  | "invalid_mime_type"
  | "invalid_preparation_result"
  | "invalid_prepared_photo"
  | "invalid_removal_result"
  | "invalid_topic_id"
  | "invalid_topic_list_result"
  | "photo_changed"
  | "photo_unavailable"
  | "preparation_failed"
  | "removal_failed"
  | "session_changed"
  | "topic_list_failed"
  | "topic_unavailable"
  | "upload_limit_reached"
  | "upload_failed";

const ERROR_MESSAGES: Record<ChildTopicPhotoErrorCode, string> = {
  child_access_denied:
    "The child topic photo is not available to this account.",
  finalization_failed: "The child topic photo could not be saved.",
  input_too_large: "The topic photo is too large.",
  invalid_child_profile_id: "The child profile id is invalid.",
  invalid_client_request_id: "The topic photo request id is invalid.",
  invalid_expected_media_asset_id: "The expected topic photo is invalid.",
  invalid_expected_user_id: "The expected adult account id is invalid.",
  invalid_family_id: "The family id is invalid.",
  invalid_finalization_result: "Saving the topic photo returned invalid data.",
  invalid_image_bytes: "The topic photo bytes are invalid.",
  invalid_mime_type: "The topic photo type is invalid.",
  invalid_preparation_result:
    "Preparing the topic photo returned invalid data.",
  invalid_prepared_photo: "The prepared topic photo is invalid.",
  invalid_removal_result: "Removing the topic photo returned invalid data.",
  invalid_topic_id: "The topic id is invalid.",
  invalid_topic_list_result: "The published topic list returned invalid data.",
  photo_changed: "The topic photo changed before this action completed.",
  photo_unavailable: "The topic photo is no longer available.",
  preparation_failed: "The topic photo upload could not be prepared.",
  removal_failed: "The topic photo could not be removed.",
  session_changed: "The signed-in account changed before the photo action.",
  topic_list_failed: "Published topics could not be loaded.",
  topic_unavailable: "The published topic is no longer available.",
  upload_limit_reached: "The topic photo upload limit has been reached.",
  upload_failed: "The topic photo could not be uploaded.",
};

export class ChildTopicPhotoError extends Error {
  readonly code: ChildTopicPhotoErrorCode;

  constructor(code: ChildTopicPhotoErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ChildTopicPhotoError";
    this.code = code;
  }
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const SINGLE_LINE_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const REQUEST_STATUSES = new Set<ChildTopicPhotoRequestStatus>([
  "awaiting_upload",
  "current",
  "superseded",
  "removed",
]);
const FINAL_REQUEST_STATUSES = new Set<
  FinalizedChildTopicReferencePhoto["requestStatus"]
>(["current", "superseded", "removed"]);
const MIME_TYPES = new Set<ChildTopicPhotoMimeType>([
  "image/jpeg",
  "image/png",
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    UUID_PATTERN.test(value) &&
    value.toLowerCase() !== NIL_UUID
  );
}

function normalizeUuid(
  value: unknown,
  code:
    | "invalid_child_profile_id"
    | "invalid_client_request_id"
    | "invalid_expected_media_asset_id"
    | "invalid_expected_user_id"
    | "invalid_family_id"
    | "invalid_topic_id",
): string {
  if (!isUuid(value)) throw new ChildTopicPhotoError(code);
  return value.toLowerCase();
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 20 &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value))
  );
}

function normalizeMimeType(value: unknown): ChildTopicPhotoMimeType {
  if (
    typeof value !== "string" ||
    !MIME_TYPES.has(value as ChildTopicPhotoMimeType)
  ) {
    throw new ChildTopicPhotoError("invalid_mime_type");
  }

  return value as ChildTopicPhotoMimeType;
}

function normalizePreparationInput(
  input: PrepareChildTopicReferencePhotoInput,
): PrepareChildTopicReferencePhotoInput {
  return {
    childProfileId: normalizeUuid(
      input.childProfileId,
      "invalid_child_profile_id",
    ),
    clientRequestId: normalizeUuid(
      input.clientRequestId,
      "invalid_client_request_id",
    ),
    expectedUserId: normalizeUuid(
      input.expectedUserId,
      "invalid_expected_user_id",
    ),
    familyId: normalizeUuid(input.familyId, "invalid_family_id"),
    inputMimeType: normalizeMimeType(input.inputMimeType),
    topicId: normalizeUuid(input.topicId, "invalid_topic_id"),
  };
}

function expectedObjectPath(
  input: Pick<
    PreparedChildTopicReferencePhoto,
    "familyId" | "childProfileId" | "topicId" | "mediaAssetId" | "inputMimeType"
  >,
): string {
  const extension = input.inputMimeType === "image/jpeg" ? "jpg" : "png";
  return `${input.familyId}/children/${input.childProfileId}/topics/${input.topicId}/${input.mediaAssetId}.${extension}`;
}

function validatePreparedPhoto(
  value: PreparedChildTopicReferencePhoto,
): PreparedChildTopicReferencePhoto {
  let normalized: PrepareChildTopicReferencePhotoInput;

  try {
    normalized = normalizePreparationInput(value);
  } catch {
    throw new ChildTopicPhotoError("invalid_prepared_photo");
  }

  if (
    !isUuid(value.requestId) ||
    !isUuid(value.mediaAssetId) ||
    value.storageBucket !== "ai-media-private" ||
    typeof value.storageObjectPath !== "string" ||
    typeof value.created !== "boolean" ||
    typeof value.requestStatus !== "string" ||
    !REQUEST_STATUSES.has(value.requestStatus as ChildTopicPhotoRequestStatus)
  ) {
    throw new ChildTopicPhotoError("invalid_prepared_photo");
  }

  const prepared: PreparedChildTopicReferencePhoto = {
    ...normalized,
    created: value.created,
    mediaAssetId: value.mediaAssetId.toLowerCase(),
    requestId: value.requestId.toLowerCase(),
    requestStatus: value.requestStatus as ChildTopicPhotoRequestStatus,
    storageBucket: "ai-media-private",
    storageObjectPath: value.storageObjectPath,
  };

  if (prepared.storageObjectPath !== expectedObjectPath(prepared)) {
    throw new ChildTopicPhotoError("invalid_prepared_photo");
  }

  return prepared;
}

function mapContextError(
  error: { code?: string } | null,
  fallback: ChildTopicPhotoErrorCode,
): ChildTopicPhotoError {
  if (error?.code === "28000") {
    return new ChildTopicPhotoError("session_changed");
  }

  if (error?.code === "42501") {
    return new ChildTopicPhotoError("child_access_denied");
  }

  if (error?.code === "P0002") {
    return new ChildTopicPhotoError("topic_unavailable");
  }

  if (error?.code === "54000") {
    return new ChildTopicPhotoError("upload_limit_reached");
  }

  return new ChildTopicPhotoError(fallback);
}

/**
 * Reserves one retry-safe private upload. The server owns the Storage bucket
 * and canonical path; this operation does not copy family media into the
 * public wardrobe catalogue or start an AI job.
 */
export async function prepareChildTopicReferencePhoto(
  client: BareTraenClient,
  input: PrepareChildTopicReferencePhotoInput,
): Promise<PreparedChildTopicReferencePhoto> {
  const normalized = normalizePreparationInput(input);
  let response: Awaited<
    ReturnType<typeof client.rpc<"prepare_child_topic_reference_photo">>
  >;

  try {
    response = await client.rpc("prepare_child_topic_reference_photo", {
      p_child_profile_id: normalized.childProfileId,
      p_client_request_id: normalized.clientRequestId,
      p_expected_user_id: normalized.expectedUserId,
      p_family_id: normalized.familyId,
      p_input_mime_type: normalized.inputMimeType,
      p_topic_id: normalized.topicId,
    });
  } catch {
    throw new ChildTopicPhotoError("preparation_failed");
  }

  if (response.error) {
    throw mapContextError(response.error, "preparation_failed");
  }

  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new ChildTopicPhotoError("invalid_preparation_result");
  }

  const row = response.data[0];

  if (
    !row ||
    !isUuid(row.request_id) ||
    !isUuid(row.media_asset_id) ||
    row.storage_bucket !== "ai-media-private" ||
    typeof row.storage_object_path !== "string" ||
    row.input_mime_type !== normalized.inputMimeType ||
    typeof row.request_status !== "string" ||
    !REQUEST_STATUSES.has(row.request_status as ChildTopicPhotoRequestStatus) ||
    typeof row.created !== "boolean"
  ) {
    throw new ChildTopicPhotoError("invalid_preparation_result");
  }

  const prepared: PreparedChildTopicReferencePhoto = {
    ...normalized,
    created: row.created,
    mediaAssetId: row.media_asset_id.toLowerCase(),
    requestId: row.request_id.toLowerCase(),
    requestStatus: row.request_status as ChildTopicPhotoRequestStatus,
    storageBucket: "ai-media-private",
    storageObjectPath: row.storage_object_path,
  };

  if (prepared.storageObjectPath !== expectedObjectPath(prepared)) {
    throw new ChildTopicPhotoError("invalid_preparation_result");
  }

  return prepared;
}

export async function uploadChildTopicReferencePhoto(
  client: BareTraenClient,
  preparedInput: PreparedChildTopicReferencePhoto,
  input: ArrayBuffer | Uint8Array,
): Promise<void> {
  const prepared = validatePreparedPhoto(preparedInput);

  if (prepared.requestStatus !== "awaiting_upload") {
    throw new ChildTopicPhotoError("photo_unavailable");
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (
    bytes.byteLength === 0 ||
    detectAiMediaMimeType(bytes) !== prepared.inputMimeType
  ) {
    throw new ChildTopicPhotoError("invalid_image_bytes");
  }

  if (bytes.byteLength > CHILD_TOPIC_PHOTO_MAX_INPUT_BYTES) {
    throw new ChildTopicPhotoError("input_too_large");
  }

  let uploadError: { statusCode?: string | number } | null;

  try {
    const response = await client.storage
      .from(prepared.storageBucket)
      .upload(prepared.storageObjectPath, bytes, {
        cacheControl: "0",
        contentType: prepared.inputMimeType,
        upsert: false,
      });
    uploadError = response.error;
  } catch {
    throw new ChildTopicPhotoError("upload_failed");
  }

  if (uploadError) {
    const statusCode = String(uploadError.statusCode ?? "");

    // The exact canonical path was reserved for this request and finalization
    // still validates its owner, MIME type, and byte size. Treating a Storage
    // conflict as success therefore also covers an ambiguous first response.
    if (statusCode === "409") return;
    throw new ChildTopicPhotoError("upload_failed");
  }
}

export async function finalizeChildTopicReferencePhoto(
  client: BareTraenClient,
  preparedInput: PreparedChildTopicReferencePhoto,
): Promise<FinalizedChildTopicReferencePhoto> {
  const prepared = validatePreparedPhoto(preparedInput);
  let response: Awaited<
    ReturnType<typeof client.rpc<"finalize_child_topic_reference_photo">>
  >;

  try {
    response = await client.rpc("finalize_child_topic_reference_photo", {
      p_child_profile_id: prepared.childProfileId,
      p_client_request_id: prepared.clientRequestId,
      p_expected_user_id: prepared.expectedUserId,
      p_family_id: prepared.familyId,
      p_topic_id: prepared.topicId,
    });
  } catch {
    throw new ChildTopicPhotoError("finalization_failed");
  }

  if (response.error) {
    throw mapContextError(response.error, "finalization_failed");
  }

  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new ChildTopicPhotoError("invalid_finalization_result");
  }

  const row = response.data[0];
  const requestMediaAssetId = row?.request_media_asset_id;
  const currentMediaAssetId = row?.current_media_asset_id;
  const previousMediaAssetId = row?.previous_media_asset_id;
  const requestStatus = row?.request_status;
  const updatedAt = row?.photo_updated_at;

  if (
    !row ||
    !isUuid(requestMediaAssetId) ||
    requestMediaAssetId.toLowerCase() !== prepared.mediaAssetId ||
    !(
      currentMediaAssetId === null ||
      (isUuid(currentMediaAssetId) &&
        currentMediaAssetId.toLowerCase() !== NIL_UUID)
    ) ||
    !(
      previousMediaAssetId === null ||
      (isUuid(previousMediaAssetId) &&
        previousMediaAssetId.toLowerCase() !== NIL_UUID)
    ) ||
    typeof requestStatus !== "string" ||
    !FINAL_REQUEST_STATUSES.has(
      requestStatus as FinalizedChildTopicReferencePhoto["requestStatus"],
    ) ||
    typeof row.changed !== "boolean" ||
    !(updatedAt === null || isTimestamp(updatedAt))
  ) {
    throw new ChildTopicPhotoError("invalid_finalization_result");
  }

  const normalizedCurrentId = currentMediaAssetId?.toLowerCase() ?? null;
  const normalizedPreviousId = previousMediaAssetId?.toLowerCase() ?? null;

  if (
    (requestStatus === "current" &&
      (normalizedCurrentId !== prepared.mediaAssetId ||
        !isTimestamp(updatedAt))) ||
    (row.changed && requestStatus !== "current") ||
    (row.changed && normalizedPreviousId === prepared.mediaAssetId) ||
    (!row.changed && normalizedPreviousId !== null)
  ) {
    throw new ChildTopicPhotoError("invalid_finalization_result");
  }

  return {
    changed: row.changed,
    currentMediaAssetId: normalizedCurrentId,
    previousMediaAssetId: normalizedPreviousId,
    requestMediaAssetId: prepared.mediaAssetId,
    requestStatus:
      requestStatus as FinalizedChildTopicReferencePhoto["requestStatus"],
    updatedAt: updatedAt ?? null,
  };
}

export async function removeChildTopicReferencePhoto(
  client: BareTraenClient,
  input: RemoveChildTopicReferencePhotoInput,
): Promise<RemovedChildTopicReferencePhoto> {
  const childProfileId = normalizeUuid(
    input.childProfileId,
    "invalid_child_profile_id",
  );
  const expectedMediaAssetId = normalizeUuid(
    input.expectedMediaAssetId,
    "invalid_expected_media_asset_id",
  );
  const expectedUserId = normalizeUuid(
    input.expectedUserId,
    "invalid_expected_user_id",
  );
  const familyId = normalizeUuid(input.familyId, "invalid_family_id");
  const topicId = normalizeUuid(input.topicId, "invalid_topic_id");
  let response: Awaited<
    ReturnType<typeof client.rpc<"remove_child_topic_reference_photo">>
  >;

  try {
    response = await client.rpc("remove_child_topic_reference_photo", {
      p_child_profile_id: childProfileId,
      p_expected_media_asset_id: expectedMediaAssetId,
      p_expected_user_id: expectedUserId,
      p_family_id: familyId,
      p_topic_id: topicId,
    });
  } catch {
    throw new ChildTopicPhotoError("removal_failed");
  }

  if (response.error?.code === "40001") {
    throw new ChildTopicPhotoError("photo_changed");
  }

  if (response.error?.code === "P0002") {
    throw new ChildTopicPhotoError("photo_unavailable");
  }

  if (response.error) {
    throw mapContextError(response.error, "removal_failed");
  }

  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new ChildTopicPhotoError("invalid_removal_result");
  }

  const row = response.data[0];

  if (
    !row ||
    !isUuid(row.removed_media_asset_id) ||
    row.removed_media_asset_id.toLowerCase() !== expectedMediaAssetId ||
    !isTimestamp(row.delete_after) ||
    typeof row.removed !== "boolean"
  ) {
    throw new ChildTopicPhotoError("invalid_removal_result");
  }

  return {
    deleteAfter: row.delete_after,
    mediaAssetId: expectedMediaAssetId,
    removed: row.removed,
  };
}

function isBoundedSingleLineText(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string {
  const length = typeof value === "string" ? Array.from(value).length : 0;
  return (
    typeof value === "string" &&
    value === value.trim() &&
    length >= minimumLength &&
    length <= maximumLength &&
    !SINGLE_LINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isBoundedDescription(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    Array.from(value).length <= 500 &&
    !DISALLOWED_MULTILINE_CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function validateSignedUrlExpiry(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 60 || Number(value) > 300) {
    throw new ChildTopicPhotoError("invalid_topic_list_result");
  }

  return Number(value);
}

type ParsedTopic = Omit<ChildPublishedTopicWithPhoto, "photo"> & {
  photoMetadata: {
    mediaAssetId: string;
    mimeType: ChildTopicPhotoMimeType;
    storageObjectPath: string;
    updatedAt: string;
  } | null;
};

function parseTopicRow(
  value: unknown,
  familyId: string,
  childProfileId: string,
): ParsedTopic | null {
  if (
    !isRecord(value) ||
    !isUuid(value.topic_id) ||
    !isBoundedSingleLineText(value.slug, 1, 120) ||
    !SLUG_PATTERN.test(value.slug) ||
    !isBoundedSingleLineText(value.title, 1, 100) ||
    !isBoundedDescription(value.description) ||
    !(value.icon === null || isBoundedSingleLineText(value.icon, 1, 16)) ||
    !(
      value.accent_color === null ||
      (typeof value.accent_color === "string" &&
        ACCENT_COLOR_PATTERN.test(value.accent_color))
    ) ||
    !Number.isSafeInteger(value.sort_order) ||
    Number(value.sort_order) < 0
  ) {
    return null;
  }

  const id = value.topic_id.toLowerCase();
  const photoValues = [
    value.photo_media_asset_id,
    value.photo_mime_type,
    value.photo_storage_bucket,
    value.photo_storage_object_path,
    value.photo_updated_at,
  ];
  let photoMetadata: ParsedTopic["photoMetadata"] = null;

  if (photoValues.every((part) => part === null)) {
    photoMetadata = null;
  } else {
    if (
      !isUuid(value.photo_media_asset_id) ||
      typeof value.photo_mime_type !== "string" ||
      !MIME_TYPES.has(value.photo_mime_type as ChildTopicPhotoMimeType) ||
      value.photo_storage_bucket !== "ai-media-private" ||
      typeof value.photo_storage_object_path !== "string" ||
      !isTimestamp(value.photo_updated_at)
    ) {
      return null;
    }

    const mediaAssetId = value.photo_media_asset_id.toLowerCase();
    const mimeType = value.photo_mime_type as ChildTopicPhotoMimeType;
    const canonicalPath = expectedObjectPath({
      childProfileId,
      familyId,
      inputMimeType: mimeType,
      mediaAssetId,
      topicId: id,
    });

    if (value.photo_storage_object_path !== canonicalPath) return null;
    photoMetadata = {
      mediaAssetId,
      mimeType,
      storageObjectPath: canonicalPath,
      updatedAt: value.photo_updated_at,
    };
  }

  return {
    accentColor: value.accent_color as string | null,
    description: value.description,
    icon: value.icon as string | null,
    id,
    photoMetadata,
    slug: value.slug,
    sortOrder: Number(value.sort_order),
    title: value.title,
  };
}

/**
 * Loads the real published topic catalogue for one active child. Optional
 * reference images are signed under family Storage RLS and raw private paths
 * are not exposed in the returned app model.
 */
export async function listChildPublishedTopicsWithPhoto(
  client: BareTraenClient,
  input: ListChildPublishedTopicsWithPhotoInput,
): Promise<ChildPublishedTopicWithPhoto[]> {
  const childProfileId = normalizeUuid(
    input.childProfileId,
    "invalid_child_profile_id",
  );
  const expectedUserId = normalizeUuid(
    input.expectedUserId,
    "invalid_expected_user_id",
  );
  const familyId = normalizeUuid(input.familyId, "invalid_family_id");
  const expiresInSeconds = validateSignedUrlExpiry(
    input.signedUrlExpiresInSeconds ?? 120,
  );
  let response: Awaited<
    ReturnType<typeof client.rpc<"list_child_published_topics_with_photo">>
  >;

  try {
    response = await client.rpc("list_child_published_topics_with_photo", {
      p_child_profile_id: childProfileId,
      p_expected_user_id: expectedUserId,
      p_family_id: familyId,
    });
  } catch {
    throw new ChildTopicPhotoError("topic_list_failed");
  }

  if (response.error) {
    throw mapContextError(response.error, "topic_list_failed");
  }

  if (!Array.isArray(response.data)) {
    throw new ChildTopicPhotoError("invalid_topic_list_result");
  }

  const parsed = response.data.map((row) =>
    parseTopicRow(row, familyId, childProfileId),
  );

  if (parsed.some((topic) => topic === null)) {
    throw new ChildTopicPhotoError("invalid_topic_list_result");
  }

  const topics = parsed as ParsedTopic[];
  const ids = new Set(topics.map((topic) => topic.id));
  const slugs = new Set(topics.map((topic) => topic.slug));

  if (ids.size !== topics.length || slugs.size !== topics.length) {
    throw new ChildTopicPhotoError("invalid_topic_list_result");
  }

  topics.sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  );

  return Promise.all(
    topics.map(async ({ photoMetadata, ...topic }) => {
      if (photoMetadata === null) return { ...topic, photo: null };

      let signedResponse: Awaited<
        ReturnType<ReturnType<typeof client.storage.from>["createSignedUrl"]>
      >;

      try {
        signedResponse = await client.storage
          .from("ai-media-private")
          .createSignedUrl(photoMetadata.storageObjectPath, expiresInSeconds);
      } catch {
        // The photo is optional and must never make the published topic
        // catalogue unavailable. Keep the validated topic while degrading
        // only this unavailable private attachment.
        return { ...topic, photo: null };
      }

      if (
        signedResponse.error ||
        typeof signedResponse.data?.signedUrl !== "string" ||
        signedResponse.data.signedUrl.length === 0
      ) {
        return { ...topic, photo: null };
      }

      return {
        ...topic,
        photo: {
          expiresInSeconds,
          mediaAssetId: photoMetadata.mediaAssetId,
          mimeType: photoMetadata.mimeType,
          signedUrl: signedResponse.data.signedUrl,
          updatedAt: photoMetadata.updatedAt,
        },
      };
    }),
  );
}
