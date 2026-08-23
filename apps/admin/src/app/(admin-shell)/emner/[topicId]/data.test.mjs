import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminTopicDetailLoadError,
  loadAdminTopicDetail,
  normalizeAdminTopicDetailId,
  parseAdminTopicDetailRows,
} from "./data.ts";

const TOPIC_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_TOPIC_ID = "10000000-0000-4000-8000-000000000002";
const GOAL_ONE_ID = "20000000-0000-4000-8000-000000000001";
const GOAL_TWO_ID = "20000000-0000-4000-8000-000000000002";
const EXERCISE_ONE_ID = "30000000-0000-4000-8000-000000000001";
const EXERCISE_TWO_ID = "30000000-0000-4000-8000-000000000002";
const WARDROBE_ONE_ID = "40000000-0000-4000-8000-000000000001";
const WARDROBE_TWO_ID = "40000000-0000-4000-8000-000000000002";
const UPDATED_AT = "2026-08-22T09:00:00.000Z";
const PUBLISHED_AT = "2026-08-22T08:00:00.000Z";

const topicRow = Object.freeze({
  accent_color: "#53C987",
  content_version: 2,
  description: "Et syntetisk emne om sikre balanceøvelser.",
  icon: "⚖️",
  id: TOPIC_ID,
  is_published: true,
  published_at: PUBLISHED_AT,
  slug: "balance",
  title: "Balance",
  updated_at: UPDATED_AT,
});

const goalOneRow = Object.freeze({
  content_version: 1,
  difficulty: "beginner",
  equipment: ["Blød måtte"],
  estimated_minutes: 8,
  id: GOAL_ONE_ID,
  is_published: true,
  published_at: PUBLISHED_AT,
  sort_order: 1,
  summary: "Find ro og stabilitet.",
  title: "Stå sikkert",
  topic_id: TOPIC_ID,
  updated_at: UPDATED_AT,
});

const goalTwoRow = Object.freeze({
  ...goalOneRow,
  id: GOAL_TWO_ID,
  is_published: false,
  published_at: null,
  sort_order: 0,
  summary: "Prøv små bevægelser.",
  title: "Bevæg dig roligt",
});

const exerciseOneRow = Object.freeze({
  content_version: 1,
  equipment: [],
  estimated_minutes: 3,
  goal_id: GOAL_ONE_ID,
  id: EXERCISE_ONE_ID,
  instructions: "Stå på et ben ved siden af en voksen.",
  is_published: true,
  measurement: "duration",
  published_at: PUBLISHED_AT,
  safety_notes: "Brug et skridsikkert underlag.",
  sort_order: 1,
  target_value: 20,
  title: "Flamingoen",
  updated_at: UPDATED_AT,
});

const exerciseTwoRow = Object.freeze({
  ...exerciseOneRow,
  goal_id: GOAL_TWO_ID,
  id: EXERCISE_TWO_ID,
  instructions: "Gå langsomt langs en streg på gulvet.",
  is_published: false,
  measurement: "completion",
  published_at: null,
  sort_order: 0,
  target_value: null,
  title: "Gå på stregen",
});

const wardrobeOneRow = Object.freeze({
  category: "effect",
  content_version: 1,
  editorial_status: "approved",
  equip_slot: "accessory",
  has_pending_revision: false,
  icon: "✨",
  id: WARDROBE_ONE_ID,
  is_published: true,
  name: "Stjernestøv",
  points: 40,
  published_at: PUBLISHED_AT,
  rarity: "special",
  sort_order: 1,
  topic_id: TOPIC_ID,
  unlock_rule: null,
  updated_at: UPDATED_AT,
});

const wardrobeTwoRow = Object.freeze({
  ...wardrobeOneRow,
  category: "clothing",
  icon: "🧢",
  id: WARDROBE_TWO_ID,
  editorial_status: "draft",
  is_published: false,
  name: "Balancehue",
  points: null,
  published_at: null,
  rarity: "common",
  sort_order: 0,
  unlock_rule: "Gennemfør to deløvelser",
});

function validRows(overrides = {}) {
  return {
    topic: topicRow,
    goals: [goalOneRow, goalTwoRow],
    exercises: [exerciseOneRow, exerciseTwoRow],
    wardrobeItems: [wardrobeOneRow, wardrobeTwoRow],
    ...overrides,
  };
}

test("accepts only one non-nil topic UUID", () => {
  assert.equal(normalizeAdminTopicDetailId(TOPIC_ID.toUpperCase()), TOPIC_ID);
  assert.equal(normalizeAdminTopicDetailId("not-a-topic"), null);
  assert.equal(
    normalizeAdminTopicDetailId("00000000-0000-0000-0000-000000000000"),
    null,
  );
  assert.equal(normalizeAdminTopicDetailId([TOPIC_ID]), null);
});

test("validates, groups and orders all topic-owned content", () => {
  const detail = parseAdminTopicDetailRows(validRows());

  assert.ok(detail);
  assert.equal(detail.id, TOPIC_ID);
  assert.equal(detail.status, "published");
  assert.deepEqual(
    detail.goals.map((goal) => goal.id),
    [GOAL_TWO_ID, GOAL_ONE_ID],
  );
  assert.deepEqual(
    detail.goals.map((goal) => goal.exercises.map((exercise) => exercise.id)),
    [[EXERCISE_TWO_ID], [EXERCISE_ONE_ID]],
  );
  assert.deepEqual(
    detail.wardrobeItems.map((item) => [
      item.id,
      item.status,
      item.editorialStatus,
      item.equipSlot,
    ]),
    [
      [WARDROBE_TWO_ID, "draft", "draft", "accessory"],
      [WARDROBE_ONE_ID, "published", "approved", "accessory"],
    ],
  );
});

test("validates wardrobe positions and keeps old deployment rows as accessories", () => {
  const oldRow = { ...wardrobeTwoRow };
  delete oldRow.equip_slot;
  const oldDetail = parseAdminTopicDetailRows(
    validRows({ wardrobeItems: [oldRow] }),
  );

  assert.ok(oldDetail);
  assert.equal(oldDetail.wardrobeItems[0]?.equipSlot, "accessory");
  assert.equal(
    parseAdminTopicDetailRows(
      validRows({
        wardrobeItems: [{ ...wardrobeOneRow, equip_slot: "left-shoe" }],
      }),
    ),
    null,
  );
});

test("keeps a published wardrobe item's staged revision editable", () => {
  const stagedAt = "2026-08-22T09:00:01.000Z";
  const detail = parseAdminTopicDetailRows(
    validRows({
      wardrobeItems: [
        {
          ...wardrobeOneRow,
          editorial_status: "draft",
          equip_slot: "feet",
          has_pending_revision: true,
          icon: "👟",
          name: "Stjernesko",
          updated_at: stagedAt,
        },
      ],
    }),
  );

  assert.ok(detail);
  assert.deepEqual(detail.wardrobeItems[0], {
    category: "effect",
    contentVersion: 1,
    editorialStatus: "draft",
    equipSlot: "feet",
    hasPendingRevision: true,
    icon: "👟",
    id: WARDROBE_ONE_ID,
    name: "Stjernesko",
    points: 40,
    publishedAt: PUBLISHED_AT,
    rarity: "special",
    sortOrder: 1,
    status: "published",
    topicId: TOPIC_ID,
    unlockRule: null,
    updatedAt: stagedAt,
  });
  assert.equal(detail.updatedAt, stagedAt);
});

test("keeps rejected wardrobe proposals out of the usable rewards", () => {
  const detail = parseAdminTopicDetailRows(
    validRows({
      wardrobeItems: [{ ...wardrobeTwoRow, editorial_status: "rejected" }],
    }),
  );

  assert.ok(detail);
  assert.deepEqual(detail.wardrobeItems, []);
});

test("uses the newest hidden or visible child revision for lifecycle actions", () => {
  const newestRevision = "2026-08-22T09:00:00.000900Z";
  const detail = parseAdminTopicDetailRows(
    validRows({
      topic: { ...topicRow, updated_at: "2026-08-22T09:00:00.000100Z" },
      wardrobeItems: [
        {
          ...wardrobeTwoRow,
          editorial_status: "rejected",
          updated_at: newestRevision,
        },
      ],
    }),
  );

  assert.ok(detail);
  assert.equal(detail.updatedAt, newestRevision);
  assert.deepEqual(detail.wardrobeItems, []);
});

test("rejects duplicate and cross-topic child rows", () => {
  assert.equal(
    parseAdminTopicDetailRows(
      validRows({ goals: [goalOneRow, { ...goalOneRow }] }),
    ),
    null,
  );
  assert.equal(
    parseAdminTopicDetailRows(
      validRows({ goals: [{ ...goalOneRow, topic_id: OTHER_TOPIC_ID }] }),
    ),
    null,
  );
  assert.equal(
    parseAdminTopicDetailRows(
      validRows({
        exercises: [
          {
            ...exerciseOneRow,
            goal_id: "20000000-0000-4000-8000-000000000009",
          },
        ],
      }),
    ),
    null,
  );
  assert.equal(
    parseAdminTopicDetailRows(
      validRows({
        wardrobeItems: [{ ...wardrobeOneRow, topic_id: OTHER_TOPIC_ID }],
      }),
    ),
    null,
  );
});

test("rejects inconsistent publication and reward states", () => {
  assert.equal(
    parseAdminTopicDetailRows(
      validRows({ topic: { ...topicRow, published_at: null } }),
    ),
    null,
  );
  assert.equal(
    parseAdminTopicDetailRows(
      validRows({
        wardrobeItems: [
          { ...wardrobeOneRow, points: 20, unlock_rule: "Dobbelt regel" },
        ],
      }),
    ),
    null,
  );
  assert.equal(
    parseAdminTopicDetailRows(
      validRows({
        wardrobeItems: [{ ...wardrobeOneRow, editorial_status: "rejected" }],
      }),
    ),
    null,
  );
});

function clientForResponses(responses) {
  const calls = [];

  return {
    calls,
    from(table) {
      const response = responses[table];
      const query = {
        eq(column, value) {
          calls.push({ column, operation: "eq", table, value });
          return query;
        },
        in(column, value) {
          calls.push({ column, operation: "in", table, value });
          return query;
        },
        maybeSingle: async () => response,
        select(columns) {
          calls.push({ columns, operation: "select", table });
          return query;
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve(response).then(onFulfilled, onRejected);
        },
      };

      return query;
    },
    rpc(name, args) {
      calls.push({ args, name, operation: "rpc" });
      return Promise.resolve(responses[name] ?? { data: [], error: null });
    },
  };
}

test("loads one topic through granted columns and groups its children", async () => {
  const { calls, ...client } = clientForResponses({
    topics: { data: topicRow, error: null },
    goals: { data: [goalOneRow, goalTwoRow], error: null },
    exercises: { data: [exerciseOneRow, exerciseTwoRow], error: null },
    wardrobe_items: {
      data: [wardrobeOneRow],
      error: null,
    },
    list_admin_wardrobe_item_drafts: {
      data: [wardrobeOneRow, wardrobeTwoRow],
      error: null,
    },
  });

  const detail = await loadAdminTopicDetail(client, TOPIC_ID.toUpperCase());

  assert.ok(detail);
  assert.equal(detail.id, TOPIC_ID);
  assert.deepEqual(
    detail.wardrobeItems.map((item) => item.id),
    [WARDROBE_TWO_ID, WARDROBE_ONE_ID],
  );
  assert.deepEqual(
    calls.find((call) => call.operation === "in" && call.table === "exercises")
      ?.value,
    [GOAL_ONE_ID, GOAL_TWO_ID],
  );
  const wardrobeSelect = calls.find(
    (call) => call.operation === "select" && call.table === "wardrobe_items",
  );
  assert.ok(wardrobeSelect);
  assert.doesNotMatch(wardrobeSelect.columns, /editorial_note|created_by/);
});

test("keeps topic details available while wardrobe storage is being deployed", async () => {
  const { calls, ...client } = clientForResponses({
    topics: { data: topicRow, error: null },
    goals: { data: [goalOneRow], error: null },
    exercises: { data: [exerciseOneRow], error: null },
    wardrobe_items: {
      data: null,
      error: { code: "PGRST205", message: "table not in schema cache" },
    },
    list_admin_wardrobe_item_drafts: {
      data: null,
      error: { code: "PGRST202", message: "function not in schema cache" },
    },
  });

  const detail = await loadAdminTopicDetail(client, TOPIC_ID);

  assert.ok(detail);
  assert.deepEqual(detail.wardrobeItems, []);
  assert.ok(calls.some((call) => call.table === "wardrobe_items"));
});

test("rejects unexpected wardrobe query failures", async () => {
  const client = clientForResponses({
    topics: { data: topicRow, error: null },
    goals: { data: [], error: null },
    wardrobe_items: {
      data: null,
      error: { code: "42501", message: "permission denied" },
    },
    list_admin_wardrobe_item_drafts: { data: [], error: null },
  });

  await assert.rejects(
    loadAdminTopicDetail(client, TOPIC_ID),
    AdminTopicDetailLoadError,
  );
});

test("returns not found without child queries and rejects invalid ids early", async () => {
  const missing = clientForResponses({
    topics: { data: null, error: null },
  });
  assert.equal(await loadAdminTopicDetail(missing, TOPIC_ID), null);
  assert.deepEqual(
    missing.calls.map((call) => call.table),
    ["topics", "topics"],
  );

  const unused = clientForResponses({});
  assert.equal(await loadAdminTopicDetail(unused, "not-a-topic"), null);
  assert.deepEqual(unused.calls, []);
});

test("maps database and malformed-row failures to a sanitized loader error", async () => {
  const failed = clientForResponses({
    topics: { data: null, error: { message: "private database detail" } },
  });

  await assert.rejects(
    loadAdminTopicDetail(failed, TOPIC_ID),
    (error) =>
      error instanceof AdminTopicDetailLoadError &&
      error.message === "Emnedetaljerne kunne ikke hentes.",
  );

  const malformed = clientForResponses({
    topics: { data: { ...topicRow, title: null }, error: null },
    goals: { data: [], error: null },
    wardrobe_items: { data: [], error: null },
    list_admin_wardrobe_item_drafts: { data: [], error: null },
  });

  await assert.rejects(
    loadAdminTopicDetail(malformed, TOPIC_ID),
    AdminTopicDetailLoadError,
  );
});
