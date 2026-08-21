import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { auditCreatorLabel } from "./audit-display.ts";
import {
  mapPromptPublicationError,
  MAX_PROMPT_LENGTH,
  validatePromptPublication,
} from "./prompt-publication.ts";

const validInput = {
  operationKey: "portrait.cartoon_3d",
  promptTemplate:
    "Create a friendly stylized 3D cartoon version of this person.\nPreserve recognizable features.",
  expectedActiveVersionId: "a2000000-0000-4000-8000-000000000002",
  confirmation: "reviewed",
};

test("accepts a reviewed prompt without provider or model input", () => {
  assert.deepEqual(validatePromptPublication(validInput), {
    ok: true,
    value: {
      operationKey: validInput.operationKey,
      promptTemplate: validInput.promptTemplate,
      expectedActiveVersionId: validInput.expectedActiveVersionId,
    },
  });
});

test("rejects missing, blank, padded, and control-character prompts", () => {
  for (const promptTemplate of [
    null,
    "",
    "   ",
    " padded",
    "padded ",
    "unsafe\u0000prompt",
  ]) {
    const result = validatePromptPublication({
      ...validInput,
      promptTemplate,
    });

    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.fieldErrors.promptTemplate);
  }
});

test("counts Unicode code points and enforces the database prompt ceiling", () => {
  assert.equal(
    validatePromptPublication({
      ...validInput,
      promptTemplate: "æ".repeat(MAX_PROMPT_LENGTH),
    }).ok,
    true,
  );

  const result = validatePromptPublication({
    ...validInput,
    promptTemplate: "🙂".repeat(MAX_PROMPT_LENGTH + 1),
  });
  assert.equal(result.ok, false);
  assert.match(
    !result.ok ? (result.fieldErrors.promptTemplate ?? "") : "",
    /højst/,
  );
});

test("requires an explicit review confirmation", () => {
  const result = validatePromptPublication({
    ...validInput,
    confirmation: null,
  });

  assert.equal(result.ok, false);
  assert.match(
    !result.ok ? (result.fieldErrors.confirmation ?? "") : "",
    /Bekræft/,
  );
});

test("rejects tampered operation and active-version identifiers", () => {
  for (const input of [
    { ...validInput, operationKey: "portrait/cartoon" },
    { ...validInput, expectedActiveVersionId: "not-a-version" },
  ]) {
    const result = validatePromptPublication(input);
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.message : "", /Genindlæs/);
  }
});

test("maps known database failures without returning raw database text", () => {
  assert.equal(mapPromptPublicationError({ code: "40001" }).status, "conflict");
  assert.equal(mapPromptPublicationError({ code: "42501" }).status, "denied");
  assert.equal(mapPromptPublicationError({ code: "22023" }).status, "invalid");
  assert.equal(
    mapPromptPublicationError({ code: "P0002" }).status,
    "unavailable",
  );

  const unknown = mapPromptPublicationError({ code: "XX000" });
  assert.equal(unknown.status, "unavailable");
  assert.doesNotMatch(unknown.message, /XX000/);
});

test("audit labels never expose stored administrator identifiers", () => {
  const currentAdminId = "10000000-0000-4000-8000-000000000003";
  const otherAdminId = "10000000-0000-4000-8000-000000000004";

  assert.equal(auditCreatorLabel(null, currentAdminId), "Systemopsætning");
  assert.equal(
    auditCreatorLabel(currentAdminId, currentAdminId),
    "Denne administrator (dig)",
  );
  assert.equal(
    auditCreatorLabel(otherAdminId, currentAdminId),
    "En anden administrator",
  );
  assert.doesNotMatch(
    auditCreatorLabel(otherAdminId, currentAdminId),
    /10000000/,
  );
});

test("the browser form cannot submit provider, gateway, model, or limits", async () => {
  const source = await readFile(
    new URL("./publish-form.tsx", import.meta.url),
    "utf8",
  );

  for (const serverOwnedField of [
    "provider",
    "gateway",
    "model",
    "maxAttempts",
    "timeoutMs",
    "maxCostMicrousd",
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`name=[\\"']${serverOwnedField}[\\"']`),
    );
  }

  assert.match(source, /name="operationKey"/);
  assert.match(source, /name="expectedActiveVersionId"/);
  assert.match(source, /name="promptTemplate"/);
  assert.match(source, /name="confirmation"/);
});
