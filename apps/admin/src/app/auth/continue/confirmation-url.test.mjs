import assert from "node:assert/strict";
import test from "node:test";

import {
  handleConfirmationPost,
  isLocalDevelopmentHost,
  isSameOriginPost,
  validateConfirmationUrl,
} from "./confirmation-url.ts";

const hostedOrigin = "https://example-project.supabase.co";
const hostedConfirmation =
  `${hostedOrigin}/auth/v1/verify?` +
  "token_hash=synthetic-token-hash&type=email&redirect_to=https%3A%2F%2Fexample.test%2Fauth%2Fcallback";
const hostedOptions = {
  configuredSupabaseUrl: hostedOrigin,
  allowLocalSupabase: false,
};

test("accepts only the configured HTTPS Supabase verification endpoint", () => {
  assert.equal(
    validateConfirmationUrl(hostedConfirmation, hostedOptions),
    hostedConfirmation,
  );

  for (const value of [
    "https://example-project.supabase.co.evil.test/auth/v1/verify?token=x&type=email",
    "https://example-project.supabase.co/other?token=x&type=email",
    "https://user:pass@example-project.supabase.co/auth/v1/verify?token=x&type=email",
    "https://example-project.supabase.co/auth/v1/verify?token=x&type=email#fragment",
    "http://example-project.supabase.co/auth/v1/verify?token=x&type=email",
    "https://example-project.supabase.co:444/auth/v1/verify?token=x&type=email",
    "https://example-project.supabase.co/auth/v1/verify?type=email",
    "https://example-project.supabase.co/auth/v1/verify?token=x",
  ]) {
    assert.equal(validateConfirmationUrl(value, hostedOptions), null, value);
  }
});

test("allows fixed local Auth origins only during local development", () => {
  const localConfirmation =
    "http://localhost:54321/auth/v1/verify?token=synthetic&type=magiclink";

  assert.equal(
    validateConfirmationUrl(localConfirmation, {
      configuredSupabaseUrl: hostedOrigin,
      allowLocalSupabase: true,
    }),
    localConfirmation,
  );
  assert.equal(validateConfirmationUrl(localConfirmation, hostedOptions), null);
  assert.equal(
    validateConfirmationUrl(
      "http://127.0.0.1:54322/auth/v1/verify?token=x&type=magiclink",
      { configuredSupabaseUrl: hostedOrigin, allowLocalSupabase: true },
    ),
    null,
  );

  assert.equal(isLocalDevelopmentHost("localhost:11000", "development"), true);
  assert.equal(isLocalDevelopmentHost("127.0.0.1:11000", "development"), true);
  assert.equal(isLocalDevelopmentHost("localhost:11000", "production"), false);
  assert.equal(
    isLocalDevelopmentHost("localhost.evil.test", "development"),
    false,
  );
});

test("requires an exact same-origin browser POST", () => {
  const sameOrigin = new Request(
    "http://localhost:11000/auth/continue/confirm",
    {
      method: "POST",
      headers: {
        origin: "http://localhost:11000",
        "sec-fetch-site": "same-origin",
      },
    },
  );
  const crossOrigin = new Request(
    "http://localhost:11000/auth/continue/confirm",
    {
      method: "POST",
      headers: { origin: "https://evil.test" },
    },
  );

  assert.equal(isSameOriginPost(sameOrigin), true);
  assert.equal(isSameOriginPost(crossOrigin), false);
  assert.equal(
    isSameOriginPost(
      new Request("http://localhost:11000/auth/continue/confirm", {
        method: "POST",
      }),
    ),
    false,
  );
});

test("POST revalidates the URL and redirects with 303 only when valid", async () => {
  const validRequest = new Request(
    "https://admin.example.test/auth/continue/confirm",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://admin.example.test",
        "sec-fetch-site": "same-origin",
      },
      body: new URLSearchParams({ confirmation_url: hostedConfirmation }),
    },
  );
  const validResponse = await handleConfirmationPost(
    validRequest,
    hostedOptions,
  );

  assert.equal(validResponse.status, 303);
  assert.equal(validResponse.headers.get("location"), hostedConfirmation);
  assert.equal(
    validResponse.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assert.equal(validResponse.headers.get("referrer-policy"), "no-referrer");

  const invalidRequest = new Request(
    "https://admin.example.test/auth/continue/confirm",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://admin.example.test",
      },
      body: new URLSearchParams({
        confirmation_url:
          "https://evil.test/auth/v1/verify?token=x&type=magiclink",
      }),
    },
  );
  const invalidResponse = await handleConfirmationPost(
    invalidRequest,
    hostedOptions,
  );

  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidResponse.headers.get("location"), null);
});

test("POST rejects an oversized body even without Content-Length", async () => {
  const request = new Request(
    "https://admin.example.test/auth/continue/confirm",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://admin.example.test",
      },
      body: `confirmation_url=${"x".repeat(12_001)}`,
    },
  );

  assert.equal(request.headers.get("content-length"), null);

  const response = await handleConfirmationPost(request, hostedOptions);

  assert.equal(response.status, 413);
  assert.equal(response.headers.get("location"), null);
});

test("POST rejects multipart forms", async () => {
  const multipart = new FormData();
  multipart.set("confirmation_url", hostedConfirmation);

  const request = new Request(
    "https://admin.example.test/auth/continue/confirm",
    {
      method: "POST",
      headers: { origin: "https://admin.example.test" },
      body: multipart,
    },
  );
  const response = await handleConfirmationPost(request, hostedOptions);

  assert.match(
    request.headers.get("content-type") ?? "",
    /^multipart\/form-data/,
  );
  assert.equal(response.status, 415);
  assert.equal(response.headers.get("location"), null);
});
