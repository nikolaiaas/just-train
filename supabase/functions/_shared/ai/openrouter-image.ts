import {
  base64ToBytes,
  bytesToBase64,
  detectSupportedImageMimeType,
} from "./bytes.ts";

const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";
const OPENROUTER_GENERATION_URL = "https://openrouter.ai/api/v1/generation";
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;

type FetchLike = typeof fetch;

type OpenRouterUsage = {
  completion_tokens?: number;
  cost?: number;
  cost_details?: {
    upstream_inference_cost?: number;
  };
  is_byok?: boolean;
  prompt_tokens?: number;
  total_tokens?: number;
};

// Keep provider routing and quality server-owned so clients cannot silently
// select a different model, increase the bill, or enable fallbacks.
export type OpenRouterImageOptions = {
  aspect_ratio: "1:1";
  background: "opaque";
  n: 1;
  provider: {
    allow_fallbacks: false;
    only: ["openai"];
  };
  quality: "low";
};

export type OpenRouterImageResult = {
  bytes: Uint8Array;
  costMicrousd: number | null;
  providerRequestId: string | null;
  usage: Record<string, number>;
};

export class OpenRouterImageError extends Error {
  readonly attemptCode: string;
  readonly providerRequestId: string | null;
  readonly publicCode: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(input: {
    attemptCode: string;
    providerRequestId?: string | null;
    publicCode: string;
    retryable: boolean;
    retryAfterSeconds?: number | null;
  }) {
    super(input.attemptCode);
    this.name = "OpenRouterImageError";
    this.attemptCode = input.attemptCode;
    this.providerRequestId = input.providerRequestId ?? null;
    this.publicCode = input.publicCode;
    this.retryable = input.retryable;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

export function parseOpenRouterImageOptions(
  value: unknown,
): OpenRouterImageOptions {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "n",
      "aspect_ratio",
      "background",
      "quality",
      "provider",
    ]) ||
    value.n !== 1 ||
    value.aspect_ratio !== "1:1" ||
    value.background !== "opaque" ||
    value.quality !== "low" ||
    !isRecord(value.provider) ||
    !hasOnlyKeys(value.provider, ["only", "allow_fallbacks"]) ||
    !Array.isArray(value.provider.only) ||
    value.provider.only.length !== 1 ||
    value.provider.only[0] !== "openai" ||
    value.provider.allow_fallbacks !== false
  ) {
    throw new OpenRouterImageError({
      attemptCode: "unsafe_request_options",
      publicCode: "server_configuration",
      retryable: false,
    });
  }

  return value as OpenRouterImageOptions;
}

function validateImageRequest(input: { model: string; prompt: string }): void {
  if (input.model !== "openai/gpt-image-2") {
    throw new OpenRouterImageError({
      attemptCode: "unsupported_model",
      publicCode: "server_configuration",
      retryable: false,
    });
  }

  if (
    input.prompt.trim() !== input.prompt ||
    input.prompt.length === 0 ||
    input.prompt.length > 12000
  ) {
    throw new OpenRouterImageError({
      attemptCode: "invalid_prompt",
      publicCode: "server_configuration",
      retryable: false,
    });
  }
}

export function createOpenRouterTextToImageRequest(input: {
  model: string;
  options: unknown;
  prompt: string;
}): Record<string, unknown> {
  validateImageRequest(input);
  const options = parseOpenRouterImageOptions(input.options);

  return {
    model: input.model,
    prompt: input.prompt,
    ...options,
  };
}

export function createOpenRouterImageRequest(input: {
  inputBytes: Uint8Array;
  inputMimeType: "image/jpeg" | "image/png" | "image/webp";
  model: string;
  options: unknown;
  prompt: string;
}): Record<string, unknown> {
  validateImageRequest(input);

  // This operation has been live-verified with PNG and the native client emits
  // JPEG. Keep the shared detector broader for future operations, but accept
  // only the formats declared by this operation version.
  if (input.inputMimeType === "image/webp") {
    throw new OpenRouterImageError({
      attemptCode: "unsupported_input_mime_type",
      publicCode: "invalid_input_image",
      retryable: false,
    });
  }

  const detectedMimeType = detectSupportedImageMimeType(input.inputBytes);

  if (detectedMimeType !== input.inputMimeType) {
    throw new OpenRouterImageError({
      attemptCode: "input_signature_mismatch",
      publicCode: "invalid_input_image",
      retryable: false,
    });
  }

  const options = parseOpenRouterImageOptions(input.options);

  return {
    model: input.model,
    prompt: input.prompt,
    ...options,
    input_references: [
      {
        type: "image_url",
        image_url: {
          url: `data:${input.inputMimeType};base64,${bytesToBase64(input.inputBytes)}`,
        },
      },
    ],
  };
}

function mapHttpError(
  status: number,
  providerRequestId: string | null,
  errorType: string | null,
  retryAfterSeconds: number | null,
): OpenRouterImageError {
  if (errorType === "content_policy_violation" || errorType === "refusal") {
    return new OpenRouterImageError({
      attemptCode: `openrouter_${errorType}`,
      providerRequestId,
      publicCode: "provider_rejected_input",
      retryable: false,
    });
  }

  if (
    errorType === "invalid_image" ||
    errorType === "image_too_large" ||
    errorType === "image_too_small" ||
    errorType === "unsupported_image_format" ||
    errorType === "image_not_found" ||
    errorType === "image_download_failed"
  ) {
    return new OpenRouterImageError({
      attemptCode: `openrouter_${errorType}`,
      providerRequestId,
      publicCode: "invalid_input_image",
      retryable: false,
    });
  }

  if (status === 429 || errorType === "rate_limit_exceeded") {
    return new OpenRouterImageError({
      attemptCode: "openrouter_rate_limited",
      providerRequestId,
      publicCode: "provider_rate_limited",
      retryable: true,
      retryAfterSeconds,
    });
  }

  if (
    [500, 502, 503, 504, 524, 529].includes(status) ||
    errorType === "provider_overloaded" ||
    errorType === "provider_unavailable" ||
    errorType === "server" ||
    errorType === "timeout" ||
    errorType === "unmapped"
  ) {
    return new OpenRouterImageError({
      attemptCode: errorType
        ? `openrouter_${errorType}`
        : `openrouter_http_${status}`,
      providerRequestId,
      publicCode: "provider_unavailable",
      retryable: true,
      retryAfterSeconds,
    });
  }

  if (
    [401, 402, 403, 404].includes(status) ||
    errorType === "authentication" ||
    errorType === "payment_required" ||
    errorType === "permission_denied" ||
    errorType === "not_found"
  ) {
    return new OpenRouterImageError({
      attemptCode: errorType
        ? `openrouter_${errorType}`
        : `openrouter_http_${status}`,
      providerRequestId,
      publicCode: "server_configuration",
      retryable: false,
    });
  }

  if (status === 408) {
    return new OpenRouterImageError({
      attemptCode: "openrouter_outcome_unknown",
      providerRequestId,
      publicCode: "provider_outcome_unknown",
      retryable: false,
    });
  }

  if ([400, 413, 422].includes(status)) {
    return new OpenRouterImageError({
      attemptCode: `openrouter_http_${status}`,
      providerRequestId,
      publicCode: "provider_rejected_input",
      retryable: false,
    });
  }

  return new OpenRouterImageError({
    attemptCode: `openrouter_http_${status}`,
    providerRequestId,
    publicCode: "provider_failed",
    retryable: false,
  });
}

function normalizeUsage(value: unknown): {
  costMicrousd: number | null;
  usage: Record<string, number>;
} {
  if (!isRecord(value)) {
    return { costMicrousd: null, usage: {} };
  }

  const usage: Record<string, number> = {};
  const allowedKeys = [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
  ] as const;

  for (const key of allowedKeys) {
    const candidate = value[key];

    if (
      typeof candidate === "number" &&
      Number.isSafeInteger(candidate) &&
      candidate >= 0
    ) {
      usage[key] = candidate;
    }
  }

  const openRouterUsage = value as OpenRouterUsage;
  const directCost = openRouterUsage.cost;
  const upstreamCost = openRouterUsage.cost_details?.upstream_inference_cost;
  const hasValidUpstreamCost =
    typeof upstreamCost === "number" &&
    Number.isFinite(upstreamCost) &&
    upstreamCost >= 0;
  // OpenRouter reports cost=0 for BYOK calls because the upstream provider
  // bills the connected account directly. Preserve that real provider cost in
  // the job audit and cost ceiling when it is supplied; otherwise leave the
  // cost unknown instead of recording OpenRouter's zero as the provider bill.
  const cost =
    openRouterUsage.is_byok === true
      ? hasValidUpstreamCost
        ? upstreamCost
        : undefined
      : directCost;
  const normalizedCost =
    typeof cost === "number" && Number.isFinite(cost) && cost >= 0
      ? Math.round(cost * 1_000_000)
      : null;
  const costMicrousd =
    normalizedCost !== null && Number.isSafeInteger(normalizedCost)
      ? normalizedCost
      : null;

  return { costMicrousd, usage };
}

function readErrorType(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error)) {
    return null;
  }

  const directCandidate = value.error.error_type;
  const metadata = value.error.metadata;
  const candidate =
    typeof directCandidate === "string"
      ? directCandidate
      : isRecord(metadata)
        ? metadata.error_type
        : null;

  return typeof candidate === "string" && /^[a-z0-9_]{1,80}$/.test(candidate)
    ? candidate
    : null;
}

function readRetryAfter(headers: Headers): number | null {
  const value = headers.get("retry-after");

  if (!value || !/^[0-9]{1,5}$/.test(value)) {
    return null;
  }

  const seconds = Number(value);
  return seconds >= 1 && seconds <= 86_400 ? seconds : null;
}

async function readBoundedJson(
  response: Response,
  providerRequestId: string | null,
  required: boolean,
): Promise<unknown> {
  const contentLengthValue = response.headers.get("content-length");

  if (contentLengthValue && /^[0-9]+$/.test(contentLengthValue)) {
    const contentLength = Number(contentLengthValue);

    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength > MAX_RESPONSE_BYTES
    ) {
      throw new OpenRouterImageError({
        attemptCode: "openrouter_response_too_large",
        providerRequestId,
        publicCode: "provider_failed",
        retryable: false,
      });
    }
  }

  if (!response.body) {
    if (!required) {
      return null;
    }

    throw new OpenRouterImageError({
      attemptCode: "invalid_openrouter_json",
      providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new OpenRouterImageError({
        attemptCode: "openrouter_response_too_large",
        providerRequestId,
        publicCode: "provider_failed",
        retryable: false,
      });
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
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    if (!required) {
      return null;
    }

    throw new OpenRouterImageError({
      attemptCode: "invalid_openrouter_json",
      providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }
}

async function reconcileGenerationCost(input: {
  apiKey: string;
  fetchImpl: FetchLike;
  generationId: string;
  signal: AbortSignal;
}): Promise<number | null> {
  if (!/^gen-[A-Za-z0-9_-]{1,190}$/.test(input.generationId)) {
    return null;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await input.fetchImpl(
        `${OPENROUTER_GENERATION_URL}?id=${encodeURIComponent(input.generationId)}`,
        {
          headers: { Authorization: `Bearer ${input.apiKey}` },
          method: "GET",
          signal: input.signal,
        },
      );

      if (response.ok) {
        const body = await readBoundedJson(response, input.generationId, true);

        if (isRecord(body) && isRecord(body.data)) {
          const generationId = body.data.id;
          const totalCost = body.data.total_cost;

          if (
            generationId === input.generationId &&
            typeof totalCost === "number" &&
            Number.isFinite(totalCost) &&
            totalCost >= 0
          ) {
            const costMicrousd = Math.round(totalCost * 1_000_000);

            return Number.isSafeInteger(costMicrousd) ? costMicrousd : null;
          }
        }
      } else if ([401, 402, 403].includes(response.status)) {
        return null;
      }
    } catch {
      if (input.signal.aborted) {
        return null;
      }
    }

    if (attempt < 2) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 150 * 2 ** attempt);
        input.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      });

      if (input.signal.aborted) {
        return null;
      }
    }
  }

  return null;
}

export function parseOpenRouterImageResponse(input: {
  body: unknown;
  providerRequestId: string | null;
}): OpenRouterImageResult {
  if (!isRecord(input.body) || !Array.isArray(input.body.data)) {
    throw new OpenRouterImageError({
      attemptCode: "invalid_openrouter_response",
      providerRequestId: input.providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }

  const image = input.body.data[0];

  if (
    input.body.data.length !== 1 ||
    !isRecord(image) ||
    typeof image.b64_json !== "string" ||
    image.b64_json.length === 0 ||
    (image.media_type !== undefined && image.media_type !== "image/png")
  ) {
    throw new OpenRouterImageError({
      attemptCode: "invalid_openrouter_image",
      providerRequestId: input.providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }

  let bytes: Uint8Array;

  try {
    bytes = base64ToBytes(image.b64_json);
  } catch {
    throw new OpenRouterImageError({
      attemptCode: "invalid_openrouter_base64",
      providerRequestId: input.providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }

  if (
    bytes.length === 0 ||
    bytes.length > 8 * 1024 * 1024 ||
    detectSupportedImageMimeType(bytes) !== "image/png"
  ) {
    throw new OpenRouterImageError({
      attemptCode: "invalid_openrouter_image_bytes",
      providerRequestId: input.providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }

  const { costMicrousd, usage } = normalizeUsage(input.body.usage);

  return {
    bytes,
    costMicrousd,
    providerRequestId: input.providerRequestId,
    usage,
  };
}

async function sendOpenRouterImageRequest(input: {
  apiKey: string;
  fetchImpl?: FetchLike;
  requestBody: Record<string, unknown>;
  timeoutMs: number;
}): Promise<OpenRouterImageResult> {
  if (!input.apiKey.startsWith("sk-or-")) {
    throw new OpenRouterImageError({
      attemptCode: "missing_openrouter_key",
      publicCode: "server_configuration",
      retryable: false,
    });
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetchImpl(OPENROUTER_IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.requestBody),
      signal: controller.signal,
    });
    const providerRequestId =
      response.headers.get("x-generation-id") ??
      response.headers.get("request-id") ??
      response.headers.get("x-request-id");
    const body = await readBoundedJson(
      response,
      providerRequestId,
      response.ok,
    );
    const errorType = readErrorType(body);

    if (!response.ok || errorType) {
      throw mapHttpError(
        response.status,
        providerRequestId,
        errorType,
        readRetryAfter(response.headers),
      );
    }

    const result = parseOpenRouterImageResponse({ body, providerRequestId });

    const isByok =
      isRecord(body) && isRecord(body.usage) && body.usage.is_byok === true;

    if (result.costMicrousd === null && providerRequestId && !isByok) {
      result.costMicrousd = await reconcileGenerationCost({
        apiKey: input.apiKey,
        fetchImpl,
        generationId: providerRequestId,
        signal: controller.signal,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof OpenRouterImageError) {
      throw error;
    }

    throw new OpenRouterImageError({
      attemptCode: "openrouter_outcome_unknown",
      publicCode: "provider_outcome_unknown",
      retryable: false,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateOpenRouterTextToImage(input: {
  apiKey: string;
  fetchImpl?: FetchLike;
  model: string;
  options: unknown;
  prompt: string;
  timeoutMs: number;
}): Promise<OpenRouterImageResult> {
  return sendOpenRouterImageRequest({
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    requestBody: createOpenRouterTextToImageRequest(input),
    timeoutMs: input.timeoutMs,
  });
}

export async function generateOpenRouterImage(input: {
  apiKey: string;
  fetchImpl?: FetchLike;
  inputBytes: Uint8Array;
  inputMimeType: "image/jpeg" | "image/png" | "image/webp";
  model: string;
  options: unknown;
  prompt: string;
  timeoutMs: number;
}): Promise<OpenRouterImageResult> {
  return sendOpenRouterImageRequest({
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    requestBody: createOpenRouterImageRequest(input),
    timeoutMs: input.timeoutMs,
  });
}
