const OPENROUTER_CHAT_COMPLETIONS_URL =
  "https://openrouter.ai/api/v1/chat/completions";

export const OPENROUTER_STRUCTURED_TEXT_MODEL = "openai/gpt-5-mini";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_MESSAGE_CONTENT_BYTES = 512 * 1024;
const MAX_SCHEMA_BYTES = 64 * 1024;
const MAX_EDITORIAL_INPUT_BYTES = 64 * 1024;
const MAX_SYSTEM_PROMPT_LENGTH = 12_000;
const MAX_SCHEMA_DEPTH = 8;
const MAX_SCHEMA_NODES = 128;
const MAX_SCHEMA_PROPERTIES = 128;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 2_000;
const MIN_MAX_TOKENS = 1;
const MAX_MAX_TOKENS = 16_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_SCHEMA_PATTERN_BYTES = 256;

type FetchLike = typeof fetch;

type JsonPrimitive = boolean | null | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

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

export type OpenRouterStructuredTextOptions = {
  max_tokens: number;
  provider: {
    allow_fallbacks: false;
    only: ["openai"];
    require_parameters: true;
  };
};

export type OpenRouterStructuredTextResult = {
  costMicrousd: number | null;
  output: Record<string, JsonValue>;
  providerRequestId: string | null;
  usage: Record<string, number>;
};

export class OpenRouterStructuredTextError extends Error {
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
    this.name = "OpenRouterStructuredTextError";
    this.attemptCode = input.attemptCode;
    this.providerRequestId = input.providerRequestId ?? null;
    this.publicCode = input.publicCode;
    this.retryable = input.retryable;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}

function configurationError(
  attemptCode: string,
): OpenRouterStructuredTextError {
  return new OpenRouterStructuredTextError({
    attemptCode,
    publicCode: "server_configuration",
    retryable: false,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function hasOnlyDataProperties(value: Record<string, unknown>): boolean {
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") {
      return false;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    return (
      descriptor?.enumerable === true &&
      "value" in descriptor &&
      descriptor.get === undefined &&
      descriptor.set === undefined
    );
  });
}

function isDenseDataArray(value: unknown): value is unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    return false;
  }

  const keys = Object.keys(value);

  if (
    keys.length !== value.length ||
    !keys.every((key, index) => key === String(index)) ||
    Reflect.ownKeys(value).length !== value.length + 1
  ) {
    return false;
  }

  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    return (
      descriptor?.enumerable === true &&
      "value" in descriptor &&
      descriptor.get === undefined &&
      descriptor.set === undefined
    );
  });
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function parseOpenRouterStructuredTextOptions(
  value: unknown,
): OpenRouterStructuredTextOptions {
  if (
    !isPlainRecord(value) ||
    !hasOnlyDataProperties(value) ||
    !hasOnlyKeys(value, ["max_tokens", "provider"]) ||
    !Number.isSafeInteger(value.max_tokens) ||
    (value.max_tokens as number) < MIN_MAX_TOKENS ||
    (value.max_tokens as number) > MAX_MAX_TOKENS ||
    !isPlainRecord(value.provider) ||
    !hasOnlyDataProperties(value.provider) ||
    !hasOnlyKeys(value.provider, [
      "only",
      "allow_fallbacks",
      "require_parameters",
    ]) ||
    !isDenseDataArray(value.provider.only) ||
    value.provider.only.length !== 1 ||
    value.provider.only[0] !== "openai" ||
    value.provider.allow_fallbacks !== false ||
    value.provider.require_parameters !== true
  ) {
    throw configurationError("unsafe_request_options");
  }

  return value as OpenRouterStructuredTextOptions;
}

function assertSafePropertyName(name: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) {
    throw configurationError("invalid_output_schema");
  }
}

function readSchemaTypes(value: unknown): {
  nullable: boolean;
  primaryType: string;
} {
  const allowedTypes = new Set([
    "array",
    "boolean",
    "integer",
    "null",
    "number",
    "object",
    "string",
  ]);

  if (typeof value === "string" && allowedTypes.has(value)) {
    return { nullable: value === "null", primaryType: value };
  }

  if (
    isDenseDataArray(value) &&
    value.length === 2 &&
    new Set(value).size === 2 &&
    value.every(
      (entry) => typeof entry === "string" && allowedTypes.has(entry),
    ) &&
    value.includes("null")
  ) {
    const primaryType = value.find((entry) => entry !== "null");

    if (typeof primaryType === "string") {
      return { nullable: true, primaryType };
    }
  }

  throw configurationError("invalid_output_schema");
}

function assertBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw configurationError("invalid_output_schema");
  }
}

function assertFiniteNumber(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw configurationError("invalid_output_schema");
  }
}

function valueMatchesPrimaryType(value: unknown, primaryType: string): boolean {
  switch (primaryType) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return Number.isSafeInteger(value);
    case "null":
      return value === null;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return isPlainRecord(value);
    case "string":
      return typeof value === "string";
    default:
      return false;
  }
}

type SchemaValidationState = {
  nodeCount: number;
  propertyCount: number;
};

function assertValidSchemaNode(
  value: unknown,
  depth: number,
  state: SchemaValidationState,
): asserts value is Record<string, unknown> {
  if (
    depth > MAX_SCHEMA_DEPTH ||
    !isPlainRecord(value) ||
    !hasOnlyDataProperties(value)
  ) {
    throw configurationError("invalid_output_schema");
  }

  state.nodeCount += 1;

  if (state.nodeCount > MAX_SCHEMA_NODES) {
    throw configurationError("invalid_output_schema");
  }

  if (value.anyOf !== undefined) {
    if (
      !hasOnlyKeys(value, ["anyOf", "description"]) ||
      !isDenseDataArray(value.anyOf) ||
      value.anyOf.length < 2 ||
      value.anyOf.length > 8
    ) {
      throw configurationError("invalid_output_schema");
    }

    if (value.description !== undefined) {
      if (
        typeof value.description !== "string" ||
        value.description.length === 0 ||
        utf8Length(value.description) > 1_000
      ) {
        throw configurationError("invalid_output_schema");
      }
    }

    const serializedBranches = new Set<string>();

    for (const branch of value.anyOf) {
      assertValidSchemaNode(branch, depth + 1, state);

      const serializedBranch = JSON.stringify(branch);

      if (serializedBranches.has(serializedBranch)) {
        throw configurationError("invalid_output_schema");
      }

      serializedBranches.add(serializedBranch);
    }

    return;
  }

  const { nullable, primaryType } = readSchemaTypes(value.type);
  const commonKeys = ["type", "description", "enum"];

  if (value.description !== undefined) {
    if (
      typeof value.description !== "string" ||
      value.description.length === 0 ||
      utf8Length(value.description) > 1_000
    ) {
      throw configurationError("invalid_output_schema");
    }
  }

  if (value.enum !== undefined) {
    if (
      !isDenseDataArray(value.enum) ||
      value.enum.length === 0 ||
      value.enum.length > 64 ||
      primaryType === "array" ||
      primaryType === "object"
    ) {
      throw configurationError("invalid_output_schema");
    }

    const serializedValues = new Set<string>();

    for (const enumValue of value.enum) {
      if (
        !(
          (nullable && enumValue === null) ||
          valueMatchesPrimaryType(enumValue, primaryType)
        ) ||
        (typeof enumValue === "string" && utf8Length(enumValue) > 1_000)
      ) {
        throw configurationError("invalid_output_schema");
      }

      const serialized = JSON.stringify(enumValue);

      if (serialized === undefined || serializedValues.has(serialized)) {
        throw configurationError("invalid_output_schema");
      }

      serializedValues.add(serialized);
    }
  }

  if (primaryType === "object") {
    if (
      !hasOnlyKeys(value, [
        ...commonKeys,
        "properties",
        "required",
        "additionalProperties",
      ]) ||
      !isPlainRecord(value.properties) ||
      !hasOnlyDataProperties(value.properties) ||
      value.additionalProperties !== false ||
      !isDenseDataArray(value.required)
    ) {
      throw configurationError("invalid_output_schema");
    }

    const propertyNames = Object.keys(value.properties);

    if (propertyNames.length === 0 || propertyNames.length > 64) {
      throw configurationError("invalid_output_schema");
    }

    state.propertyCount += propertyNames.length;

    if (state.propertyCount > MAX_SCHEMA_PROPERTIES) {
      throw configurationError("invalid_output_schema");
    }

    if (
      value.required.length !== propertyNames.length ||
      new Set(value.required).size !== propertyNames.length ||
      !value.required.every(
        (name) => typeof name === "string" && propertyNames.includes(name),
      )
    ) {
      throw configurationError("invalid_output_schema");
    }

    for (const propertyName of propertyNames) {
      assertSafePropertyName(propertyName);
      assertValidSchemaNode(value.properties[propertyName], depth + 1, state);
    }

    return;
  }

  if (primaryType === "array") {
    if (!hasOnlyKeys(value, [...commonKeys, "items", "minItems", "maxItems"])) {
      throw configurationError("invalid_output_schema");
    }

    assertValidSchemaNode(value.items, depth + 1, state);

    if (value.minItems !== undefined) {
      assertBoundedInteger(value.minItems, 0, 100);
    }

    if (value.maxItems !== undefined) {
      assertBoundedInteger(value.maxItems, 0, 100);
    }

    if (
      typeof value.minItems === "number" &&
      typeof value.maxItems === "number" &&
      value.minItems > value.maxItems
    ) {
      throw configurationError("invalid_output_schema");
    }

    return;
  }

  if (primaryType === "string") {
    if (
      !hasOnlyKeys(value, [...commonKeys, "minLength", "maxLength", "pattern"])
    ) {
      throw configurationError("invalid_output_schema");
    }

    if (value.minLength !== undefined) {
      assertBoundedInteger(value.minLength, 0, 8_000);
    }

    if (value.maxLength !== undefined) {
      assertBoundedInteger(value.maxLength, 0, 8_000);
    }

    if (
      typeof value.minLength === "number" &&
      typeof value.maxLength === "number" &&
      value.minLength > value.maxLength
    ) {
      throw configurationError("invalid_output_schema");
    }

    if (value.pattern !== undefined) {
      if (
        typeof value.pattern !== "string" ||
        value.pattern.length === 0 ||
        utf8Length(value.pattern) > MAX_SCHEMA_PATTERN_BYTES ||
        !value.pattern.startsWith("^") ||
        !value.pattern.endsWith("$") ||
        /\\[1-9]|\(\?<?[=!]/u.test(value.pattern)
      ) {
        throw configurationError("invalid_output_schema");
      }

      try {
        new RegExp(value.pattern, "u");
      } catch {
        throw configurationError("invalid_output_schema");
      }
    }

    return;
  }

  if (primaryType === "number" || primaryType === "integer") {
    if (!hasOnlyKeys(value, [...commonKeys, "minimum", "maximum"])) {
      throw configurationError("invalid_output_schema");
    }

    if (value.minimum !== undefined) {
      assertFiniteNumber(value.minimum);
    }

    if (value.maximum !== undefined) {
      assertFiniteNumber(value.maximum);
    }

    if (
      typeof value.minimum === "number" &&
      typeof value.maximum === "number" &&
      value.minimum > value.maximum
    ) {
      throw configurationError("invalid_output_schema");
    }

    return;
  }

  if (!hasOnlyKeys(value, commonKeys)) {
    throw configurationError("invalid_output_schema");
  }
}

export function validateOpenRouterStructuredTextSchema(
  value: unknown,
): Record<string, unknown> {
  assertValidSchemaNode(value, 0, { nodeCount: 0, propertyCount: 0 });

  const { nullable, primaryType } = readSchemaTypes(value.type);

  if (primaryType !== "object" || nullable) {
    throw configurationError("invalid_output_schema");
  }

  let serialized: string;

  try {
    serialized = JSON.stringify(value);
  } catch {
    throw configurationError("invalid_output_schema");
  }

  if (utf8Length(serialized) > MAX_SCHEMA_BYTES) {
    throw configurationError("invalid_output_schema");
  }

  return JSON.parse(serialized) as Record<string, unknown>;
}

function validateEditorialInput(value: unknown): string {
  const seen = new WeakSet<object>();
  let nodeCount = 0;

  function visit(candidate: unknown, depth: number): void {
    if (depth > MAX_JSON_DEPTH) {
      throw configurationError("invalid_editorial_input");
    }

    nodeCount += 1;

    if (nodeCount > MAX_JSON_NODES) {
      throw configurationError("invalid_editorial_input");
    }

    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean"
    ) {
      return;
    }

    if (typeof candidate === "number") {
      if (Number.isFinite(candidate)) {
        return;
      }

      throw configurationError("invalid_editorial_input");
    }

    if (Array.isArray(candidate)) {
      if (
        !isDenseDataArray(candidate) ||
        candidate.length > 500 ||
        seen.has(candidate)
      ) {
        throw configurationError("invalid_editorial_input");
      }

      seen.add(candidate);
      candidate.forEach((entry) => visit(entry, depth + 1));
      return;
    }

    if (
      !isPlainRecord(candidate) ||
      !hasOnlyDataProperties(candidate) ||
      seen.has(candidate)
    ) {
      throw configurationError("invalid_editorial_input");
    }

    seen.add(candidate);
    const entries = Object.entries(candidate);

    if (entries.length > 500) {
      throw configurationError("invalid_editorial_input");
    }

    for (const [key, entry] of entries) {
      if (
        key.length === 0 ||
        utf8Length(key) > 128 ||
        key === "__proto__" ||
        key === "constructor" ||
        key === "prototype"
      ) {
        throw configurationError("invalid_editorial_input");
      }

      visit(entry, depth + 1);
    }
  }

  if (!isPlainRecord(value)) {
    throw configurationError("invalid_editorial_input");
  }

  visit(value, 0);

  let serialized: string;

  try {
    serialized = JSON.stringify(value);
  } catch {
    throw configurationError("invalid_editorial_input");
  }

  if (
    serialized.length === 0 ||
    utf8Length(serialized) > MAX_EDITORIAL_INPUT_BYTES
  ) {
    throw configurationError("invalid_editorial_input");
  }

  return serialized;
}

export function createOpenRouterStructuredTextRequest(input: {
  editorialInput: unknown;
  model: string;
  options: unknown;
  outputSchema: unknown;
  schemaName: string;
  systemPrompt: string;
}): Record<string, unknown> {
  if (input.model !== OPENROUTER_STRUCTURED_TEXT_MODEL) {
    throw configurationError("unsupported_model");
  }

  if (
    typeof input.systemPrompt !== "string" ||
    input.systemPrompt.trim() !== input.systemPrompt ||
    input.systemPrompt.length === 0 ||
    input.systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH
  ) {
    throw configurationError("invalid_system_prompt");
  }

  if (
    typeof input.schemaName !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(input.schemaName)
  ) {
    throw configurationError("invalid_schema_name");
  }

  const options = parseOpenRouterStructuredTextOptions(input.options);
  const outputSchema = validateOpenRouterStructuredTextSchema(
    input.outputSchema,
  );
  const editorialInput = validateEditorialInput(input.editorialInput);

  return {
    model: OPENROUTER_STRUCTURED_TEXT_MODEL,
    ...options,
    messages: [
      { content: input.systemPrompt, role: "system" },
      { content: editorialInput, role: "user" },
    ],
    // Request-level plugin settings override OpenRouter account defaults. This
    // keeps a default legacy web plugin from adding browsing to editorial jobs.
    plugins: [{ enabled: false, id: "web" }],
    // GPT-5 models spend part of max_tokens on hidden reasoning. Keep that
    // bounded for these simple editorial transforms so the JSON answer cannot
    // be crowded out by the model's default reasoning effort.
    reasoning: { effort: "minimal", exclude: true },
    response_format: {
      json_schema: {
        name: input.schemaName,
        schema: outputSchema,
        strict: true,
      },
      type: "json_schema",
    },
  };
}

function readErrorType(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error)) {
    return null;
  }

  const metadata = value.error.metadata;
  const candidates = [
    value.error.error_type,
    value.error.type,
    value.error.code,
    isRecord(metadata) ? metadata.error_type : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^[a-z0-9_]{1,80}$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

function hasProviderError(value: unknown): boolean {
  return isRecord(value) && isRecord(value.error);
}

function readRetryAfter(headers: Headers): number | null {
  const value = headers.get("retry-after");

  if (!value || !/^[0-9]{1,5}$/.test(value)) {
    return null;
  }

  const seconds = Number(value);
  return seconds >= 1 && seconds <= 86_400 ? seconds : null;
}

function sanitizeProviderRequestId(value: unknown): string | null {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
    ? value
    : null;
}

function readHeaderRequestId(headers: Headers): string | null {
  for (const headerName of ["x-generation-id", "request-id", "x-request-id"]) {
    const requestId = sanitizeProviderRequestId(headers.get(headerName));

    if (requestId) {
      return requestId;
    }
  }

  return null;
}

function readBodyRequestId(value: unknown): string | null {
  return isRecord(value) ? sanitizeProviderRequestId(value.id) : null;
}

function mapHttpError(
  status: number,
  providerRequestId: string | null,
  errorType: string | null,
  retryAfterSeconds: number | null,
): OpenRouterStructuredTextError {
  if (
    errorType === "content_policy_violation" ||
    errorType === "moderation" ||
    errorType === "refusal"
  ) {
    return new OpenRouterStructuredTextError({
      attemptCode: `openrouter_${errorType}`,
      providerRequestId,
      publicCode: "provider_rejected_input",
      retryable: false,
    });
  }

  if (
    status === 429 ||
    errorType === "rate_limit_exceeded" ||
    errorType === "rate_limited"
  ) {
    return new OpenRouterStructuredTextError({
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
    return new OpenRouterStructuredTextError({
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
    return new OpenRouterStructuredTextError({
      attemptCode: errorType
        ? `openrouter_${errorType}`
        : `openrouter_http_${status}`,
      providerRequestId,
      publicCode: "server_configuration",
      retryable: false,
    });
  }

  if (status === 408) {
    return new OpenRouterStructuredTextError({
      attemptCode: "openrouter_outcome_unknown",
      providerRequestId,
      publicCode: "provider_outcome_unknown",
      retryable: false,
    });
  }

  if ([400, 413, 422].includes(status)) {
    return new OpenRouterStructuredTextError({
      attemptCode: `openrouter_http_${status}`,
      providerRequestId,
      publicCode: "provider_rejected_input",
      retryable: false,
    });
  }

  return new OpenRouterStructuredTextError({
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

  for (const key of [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
  ] as const) {
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
      throw new OpenRouterStructuredTextError({
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

    throw new OpenRouterStructuredTextError({
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
      throw new OpenRouterStructuredTextError({
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

    throw new OpenRouterStructuredTextError({
      attemptCode: "invalid_openrouter_json",
      providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }
}

function outputError(providerRequestId: string | null): never {
  throw new OpenRouterStructuredTextError({
    attemptCode: "invalid_openrouter_output",
    providerRequestId,
    publicCode: "provider_failed",
    retryable: false,
  });
}

function validateOutputNode(
  value: unknown,
  schema: Record<string, unknown>,
  providerRequestId: string | null,
): void {
  if (Array.isArray(schema.anyOf)) {
    for (const branch of schema.anyOf) {
      if (!isPlainRecord(branch)) {
        outputError(providerRequestId);
      }

      try {
        validateOutputNode(value, branch, providerRequestId);
        return;
      } catch (error) {
        if (
          !(error instanceof OpenRouterStructuredTextError) ||
          error.attemptCode !== "invalid_openrouter_output"
        ) {
          throw error;
        }
      }
    }

    outputError(providerRequestId);
  }

  const { nullable, primaryType } = readSchemaTypes(schema.type);

  if (nullable && value === null) {
    return;
  }

  if (!valueMatchesPrimaryType(value, primaryType)) {
    outputError(providerRequestId);
  }

  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some(
      (candidate) => JSON.stringify(candidate) === JSON.stringify(value),
    )
  ) {
    outputError(providerRequestId);
  }

  if (primaryType === "object") {
    if (!isPlainRecord(value) || !isPlainRecord(schema.properties)) {
      outputError(providerRequestId);
    }

    const propertyNames = Object.keys(schema.properties);
    const outputNames = Object.keys(value);

    if (
      outputNames.length !== propertyNames.length ||
      !outputNames.every((name) => propertyNames.includes(name))
    ) {
      outputError(providerRequestId);
    }

    for (const propertyName of propertyNames) {
      const childSchema = schema.properties[propertyName];

      if (!isPlainRecord(childSchema)) {
        outputError(providerRequestId);
      }

      validateOutputNode(value[propertyName], childSchema, providerRequestId);
    }

    return;
  }

  if (primaryType === "array") {
    if (!Array.isArray(value) || !isPlainRecord(schema.items)) {
      outputError(providerRequestId);
    }

    if (
      (typeof schema.minItems === "number" && value.length < schema.minItems) ||
      (typeof schema.maxItems === "number" && value.length > schema.maxItems)
    ) {
      outputError(providerRequestId);
    }

    value.forEach((entry) =>
      validateOutputNode(
        entry,
        schema.items as Record<string, unknown>,
        providerRequestId,
      ),
    );
    return;
  }

  if (primaryType === "string") {
    if (typeof value !== "string") {
      outputError(providerRequestId);
    }

    const length = [...value].length;

    if (
      (typeof schema.minLength === "number" && length < schema.minLength) ||
      (typeof schema.maxLength === "number" && length > schema.maxLength)
    ) {
      outputError(providerRequestId);
    }

    if (
      typeof schema.pattern === "string" &&
      !new RegExp(schema.pattern, "u").test(value)
    ) {
      outputError(providerRequestId);
    }

    return;
  }

  if (primaryType === "number" || primaryType === "integer") {
    if (typeof value !== "number") {
      outputError(providerRequestId);
    }

    if (
      (typeof schema.minimum === "number" && value < schema.minimum) ||
      (typeof schema.maximum === "number" && value > schema.maximum)
    ) {
      outputError(providerRequestId);
    }
  }
}

export function parseOpenRouterStructuredTextResponse(input: {
  body: unknown;
  outputSchema: unknown;
  providerRequestId: string | null;
}): OpenRouterStructuredTextResult {
  const outputSchema = validateOpenRouterStructuredTextSchema(
    input.outputSchema,
  );

  if (!isRecord(input.body) || !Array.isArray(input.body.choices)) {
    throw new OpenRouterStructuredTextError({
      attemptCode: "invalid_openrouter_response",
      providerRequestId: input.providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }

  const choice = input.body.choices[0];

  if (
    input.body.choices.length !== 1 ||
    !isRecord(choice) ||
    !isRecord(choice.message)
  ) {
    throw new OpenRouterStructuredTextError({
      attemptCode: "invalid_openrouter_response",
      providerRequestId: input.providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }

  if (
    (typeof choice.message.refusal === "string" &&
      choice.message.refusal.length > 0) ||
    choice.finish_reason === "content_filter"
  ) {
    throw new OpenRouterStructuredTextError({
      attemptCode: "openrouter_refusal",
      providerRequestId: input.providerRequestId,
      publicCode: "provider_rejected_input",
      retryable: false,
    });
  }

  if (choice.finish_reason === "length") {
    throw new OpenRouterStructuredTextError({
      attemptCode: "openrouter_output_truncated",
      providerRequestId: input.providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }

  if (
    typeof choice.message.content !== "string" ||
    choice.message.content.length === 0 ||
    utf8Length(choice.message.content) > MAX_MESSAGE_CONTENT_BYTES
  ) {
    throw new OpenRouterStructuredTextError({
      attemptCode: "invalid_openrouter_response",
      providerRequestId: input.providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }

  let output: unknown;

  try {
    output = JSON.parse(choice.message.content);
  } catch {
    throw new OpenRouterStructuredTextError({
      attemptCode: "invalid_openrouter_message_json",
      providerRequestId: input.providerRequestId,
      publicCode: "provider_failed",
      retryable: false,
    });
  }

  if (!isPlainRecord(output)) {
    outputError(input.providerRequestId);
  }

  validateOutputNode(output, outputSchema, input.providerRequestId);
  const { costMicrousd, usage } = normalizeUsage(input.body.usage);

  return {
    costMicrousd,
    output: output as Record<string, JsonValue>,
    providerRequestId: input.providerRequestId,
    usage,
  };
}

export async function generateOpenRouterStructuredText(input: {
  apiKey: string;
  editorialInput: unknown;
  fetchImpl?: FetchLike;
  model: string;
  options: unknown;
  outputSchema: unknown;
  schemaName: string;
  systemPrompt: string;
  timeoutMs: number;
}): Promise<OpenRouterStructuredTextResult> {
  if (
    typeof input.apiKey !== "string" ||
    input.apiKey.trim() !== input.apiKey ||
    !input.apiKey.startsWith("sk-or-") ||
    input.apiKey.length > 500
  ) {
    throw configurationError("missing_openrouter_key");
  }

  if (
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs < MIN_TIMEOUT_MS ||
    input.timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw configurationError("invalid_timeout");
  }

  const requestBody = createOpenRouterStructuredTextRequest(input);
  const outputSchema = (requestBody.response_format as Record<string, unknown>)
    .json_schema as Record<string, unknown>;
  const validatedOutputSchema = outputSchema.schema;
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const headerRequestId = readHeaderRequestId(response.headers);
    const body = await readBoundedJson(response, headerRequestId, response.ok);
    const providerRequestId = headerRequestId ?? readBodyRequestId(body);
    const errorType = readErrorType(body);

    if (!response.ok || hasProviderError(body)) {
      throw mapHttpError(
        response.status,
        providerRequestId,
        errorType,
        readRetryAfter(response.headers),
      );
    }

    return parseOpenRouterStructuredTextResponse({
      body,
      outputSchema: validatedOutputSchema,
      providerRequestId,
    });
  } catch (error) {
    if (error instanceof OpenRouterStructuredTextError) {
      throw error;
    }

    throw new OpenRouterStructuredTextError({
      attemptCode: "openrouter_outcome_unknown",
      publicCode: "provider_outcome_unknown",
      retryable: false,
    });
  } finally {
    clearTimeout(timeout);
  }
}
