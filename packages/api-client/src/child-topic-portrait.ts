import {
  WARDROBE_EQUIP_SLOTS,
  type WardrobeEquipSlot,
} from "@bare-traen/domain";

import type { AiMediaJobStatus } from "./ai-media.ts";
import type { BareTraenClient } from "./index.ts";

export type PrepareChildTopicBasePortraitInput = {
  childProfileId: string;
  clientRequestId: string;
  expectedUserId: string;
  familyId: string;
  topicId: string;
};

export type PreparedChildTopicBasePortrait = {
  created: boolean;
  jobId: string;
  jobStatus: AiMediaJobStatus;
  outputMediaAssetId: string;
  sourceReferenceMediaAssetId: string;
};

export type SetChildTopicWardrobeItemEquippedAndPrepareRenderInput = {
  childProfileId: string;
  clientRequestId: string;
  equipped: boolean;
  expectedUserId: string;
  familyId: string;
  topicId: string;
  wardrobeItemId: string;
};

export type ChildTopicWardrobeRender = {
  baseMediaAssetId: string | null;
  created: boolean;
  equipmentFingerprint: string;
  equippedWardrobeItemIds: string[];
  errorCode: ChildTopicWardrobeRenderErrorCode | null;
  jobId: string | null;
  jobStatus: AiMediaJobStatus | null;
  mode: "ai_job" | "base" | "stale";
  outputMediaAssetId: string | null;
};

export type ChildTopicWardrobeRenderErrorCode =
  | "base_required"
  | "base_stale"
  | "catalogue_image_missing"
  | "daily_limit_reached"
  | "operation_unavailable";

export type PrepareChildTopicWardrobeRenderInput = {
  childProfileId: string;
  clientRequestId: string;
  expectedUserId: string;
  familyId: string;
  topicId: string;
};

export type ChildTopicWardrobeRenderRequest = {
  equipment: {
    acquiredAt: string;
    childProfileId: string;
    equipSlot: WardrobeEquipSlot;
    equippedAt: string | null;
    isEquipped: boolean;
    wardrobeItemId: string;
  };
  render: ChildTopicWardrobeRender;
};

export type LoadChildTopicPortraitInput = {
  childProfileId: string;
  expectedUserId: string;
  familyId: string;
  signedUrlExpiresInSeconds?: number;
  topicId: string;
};

export type ChildTopicPortraitImage = {
  expiresInSeconds: number;
  jobId: string;
  mediaAssetId: string;
  mimeType: "image/png";
  signedUrl: string;
};

export type ChildTopicPortraitState = {
  base: ChildTopicPortraitImage | null;
  baseSourceMediaAssetId: string | null;
  childProfileId: string;
  currentLook: ChildTopicPortraitImage | null;
  currentReferenceMediaAssetId: string | null;
  displayEquipmentFingerprint: string | null;
  displayKind: "base" | "wardrobe" | null;
  displayedWardrobeItemIds: string[];
  familyId: string;
  hasLiveEquipmentRenderAttempt: boolean;
  isBaseStale: boolean;
  isLookStale: boolean;
  liveEquipmentFingerprint: string;
  liveWardrobeItemIds: string[];
  pendingJob: {
    id: string;
    publicErrorCode: string | null;
    status: AiMediaJobStatus;
  } | null;
  topicId: string;
  updatedAt: string | null;
};

export type ChildTopicPortraitErrorCode =
  | "daily_limit_reached"
  | "family_access_denied"
  | "invalid_child_profile_id"
  | "invalid_client_request_id"
  | "invalid_equipped_state"
  | "invalid_expected_user_id"
  | "invalid_family_id"
  | "invalid_portrait_result"
  | "invalid_topic_id"
  | "invalid_wardrobe_item_id"
  | "portrait_load_failed"
  | "portrait_preparation_failed"
  | "portrait_unavailable"
  | "session_changed"
  | "wardrobe_render_preparation_failed";

const ERROR_MESSAGES: Record<ChildTopicPortraitErrorCode, string> = {
  daily_limit_reached: "The daily image limit has been reached.",
  family_access_denied: "The skill portrait is not available to this family.",
  invalid_child_profile_id: "The child profile id is invalid.",
  invalid_client_request_id: "The portrait request id is invalid.",
  invalid_equipped_state: "The wardrobe equipment state is invalid.",
  invalid_expected_user_id: "The expected adult account id is invalid.",
  invalid_family_id: "The family id is invalid.",
  invalid_portrait_result: "The skill portrait returned invalid data.",
  invalid_topic_id: "The subject id is invalid.",
  invalid_wardrobe_item_id: "The wardrobe item id is invalid.",
  portrait_load_failed: "The skill portrait could not be loaded.",
  portrait_preparation_failed: "The base skill portrait could not be prepared.",
  portrait_unavailable:
    "A current subject photo and base portrait are required for this action.",
  session_changed: "The signed-in account changed before the portrait action.",
  wardrobe_render_preparation_failed:
    "The wardrobe look could not be prepared.",
};

export class ChildTopicPortraitError extends Error {
  readonly code: ChildTopicPortraitErrorCode;

  constructor(code: ChildTopicPortraitErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ChildTopicPortraitError";
    this.code = code;
  }
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const JOB_ERROR_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const JOB_STATUSES = new Set<AiMediaJobStatus>([
  "awaiting_upload",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
]);
const EQUIP_SLOTS = new Set<WardrobeEquipSlot>(WARDROBE_EQUIP_SLOTS);
const WARDROBE_RENDER_ERROR_CODES = new Set<ChildTopicWardrobeRenderErrorCode>([
  "base_required",
  "base_stale",
  "catalogue_image_missing",
  "daily_limit_reached",
  "operation_unavailable",
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
    | "invalid_expected_user_id"
    | "invalid_family_id"
    | "invalid_topic_id"
    | "invalid_wardrobe_item_id",
): string {
  if (!isUuid(value)) throw new ChildTopicPortraitError(code);
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

function isJobStatus(value: unknown): value is AiMediaJobStatus {
  return (
    typeof value === "string" && JOB_STATUSES.has(value as AiMediaJobStatus)
  );
}

function normalizeUuidArray(value: unknown, maximum: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const values = value.map((entry) =>
    isUuid(entry) ? entry.toLowerCase() : null,
  );

  if (values.some((entry) => entry === null)) return null;
  const normalized = values as string[];
  return new Set(normalized).size === normalized.length ? normalized : null;
}

function databaseCode(error: unknown): string | null {
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

function mapDatabaseError(
  error: unknown,
  fallback:
    | "portrait_load_failed"
    | "portrait_preparation_failed"
    | "wardrobe_render_preparation_failed",
): ChildTopicPortraitError {
  const code = databaseCode(error);

  if (code === "28000") return new ChildTopicPortraitError("session_changed");
  if (code === "42501") {
    return new ChildTopicPortraitError("family_access_denied");
  }
  if (code === "P0002") {
    return new ChildTopicPortraitError("portrait_unavailable");
  }
  if (code === "54000") {
    return new ChildTopicPortraitError("daily_limit_reached");
  }

  return new ChildTopicPortraitError(fallback);
}

function normalizeContext<
  T extends {
    childProfileId: string;
    expectedUserId: string;
    familyId: string;
    topicId: string;
  },
>(input: T): T {
  return {
    ...input,
    childProfileId: normalizeUuid(
      input.childProfileId,
      "invalid_child_profile_id",
    ),
    expectedUserId: normalizeUuid(
      input.expectedUserId,
      "invalid_expected_user_id",
    ),
    familyId: normalizeUuid(input.familyId, "invalid_family_id"),
    topicId: normalizeUuid(input.topicId, "invalid_topic_id"),
  };
}

function parseWardrobeRenderRow(
  value: unknown,
): ChildTopicWardrobeRender | null {
  if (!isRecord(value)) return null;

  const equippedIds = normalizeUuidArray(value.equipped_wardrobe_item_ids, 5);
  const mode = value.render_mode;
  const errorCode = value.render_error_code;

  if (
    (mode !== "base" && mode !== "ai_job" && mode !== "stale") ||
    typeof value.created !== "boolean" ||
    !(
      value.base_media_asset_id === null || isUuid(value.base_media_asset_id)
    ) ||
    typeof value.equipment_fingerprint !== "string" ||
    !FINGERPRINT_PATTERN.test(value.equipment_fingerprint) ||
    !equippedIds ||
    !(
      errorCode === null ||
      (typeof errorCode === "string" &&
        WARDROBE_RENDER_ERROR_CODES.has(
          errorCode as ChildTopicWardrobeRenderErrorCode,
        ))
    )
  ) {
    return null;
  }

  if (
    (mode === "base" &&
      (errorCode !== null ||
        value.job_id !== null ||
        value.job_status !== null ||
        value.output_media_asset_id !== null ||
        !isUuid(value.base_media_asset_id) ||
        equippedIds.length !== 0)) ||
    (mode === "ai_job" &&
      (errorCode !== null ||
        !isUuid(value.job_id) ||
        !isJobStatus(value.job_status) ||
        !isUuid(value.base_media_asset_id) ||
        !isUuid(value.output_media_asset_id) ||
        equippedIds.length === 0)) ||
    (mode === "stale" &&
      (errorCode === null ||
        value.job_id !== null ||
        value.job_status !== null ||
        value.output_media_asset_id !== null))
  ) {
    return null;
  }

  return {
    baseMediaAssetId:
      value.base_media_asset_id === null
        ? null
        : (value.base_media_asset_id as string).toLowerCase(),
    created: value.created,
    equipmentFingerprint: value.equipment_fingerprint,
    equippedWardrobeItemIds: equippedIds,
    errorCode: errorCode as ChildTopicWardrobeRenderErrorCode | null,
    jobId:
      value.job_id === null ? null : (value.job_id as string).toLowerCase(),
    jobStatus: value.job_status as AiMediaJobStatus | null,
    mode,
    outputMediaAssetId:
      value.output_media_asset_id === null
        ? null
        : (value.output_media_asset_id as string).toLowerCase(),
  };
}

export async function prepareChildTopicBasePortrait(
  client: BareTraenClient,
  input: PrepareChildTopicBasePortraitInput,
): Promise<PreparedChildTopicBasePortrait> {
  const normalized = normalizeContext({
    ...input,
    clientRequestId: normalizeUuid(
      input.clientRequestId,
      "invalid_client_request_id",
    ),
  });

  let response: Awaited<
    ReturnType<typeof client.rpc<"prepare_child_topic_base_portrait">>
  >;

  try {
    response = await client.rpc("prepare_child_topic_base_portrait", {
      p_child_profile_id: normalized.childProfileId,
      p_client_request_id: normalized.clientRequestId,
      p_expected_user_id: normalized.expectedUserId,
      p_family_id: normalized.familyId,
      p_topic_id: normalized.topicId,
    });
  } catch {
    throw new ChildTopicPortraitError("portrait_preparation_failed");
  }

  if (response.error) {
    throw mapDatabaseError(response.error, "portrait_preparation_failed");
  }

  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  const row = response.data[0];
  if (
    !row ||
    !isUuid(row.job_id) ||
    !isUuid(row.source_reference_media_asset_id) ||
    !isUuid(row.output_media_asset_id) ||
    !isJobStatus(row.job_status) ||
    typeof row.created !== "boolean"
  ) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  return {
    created: row.created,
    jobId: row.job_id.toLowerCase(),
    jobStatus: row.job_status,
    outputMediaAssetId: row.output_media_asset_id.toLowerCase(),
    sourceReferenceMediaAssetId:
      row.source_reference_media_asset_id.toLowerCase(),
  };
}

export async function setChildTopicWardrobeItemEquippedAndPrepareRender(
  client: BareTraenClient,
  input: SetChildTopicWardrobeItemEquippedAndPrepareRenderInput,
): Promise<ChildTopicWardrobeRenderRequest> {
  if (typeof input.equipped !== "boolean") {
    throw new ChildTopicPortraitError("invalid_equipped_state");
  }

  const normalized = normalizeContext({
    ...input,
    clientRequestId: normalizeUuid(
      input.clientRequestId,
      "invalid_client_request_id",
    ),
    wardrobeItemId: normalizeUuid(
      input.wardrobeItemId,
      "invalid_wardrobe_item_id",
    ),
  });

  let response: Awaited<
    ReturnType<
      typeof client.rpc<"set_child_topic_wardrobe_item_equipped_and_prepare_render">
    >
  >;

  try {
    response = await client.rpc(
      "set_child_topic_wardrobe_item_equipped_and_prepare_render",
      {
        p_child_profile_id: normalized.childProfileId,
        p_client_request_id: normalized.clientRequestId,
        p_equipped: normalized.equipped,
        p_expected_user_id: normalized.expectedUserId,
        p_family_id: normalized.familyId,
        p_topic_id: normalized.topicId,
        p_wardrobe_item_id: normalized.wardrobeItemId,
      },
    );
  } catch {
    throw new ChildTopicPortraitError("wardrobe_render_preparation_failed");
  }

  if (response.error) {
    throw mapDatabaseError(
      response.error,
      "wardrobe_render_preparation_failed",
    );
  }

  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  const row = response.data[0];
  const render = parseWardrobeRenderRow(row);

  if (
    !row ||
    row.child_profile_id !== normalized.childProfileId ||
    row.wardrobe_item_id !== normalized.wardrobeItemId ||
    typeof row.equip_slot !== "string" ||
    !EQUIP_SLOTS.has(row.equip_slot as WardrobeEquipSlot) ||
    row.is_equipped !== normalized.equipped ||
    !isTimestamp(row.acquired_at) ||
    (normalized.equipped
      ? !isTimestamp(row.equipped_at)
      : row.equipped_at !== null) ||
    !render
  ) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  return {
    equipment: {
      acquiredAt: row.acquired_at,
      childProfileId: normalized.childProfileId,
      equipSlot: row.equip_slot as WardrobeEquipSlot,
      equippedAt: row.equipped_at,
      isEquipped: normalized.equipped,
      wardrobeItemId: normalized.wardrobeItemId,
    },
    render,
  };
}

/**
 * Prepares the complete currently equipped look without changing a wardrobe
 * item. Use this after a new base succeeds or to retry a failed/stale render.
 */
export async function prepareChildTopicWardrobeRender(
  client: BareTraenClient,
  input: PrepareChildTopicWardrobeRenderInput,
): Promise<ChildTopicWardrobeRender> {
  const normalized = normalizeContext({
    ...input,
    clientRequestId: normalizeUuid(
      input.clientRequestId,
      "invalid_client_request_id",
    ),
  });

  let response: Awaited<
    ReturnType<typeof client.rpc<"prepare_child_topic_wardrobe_render">>
  >;

  try {
    response = await client.rpc("prepare_child_topic_wardrobe_render", {
      p_child_profile_id: normalized.childProfileId,
      p_client_request_id: normalized.clientRequestId,
      p_expected_user_id: normalized.expectedUserId,
      p_family_id: normalized.familyId,
      p_topic_id: normalized.topicId,
    });
  } catch {
    throw new ChildTopicPortraitError("wardrobe_render_preparation_failed");
  }

  if (response.error) {
    throw mapDatabaseError(
      response.error,
      "wardrobe_render_preparation_failed",
    );
  }
  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  const render = parseWardrobeRenderRow(response.data[0]);
  if (!render) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  return render;
}

function expectedPortraitPath(input: {
  childProfileId: string;
  familyId: string;
  jobId: string;
  topicId: string;
}): string {
  return `${input.familyId}/children/${input.childProfileId}/topics/${input.topicId}/portraits/${input.jobId}/output.png`;
}

async function signPortraitImage(
  client: BareTraenClient,
  input: {
    childProfileId: string;
    expiresInSeconds: number;
    familyId: string;
    jobId: string;
    mediaAssetId: string;
    objectPath: string;
    topicId: string;
  },
): Promise<ChildTopicPortraitImage> {
  if (
    input.objectPath !== expectedPortraitPath(input) ||
    !isUuid(input.jobId) ||
    !isUuid(input.mediaAssetId)
  ) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  const { data, error } = await client.storage
    .from("ai-media-private")
    .createSignedUrl(input.objectPath, input.expiresInSeconds);

  if (error || typeof data?.signedUrl !== "string") {
    throw new ChildTopicPortraitError("portrait_load_failed");
  }

  return {
    expiresInSeconds: input.expiresInSeconds,
    jobId: input.jobId.toLowerCase(),
    mediaAssetId: input.mediaAssetId.toLowerCase(),
    mimeType: "image/png",
    signedUrl: data.signedUrl,
  };
}

export async function loadChildTopicPortrait(
  client: BareTraenClient,
  input: LoadChildTopicPortraitInput,
): Promise<ChildTopicPortraitState> {
  const normalized = normalizeContext(input);
  const expiresInSeconds = input.signedUrlExpiresInSeconds ?? 120;
  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 60 ||
    expiresInSeconds > 300
  ) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  let response: Awaited<
    ReturnType<typeof client.rpc<"get_child_topic_portrait">>
  >;
  try {
    response = await client.rpc("get_child_topic_portrait", {
      p_child_profile_id: normalized.childProfileId,
      p_expected_user_id: normalized.expectedUserId,
      p_family_id: normalized.familyId,
      p_topic_id: normalized.topicId,
    });
  } catch {
    throw new ChildTopicPortraitError("portrait_load_failed");
  }

  if (response.error) {
    throw mapDatabaseError(response.error, "portrait_load_failed");
  }
  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  const row = response.data[0];
  const displayIds = normalizeUuidArray(row?.display_wardrobe_item_ids, 5);
  const liveIds = normalizeUuidArray(row?.live_wardrobe_item_ids, 5);

  if (
    !row ||
    row.family_id !== normalized.familyId ||
    row.child_profile_id !== normalized.childProfileId ||
    row.topic_id !== normalized.topicId ||
    !(
      row.current_reference_media_asset_id === null ||
      isUuid(row.current_reference_media_asset_id)
    ) ||
    !(
      row.base_source_media_asset_id === null ||
      isUuid(row.base_source_media_asset_id)
    ) ||
    typeof row.live_equipment_fingerprint !== "string" ||
    !FINGERPRINT_PATTERN.test(row.live_equipment_fingerprint) ||
    !displayIds ||
    !liveIds ||
    typeof row.has_live_equipment_render_attempt !== "boolean" ||
    typeof row.is_base_stale !== "boolean" ||
    typeof row.is_look_stale !== "boolean" ||
    !(row.updated_at === null || isTimestamp(row.updated_at))
  ) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  const baseParts = [
    row.base_job_id,
    row.base_media_asset_id,
    row.base_storage_bucket,
    row.base_storage_object_path,
  ];
  const displayParts = [
    row.display_kind,
    row.display_job_id,
    row.display_media_asset_id,
    row.display_storage_bucket,
    row.display_storage_object_path,
    row.display_equipment_fingerprint,
  ];
  const hasBase = baseParts.every((part) => part !== null);
  const hasDisplay = displayParts.every((part) => part !== null);

  if (
    (!hasBase && !baseParts.every((part) => part === null)) ||
    (!hasBase && row.base_source_media_asset_id !== null) ||
    (!hasDisplay && !displayParts.every((part) => part === null)) ||
    (hasBase &&
      (!isUuid(row.base_job_id) ||
        !isUuid(row.base_media_asset_id) ||
        row.base_storage_bucket !== "ai-media-private" ||
        typeof row.base_storage_object_path !== "string")) ||
    (hasDisplay &&
      ((row.display_kind !== "base" && row.display_kind !== "wardrobe") ||
        !isUuid(row.display_job_id) ||
        !isUuid(row.display_media_asset_id) ||
        row.display_storage_bucket !== "ai-media-private" ||
        typeof row.display_storage_object_path !== "string" ||
        typeof row.display_equipment_fingerprint !== "string" ||
        !FINGERPRINT_PATTERN.test(row.display_equipment_fingerprint))) ||
    (hasDisplay &&
      row.display_kind === "base" &&
      (displayIds.length !== 0 ||
        row.display_job_id !== row.base_job_id ||
        row.display_media_asset_id !== row.base_media_asset_id)) ||
    (hasDisplay &&
      row.display_kind === "wardrobe" &&
      (displayIds.length < 1 || !hasBase))
  ) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  const pendingParts = [
    row.pending_job_id,
    row.pending_job_status,
    row.pending_public_error_code,
  ];
  const hasPending = row.pending_job_id !== null;

  if (
    (!hasPending && !pendingParts.every((part) => part === null)) ||
    (hasPending &&
      (!isUuid(row.pending_job_id) ||
        !isJobStatus(row.pending_job_status) ||
        !(
          row.pending_public_error_code === null ||
          (typeof row.pending_public_error_code === "string" &&
            JOB_ERROR_PATTERN.test(row.pending_public_error_code))
        )))
  ) {
    throw new ChildTopicPortraitError("invalid_portrait_result");
  }

  const common = {
    childProfileId: normalized.childProfileId,
    expiresInSeconds,
    familyId: normalized.familyId,
    topicId: normalized.topicId,
  };
  const base = hasBase
    ? await signPortraitImage(client, {
        ...common,
        jobId: row.base_job_id,
        mediaAssetId: row.base_media_asset_id,
        objectPath: row.base_storage_object_path,
      })
    : null;
  const currentLook = hasDisplay
    ? row.display_media_asset_id === row.base_media_asset_id && base
      ? base
      : await signPortraitImage(client, {
          ...common,
          jobId: row.display_job_id,
          mediaAssetId: row.display_media_asset_id,
          objectPath: row.display_storage_object_path,
        })
    : null;

  return {
    base,
    baseSourceMediaAssetId:
      row.base_source_media_asset_id?.toLowerCase() ?? null,
    childProfileId: normalized.childProfileId,
    currentLook,
    currentReferenceMediaAssetId:
      row.current_reference_media_asset_id?.toLowerCase() ?? null,
    displayEquipmentFingerprint: row.display_equipment_fingerprint,
    displayKind: row.display_kind,
    displayedWardrobeItemIds: displayIds,
    familyId: normalized.familyId,
    hasLiveEquipmentRenderAttempt: row.has_live_equipment_render_attempt,
    isBaseStale: row.is_base_stale,
    isLookStale: row.is_look_stale,
    liveEquipmentFingerprint: row.live_equipment_fingerprint,
    liveWardrobeItemIds: liveIds,
    pendingJob: hasPending
      ? {
          id: row.pending_job_id.toLowerCase(),
          publicErrorCode: row.pending_public_error_code,
          status: row.pending_job_status,
        }
      : null,
    topicId: normalized.topicId,
    updatedAt: row.updated_at,
  };
}
