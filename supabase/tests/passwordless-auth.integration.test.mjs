import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);
const redirectTo = "http://127.0.0.1:11000/auth/callback";
const continuePrefix = "http://127.0.0.1:11000/auth/continue?confirmation_url=";

async function readLocalStatus() {
  let stdout;

  try {
    ({ stdout } = await execFile("supabase", ["status", "-o", "json"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }));
  } catch {
    throw new Error(
      "Could not read local Supabase status; start and reset the local stack first",
    );
  }

  let status;

  try {
    status = JSON.parse(stdout);
  } catch {
    throw new Error("Local Supabase returned an invalid status document");
  }

  for (const key of ["API_URL", "PUBLISHABLE_KEY", "MAILPIT_URL"]) {
    assert.ok(
      typeof status[key] === "string" && status[key].length > 0,
      `Local Supabase status is missing ${key}`,
    );
  }

  return status;
}

async function safeFetch(label, url, init) {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(`${label} request failed`);
  }
}

async function readJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned a non-JSON response`);
  }
}

async function listMessageIds(mailpitUrl) {
  const response = await safeFetch(
    "Mailpit message list",
    `${mailpitUrl}/api/v1/messages`,
  );
  assert.equal(response.status, 200, "Mailpit message list must be available");

  const payload = await readJson(response, "Mailpit message list");
  assert.ok(
    Array.isArray(payload.messages),
    "Mailpit must return a message list",
  );

  return new Set(payload.messages.map((message) => message.ID));
}

function isRecipient(message, email) {
  return (
    Array.isArray(message.To) &&
    message.To.some((recipient) => recipient.Address === email)
  );
}

async function waitForMessage(mailpitUrl, email, previousIds) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const response = await safeFetch(
      "Mailpit message list",
      `${mailpitUrl}/api/v1/messages`,
    );
    assert.equal(
      response.status,
      200,
      "Mailpit message list must be available",
    );

    const payload = await readJson(response, "Mailpit message list");
    const message = payload.messages?.find(
      (candidate) =>
        !previousIds.has(candidate.ID) && isRecipient(candidate, email),
    );

    if (message) {
      const detailResponse = await safeFetch(
        "Mailpit message detail",
        `${mailpitUrl}/api/v1/message/${encodeURIComponent(message.ID)}`,
      );
      assert.equal(
        detailResponse.status,
        200,
        "Mailpit message detail must be available",
      );
      return readJson(detailResponse, "Mailpit message detail");
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for the synthetic passwordless email");
}

function decodeHtmlAttribute(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#39;", "'");
}

function readCredentialMaterial(message) {
  assert.ok(
    typeof message.HTML === "string",
    "The synthetic email must have an HTML body",
  );

  const codeMatch = message.HTML.match(/>\s*(\d{6})\s*</);
  const linkMatch = message.HTML.match(
    /href="([^"]*\/auth\/continue\?confirmation_url=[^"]+)"/,
  );

  assert.ok(codeMatch, "The synthetic email must contain a six-digit code");
  assert.ok(
    linkMatch,
    "The synthetic email must contain the continuation link",
  );
  assert.ok(
    !message.HTML.includes("{{"),
    "The synthetic email must not contain unrendered template variables",
  );

  const continuationUrl = decodeHtmlAttribute(linkMatch[1]);
  assert.ok(
    continuationUrl.startsWith(continuePrefix),
    "The email link must use the local continuation route",
  );
  assert.ok(
    !message.HTML.includes(`href="http://127.0.0.1:54321/auth/v1/verify`),
    "The email must not expose a directly clickable Auth verification link",
  );

  let confirmationUrl;

  try {
    confirmationUrl = decodeURIComponent(
      continuationUrl.slice(continuePrefix.length),
    );
  } catch {
    throw new Error(
      "The continuation route carried an invalid verification URL",
    );
  }

  assert.ok(
    confirmationUrl.startsWith("http://127.0.0.1:54321/auth/v1/verify?"),
    "The continuation route must carry a local Auth verification URL",
  );

  return { code: codeMatch[1], confirmationUrl };
}

async function requestPasswordlessEmail(apiUrl, publishableKey, email) {
  const response = await safeFetch(
    "Passwordless email",
    `${apiUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, create_user: false }),
    },
  );

  assert.equal(response.status, 200, "Passwordless email request must succeed");
}

async function verifyEmailCode(apiUrl, publishableKey, email, code) {
  const response = await safeFetch(
    "Email OTP verification",
    `${apiUrl}/auth/v1/verify`,
    {
      method: "POST",
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, token: code, type: "email" }),
    },
  );

  return {
    response,
    payload: await readJson(response, "Email OTP verification"),
  };
}

async function assertSession(apiUrl, publishableKey, accessToken, email) {
  assert.ok(
    typeof accessToken === "string" && accessToken.length > 0,
    "Verification must return an access token",
  );

  const response = await safeFetch(
    "Authenticated user",
    `${apiUrl}/auth/v1/user`,
    {
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
  assert.equal(response.status, 200, "The issued session must be usable");

  const user = await readJson(response, "Authenticated user");
  assert.equal(
    user.email,
    email,
    "The issued session must belong to the fixture",
  );
}

function parseSensitiveUrl(value, label) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} was not a valid URL`);
  }
}

test("email OTP renders safely, creates a session, and cannot be replayed", async () => {
  const status = await readLocalStatus();
  const email = "parent.one@example.test";
  const previousIds = await listMessageIds(status.MAILPIT_URL);

  await requestPasswordlessEmail(status.API_URL, status.PUBLISHABLE_KEY, email);
  const message = await waitForMessage(status.MAILPIT_URL, email, previousIds);
  const { code } = readCredentialMaterial(message);

  const firstAttempt = await verifyEmailCode(
    status.API_URL,
    status.PUBLISHABLE_KEY,
    email,
    code,
  );
  assert.equal(
    firstAttempt.response.status,
    200,
    "The email OTP must verify once",
  );
  assert.ok(
    typeof firstAttempt.payload.refresh_token === "string" &&
      firstAttempt.payload.refresh_token.length > 0,
    "OTP verification must return a refresh token",
  );
  await assertSession(
    status.API_URL,
    status.PUBLISHABLE_KEY,
    firstAttempt.payload.access_token,
    email,
  );

  const replay = await verifyEmailCode(
    status.API_URL,
    status.PUBLISHABLE_KEY,
    email,
    code,
  );
  assert.ok(replay.response.status >= 400, "A used email OTP must be rejected");
  assert.ok(
    !replay.payload.access_token,
    "OTP replay must not issue a session",
  );
});

test("magic link verifies once behind the intermediary and cannot be replayed", async () => {
  const status = await readLocalStatus();
  const email = "parent.two@example.test";
  const previousIds = await listMessageIds(status.MAILPIT_URL);

  await requestPasswordlessEmail(status.API_URL, status.PUBLISHABLE_KEY, email);
  const message = await waitForMessage(status.MAILPIT_URL, email, previousIds);
  const { confirmationUrl } = readCredentialMaterial(message);

  const firstAttempt = await safeFetch(
    "Magic-link verification",
    confirmationUrl,
    {
      redirect: "manual",
    },
  );
  assert.ok(
    firstAttempt.status >= 300 && firstAttempt.status < 400,
    "The magic link must redirect after its first verification",
  );

  const firstLocation = firstAttempt.headers.get("location");
  assert.ok(
    firstLocation,
    "The verified magic link must have a redirect target",
  );
  const firstRedirect = parseSensitiveUrl(firstLocation, "Magic-link redirect");
  const firstSession = new URLSearchParams(firstRedirect.hash.slice(1));
  assert.ok(
    firstRedirect.origin === "http://127.0.0.1:11000" &&
      firstRedirect.pathname === "/auth/callback",
    "The magic link must return to the exact local callback",
  );
  assert.ok(
    !firstSession.has("error"),
    "The first magic-link use must succeed",
  );
  await assertSession(
    status.API_URL,
    status.PUBLISHABLE_KEY,
    firstSession.get("access_token"),
    email,
  );

  const replay = await safeFetch("Magic-link replay", confirmationUrl, {
    redirect: "manual",
  });
  assert.ok(
    replay.status >= 300 && replay.status < 400,
    "A used magic link must return an error redirect",
  );

  const replayLocation = replay.headers.get("location");
  assert.ok(replayLocation, "Magic-link replay must have a redirect target");
  const replayRedirect = parseSensitiveUrl(
    replayLocation,
    "Magic-link replay redirect",
  );
  const replayResult = new URLSearchParams(replayRedirect.hash.slice(1));
  assert.ok(replayResult.has("error"), "Magic-link replay must be rejected");
  assert.ok(
    !replayResult.has("access_token"),
    "Magic-link replay must not issue a session",
  );
});
