import assert from "node:assert/strict";
import test from "node:test";

import {
  assistantInvocationErrorMessage,
  readAssistantInvocationStatus,
} from "./assistant-invocation.ts";

test("reads function HTTP status without consuming or exposing the response", () => {
  assert.equal(readAssistantInvocationStatus({ status: 429 }), 429);
  assert.equal(
    readAssistantInvocationStatus({
      context: new Response(null, { status: 503 }),
    }),
    503,
  );

  for (const invalid of [null, "401", {}, { status: 99 }, { status: 700 }]) {
    assert.equal(readAssistantInvocationStatus(invalid), null);
  }
});

test("maps invocation boundaries to actionable, credential-safe copy", () => {
  assert.match(
    assistantInvocationErrorMessage({ context: { status: 401 } }),
    /Log ind igen/,
  );
  assert.match(
    assistantInvocationErrorMessage({ context: { status: 404 } }),
    /Genindlæs/,
  );
  assert.match(
    assistantInvocationErrorMessage({ context: { status: 429 } }),
    /travlt/,
  );
  assert.match(
    assistantInvocationErrorMessage({ context: { status: 503 } }),
    /serveropsætning/,
  );

  const unknown = assistantInvocationErrorMessage(new Error("secret detail"));
  assert.match(unknown, /kunne ikke startes/);
  assert.doesNotMatch(unknown, /secret detail/);
});
