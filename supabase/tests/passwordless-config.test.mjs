import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const configUrl = new URL("../config.toml", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const seedUrl = new URL("../seed.sql", import.meta.url);
const templateUrl = new URL("../templates/passwordless.html", import.meta.url);

const [config, readme, seed, template] = await Promise.all([
  readFile(configUrl, "utf8"),
  readFile(readmeUrl, "utf8"),
  readFile(seedUrl, "utf8"),
  readFile(templateUrl, "utf8"),
]);

function section(source, name) {
  const marker = `[${name}]`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${marker}`);

  const bodyStart = start + marker.length;
  const remaining = source.slice(bodyStart);
  const nextSection = remaining.search(/\n\[[^\n]+\]/);

  return nextSection === -1 ? remaining : remaining.slice(0, nextSection);
}

function occurrences(source, value) {
  return source.split(value).length - 1;
}

test("local email auth is a six-digit, ten-minute passwordless flow", () => {
  const authEmail = section(config, "auth.email");

  assert.match(authEmail, /^enable_signup = true$/m);
  assert.match(authEmail, /^enable_confirmations = true$/m);
  assert.match(authEmail, /^max_frequency = "60s"$/m);
  assert.match(authEmail, /^otp_length = 6$/m);
  assert.match(authEmail, /^otp_expiry = 600$/m);
  assert.match(config, /^minimum_password_length = 8$/m);
  assert.match(config, /^password_requirements = "letters_digits"$/m);
});

test("local auth accepts only the declared Bare Træn callback targets", () => {
  const redirects = config.match(
    /additional_redirect_urls\s*=\s*\[([\s\S]*?)\n\]/,
  );
  assert.ok(redirects, "Missing additional_redirect_urls");

  const configuredUrls = Array.from(
    redirects[1].matchAll(/"([^"]+)"/g),
    (match) => match[1],
  );

  assert.deepEqual(configuredUrls, [
    "http://127.0.0.1:11000/auth/callback",
    "http://localhost:11000/auth/callback",
    "http://127.0.0.1:11001/auth/callback",
    "http://localhost:11001/auth/callback",
    "baretraen-dev://auth/callback",
    "baretraen-preview://auth/callback",
    "baretraen://auth/callback",
  ]);
});

test("new and returning users receive the same tracked template", () => {
  const confirmation = section(config, "auth.email.template.confirmation");
  const magicLink = section(config, "auth.email.template.magic_link");

  for (const templateConfig of [confirmation, magicLink]) {
    assert.match(templateConfig, /^subject = "Log ind i Bare Træn"$/m);
    assert.match(
      templateConfig,
      /^content_path = "\.\/supabase\/templates\/passwordless\.html"$/m,
    );
  }
});

test("the Danish email offers one code and one intermediary button", () => {
  assert.match(template, /<html lang="da">/);
  assert.match(template, /sekscifrede engangskode/);
  assert.match(template, /det magiske link/);
  assert.equal(occurrences(template, "{{ .Token }}"), 1);
  assert.equal(occurrences(template, "{{ .ConfirmationURL }}"), 1);
  assert.equal(occurrences(template, "{{ .SiteURL }}"), 1);
  assert.match(
    template,
    /href="{{ \.SiteURL }}\/auth\/continue\?confirmation_url={{ \.ConfirmationURL }}"/,
  );
  assert.doesNotMatch(template, /href="{{ \.ConfirmationURL }}"/);
  assert.doesNotMatch(template, /password/i);
});

test("local fixture users have no password hash", () => {
  assert.doesNotMatch(seed, /encrypted_password/i);
  assert.doesNotMatch(seed, /\bcrypt\s*\(/i);
  assert.equal(occurrences(seed, "@example.test"), 6);
  assert.match(readme, /fixture users are passwordless/);
  assert.match(readme, /127\.0\.0\.1:54324/);
});
