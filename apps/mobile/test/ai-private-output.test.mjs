import assert from "node:assert/strict";
import test from "node:test";

import {
  loadPrivateWebImage,
  loadPrivateWebPng,
  revokePrivateWebImage,
} from "../src/ai/private-output.ts";

test("loads a private PNG with no-store and returns an owned blob URL", async () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ options, url });
    return new Response(new Blob([new Uint8Array([1, 2, 3])]), {
      headers: { "Content-Type": "image/png" },
      status: 200,
    });
  };
  URL.createObjectURL = () => "blob:private-output-test";

  try {
    const controller = new AbortController();
    const result = await loadPrivateWebPng(
      "https://example.test/private-signed-output",
      controller.signal,
    );

    assert.equal(result, "blob:private-output-test");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.cache, "no-store");
    assert.deepEqual(calls[0].options.headers, {
      "Cache-Control": "no-store",
    });
    assert.equal(calls[0].options.signal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
  }
});

test("loads a private JPEG only when the caller explicitly allows it", async () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;

  globalThis.fetch = async () =>
    new Response(new Blob([new Uint8Array([1, 2, 3])]), {
      headers: { "Content-Type": "image/jpeg" },
      status: 200,
    });
  URL.createObjectURL = () => "blob:private-topic-photo";

  try {
    await assert.rejects(
      loadPrivateWebPng(
        "https://example.test/private-topic-photo",
        new AbortController().signal,
      ),
      /invalid_private_output/,
    );
    assert.equal(
      await loadPrivateWebImage(
        "https://example.test/private-topic-photo",
        new AbortController().signal,
        ["image/jpeg", "image/png"],
      ),
      "blob:private-topic-photo",
    );
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
  }
});

test("rejects unavailable or non-PNG private output", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => new Response(null, { status: 403 });
    await assert.rejects(
      loadPrivateWebPng(
        "https://example.test/expired",
        new AbortController().signal,
      ),
      /private_output_unavailable/,
    );

    globalThis.fetch = async () =>
      new Response(new Blob([new Uint8Array([1])]), {
        headers: { "Content-Type": "text/plain" },
        status: 200,
      });
    await assert.rejects(
      loadPrivateWebPng(
        "https://example.test/not-an-image",
        new AbortController().signal,
      ),
      /invalid_private_output/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("revokes only owned browser blob URLs", () => {
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const revoked = [];
  URL.revokeObjectURL = (uri) => revoked.push(uri);

  try {
    revokePrivateWebImage("blob:private-output-test");
    revokePrivateWebImage("https://example.test/signed");
    revokePrivateWebImage(null);
    assert.deepEqual(revoked, ["blob:private-output-test"]);
  } finally {
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});
