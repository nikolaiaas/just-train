import assert from "node:assert/strict";
import test from "node:test";

import { isLocalAdminRequest, resolveAdminBackend } from "./backend.ts";

const environment = {
  developmentUrl: "https://development.example.supabase.co",
  developmentPublishableKey: "sb_publishable_development_synthetic",
  localUrl: "http://127.0.0.1:54321",
  localPublishableKey: "sb_publishable_local_synthetic",
};

const localLocation = {
  host: "localhost:11000",
  protocol: "http:",
  nodeEnvironment: "development",
};

test("shows the selector only on the exact local admin origins in development", () => {
  assert.equal(isLocalAdminRequest(localLocation), true);
  assert.equal(
    isLocalAdminRequest({ ...localLocation, host: "127.0.0.1:11000" }),
    true,
  );

  for (const location of [
    { ...localLocation, host: "localhost:11001" },
    { ...localLocation, host: "localhost.evil.test:11000" },
    { ...localLocation, host: "user@localhost:11000" },
    { ...localLocation, protocol: "https:" },
    { ...localLocation, nodeEnvironment: "production" },
  ]) {
    assert.equal(isLocalAdminRequest(location), false);
  }
});

test("keeps local and hosted development sessions in separate namespaces", () => {
  const development = resolveAdminBackend({
    selectedBackend: "development",
    location: localLocation,
    environment,
  });
  const local = resolveAdminBackend({
    selectedBackend: "local",
    location: localLocation,
    environment,
  });

  assert.equal(development.backend, "development");
  assert.equal(local.backend, "local");
  assert.equal(local.localAvailable, true);
  assert.notEqual(development.storageKey, local.storageKey);
  assert.match(development.storageKey, /-development$/);
  assert.match(local.storageKey, /-local$/);
});

test("never honors a local or production selection on a hosted request", () => {
  for (const selectedBackend of ["local", "production"]) {
    const result = resolveAdminBackend({
      selectedBackend,
      location: {
        host: "admin.example.test",
        protocol: "https:",
        nodeEnvironment: "production",
      },
      environment,
    });

    assert.equal(result.backend, "development");
    assert.equal(result.selectorVisible, false);
    assert.equal(result.localAvailable, false);
    assert.equal(result.secureCookies, true);
  }
});

test("keeps auth cookies Secure outside the exact local development gate", () => {
  for (const location of [
    {
      host: "admin.example.test",
      protocol: "http:",
      nodeEnvironment: "production",
    },
    {
      host: null,
      protocol: null,
      nodeEnvironment: "production",
    },
  ]) {
    const result = resolveAdminBackend({
      selectedBackend: "development",
      location,
      environment,
    });

    assert.equal(result.selectorVisible, false);
    assert.equal(result.secureCookies, true);
  }
});

test("falls back safely when optional local configuration is absent or invalid", () => {
  for (const localUrl of [
    undefined,
    "https://other.example.test",
    "http://localhost:54322",
  ]) {
    const result = resolveAdminBackend({
      selectedBackend: "local",
      location: localLocation,
      environment: { ...environment, localUrl },
    });

    assert.equal(result.backend, "development");
    assert.equal(result.localAvailable, false);
  }
});
