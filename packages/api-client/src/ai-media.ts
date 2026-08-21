import type { BareTraenClient } from "./index.ts";

export const AI_CARTOON_OPERATION_KEY = "portrait.cartoon_3d" as const;
export const AI_MEDIA_MAX_INPUT_BYTES = 8 * 1024 * 1024;

export type AiMediaSubject = "synthetic" | "adult_test" | "child";
export type AiMediaMimeType = "image/jpeg" | "image/png" | "image/webp";
export type AiMediaJobStatus =
  "awaiting_upload" | "processing" | "succeeded" | "failed" | "cancelled";

export type PrepareAiMediaJobInput = {
  clientRequestId: string;
  childProfileId: string | null;
  expectedUserId: string;
  familyId: string;
  inputMimeType: AiMediaMimeType;
  operationKey: string;
  subjectKind: AiMediaSubject;
};

export type PreparedAiMediaJob = {
  created: boolean;
  inputAssetId: string;
  inputMimeType: AiMediaMimeType;
  inputObjectPath: string;
  jobId: string;
  jobStatus: AiMediaJobStatus;
  outputAssetId: string;
  storageBucket: string;
};

export type AiMediaJob = {
  completedAt: string | null;
  id: string;
  processingStartedAt: string | null;
  publicErrorCode: string | null;
  status: AiMediaJobStatus;
};

export type AiMediaOutput = {
  expiresInSeconds: number;
  mimeType: "image/png";
  signedUrl: string;
};

export type AiMediaErrorCode =
  | "family_access_denied"
  | "input_too_large"
  | "invalid_child_profile_id"
  | "invalid_client_request_id"
  | "invalid_expected_user_id"
  | "invalid_family_id"
  | "invalid_image_bytes"
  | "invalid_mime_type"
  | "invalid_operation_key"
  | "invalid_preparation_result"
  | "invalid_subject_kind"
  | "job_not_found"
  | "job_status_failed"
  | "operation_unavailable"
  | "preparation_failed"
  | "result_not_ready"
  | "session_changed"
  | "start_failed"
  | "upload_failed";

const ERROR_MESSAGES: Record<AiMediaErrorCode, string> = {
  family_access_denied: "The family cannot create this AI media job.",
  input_too_large: "The input image is too large.",
  invalid_child_profile_id: "The child profile for this image is invalid.",
  invalid_client_request_id: "The AI media request id is invalid.",
  invalid_expected_user_id: "The expected adult account id is invalid.",
  invalid_family_id: "The family id is invalid.",
  invalid_image_bytes: "The input image bytes are invalid.",
  invalid_mime_type: "The input image type is invalid.",
  invalid_operation_key: "The AI operation key is invalid.",
  invalid_preparation_result: "The AI media preparation result is invalid.",
  invalid_subject_kind: "The AI media subject type is invalid.",
  job_not_found: "The AI media job could not be found.",
  job_status_failed: "The AI media job status could not be loaded.",
  operation_unavailable: "The AI operation is not available.",
  preparation_failed: "The AI media job could not be prepared.",
  result_not_ready: "The AI media result is not ready.",
  session_changed: "The signed-in account changed before the AI request.",
  start_failed: "The AI media job could not be started.",
  upload_failed: "The AI media input could not be uploaded.",
};

export class AiMediaError extends Error {
  readonly code: AiMediaErrorCode;
  readonly publicJobErrorCode: string | null;

  constructor(
    code: AiMediaErrorCode,
    publicJobErrorCode: string | null = null,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = "AiMediaError";
    this.code = code;
    this.publicJobErrorCode = publicJobErrorCode;
  }
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const JOB_ERROR_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const MIME_TYPES = new Set<AiMediaMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const JOB_STATUSES = new Set<AiMediaJobStatus>([
  "awaiting_upload",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
]);

function validateUuid(
  value: unknown,
  code:
    | "invalid_client_request_id"
    | "invalid_child_profile_id"
    | "invalid_expected_user_id"
    | "invalid_family_id",
): string {
  if (
    typeof value !== "string" ||
    !UUID_PATTERN.test(value) ||
    value.toLowerCase() === NIL_UUID
  ) {
    throw new AiMediaError(code);
  }

  return value.toLowerCase();
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validateOperationKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 120 ||
    !OPERATION_KEY_PATTERN.test(value)
  ) {
    throw new AiMediaError("invalid_operation_key");
  }

  return value;
}

function validateSubject(value: unknown): AiMediaSubject {
  if (value !== "synthetic" && value !== "adult_test" && value !== "child") {
    throw new AiMediaError("invalid_subject_kind");
  }

  return value;
}

function validateChildProfileId(
  value: unknown,
  subjectKind: AiMediaSubject,
): string | null {
  if (subjectKind === "child") {
    return validateUuid(value, "invalid_child_profile_id");
  }

  if (value !== null && value !== undefined) {
    throw new AiMediaError("invalid_child_profile_id");
  }

  return null;
}

function validateMimeType(value: unknown): AiMediaMimeType {
  if (typeof value !== "string" || !MIME_TYPES.has(value as AiMediaMimeType)) {
    throw new AiMediaError("invalid_mime_type");
  }

  return value as AiMediaMimeType;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  );
}

export function detectAiMediaMimeType(
  input: ArrayBuffer | Uint8Array,
): AiMediaMimeType | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
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

function mapPreparationError(error: { code?: string } | null): AiMediaError {
  if (error?.code === "28000") {
    return new AiMediaError("session_changed");
  }

  if (error?.code === "42501") {
    return new AiMediaError("family_access_denied");
  }

  if (error?.code === "P0002") {
    return new AiMediaError("operation_unavailable");
  }

  return new AiMediaError("preparation_failed");
}

function isStatus(value: unknown): value is AiMediaJobStatus {
  return (
    typeof value === "string" && JOB_STATUSES.has(value as AiMediaJobStatus)
  );
}

/**
 * Reserves a retry-safe private AI job. Prompt, model, provider, and request
 * options are deliberately absent: the server pins those from the active
 * immutable operation version.
 */
export async function prepareAiMediaJob(
  client: BareTraenClient,
  input: PrepareAiMediaJobInput,
): Promise<PreparedAiMediaJob> {
  const clientRequestId = validateUuid(
    input.clientRequestId,
    "invalid_client_request_id",
  );
  const expectedUserId = validateUuid(
    input.expectedUserId,
    "invalid_expected_user_id",
  );
  const familyId = validateUuid(input.familyId, "invalid_family_id");
  const inputMimeType = validateMimeType(input.inputMimeType);
  const operationKey = validateOperationKey(input.operationKey);
  const subjectKind = validateSubject(input.subjectKind);
  const childProfileId = validateChildProfileId(
    input.childProfileId,
    subjectKind,
  );
  let response: Awaited<ReturnType<typeof client.rpc<"prepare_ai_media_job">>>;

  try {
    response = await client.rpc("prepare_ai_media_job", {
      p_child_profile_id: childProfileId ?? undefined,
      p_client_request_id: clientRequestId,
      p_expected_user_id: expectedUserId,
      p_family_id: familyId,
      p_input_mime_type: inputMimeType,
      p_operation_key: operationKey,
      p_subject_kind: subjectKind,
    });
  } catch {
    throw new AiMediaError("preparation_failed");
  }

  if (response.error) {
    throw mapPreparationError(response.error);
  }

  if (!Array.isArray(response.data) || response.data.length !== 1) {
    throw new AiMediaError("invalid_preparation_result");
  }

  const row = response.data[0];
  const expectedInputExtension =
    inputMimeType === "image/jpeg"
      ? "jpg"
      : inputMimeType === "image/png"
        ? "png"
        : "webp";

  if (
    !row ||
    !isUuid(row.job_id) ||
    !isUuid(row.input_asset_id) ||
    !isUuid(row.output_asset_id) ||
    row.storage_bucket !== "ai-media-private" ||
    typeof row.input_object_path !== "string" ||
    row.input_object_path !==
      `${familyId}/${expectedUserId}/${row.job_id}/input.${expectedInputExtension}` ||
    !isStatus(row.job_status) ||
    typeof row.created !== "boolean"
  ) {
    throw new AiMediaError("invalid_preparation_result");
  }

  return {
    created: row.created,
    inputAssetId: row.input_asset_id,
    inputMimeType,
    inputObjectPath: row.input_object_path,
    jobId: row.job_id,
    jobStatus: row.job_status,
    outputAssetId: row.output_asset_id,
    storageBucket: row.storage_bucket,
  };
}

export async function uploadAiMediaInput(
  client: BareTraenClient,
  prepared: PreparedAiMediaJob,
  input: ArrayBuffer | Uint8Array,
): Promise<void> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (
    bytes.byteLength === 0 ||
    detectAiMediaMimeType(bytes) !== prepared.inputMimeType
  ) {
    throw new AiMediaError("invalid_image_bytes");
  }

  if (bytes.byteLength > AI_MEDIA_MAX_INPUT_BYTES) {
    throw new AiMediaError("input_too_large");
  }

  const { error } = await client.storage
    .from(prepared.storageBucket)
    .upload(prepared.inputObjectPath, bytes, {
      cacheControl: "0",
      contentType: prepared.inputMimeType,
      upsert: false,
    });

  if (error) {
    const statusCode = "statusCode" in error ? String(error.statusCode) : "";

    if (!prepared.created && statusCode === "409") {
      return;
    }

    throw new AiMediaError("upload_failed");
  }
}

export async function startAiMediaJob(
  client: BareTraenClient,
  jobId: string,
): Promise<"accepted" | "succeeded"> {
  if (!isUuid(jobId)) {
    throw new AiMediaError("job_not_found");
  }

  const { data, error } = await client.functions.invoke("process-ai-job", {
    body: { jobId },
  });

  if (
    error ||
    typeof data !== "object" ||
    data === null ||
    data.jobId !== jobId ||
    (data.status !== "accepted" && data.status !== "succeeded")
  ) {
    throw new AiMediaError("start_failed");
  }

  return data.status;
}

export async function getAiMediaJob(
  client: BareTraenClient,
  jobId: string,
): Promise<AiMediaJob> {
  if (!isUuid(jobId)) {
    throw new AiMediaError("job_not_found");
  }

  const { data, error } = await client
    .from("ai_jobs")
    .select(
      "id, status, public_error_code, completed_at, processing_started_at",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new AiMediaError("job_status_failed");
  }

  if (!data || data.id !== jobId || !isStatus(data.status)) {
    throw new AiMediaError("job_not_found");
  }

  const publicErrorCode = data.public_error_code;

  if (
    publicErrorCode !== null &&
    (typeof publicErrorCode !== "string" ||
      publicErrorCode.length > 120 ||
      !JOB_ERROR_PATTERN.test(publicErrorCode))
  ) {
    throw new AiMediaError("job_status_failed");
  }

  return {
    completedAt: data.completed_at,
    id: data.id,
    processingStartedAt: data.processing_started_at,
    publicErrorCode,
    status: data.status,
  };
}

export async function createAiMediaOutputUrl(
  client: BareTraenClient,
  jobId: string,
  expiresInSeconds = 120,
): Promise<AiMediaOutput> {
  if (!isUuid(jobId)) {
    throw new AiMediaError("job_not_found");
  }

  if (
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 60 ||
    expiresInSeconds > 300
  ) {
    throw new AiMediaError("result_not_ready");
  }

  const { data: link, error: linkError } = await client
    .from("ai_job_media")
    .select("media_asset_id")
    .eq("job_id", jobId)
    .eq("slot", "generated_image")
    .eq("ordinal", 0)
    .maybeSingle();

  if (linkError || !link || !isUuid(link.media_asset_id)) {
    throw new AiMediaError("result_not_ready");
  }

  const { data: asset, error: assetError } = await client
    .from("media_assets")
    .select("id, status, mime_type, storage_bucket, storage_object_path")
    .eq("id", link.media_asset_id)
    .maybeSingle();

  if (
    assetError ||
    !asset ||
    asset.id !== link.media_asset_id ||
    asset.status !== "ready" ||
    asset.mime_type !== "image/png" ||
    asset.storage_bucket !== "ai-media-private" ||
    typeof asset.storage_object_path !== "string"
  ) {
    throw new AiMediaError("result_not_ready");
  }

  const { data: signed, error: signedError } = await client.storage
    .from(asset.storage_bucket)
    .createSignedUrl(asset.storage_object_path, expiresInSeconds);

  if (signedError || !signed?.signedUrl) {
    throw new AiMediaError("result_not_ready");
  }

  return {
    expiresInSeconds,
    mimeType: "image/png",
    signedUrl: signed.signedUrl,
  };
}
