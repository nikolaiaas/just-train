import assert from "node:assert/strict";
import test from "node:test";

import { resolveExternalRequestLocation } from "./request-location.ts";

test("uses the validated Host header when Next canonicalizes a loopback URL", () => {
  assert.deepEqual(
    resolveExternalRequestLocation({
      requestUrl: "http://localhost:11000/auth/backend",
      hostHeader: "127.0.0.1:11000",
      forwardedProtocol: null,
      isVercel: false,
    }),
    {
      host: "127.0.0.1:11000",
      origin: "http://127.0.0.1:11000",
      pathname: "/auth/backend",
      protocol: "http:",
    },
  );
});

test("forces HTTPS on Vercel even if a forwarded header says HTTP", () => {
  assert.deepEqual(
    resolveExternalRequestLocation({
      requestUrl: "http://internal.example/auth/callback",
      hostHeader: "admin.example.test",
      forwardedProtocol: "http",
      isVercel: true,
    }),
    {
      host: "admin.example.test",
      origin: "https://admin.example.test",
      pathname: "/auth/callback",
      protocol: "https:",
    },
  );
});

test("rejects malformed external hosts", () => {
  for (const hostHeader of [
    null,
    "user@localhost:11000",
    "localhost:11000/path",
    " localhost:11000",
  ]) {
    assert.equal(
      resolveExternalRequestLocation({
        requestUrl: "http://localhost:11000/login",
        hostHeader,
        forwardedProtocol: null,
        isVercel: false,
      }),
      null,
    );
  }
});
