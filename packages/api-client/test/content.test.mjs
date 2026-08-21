import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminContentError,
  createAdminTopicDraft,
  loadAdminTopicLibrary,
} from "../src/index.ts";

const requestId = "d1000000-0000-4000-8000-000000000001";
const authenticatedUserId = "10000000-0000-4000-8000-000000000003";
const goalId = "50000000-0000-4000-8000-000000000001";
const exerciseOneId = "60000000-0000-4000-8000-000000000001";
const exerciseTwoId = "60000000-0000-4000-8000-000000000002";

const createdRow = Object.freeze({
  accent_color: "#53C987",
  content_version: 1,
  created_at: "2026-08-21T20:00:00.000Z",
  created_by: authenticatedUserId,
  description: "Korte øvelser med fart.\nAnden linje.",
  icon: "🏃‍♀️",
  id: requestId,
  is_published: false,
  published_at: null,
  slug: "loeb-og-fart",
  sort_order: 0,
  title: "Løb og fart",
  updated_at: "2026-08-21T20:00:00.000Z",
});

const validInput = Object.freeze({
  accentColor: "#53C987",
  authenticatedUserId,
  description: createdRow.description,
  icon: createdRow.icon,
  requestId,
  slug: createdRow.slug,
  title: createdRow.title,
});

function assertContentError(error, code) {
  assert.ok(error instanceof AdminContentError);
  assert.equal(error.code, code);
  return true;
}

function awaitableQuery(response, calls) {
  const query = {
    eq(column, value) {
      calls.push({ operation: "eq", column, value });
      return query;
    },
    insert(value) {
      calls.push({ operation: "insert", value });
      return query;
    },
    maybeSingle: async () => response,
    order(column, options) {
      calls.push({ operation: "order", column, options });
      return query;
    },
    select(columns) {
      calls.push({ operation: "select", columns });
      return query;
    },
    then(resolve, reject) {
      return Promise.resolve(response).then(resolve, reject);
    },
  };

  return query;
}

function expectedTopic(overrides = {}) {
  return {
    accentColor: "#53C987",
    contentVersion: 1,
    createdAt: "2026-08-21T20:00:00.000Z",
    createdBy: authenticatedUserId,
    description: createdRow.description,
    exerciseCount: 0,
    goalCount: 0,
    icon: createdRow.icon,
    id: requestId,
    publishedAt: null,
    slug: createdRow.slug,
    sortOrder: 0,
    status: "draft",
    title: createdRow.title,
    updatedAt: "2026-08-21T20:00:00.000Z",
    ...overrides,
  };
}

test("loads real topics with nested goal and exercise counts", async () => {
  const calls = [];
  const publishedRow = {
    ...createdRow,
    id: "40000000-0000-4000-8000-000000000001",
    is_published: true,
    published_at: "2026-08-21T19:30:00.000Z",
    slug: "fodbold",
    sort_order: 10,
    title: "Fodbold",
    goals: [
      {
        id: goalId,
        exercises: [{ id: exerciseOneId }, { id: exerciseTwoId }],
      },
    ],
  };
  const draftRow = {
    ...createdRow,
    id: "40000000-0000-4000-8000-000000000002",
    slug: "gymnastik",
    sort_order: 20,
    title: "Gymnastik",
    goals: [],
  };
  const client = {
    from(table) {
      calls.push({ operation: "from", table });
      return awaitableQuery(
        { data: [publishedRow, draftRow], error: null },
        calls,
      );
    },
  };

  const result = await loadAdminTopicLibrary(client);

  assert.deepEqual(result, [
    expectedTopic({
      exerciseCount: 2,
      goalCount: 1,
      id: publishedRow.id,
      publishedAt: publishedRow.published_at,
      slug: "fodbold",
      sortOrder: 10,
      status: "published",
      title: "Fodbold",
    }),
    expectedTopic({
      id: draftRow.id,
      slug: "gymnastik",
      sortOrder: 20,
      title: "Gymnastik",
    }),
  ]);
  assert.equal(calls[0].table, "topics");
  assert.match(calls[1].columns, /goals\(id, exercises\(id\)\)/);
  assert.deepEqual(calls.slice(2), [
    {
      operation: "order",
      column: "sort_order",
      options: { ascending: true },
    },
    {
      operation: "order",
      column: "title",
      options: { ascending: true },
    },
  ]);
});

test("accepts an empty admin topic library", async () => {
  const client = {
    from() {
      return awaitableQuery({ data: [], error: null }, []);
    },
  };

  assert.deepEqual(await loadAdminTopicLibrary(client), []);
});

test("rejects malformed library rows and duplicate relation data", async () => {
  const invalidRows = [
    null,
    { ...createdRow, goals: null },
    { ...createdRow, goals: [{ id: "not-a-uuid", exercises: [] }] },
    {
      ...createdRow,
      goals: [
        { id: goalId, exercises: [] },
        { id: goalId, exercises: [] },
      ],
    },
    {
      ...createdRow,
      goals: [
        {
          id: goalId,
          exercises: [{ id: exerciseOneId }, { id: exerciseOneId }],
        },
      ],
    },
    { ...createdRow, is_published: true, published_at: null, goals: [] },
    { ...createdRow, description: " padded ", goals: [] },
  ];

  for (const row of invalidRows) {
    const client = {
      from() {
        return awaitableQuery({ data: [row], error: null }, []);
      },
    };

    await assert.rejects(loadAdminTopicLibrary(client), (error) =>
      assertContentError(error, "invalid_topic_library_result"),
    );
  }

  const duplicateTopicClient = {
    from() {
      const row = { ...createdRow, goals: [] };
      return awaitableQuery({ data: [row, row], error: null }, []);
    },
  };

  await assert.rejects(loadAdminTopicLibrary(duplicateTopicClient), (error) =>
    assertContentError(error, "invalid_topic_library_result"),
  );
});

test("normalizes library failures without exposing database details", async () => {
  const clients = [
    {
      from() {
        return awaitableQuery(
          {
            data: null,
            error: {
              code: "42501",
              message: "Synthetic private permission details",
            },
          },
          [],
        );
      },
      code: "admin_access_denied",
    },
    {
      from() {
        return awaitableQuery(
          {
            data: null,
            error: { code: "XX000", message: "Synthetic private SQL details" },
          },
          [],
        );
      },
      code: "topic_library_load_failed",
    },
    {
      from() {
        throw new Error("Synthetic private network details");
      },
      code: "topic_library_load_failed",
    },
  ];

  for (const { code, ...client } of clients) {
    await assert.rejects(loadAdminTopicLibrary(client), (error) => {
      assertContentError(error, code);
      assert.doesNotMatch(error.message, /synthetic|sql|network/i);
      return true;
    });
  }
});

test("creates an unpublished topic with the request id as its stable id", async () => {
  const calls = [];
  const client = {
    from(table) {
      calls.push({ operation: "from", table });
      return awaitableQuery({ data: createdRow, error: null }, calls);
    },
  };

  const result = await createAdminTopicDraft(client, {
    ...validInput,
    accentColor: "  #53c987  ",
    authenticatedUserId: authenticatedUserId.toUpperCase(),
    description: "  Korte øvelser med fart.\r\nAnden linje.  ",
    icon: "  🏃‍♀️  ",
    requestId: requestId.toUpperCase(),
    slug: "  LOEB-OG-FART  ",
    title: "  Løb og fart  ",
  });

  assert.deepEqual(result, { created: true, topic: expectedTopic() });
  assert.deepEqual(calls[0], { operation: "from", table: "topics" });
  assert.deepEqual(calls[1], {
    operation: "insert",
    value: {
      accent_color: "#53C987",
      created_by: authenticatedUserId,
      description: createdRow.description,
      icon: createdRow.icon,
      id: requestId,
      is_published: false,
      slug: "loeb-og-fart",
      sort_order: 0,
      title: "Løb og fart",
    },
  });
  assert.match(calls[2].columns, /^id, slug, title/);
});

test("rejects invalid topic inputs before accessing Supabase", async () => {
  let calls = 0;
  const client = {
    from() {
      calls += 1;
      throw new Error("must not query");
    },
  };
  const cases = [
    [{ requestId: "not-a-uuid" }, "invalid_request_id"],
    [
      { requestId: "00000000-0000-0000-0000-000000000000" },
      "invalid_request_id",
    ],
    [{ authenticatedUserId: "not-a-uuid" }, "invalid_authenticated_user_id"],
    [{ title: "   " }, "invalid_title"],
    [{ title: "x".repeat(101) }, "invalid_title"],
    [{ title: "Line\nBreak" }, "invalid_title"],
    [{ slug: "Unsafe Slug" }, "invalid_slug"],
    [{ description: "x".repeat(501) }, "invalid_description"],
    [{ description: "unsafe\u0000text" }, "invalid_description"],
    [{ icon: "x".repeat(17) }, "invalid_icon"],
    [{ icon: "icon\n" }, "invalid_icon"],
    [{ accentColor: "rgb(83, 201, 135)" }, "invalid_accent_color"],
  ];

  for (const [patch, code] of cases) {
    await assert.rejects(
      createAdminTopicDraft(client, { ...validInput, ...patch }),
      (error) => assertContentError(error, code),
    );
  }

  assert.equal(calls, 0);
});

test("recovers an exact duplicate request without overwriting the draft", async () => {
  const calls = [];
  let queryNumber = 0;
  const client = {
    from(table) {
      calls.push({ operation: "from", table });
      queryNumber += 1;
      return awaitableQuery(
        queryNumber === 1
          ? {
              data: null,
              error: { code: "23505", message: "Synthetic unique details" },
            }
          : { data: createdRow, error: null },
        calls,
      );
    },
  };

  assert.deepEqual(await createAdminTopicDraft(client, validInput), {
    created: false,
    topic: expectedTopic(),
  });
  assert.equal(calls.filter((call) => call.operation === "insert").length, 1);
  assert.deepEqual(
    calls.find((call) => call.operation === "eq"),
    { operation: "eq", column: "id", value: requestId },
  );
});

test("treats a reused request id or an unrelated slug collision as a conflict", async () => {
  for (const existing of [{ ...createdRow, title: "Et andet emne" }, null]) {
    let queryNumber = 0;
    const client = {
      from() {
        queryNumber += 1;
        return awaitableQuery(
          queryNumber === 1
            ? { data: null, error: { code: "23505" } }
            : { data: existing, error: null },
          [],
        );
      },
    };

    await assert.rejects(createAdminTopicDraft(client, validInput), (error) =>
      assertContentError(error, "topic_creation_conflict"),
    );
  }
});

test("normalizes creation failures and validates the inserted row", async () => {
  for (const [response, code] of [
    [
      {
        data: null,
        error: { code: "42501", message: "Synthetic permission details" },
      },
      "admin_access_denied",
    ],
    [
      {
        data: null,
        error: { code: "XX000", message: "Synthetic SQL details" },
      },
      "topic_creation_failed",
    ],
    [
      { data: { ...createdRow, is_published: true }, error: null },
      "invalid_topic_creation_result",
    ],
    [
      { data: { ...createdRow, created_by: null }, error: null },
      "invalid_topic_creation_result",
    ],
    [
      { data: { ...createdRow, id: "not-a-uuid" }, error: null },
      "invalid_topic_creation_result",
    ],
  ]) {
    const client = {
      from() {
        return awaitableQuery(response, []);
      },
    };

    await assert.rejects(createAdminTopicDraft(client, validInput), (error) => {
      assertContentError(error, code);
      assert.doesNotMatch(error.message, /synthetic|sql/i);
      return true;
    });
  }

  await assert.rejects(
    createAdminTopicDraft(
      {
        from() {
          throw new Error("Synthetic network details");
        },
      },
      validInput,
    ),
    (error) => {
      assertContentError(error, "topic_creation_failed");
      assert.doesNotMatch(error.message, /synthetic|network/i);
      return true;
    },
  );
});
