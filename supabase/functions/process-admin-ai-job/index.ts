import { createClient } from "npm:@supabase/supabase-js@2.112.3";

import { normalizeAdminContentOutput } from "../_shared/ai/admin-content-output.ts";
import {
  generateOpenRouterStructuredText,
  OpenRouterStructuredTextError,
} from "../_shared/ai/openrouter-structured-text.ts";

type Claim = {
  attempt_number: number;
  gateway: string;
  input_data: unknown;
  job_id: string;
  max_cost_microusd: number;
  model: string;
  operation_key:
    | "content.topic_brief"
    | "content.wardrobe_examples"
    | "content.goal_draft"
    | "content.exercise_draft";
  output_contract: unknown;
  prompt_template: string;
  provider: string;
  request_options: unknown;
  timeout_ms: number;
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

    if (done) break;

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
  if (error instanceof OpenRouterStructuredTextError) {
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

function schemaName(operationKey: Claim["operation_key"]): string {
  switch (operationKey) {
    case "content.topic_brief":
      return "admin_topic_brief";
    case "content.wardrobe_examples":
      return "admin_wardrobe_examples";
    case "content.goal_draft":
      return "admin_goal_draft";
    case "content.exercise_draft":
      return "admin_exercise_draft";
  }
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
  const { data: claimRows, error: claimError } = await admin.rpc(
    "claim_admin_ai_job_for_worker",
    { p_job_id: jobId },
  );

  if (claimError) {
    console.error(JSON.stringify({ event: "admin_ai_claim_failed", jobId }));
    return;
  }

  const claim = (claimRows?.[0] ?? null) as Claim | null;

  if (!claim) return;

  let billedCostMicrousd: number | null = null;
  let providerRequestId: string | null = null;
  let usage: Record<string, number> = {};

  try {
    if (
      claim.gateway !== "openrouter" ||
      claim.provider !== "openai" ||
      (claim.operation_key !== "content.topic_brief" &&
        claim.operation_key !== "content.wardrobe_examples" &&
        claim.operation_key !== "content.goal_draft" &&
        claim.operation_key !== "content.exercise_draft")
    ) {
      throw new OpenRouterStructuredTextError({
        attemptCode: "unsupported_gateway",
        publicCode: "server_configuration",
        retryable: false,
      });
    }

    const result = await generateOpenRouterStructuredText({
      apiKey: readRequiredEnvironment("OPENROUTER_API_KEY"),
      editorialInput: claim.input_data,
      model: claim.model,
      options: claim.request_options,
      outputSchema: claim.output_contract,
      schemaName: schemaName(claim.operation_key),
      systemPrompt: claim.prompt_template,
      timeoutMs: claim.timeout_ms,
    });
    billedCostMicrousd = result.costMicrousd;
    providerRequestId = result.providerRequestId;
    usage = result.usage;

    if (result.costMicrousd === null) {
      throw new OpenRouterStructuredTextError({
        attemptCode: "openrouter_cost_unavailable",
        providerRequestId: result.providerRequestId,
        publicCode: "provider_failed",
        retryable: false,
      });
    }

    if (result.costMicrousd > claim.max_cost_microusd) {
      throw new OpenRouterStructuredTextError({
        attemptCode: "provider_cost_limit_exceeded",
        providerRequestId: result.providerRequestId,
        publicCode: "cost_limit_exceeded",
        retryable: false,
      });
    }

    const normalizedOutput = normalizeAdminContentOutput(
      claim.operation_key,
      result.output,
    );

    if (!normalizedOutput) {
      throw new OpenRouterStructuredTextError({
        attemptCode: "invalid_openrouter_output",
        providerRequestId: result.providerRequestId,
        publicCode: "provider_failed",
        retryable: false,
      });
    }

    const completionPayload = {
      p_attempt_number: claim.attempt_number,
      p_cost_microusd: result.costMicrousd,
      p_job_id: claim.job_id,
      p_output_data: normalizedOutput,
      p_provider_request_id: result.providerRequestId,
      p_usage: result.usage,
    };
    let { error: completeError } = await admin.rpc(
      "complete_admin_ai_job_for_worker",
      completionPayload,
    );

    if (completeError) {
      ({ error: completeError } = await admin.rpc(
        "complete_admin_ai_job_for_worker",
        completionPayload,
      ));
    }

    if (completeError) throw new Error("completion_failed");

    console.info(
      JSON.stringify({
        event: "admin_ai_job_succeeded",
        jobId,
        costMicrousd: result.costMicrousd,
      }),
    );
  } catch (error) {
    const mapped = safeError(error);
    const { error: failError } = await admin.rpc(
      "fail_admin_ai_job_for_worker",
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
        event: failError
          ? "admin_ai_fail_transition_failed"
          : "admin_ai_job_failed",
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
      .select("id, requested_by, scope_kind, status")
      .eq("id", jobId)
      .maybeSingle();

    if (
      jobError ||
      !job ||
      job.requested_by !== identity.user.id ||
      job.scope_kind !== "admin"
    ) {
      return jsonResponse({ error: "job_not_found" }, 404);
    }

    if (job.status !== "succeeded" && job.status !== "failed") {
      await processJob(jobId);
    }

    const { data: completedJob, error: completedJobError } = await userClient
      .from("ai_jobs")
      .select("status")
      .eq("id", jobId)
      .maybeSingle();

    if (completedJobError || !completedJob) {
      return jsonResponse({ error: "job_not_found" }, 404);
    }

    return jsonResponse({ jobId, status: completedJob.status }, 200);
  } catch {
    return jsonResponse({ error: "server_configuration" }, 503);
  }
});
