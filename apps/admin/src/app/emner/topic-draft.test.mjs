import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TOPIC_DESCRIPTION_LENGTH,
  MAX_TOPIC_ICON_LENGTH,
  MAX_TOPIC_SLUG_LENGTH,
  MAX_TOPIC_TITLE_LENGTH,
  normalizeDanishTopicSlug,
  validateTopicDraftForm,
} from "./topic-draft.ts";

const REQUEST_ID = "D1000000-0000-4000-8000-000000000001";

function validForm(overrides = {}) {
  const values = {
    requestId: REQUEST_ID,
    title: "Løb og fart",
    description: "Korte øvelser med fart og god løbeteknik.",
    icon: "🏃‍♀️",
    accentColor: "#53c987",
    ...overrides,
  };
  const formData = new FormData();

  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) {
      formData.append(name, value);
    }
  }

  return formData;
}

test("accepts one value per field and returns normalized database input", () => {
  const result = validateTopicDraftForm(
    validForm({
      title: "  Løb og fart  ",
      description: "  Første linje.\r\nAnden linje.  ",
      icon: "  🏃‍♀️  ",
    }),
  );

  assert.deepEqual(result, {
    ok: true,
    value: {
      requestId: REQUEST_ID.toLowerCase(),
      title: "Løb og fart",
      slug: "loeb-og-fart",
      description: "Første linje.\nAnden linje.",
      icon: "🏃‍♀️",
      accentColor: "#53C987",
    },
  });
});

test("normalizes Danish letters, accents, punctuation, and repeated separators", () => {
  assert.equal(
    normalizeDanishTopicSlug("Ærlig øvelse på åben bane"),
    "aerlig-oevelse-paa-aaben-bane",
  );
  assert.equal(
    normalizeDanishTopicSlug("  Café & balance — trin 1!  "),
    "cafe-balance-trin-1",
  );
});

test("rejects missing, repeated, and non-string form values per field", () => {
  const formData = validForm();
  formData.delete("description");
  formData.append("title", "Et andet emne");
  formData.set("icon", new Blob(["synthetic"], { type: "text/plain" }));

  const result = validateTopicDraftForm(formData);

  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.fieldErrors.title);
  assert.ok(!result.ok && result.fieldErrors.description);
  assert.ok(!result.ok && result.fieldErrors.icon);
  assert.match(!result.ok ? result.message : "", /valideres/);
});

test("rejects duplicate idempotency and presentation fields instead of choosing one", () => {
  const formData = validForm();

  for (const field of ["requestId", "description", "accentColor"]) {
    formData.append(field, "tampered");
  }

  const result = validateTopicDraftForm(formData);

  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.fieldErrors.requestId);
  assert.ok(!result.ok && result.fieldErrors.description);
  assert.ok(!result.ok && result.fieldErrors.accentColor);
});

test("requires a non-zero RFC UUID for idempotency", () => {
  for (const requestId of [
    "not-a-uuid",
    "00000000-0000-0000-0000-000000000000",
    "d1000000-0000-0000-7000-000000000001",
  ]) {
    const result = validateTopicDraftForm(validForm({ requestId }));
    assert.equal(result.ok, false);
    assert.match(
      !result.ok ? (result.fieldErrors.requestId ?? "") : "",
      /ugyldig/,
    );
  }
});

test("counts Unicode code points at the conservative text ceilings", () => {
  assert.equal(
    validateTopicDraftForm(
      validForm({ title: `${"a".repeat(MAX_TOPIC_TITLE_LENGTH - 1)}æ` }),
    ).ok,
    true,
  );
  assert.equal(
    validateTopicDraftForm(
      validForm({ description: "🙂".repeat(MAX_TOPIC_DESCRIPTION_LENGTH) }),
    ).ok,
    true,
  );

  const longTitle = validateTopicDraftForm(
    validForm({ title: "a".repeat(MAX_TOPIC_TITLE_LENGTH + 1) }),
  );
  const longDescription = validateTopicDraftForm(
    validForm({
      description: "🙂".repeat(MAX_TOPIC_DESCRIPTION_LENGTH + 1),
    }),
  );

  assert.equal(longTitle.ok, false);
  assert.match(
    !longTitle.ok ? (longTitle.fieldErrors.title ?? "") : "",
    /højst/,
  );
  assert.equal(longDescription.ok, false);
  assert.match(
    !longDescription.ok ? (longDescription.fieldErrors.description ?? "") : "",
    /højst/,
  );
});

test("rejects titles whose Danish transliteration exceeds the slug ceiling", () => {
  const result = validateTopicDraftForm(
    validForm({ title: "æ".repeat(MAX_TOPIC_SLUG_LENGTH / 2 + 1) }),
  );

  assert.equal(result.ok, false);
  assert.match(!result.ok ? (result.fieldErrors.title ?? "") : "", /adresse/);
});

test("allows incomplete optional draft fields and maps blanks to null", () => {
  const result = validateTopicDraftForm(
    validForm({ description: "   ", icon: "", accentColor: "   " }),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.ok
      ? {
          description: result.value.description,
          icon: result.value.icon,
          accentColor: result.value.accentColor,
        }
      : null,
    { description: "", icon: null, accentColor: null },
  );
});

test("requires child-visible descriptions to address the child", () => {
  for (const description of [
    "Barnet leger med bolden og lærer nye finter.",
    "Hjælp dit barn med at vælge en øvelse.",
  ]) {
    const result = validateTopicDraftForm(validForm({ description }));
    assert.equal(result.ok, false, description);
    assert.match(
      !result.ok ? (result.fieldErrors.description ?? "") : "",
      /direkte til barnet/,
    );
  }
});

test("returns field-specific Danish errors for invalid content", () => {
  const invalidTitle = validateTopicDraftForm(validForm({ title: "⚽️" }));
  const invalidControls = validateTopicDraftForm(
    validForm({ description: "Usikker\u0000tekst", icon: "⚽\n" }),
  );
  const invalidIcon = validateTopicDraftForm(
    validForm({ icon: "x".repeat(MAX_TOPIC_ICON_LENGTH + 1) }),
  );
  const invalidColor = validateTopicDraftForm(
    validForm({ accentColor: "rgb(83, 201, 135)" }),
  );

  assert.equal(invalidTitle.ok, false);
  assert.match(
    !invalidTitle.ok ? (invalidTitle.fieldErrors.title ?? "") : "",
    /bogstav eller tal/,
  );
  assert.equal(invalidControls.ok, false);
  assert.ok(!invalidControls.ok && invalidControls.fieldErrors.description);
  assert.ok(!invalidControls.ok && invalidControls.fieldErrors.icon);
  assert.equal(invalidIcon.ok, false);
  assert.match(
    !invalidIcon.ok ? (invalidIcon.fieldErrors.icon ?? "") : "",
    /højst/,
  );
  assert.equal(invalidColor.ok, false);
  assert.match(
    !invalidColor.ok ? (invalidColor.fieldErrors.accentColor ?? "") : "",
    /#53C987/,
  );
});
