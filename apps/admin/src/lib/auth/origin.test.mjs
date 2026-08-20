import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTrustedActionOrigin,
  resolveTrustedCallbackOrigin,
} from "./origin.ts";
import { parseAdminCallback } from "./callback.ts";
import { externalizeRequestUrl } from "./request-location.ts";

test("accepts exact local action origins only in development", () => {
  assert.equal(
    resolveTrustedActionOrigin({
      originHeader: "http://localhost:11000",
      hostHeader: "localhost:11000",
      nodeEnvironment: "development",
    }),
    "http://localhost:11000",
  );

  for (const input of [
    {
      originHeader: "http://localhost:11000",
      hostHeader: "localhost:11000",
      nodeEnvironment: "production",
    },
    {
      originHeader: "http://localhost:11000",
      hostHeader: "evil.test",
      nodeEnvironment: "development",
    },
    {
      originHeader: "http://localhost.evil.test:11000",
      hostHeader: "localhost.evil.test:11000",
      nodeEnvironment: "development",
    },
  ]) {
    assert.equal(resolveTrustedActionOrigin(input), null);
  }
});

test("accepts only the configured stable hosted origin", () => {
  const base = {
    hostHeader: "admin.example.test",
    nodeEnvironment: "production",
    configuredOrigin: "https://admin.example.test",
  };

  assert.equal(
    resolveTrustedActionOrigin({
      ...base,
      originHeader: "https://admin.example.test",
    }),
    "https://admin.example.test",
  );
  assert.equal(
    resolveTrustedActionOrigin({
      ...base,
      hostHeader: "preview.example.test",
      originHeader: "https://preview.example.test",
    }),
    null,
  );
});

test("validates callback path and origin without trusting query input", () => {
  const base = {
    nodeEnvironment: "production",
    configuredOrigin: "https://admin.example.test",
    forwardedProtocol: "https",
    hostHeader: "admin.example.test",
    isVercel: false,
  };

  assert.equal(
    resolveTrustedCallbackOrigin({
      ...base,
      requestUrl: "https://admin.example.test/auth/callback?code=synthetic",
    }),
    "https://admin.example.test",
  );
  assert.equal(
    resolveTrustedCallbackOrigin({
      ...base,
      requestUrl: "https://admin.example.test/other?code=synthetic",
    }),
    null,
  );
  assert.equal(
    resolveTrustedCallbackOrigin({
      ...base,
      requestUrl: "https://preview.example.test/auth/callback?code=synthetic",
      hostHeader: "preview.example.test",
    }),
    null,
  );
});

test("reconstructs a 127 callback when Next canonicalizes its internal URL", () => {
  const internalUrl =
    "http://localhost:11000/auth/callback?code=synthetic-code";
  const trustedOrigin = resolveTrustedCallbackOrigin({
    requestUrl: internalUrl,
    hostHeader: "127.0.0.1:11000",
    forwardedProtocol: null,
    isVercel: false,
    nodeEnvironment: "development",
  });

  assert.equal(trustedOrigin, "http://127.0.0.1:11000");

  const externalUrl = externalizeRequestUrl(internalUrl, trustedOrigin);
  assert.equal(
    externalUrl,
    "http://127.0.0.1:11000/auth/callback?code=synthetic-code",
  );
  assert.deepEqual(parseAdminCallback(externalUrl, trustedOrigin), {
    code: "synthetic-code",
  });
});
