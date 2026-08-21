import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpenRouterImageRequest,
  generateOpenRouterImage,
  OpenRouterImageError,
  parseOpenRouterImageOptions,
  parseOpenRouterImageResponse,
} from "./openrouter-image.ts";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const OPTIONS = {
  aspect_ratio: "1:1",
  n: 1,
  provider: {
    allow_fallbacks: false,
    only: ["azure"],
  },
};
const PROMPT =
  "Create a friendly stylized 3D cartoon version of this person. Preserve their recognizable face, hairstyle, skin tone and distinctive features.";

function assertImageError(error, expected) {
  assert.ok(error instanceof OpenRouterImageError);
  assert.equal(error.attemptCode, expected.attemptCode);
  assert.equal(error.publicCode, expected.publicCode);
  assert.equal(error.retryable, expected.retryable);
  return true;
}

test("accepts only the bounded provider request options", () => {
  assert.deepEqual(parseOpenRouterImageOptions(OPTIONS), OPTIONS);

  for (const unsafeProviderOptions of [
    { ...OPTIONS.provider, allow_fallbacks: true },
    { ...OPTIONS.provider, only: ["openai"] },
    { ...OPTIONS.provider, data_collection: "deny" },
    { ...OPTIONS.provider, zdr: true },
  ]) {
    assert.throws(
      () =>
        parseOpenRouterImageOptions({
          ...OPTIONS,
          provider: unsafeProviderOptions,
        }),
      (error) =>
        assertImageError(error, {
          attemptCode: "unsafe_request_options",
          publicCode: "server_configuration",
          retryable: false,
        }),
    );
  }
});

test("builds a data URL request without accepting a client-selected model", () => {
  const body = createOpenRouterImageRequest({
    inputBytes: PNG_BYTES,
    inputMimeType: "image/png",
    model: "microsoft/mai-image-2.5",
    options: OPTIONS,
    prompt: PROMPT,
  });

  assert.equal(body.model, "microsoft/mai-image-2.5");
  assert.equal(body.prompt, PROMPT);
  assert.deepEqual(body.provider, {
    allow_fallbacks: false,
    only: ["azure"],
  });
  assert.match(
    body.input_references[0].image_url.url,
    /^data:image\/png;base64,/,
  );

  assert.throws(
    () =>
      createOpenRouterImageRequest({
        inputBytes: PNG_BYTES,
        inputMimeType: "image/png",
        model: "client-selected-model",
        options: OPTIONS,
        prompt: PROMPT,
      }),
    (error) =>
      assertImageError(error, {
        attemptCode: "unsupported_model",
        publicCode: "server_configuration",
        retryable: false,
      }),
  );
});

test("rejects a declared MIME type that disagrees with the image signature", () => {
  assert.throws(
    () =>
      createOpenRouterImageRequest({
        inputBytes: PNG_BYTES,
        inputMimeType: "image/jpeg",
        model: "microsoft/mai-image-2.5",
        options: OPTIONS,
        prompt: PROMPT,
      }),
    (error) =>
      assertImageError(error, {
        attemptCode: "input_signature_mismatch",
        publicCode: "invalid_input_image",
        retryable: false,
      }),
  );
});

test("parses exactly one PNG and normalizes cost to microdollars", () => {
  const result = parseOpenRouterImageResponse({
    body: {
      data: [
        {
          b64_json: Buffer.from(PNG_BYTES).toString("base64"),
          media_type: "image/png",
        },
      ],
      usage: { cost: 0.123456, prompt_tokens: 3, total_tokens: 3 },
    },
    providerRequestId: "request-1",
  });

  assert.deepEqual(result.bytes, PNG_BYTES);
  assert.equal(result.costMicrousd, 123_456);
  assert.deepEqual(result.usage, { prompt_tokens: 3, total_tokens: 3 });
  assert.equal(result.providerRequestId, "request-1");
});

test("keeps a missing provider cost unknown instead of reporting zero", () => {
  const result = parseOpenRouterImageResponse({
    body: {
      data: [
        {
          b64_json: Buffer.from(PNG_BYTES).toString("base64"),
          media_type: "image/png",
        },
      ],
      usage: { total_tokens: 3 },
    },
    providerRequestId: "generation-without-cost",
  });

  assert.equal(result.costMicrousd, null);
});

test("posts only to the dedicated Images endpoint and maps throttling", async () => {
  let callCount = 0;
  let capturedUrl;
  let capturedInit;

  await assert.rejects(
    generateOpenRouterImage({
      apiKey: "sk-or-v1-test-only",
      fetchImpl: async (url, init) => {
        callCount += 1;
        capturedUrl = url;
        capturedInit = init;
        return new Response("rate limited", {
          headers: {
            "retry-after": "30",
            "x-generation-id": "generation-429",
          },
          status: 429,
        });
      },
      inputBytes: PNG_BYTES,
      inputMimeType: "image/png",
      model: "microsoft/mai-image-2.5",
      options: OPTIONS,
      prompt: PROMPT,
      timeoutMs: 1_000,
    }),
    (error) =>
      assertImageError(error, {
        attemptCode: "openrouter_rate_limited",
        publicCode: "provider_rate_limited",
        retryable: true,
      }),
  );

  assert.equal(capturedUrl, "https://openrouter.ai/api/v1/images");
  assert.equal(callCount, 1);
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers.Authorization, "Bearer sk-or-v1-test-only");
  const capturedBody = JSON.parse(capturedInit.body);
  assert.equal(capturedBody.model, "microsoft/mai-image-2.5");
  assert.deepEqual(capturedBody.provider, {
    allow_fallbacks: false,
    only: ["azure"],
  });
});

test("maps an empty provider failure from its HTTP status", async () => {
  await assert.rejects(
    generateOpenRouterImage({
      apiKey: "sk-or-v1-test-only",
      fetchImpl: async () => new Response(null, { status: 503 }),
      inputBytes: PNG_BYTES,
      inputMimeType: "image/png",
      model: "microsoft/mai-image-2.5",
      options: OPTIONS,
      prompt: PROMPT,
      timeoutMs: 1_000,
    }),
    (error) =>
      assertImageError(error, {
        attemptCode: "openrouter_http_503",
        publicCode: "provider_unavailable",
        retryable: true,
      }),
  );
});

test("recognizes a direct typed availability error", async () => {
  await assert.rejects(
    generateOpenRouterImage({
      apiKey: "sk-or-v1-test-only",
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              error_type: "provider_unavailable",
              message: "Synthetic raw provider detail",
            },
          },
          { status: 503 },
        ),
      inputBytes: PNG_BYTES,
      inputMimeType: "image/png",
      model: "microsoft/mai-image-2.5",
      options: OPTIONS,
      prompt: PROMPT,
      timeoutMs: 1_000,
    }),
    (error) =>
      assertImageError(error, {
        attemptCode: "openrouter_provider_unavailable",
        publicCode: "provider_unavailable",
        retryable: true,
      }),
  );
});

test("maps a typed content-policy response without retaining raw details", async () => {
  await assert.rejects(
    generateOpenRouterImage({
      apiKey: "sk-or-v1-test-only",
      fetchImpl: async () =>
        Response.json(
          {
            error: {
              code: 400,
              message: "Synthetic raw provider detail",
              metadata: { error_type: "content_policy_violation" },
            },
          },
          {
            headers: { "x-generation-id": "generation-policy" },
            status: 400,
          },
        ),
      inputBytes: PNG_BYTES,
      inputMimeType: "image/png",
      model: "microsoft/mai-image-2.5",
      options: OPTIONS,
      prompt: PROMPT,
      timeoutMs: 1_000,
    }),
    (error) => {
      assertImageError(error, {
        attemptCode: "openrouter_content_policy_violation",
        publicCode: "provider_rejected_input",
        retryable: false,
      });
      assert.equal(error.providerRequestId, "generation-policy");
      assert.doesNotMatch(error.message, /synthetic/i);
      return true;
    },
  );
});

test("maps key guardrail denials to server configuration", async () => {
  for (const body of [
    { error: { error_type: "permission_denied" } },
    { error: { message: "Synthetic untyped guardrail denial" } },
  ]) {
    await assert.rejects(
      generateOpenRouterImage({
        apiKey: "sk-or-v1-test-only",
        fetchImpl: async () => Response.json(body, { status: 403 }),
        inputBytes: PNG_BYTES,
        inputMimeType: "image/png",
        model: "microsoft/mai-image-2.5",
        options: OPTIONS,
        prompt: PROMPT,
        timeoutMs: 1_000,
      }),
      (error) => {
        assertImageError(error, {
          attemptCode:
            body.error.error_type === "permission_denied"
              ? "openrouter_permission_denied"
              : "openrouter_http_403",
          publicCode: "server_configuration",
          retryable: false,
        });
        assert.doesNotMatch(error.message, /synthetic/i);
        return true;
      },
    );
  }
});

test("reconciles a missing image cost from the generation record", async () => {
  const calls = [];
  const result = await generateOpenRouterImage({
    apiKey: "sk-or-v1-test-only",
    fetchImpl: async (url, init) => {
      calls.push({ init, url: String(url) });

      if (String(url).includes("/generation?")) {
        return Response.json({
          data: { id: "gen-cost-1", total_cost: 0.04 },
        });
      }

      return Response.json(
        {
          data: [
            {
              b64_json: Buffer.from(PNG_BYTES).toString("base64"),
              media_type: "image/png",
            },
          ],
          usage: { total_tokens: 3 },
        },
        { headers: { "x-generation-id": "gen-cost-1" } },
      );
    },
    inputBytes: PNG_BYTES,
    inputMimeType: "image/png",
    model: "microsoft/mai-image-2.5",
    options: OPTIONS,
    prompt: PROMPT,
    timeoutMs: 1_000,
  });

  assert.equal(result.costMicrousd, 40_000);
  assert.equal(calls.length, 2);
  assert.equal(
    calls[1].url,
    "https://openrouter.ai/api/v1/generation?id=gen-cost-1",
  );
  assert.equal(calls[1].init.method, "GET");
});

test("polls only the idempotent generation lookup during eventual consistency", async () => {
  let lookupCount = 0;
  const methods = [];
  const result = await generateOpenRouterImage({
    apiKey: "sk-or-v1-test-only",
    fetchImpl: async (url, init) => {
      methods.push(init.method);

      if (String(url).includes("/generation?")) {
        lookupCount += 1;
        return lookupCount < 3
          ? Response.json({ error: { code: 404 } }, { status: 404 })
          : Response.json({
              data: { id: "gen-eventual-1", total_cost: 0.05 },
            });
      }

      return Response.json(
        {
          data: [
            {
              b64_json: Buffer.from(PNG_BYTES).toString("base64"),
              media_type: "image/png",
            },
          ],
          usage: {},
        },
        { headers: { "x-generation-id": "gen-eventual-1" } },
      );
    },
    inputBytes: PNG_BYTES,
    inputMimeType: "image/png",
    model: "microsoft/mai-image-2.5",
    options: OPTIONS,
    prompt: PROMPT,
    timeoutMs: 2_000,
  });

  assert.equal(result.costMicrousd, 50_000);
  assert.equal(lookupCount, 3);
  assert.deepEqual(methods, ["POST", "GET", "GET", "GET"]);
});

test("treats a network failure as an unknown non-retryable provider outcome", async () => {
  await assert.rejects(
    generateOpenRouterImage({
      apiKey: "sk-or-v1-test-only",
      fetchImpl: async () => {
        throw new Error("network failed after a possible write");
      },
      inputBytes: PNG_BYTES,
      inputMimeType: "image/png",
      model: "microsoft/mai-image-2.5",
      options: OPTIONS,
      prompt: PROMPT,
      timeoutMs: 1_000,
    }),
    (error) =>
      assertImageError(error, {
        attemptCode: "openrouter_outcome_unknown",
        publicCode: "provider_outcome_unknown",
        retryable: false,
      }),
  );
});
