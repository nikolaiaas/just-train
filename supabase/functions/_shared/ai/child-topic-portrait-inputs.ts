import { OpenRouterImageError } from "./openrouter-image.ts";

export type ClaimedPortraitInput = {
  bucket: "ai-media-private" | "wardrobe-images";
  mimeType: "image/jpeg" | "image/png";
  objectPath: string;
};

const JOB_STATUSES = new Set([
  "awaiting_upload",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChildTopicPortraitJobReconciliation = {
  mayProcess: boolean;
  status:
    "awaiting_upload" | "processing" | "succeeded" | "failed" | "cancelled";
};

export function parseChildTopicPortraitJobReconciliation(
  value: unknown,
  expectedJobId: string,
): ChildTopicPortraitJobReconciliation | null {
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    typeof value[0] !== "object" ||
    value[0] === null ||
    Array.isArray(value[0])
  ) {
    return null;
  }

  const row = value[0] as Record<string, unknown>;
  if (
    typeof row.job_id !== "string" ||
    !UUID_PATTERN.test(row.job_id) ||
    row.job_id.toLowerCase() !== expectedJobId.toLowerCase() ||
    typeof row.job_status !== "string" ||
    !JOB_STATUSES.has(row.job_status) ||
    typeof row.may_process !== "boolean" ||
    (row.may_process &&
      row.job_status !== "awaiting_upload" &&
      row.job_status !== "processing")
  ) {
    return null;
  }

  return {
    mayProcess: row.may_process,
    status: row.job_status as ChildTopicPortraitJobReconciliation["status"],
  };
}

export function isMissingChildTopicPortraitClaimRpcError(
  error: unknown,
): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === "42883" || code === "PGRST202";
}

export type ChildTopicPortraitClaimPlan =
  | "fail_closed"
  | "fallback_legacy"
  | "inspect_portrait_table"
  | "use_portrait_claim";

/**
 * Keeps an Edge-before-migration rollout safe: the new table is inspected only
 * after the new RPC has proved that the portrait schema exists.
 */
export function planChildTopicPortraitClaim(input: {
  error: unknown;
  hasClaimRow: boolean;
}): ChildTopicPortraitClaimPlan {
  if (input.error) {
    return isMissingChildTopicPortraitClaimRpcError(input.error)
      ? "fallback_legacy"
      : "fail_closed";
  }

  return input.hasClaimRow ? "use_portrait_claim" : "inspect_portrait_table";
}

export function parseChildTopicPortraitClaimInputs(
  value: unknown,
): ClaimedPortraitInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    throw new OpenRouterImageError({
      attemptCode: "invalid_claimed_inputs",
      publicCode: "server_configuration",
      retryable: false,
    });
  }

  const inputs: ClaimedPortraitInput[] = [];

  for (const candidate of value) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      throw new OpenRouterImageError({
        attemptCode: "invalid_claimed_inputs",
        publicCode: "server_configuration",
        retryable: false,
      });
    }

    const input = candidate as Record<string, unknown>;
    if (
      (input.bucket !== "ai-media-private" &&
        input.bucket !== "wardrobe-images") ||
      typeof input.object_path !== "string" ||
      input.object_path.length < 10 ||
      input.object_path.length > 500 ||
      /(^|\/)\.\.?(\/|$)/.test(input.object_path) ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(input.object_path) ||
      (input.mime_type !== "image/jpeg" && input.mime_type !== "image/png") ||
      (input.bucket === "wardrobe-images" && input.mime_type !== "image/png")
    ) {
      throw new OpenRouterImageError({
        attemptCode: "invalid_claimed_inputs",
        publicCode: "server_configuration",
        retryable: false,
      });
    }

    inputs.push({
      bucket: input.bucket,
      mimeType: input.mime_type,
      objectPath: input.object_path,
    });
  }

  return inputs;
}
