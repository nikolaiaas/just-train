import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpenRouterStructuredTextRequest,
  generateOpenRouterStructuredText,
  OPENROUTER_STRUCTURED_TEXT_MODEL,
  OpenRouterStructuredTextError,
  parseOpenRouterStructuredTextOptions,
  parseOpenRouterStructuredTextResponse,
  validateOpenRouterStructuredTextSchema,
} from "./openrouter-structured-text.ts";

const OPTIONS = {
  max_tokens: 800,
  provider: {
    allow_fallbacks: false,
    only: ["openai"],
    require_parameters: true,
  },
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    activities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          minutes: { type: "integer", minimum: 1, maximum: 60 },
          name: { type: "string", minLength: 1, maxLength: 80 },
        },
        required: ["minutes", "name"],
      },
      maxItems: 5,
    },
    summary: { type: ["string", "null"], maxLength: 500 },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 80,
      pattern: "^\\S(?:[\\s\\S]*\\S)?$",
    },
  },
  required: ["activities", "summary", "title"],
};

const OUTPUT = {
  activities: [{ minutes: 10, name: "Hop som en frø" }],
  summary: null,
  title: "En lille bevægelsesleg",
};

const MEASUREMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestion: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            measurement: {
              type: "string",
              enum: ["repetitions"],
              pattern: "^repetitions$",
            },
            targetValue: { type: "integer", minimum: 1, maximum: 10_000 },
          },
          required: ["measurement", "targetValue"],
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            measurement: { type: "string", enum: ["duration"] },
            targetValue: { type: "integer", minimum: 1, maximum: 86_400 },
          },
          required: ["measurement", "targetValue"],
        },
      ],
    },
  },
  required: ["suggestion"],
};

const REQUEST_INPUT = {
  editorialInput: {
    ageGroup: "4-6",
    notes: "Brug et enkelt og varmt dansk sprog.",
  },
  model: OPENROUTER_STRUCTURED_TEXT_MODEL,
  options: OPTIONS,
  outputSchema: OUTPUT_SCHEMA,
  schemaName: "editorial_activity",
  systemPrompt: "Du er en redaktionel assistent for en familie-app.",
};

function assertTextError(error, expected) {
  assert.ok(error instanceof OpenRouterStructuredTextError);
  assert.equal(error.attemptCode, expected.attemptCode);
  assert.equal(error.publicCode, expected.publicCode);
  assert.equal(error.retryable, expected.retryable);

  if (Object.hasOwn(expected, "providerRequestId")) {
    assert.equal(error.providerRequestId, expected.providerRequestId);
  }

  if (Object.hasOwn(expected, "retryAfterSeconds")) {
    assert.equal(error.retryAfterSeconds, expected.retryAfterSeconds);
  }

  return true;
}

test("accepts only bounded server-owned text options", () => {
  assert.deepEqual(parseOpenRouterStructuredTextOptions(OPTIONS), OPTIONS);

  for (const unsafeOptions of [
    { ...OPTIONS, max_tokens: 0 },
    { ...OPTIONS, max_tokens: 4_097 },
    { ...OPTIONS, tools: [] },
    {
      ...OPTIONS,
      provider: { ...OPTIONS.provider, allow_fallbacks: true },
    },
    {
      ...OUTPUT_SCHEMA,
      properties: {
        ...OUTPUT_SCHEMA.properties,
        title: { type: "string", pattern: "(a+)+$" },
      },
    },
    { ...OPTIONS, provider: { ...OPTIONS.provider, only: ["anthropic"] } },
    { ...OPTIONS, reasoning: { effort: "high" } },
    {
      ...OPTIONS,
      provider: { ...OPTIONS.provider, require_parameters: false },
    },
    { ...OPTIONS, provider: { ...OPTIONS.provider, zdr: true } },
  ]) {
    assert.throws(
      () => parseOpenRouterStructuredTextOptions(unsafeOptions),
      (error) =>
        assertTextError(error, {
          attemptCode: "unsafe_request_options",
          publicCode: "server_configuration",
          retryable: false,
        }),
    );
  }
});

test("builds strict JSON-schema chat messages without tools or browsing", () => {
  const request = createOpenRouterStructuredTextRequest(REQUEST_INPUT);

  assert.equal(request.model, "openai/gpt-5-mini");
  assert.equal(request.max_tokens, 800);
  assert.deepEqual(request.provider, {
    allow_fallbacks: false,
    only: ["openai"],
    require_parameters: true,
  });
  assert.deepEqual(request.messages, [
    { content: REQUEST_INPUT.systemPrompt, role: "system" },
    {
      content: JSON.stringify(REQUEST_INPUT.editorialInput),
      role: "user",
    },
  ]);
  assert.deepEqual(request.plugins, [{ enabled: false, id: "web" }]);
  assert.deepEqual(request.reasoning, {
    effort: "minimal",
    exclude: true,
  });
  assert.deepEqual(request.response_format, {
    json_schema: {
      name: "editorial_activity",
      schema: OUTPUT_SCHEMA,
      strict: true,
    },
    type: "json_schema",
  });

  for (const forbiddenKey of [
    "tools",
    "tool_choice",
    "web_search",
    "transforms",
  ]) {
    assert.equal(Object.hasOwn(request, forbiddenKey), false);
  }

  assert.notEqual(request.response_format.json_schema.schema, OUTPUT_SCHEMA);
});

test("rejects any model other than the pinned GPT-5 mini model", () => {
  assert.throws(
    () =>
      createOpenRouterStructuredTextRequest({
        ...REQUEST_INPUT,
        model: "openai/gpt-5.1",
      }),
    (error) =>
      assertTextError(error, {
        attemptCode: "unsupported_model",
        publicCode: "server_configuration",
        retryable: false,
      }),
  );
});

test("validates a bounded strict object schema before sending it", () => {
  assert.deepEqual(
    validateOpenRouterStructuredTextSchema(OUTPUT_SCHEMA),
    OUTPUT_SCHEMA,
  );

  const invalidSchemas = [
    { type: "array", items: { type: "string" } },
    { ...OUTPUT_SCHEMA, additionalProperties: true },
    { ...OUTPUT_SCHEMA, required: ["title"] },
    {
      ...OUTPUT_SCHEMA,
      properties: {
        ...OUTPUT_SCHEMA.properties,
        unsafe: { type: "string", pattern: ".*" },
      },
      required: [...OUTPUT_SCHEMA.required, "unsafe"],
    },
    {
      ...OUTPUT_SCHEMA,
      properties: { result: { $ref: "https://example.com/schema.json" } },
      required: ["result"],
    },
    { ...OUTPUT_SCHEMA, required: Array(OUTPUT_SCHEMA.required.length) },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        result: { type: "object", enum: [{}] },
      },
      required: ["result"],
    },
  ];

  for (const schema of invalidSchemas) {
    assert.throws(
      () => validateOpenRouterStructuredTextSchema(schema),
      (error) =>
        assertTextError(error, {
          attemptCode: "invalid_output_schema",
          publicCode: "server_configuration",
          retryable: false,
        }),
    );
  }
});

test("accepts bounded nested anyOf schemas and preserves them in strict requests", () => {
  assert.deepEqual(
    validateOpenRouterStructuredTextSchema(MEASUREMENT_SCHEMA),
    MEASUREMENT_SCHEMA,
  );

  const request = createOpenRouterStructuredTextRequest({
    ...REQUEST_INPUT,
    outputSchema: MEASUREMENT_SCHEMA,
  });

  assert.deepEqual(
    request.response_format.json_schema.schema,
    MEASUREMENT_SCHEMA,
  );

  for (const schema of [
    {
      ...MEASUREMENT_SCHEMA,
      properties: { suggestion: { anyOf: [] } },
    },
    {
      ...MEASUREMENT_SCHEMA,
      properties: {
        suggestion: {
          anyOf: [
            MEASUREMENT_SCHEMA.properties.suggestion.anyOf[0],
            { type: "string", pattern: ".*" },
          ],
        },
      },
    },
    {
      ...MEASUREMENT_SCHEMA,
      properties: {
        suggestion: {
          type: "object",
          anyOf: MEASUREMENT_SCHEMA.properties.suggestion.anyOf,
        },
      },
    },
  ]) {
    assert.throws(
      () => validateOpenRouterStructuredTextSchema(schema),
      (error) =>
        assertTextError(error, {
          attemptCode: "invalid_output_schema",
          publicCode: "server_configuration",
          retryable: false,
        }),
    );
  }
});

test("rejects unvalidated, cyclic, or oversized editorial input", () => {
  const cyclic = {};
  cyclic.self = cyclic;

  for (const editorialInput of [
    ["not", "an", "object"],
    { value: Number.NaN },
    { value: undefined },
    { value: Array(1) },
    cyclic,
    { value: "x".repeat(70_000) },
  ]) {
    assert.throws(
      () =>
        createOpenRouterStructuredTextRequest({
          ...REQUEST_INPUT,
          editorialInput,
        }),
      (error) =>
        assertTextError(error, {
          attemptCode: "invalid_editorial_input",
          publicCode: "server_configuration",
          retryable: false,
        }),
    );
  }
});

test("parses exactly one JSON object and normalizes usage and cost", () => {
  const result = parseOpenRouterStructuredTextResponse({
    body: {
      choices: [{ message: { content: JSON.stringify(OUTPUT) } }],
      usage: {
        completion_tokens: 44,
        cost: 0.001234,
        ignored_tokens: 999,
        prompt_tokens: 82,
        total_tokens: 126,
      },
    },
    outputSchema: OUTPUT_SCHEMA,
    providerRequestId: "request-1",
  });

  assert.deepEqual(result.output, OUTPUT);
  assert.deepEqual(result.usage, {
    completion_tokens: 44,
    prompt_tokens: 82,
    total_tokens: 126,
  });
  assert.equal(result.costMicrousd, 1_234);
  assert.equal(result.providerRequestId, "request-1");
});

test("validates output against the matching anyOf branch", () => {
  for (const suggestion of [
    { measurement: "repetitions", targetValue: 10_000 },
    { measurement: "duration", targetValue: 86_400 },
  ]) {
    const result = parseOpenRouterStructuredTextResponse({
      body: {
        choices: [{ message: { content: JSON.stringify({ suggestion }) } }],
      },
      outputSchema: MEASUREMENT_SCHEMA,
      providerRequestId: "request-any-of",
    });

    assert.deepEqual(result.output, { suggestion });
  }

  for (const suggestion of [
    { measurement: "repetitions", targetValue: 10_001 },
    { measurement: "duration", targetValue: 86_401 },
    { measurement: "completion", targetValue: null },
  ]) {
    assert.throws(
      () =>
        parseOpenRouterStructuredTextResponse({
          body: {
            choices: [{ message: { content: JSON.stringify({ suggestion }) } }],
          },
          outputSchema: MEASUREMENT_SCHEMA,
          providerRequestId: "request-invalid-any-of",
        }),
      (error) =>
        assertTextError(error, {
          attemptCode: "invalid_openrouter_output",
          providerRequestId: "request-invalid-any-of",
          publicCode: "provider_failed",
          retryable: false,
        }),
    );
  }
});

test("uses upstream cost for BYOK and leaves an absent cost unknown", () => {
  const byokResult = parseOpenRouterStructuredTextResponse({
    body: {
      choices: [{ message: { content: JSON.stringify(OUTPUT) } }],
      usage: {
        cost: 0,
        cost_details: { upstream_inference_cost: 0.004321 },
        is_byok: true,
      },
    },
    outputSchema: OUTPUT_SCHEMA,
    providerRequestId: "request-byok",
  });
  const unknownCostResult = parseOpenRouterStructuredTextResponse({
    body: {
      choices: [{ message: { content: JSON.stringify(OUTPUT) } }],
      usage: { is_byok: true },
    },
    outputSchema: OUTPUT_SCHEMA,
    providerRequestId: "request-byok-unknown",
  });

  assert.equal(byokResult.costMicrousd, 4_321);
  assert.equal(unknownCostResult.costMicrousd, null);
});

test("rejects markdown, arrays, multiple choices, and schema violations", () => {
  const bodies = [
    {
      choices: [
        {
          message: { content: `\`\`\`json\n${JSON.stringify(OUTPUT)}\n\`\`\`` },
        },
      ],
    },
    { choices: [{ message: { content: "[]" } }] },
    {
      choices: [
        { message: { content: JSON.stringify(OUTPUT) } },
        { message: { content: JSON.stringify(OUTPUT) } },
      ],
    },
    {
      choices: [
        {
          message: {
            content: JSON.stringify({ ...OUTPUT, unexpected: true }),
          },
        },
      ],
    },
    {
      choices: [
        {
          message: {
            content: JSON.stringify({
              ...OUTPUT,
              activities: Array.from({ length: 6 }, () => OUTPUT.activities[0]),
            }),
          },
        },
      ],
    },
    {
      choices: [
        {
          message: {
            content: JSON.stringify({ ...OUTPUT, title: 123 }),
          },
        },
      ],
    },
    {
      choices: [
        {
          message: {
            content: JSON.stringify({ ...OUTPUT, title: " Padded title " }),
          },
        },
      ],
    },
  ];

  for (const body of bodies) {
    assert.throws(
      () =>
        parseOpenRouterStructuredTextResponse({
          body,
          outputSchema: OUTPUT_SCHEMA,
          providerRequestId: "request-invalid-output",
        }),
      (error) => {
        assert.ok(error instanceof OpenRouterStructuredTextError);
        assert.equal(error.publicCode, "provider_failed");
        assert.equal(error.retryable, false);
        return true;
      },
    );
  }
});

test("maps a structured-output refusal without exposing its text", () => {
  assert.throws(
    () =>
      parseOpenRouterStructuredTextResponse({
        body: {
          choices: [
            {
              finish_reason: "content_filter",
              message: { refusal: "raw moderation explanation" },
            },
          ],
        },
        outputSchema: OUTPUT_SCHEMA,
        providerRequestId: "request-refusal",
      }),
    (error) => {
      assertTextError(error, {
        attemptCode: "openrouter_refusal",
        providerRequestId: "request-refusal",
        publicCode: "provider_rejected_input",
        retryable: false,
      });
      assert.doesNotMatch(error.message, /raw moderation explanation/);
      return true;
    },
  );
});

test("maps a length-limited response as truncated without parsing partial JSON", () => {
  const partialOutput = '{"reply":"Et forslag","suggestion":';

  assert.throws(
    () =>
      parseOpenRouterStructuredTextResponse({
        body: {
          choices: [
            {
              finish_reason: "length",
              message: { content: partialOutput },
            },
          ],
        },
        outputSchema: OUTPUT_SCHEMA,
        providerRequestId: "request-truncated",
      }),
    (error) => {
      assertTextError(error, {
        attemptCode: "openrouter_output_truncated",
        providerRequestId: "request-truncated",
        publicCode: "provider_failed",
        retryable: false,
      });
      assert.doesNotMatch(error.message, /Et forslag/);
      return true;
    },
  );
});

test("posts to chat completions and returns a sanitized request ID", async () => {
  let capturedUrl;
  let capturedInit;

  const result = await generateOpenRouterStructuredText({
    ...REQUEST_INPUT,
    apiKey: "sk-or-v1-test-only",
    fetchImpl: async (url, init) => {
      capturedUrl = url;
      capturedInit = init;

      return Response.json(
        {
          choices: [{ message: { content: JSON.stringify(OUTPUT) } }],
          id: "gen-safe_123",
          usage: { cost: 0.0005, total_tokens: 50 },
        },
        { headers: { "x-request-id": "unsafe/request/id" } },
      );
    },
    timeoutMs: 5_000,
  });

  assert.equal(capturedUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers.Authorization, "Bearer sk-or-v1-test-only");
  assert.equal(capturedInit.headers.Accept, "application/json");
  assert.deepEqual(
    JSON.parse(capturedInit.body),
    createOpenRouterStructuredTextRequest(REQUEST_INPUT),
  );
  assert.equal(result.providerRequestId, "gen-safe_123");
  assert.equal(result.costMicrousd, 500);
});

test("maps provider errors to stable sanitized categories", async () => {
  await assert.rejects(
    generateOpenRouterStructuredText({
      ...REQUEST_INPUT,
      apiKey: "sk-or-v1-test-only",
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              error_type: "rate_limit_exceeded",
              message: "secret provider diagnostic that must not escape",
            },
          },
          {
            headers: {
              "retry-after": "30",
              "x-request-id": "request-rate-limit",
            },
            status: 429,
          },
        ),
      timeoutMs: 5_000,
    }),
    (error) => {
      assertTextError(error, {
        attemptCode: "openrouter_rate_limited",
        providerRequestId: "request-rate-limit",
        publicCode: "provider_rate_limited",
        retryable: true,
        retryAfterSeconds: 30,
      });
      assert.doesNotMatch(error.message, /secret provider diagnostic/);
      return true;
    },
  );
});

test("bounds provider response bytes before parsing JSON", async () => {
  await assert.rejects(
    generateOpenRouterStructuredText({
      ...REQUEST_INPUT,
      apiKey: "sk-or-v1-test-only",
      fetchImpl: async () =>
        new Response("{}", {
          headers: { "content-length": String(1024 * 1024 + 1) },
        }),
      timeoutMs: 5_000,
    }),
    (error) =>
      assertTextError(error, {
        attemptCode: "openrouter_response_too_large",
        publicCode: "provider_failed",
        retryable: false,
      }),
  );
});

test("bounds a streamed provider response without trusting Content-Length", async () => {
  const oversizedChunk = new Uint8Array(1024 * 1024 + 1);

  await assert.rejects(
    generateOpenRouterStructuredText({
      ...REQUEST_INPUT,
      apiKey: "sk-or-v1-test-only",
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(oversizedChunk);
              controller.close();
            },
          }),
        ),
      timeoutMs: 5_000,
    }),
    (error) =>
      assertTextError(error, {
        attemptCode: "openrouter_response_too_large",
        publicCode: "provider_failed",
        retryable: false,
      }),
  );
});

test("maps a transport failure to an unknown provider outcome", async () => {
  await assert.rejects(
    generateOpenRouterStructuredText({
      ...REQUEST_INPUT,
      apiKey: "sk-or-v1-test-only",
      fetchImpl: async () => {
        throw new Error("network details must remain private");
      },
      timeoutMs: 5_000,
    }),
    (error) =>
      assertTextError(error, {
        attemptCode: "openrouter_outcome_unknown",
        publicCode: "provider_outcome_unknown",
        retryable: false,
      }),
  );
});
