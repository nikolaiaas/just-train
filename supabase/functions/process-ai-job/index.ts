import { createClient } from "npm:@supabase/supabase-js@2.112.3";

import {
  generateOpenRouterMultiImage,
  OpenRouterImageError,
  type OpenRouterImageReference,
} from "../_shared/ai/openrouter-image.ts";
import {
  detectSupportedImageMimeType,
  sha256Hex,
} from "../_shared/ai/bytes.ts";
import {
  parseChildTopicPortraitJobReconciliation,
  parseChildTopicPortraitClaimInputs,
  planChildTopicPortraitClaim,
  type ClaimedPortraitInput,
} from "../_shared/ai/child-topic-portrait-inputs.ts";

type EdgeRuntimeApi = { waitUntil(promise: Promise<unknown>): void };
type EdgeGlobal = typeof globalThis & { EdgeRuntime?: EdgeRuntimeApi };

type Claim = {
  attempt_number: number;
  gateway: string;
  input_mime_type: string;
  input_object_path: string;
  job_id: string;
  max_cost_microusd: number;
  model: string;
  output_asset_id: string;
  output_object_path: string;
  prompt_template: string;
  provider: string;
  request_options: unknown;
  storage_bucket: string;
  timeout_ms: number;
  input_images?: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function readRequiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(`missing_${name.toLowerCase()}`);
  }

  return value;
}

function readNamedKey(jsonName: string, legacyName: string): string {
  const serialized = Deno.env.get(jsonName);

  if (serialized) {
    try {
      const parsed = JSON.parse(serialized) as Record<string, unknown>;
      const key = parsed.default;

      if (typeof key === "string" && key.length > 0) {
        return key;
      }
    } catch {
      throw new Error(`invalid_${jsonName.toLowerCase()}`);
    }
  }

  return readRequiredEnvironment(legacyName);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function readClaimedInputs(claim: Claim): ClaimedPortraitInput[] {
  const value = claim.input_images;

  if (value === undefined) {
    return [
      {
        bucket: claim.storage_bucket,
        mimeType: claim.input_mime_type as "image/jpeg" | "image/png",
        objectPath: claim.input_object_path,
      },
    ];
  }

  return parseChildTopicPortraitClaimInputs(value);
}

async function readBoundedRequestJson(
  request: Request,
): Promise<{ body: unknown; error: null } | { body: null; error: string }> {
  if (!request.body) {
    return { body: null, error: "invalid_request" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > 1_024) {
      await reader.cancel();
      return { body: null, error: "request_too_large" };
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      body: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      error: null,
    };
  } catch {
    return { body: null, error: "invalid_request" };
  }
}

function safeError(error: unknown): {
  attemptCode: string;
  providerRequestId: string | null;
  publicCode: string;
} {
  if (error instanceof OpenRouterImageError) {
    return {
      attemptCode: error.attemptCode,
      providerRequestId: error.providerRequestId,
      publicCode: error.publicCode,
    };
  }

  return {
    attemptCode: "worker_failed",
    providerRequestId: null,
    publicCode: "worker_interrupted",
  };
}

function readStorageStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return null;
  }

  const value = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isInteger(value) ? value : null;
}

async function processJob(jobId: string): Promise<void> {
  const supabaseUrl = readRequiredEnvironment("SUPABASE_URL");
  const secretKey = readNamedKey(
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false },
  });
  const portraitClaim = await admin.rpc(
    "claim_child_topic_portrait_job_for_worker",
    { p_job_id: jobId },
  );
  let claimRows = portraitClaim.data as unknown[] | null;
  let claimError: unknown = portraitClaim.error;

  const portraitClaimPlan = planChildTopicPortraitClaim({
    error: claimError,
    hasClaimRow: Boolean(claimRows?.[0]),
  });

  if (portraitClaimPlan === "fail_closed") {
    console.error(JSON.stringify({ event: "ai_claim_failed", jobId }));
    return;
  }

  if (portraitClaimPlan === "inspect_portrait_table") {
    const { data: portraitRender, error: portraitRenderError } = await admin
      .from("child_topic_portrait_renders")
      .select("job_id")
      .eq("job_id", jobId)
      .maybeSingle();

    if (portraitRenderError) {
      console.error(JSON.stringify({ event: "ai_claim_failed", jobId }));
      return;
    }

    if (portraitRender) {
      return;
    }
  }

  if (
    portraitClaimPlan === "fallback_legacy" ||
    portraitClaimPlan === "inspect_portrait_table"
  ) {
    const legacyClaim = await admin.rpc("claim_ai_media_job_for_worker", {
      p_job_id: jobId,
    });
    claimRows = legacyClaim.data as unknown[] | null;
    claimError = legacyClaim.error;

    if (claimError) {
      console.error(JSON.stringify({ event: "ai_claim_failed", jobId }));
      return;
    }
  }

  const claim = (claimRows?.[0] ?? null) as Claim | null;

  if (!claim) {
    return;
  }

  let billedCostMicrousd: number | null = null;
  let providerRequestId: string | null = null;
  let usage: Record<string, number> = {};

  try {
    if (claim.gateway !== "openrouter" || claim.provider !== "openai") {
      throw new OpenRouterImageError({
        attemptCode: "unsupported_gateway",
        publicCode: "server_configuration",
        retryable: false,
      });
    }

    const claimedInputs = readClaimedInputs(claim);
    const inputReferences: OpenRouterImageReference[] = [];
    let totalInputBytes = 0;

    for (const claimedInput of claimedInputs) {
      const { data: inputBlob, error: downloadError } = await admin.storage
        .from(claimedInput.bucket)
        .download(claimedInput.objectPath);

      if (downloadError || !inputBlob) {
        const status = readStorageStatus(downloadError);
        throw new OpenRouterImageError({
          attemptCode: "input_download_failed",
          publicCode:
            status === 404 || !downloadError
              ? "invalid_input_image"
              : "worker_interrupted",
          retryable: status !== 404 && Boolean(downloadError),
        });
      }

      if (inputBlob.size === 0 || inputBlob.size > 8 * 1024 * 1024) {
        throw new OpenRouterImageError({
          attemptCode: "input_size_invalid",
          publicCode: "invalid_input_image",
          retryable: false,
        });
      }

      totalInputBytes += inputBlob.size;
      if (totalInputBytes > 32 * 1024 * 1024) {
        throw new OpenRouterImageError({
          attemptCode: "total_input_size_invalid",
          publicCode: "invalid_input_image",
          retryable: false,
        });
      }

      const inputBytes = new Uint8Array(await inputBlob.arrayBuffer());
      const detectedInputType = detectSupportedImageMimeType(inputBytes);

      if (!detectedInputType || detectedInputType !== claimedInput.mimeType) {
        throw new OpenRouterImageError({
          attemptCode: "input_signature_mismatch",
          publicCode: "invalid_input_image",
          retryable: false,
        });
      }

      inputReferences.push({
        bytes: inputBytes,
        mimeType: claimedInput.mimeType,
      });
    }

    const result = await generateOpenRouterMultiImage({
      apiKey: readRequiredEnvironment("OPENROUTER_API_KEY"),
      inputReferences,
      model: claim.model,
      options: claim.request_options,
      prompt: claim.prompt_template,
      timeoutMs: claim.timeout_ms,
    });
    billedCostMicrousd = result.costMicrousd;
    providerRequestId = result.providerRequestId;
    usage = result.usage;

    if (result.costMicrousd === null) {
      throw new OpenRouterImageError({
        attemptCode: "openrouter_cost_unavailable",
        providerRequestId: result.providerRequestId,
        publicCode: "provider_failed",
        retryable: false,
      });
    }

    if (result.costMicrousd > claim.max_cost_microusd) {
      throw new OpenRouterImageError({
        attemptCode: "provider_cost_limit_exceeded",
        providerRequestId: result.providerRequestId,
        publicCode: "cost_limit_exceeded",
        retryable: false,
      });
    }

    const outputSha256 = await sha256Hex(result.bytes);
    const { error: uploadError } = await admin.storage
      .from(claim.storage_bucket)
      .upload(claim.output_object_path, result.bytes, {
        cacheControl: "0",
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      throw new OpenRouterImageError({
        attemptCode: "output_upload_failed",
        providerRequestId: result.providerRequestId,
        publicCode: "worker_interrupted",
        retryable: true,
      });
    }

    const completionPayload = {
      p_attempt_number: claim.attempt_number,
      p_cost_microusd: result.costMicrousd,
      p_job_id: claim.job_id,
      p_output_asset_id: claim.output_asset_id,
      p_output_byte_size: result.bytes.byteLength,
      p_output_sha256_hex: outputSha256,
      p_provider_request_id: result.providerRequestId,
      p_usage: result.usage,
    };
    let { error: completeError } = await admin.rpc(
      "complete_ai_media_job_for_worker",
      completionPayload,
    );

    if (completeError) {
      ({ error: completeError } = await admin.rpc(
        "complete_ai_media_job_for_worker",
        completionPayload,
      ));
    }

    if (completeError) {
      throw new Error("completion_failed");
    }

    console.info(
      JSON.stringify({
        event: "ai_job_succeeded",
        jobId,
        costMicrousd: result.costMicrousd,
      }),
    );
  } catch (error) {
    const mapped = safeError(error);
    const { error: failError } = await admin.rpc(
      "fail_ai_media_job_for_worker",
      {
        p_attempt_error_code: mapped.attemptCode,
        p_attempt_number: claim.attempt_number,
        p_cost_microusd: billedCostMicrousd,
        p_job_id: claim.job_id,
        p_provider_request_id: mapped.providerRequestId ?? providerRequestId,
        p_public_error_code: mapped.publicCode,
        p_usage: usage,
      },
    );
    console.error(
      JSON.stringify({
        event: failError ? "ai_fail_transition_failed" : "ai_job_failed",
        jobId,
        errorCode: mapped.attemptCode,
      }),
    );
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(contentLength) && contentLength > 1_024) {
    return jsonResponse({ error: "request_too_large" }, 413);
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "authentication_required" }, 401);
  }

  const parsedRequest = await readBoundedRequestJson(request);

  if (parsedRequest.error) {
    return jsonResponse(
      { error: parsedRequest.error },
      parsedRequest.error === "request_too_large" ? 413 : 400,
    );
  }

  const payload = parsedRequest.body;

  const jobId =
    typeof payload === "object" && payload !== null && "jobId" in payload
      ? (payload as { jobId?: unknown }).jobId
      : null;

  if (!isUuid(jobId)) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  try {
    const supabaseUrl = readRequiredEnvironment("SUPABASE_URL");
    const publishableKey = readNamedKey(
      "SUPABASE_PUBLISHABLE_KEYS",
      "SUPABASE_ANON_KEY",
    );
    const userClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: identity, error: identityError } =
      await userClient.auth.getUser();

    if (identityError || !identity.user) {
      return jsonResponse({ error: "authentication_required" }, 401);
    }

    const { data: job, error: jobError } = await userClient
      .from("ai_jobs")
      .select("id, requested_by, status")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      return jsonResponse({ error: "job_not_found" }, 404);
    }

    let observedStatus = job.status;
    let mayProcess = job.requested_by === identity.user.id;

    if (!mayProcess) {
      const { data: reconciliationRows, error: reconciliationError } =
        await userClient.rpc("reconcile_child_topic_portrait_job_start", {
          p_expected_user_id: identity.user.id,
          p_job_id: jobId,
        });
      const reconciliation = parseChildTopicPortraitJobReconciliation(
        reconciliationRows,
        jobId,
      );

      if (reconciliationError || !reconciliation) {
        return jsonResponse({ error: "job_not_found" }, 404);
      }

      observedStatus = reconciliation.status;
      mayProcess = reconciliation.mayProcess;
    }

    if (observedStatus === "succeeded") {
      return jsonResponse({ jobId, status: "succeeded" }, 200);
    }

    if (!mayProcess) {
      return jsonResponse({ jobId, status: "accepted" }, 202);
    }

    const work = processJob(jobId);
    const edgeRuntime = (globalThis as EdgeGlobal).EdgeRuntime;

    if (edgeRuntime) {
      edgeRuntime.waitUntil(work);
    } else {
      await work;
    }

    return jsonResponse({ jobId, status: "accepted" }, 202);
  } catch {
    return jsonResponse({ error: "server_configuration" }, 503);
  }
});
