import assert from "node:assert/strict";
import test from "node:test";

import {
  WardrobeError,
  loadChildWardrobe,
  setChildWardrobeItemEquipped,
} from "../src/wardrobe.ts";

const childId = "30000000-0000-4000-8000-000000000001";
const otherChildId = "30000000-0000-4000-8000-000000000002";
const shoesId = "f1000000-0000-4000-8000-000000000001";
const helmetId = "f1000000-0000-4000-8000-000000000003";
const topicId = "10000000-0000-4000-8000-000000000001";

const shoesRow = Object.freeze({
  acquired_at: "2026-08-23T08:00:00.000Z",
  catalog_equip_slot: "feet",
  catalog_item_id: shoesId,
  category: "clothing",
  child_profile_id: childId,
  equip_slot: "feet",
  equipped_at: "2026-08-23T08:05:00.000Z",
  icon: "👟",
  is_equipped: true,
  name: "Lynsko",
  rarity: "rare",
  topic_id: topicId,
  wardrobe_item_id: shoesId,
});

const helmetRow = Object.freeze({
  acquired_at: "2026-08-23T08:01:00.000Z",
  catalog_equip_slot: "head",
  catalog_item_id: helmetId,
  category: "equipment",
  child_profile_id: childId,
  equip_slot: "head",
  equipped_at: null,
  icon: "🧢",
  is_equipped: false,
  name: "Superhjelm",
  rarity: "special",
  topic_id: topicId,
  wardrobe_item_id: helmetId,
});

function rpcClient(response, calls = []) {
  return {
    calls,
    async rpc(name, args) {
      calls.push({ operation: "rpc", name, args });
      return response;
    },
  };
}

function assertWardrobeError(error, code) {
  assert.ok(error instanceof WardrobeError);
  assert.equal(error.code, code);
  return true;
}

test("loads the RLS-filtered child wardrobe with exclusive slot state", async () => {
  const { calls, ...client } = rpcClient({
    data: [shoesRow, helmetRow],
    error: null,
  });

  const items = await loadChildWardrobe(client, {
    childProfileId: childId.toUpperCase(),
  });

  assert.deepEqual(items, [
    {
      acquiredAt: shoesRow.acquired_at,
      category: "clothing",
      childProfileId: childId,
      equipSlot: "feet",
      equippedAt: shoesRow.equipped_at,
      icon: "👟",
      isEquipped: true,
      name: "Lynsko",
      rarity: "rare",
      topicId,
      wardrobeItemId: shoesId,
    },
    {
      acquiredAt: helmetRow.acquired_at,
      category: "equipment",
      childProfileId: childId,
      equipSlot: "head",
      equippedAt: null,
      icon: "🧢",
      isEquipped: false,
      name: "Superhjelm",
      rarity: "special",
      topicId,
      wardrobeItemId: helmetId,
    },
  ]);
  assert.deepEqual(calls, [
    {
      operation: "rpc",
      name: "list_child_wardrobe",
      args: { p_child_profile_id: childId },
    },
  ]);
});

test("equips one complete pair of shoes through the atomic slot RPC", async () => {
  const { calls, ...client } = rpcClient({ data: [shoesRow], error: null });

  const result = await setChildWardrobeItemEquipped(client, {
    childProfileId: childId.toUpperCase(),
    equipped: true,
    wardrobeItemId: shoesId.toUpperCase(),
  });

  assert.equal(result.equipSlot, "feet");
  assert.equal(result.isEquipped, true);
  assert.deepEqual(calls, [
    {
      operation: "rpc",
      name: "set_child_wardrobe_item_equipped",
      args: {
        p_child_profile_id: childId,
        p_equipped: true,
        p_wardrobe_item_id: shoesId,
      },
    },
  ]);
});

test("rejects malformed wardrobe requests before accessing Supabase", async () => {
  const { calls, ...client } = rpcClient({ data: [], error: null });

  await assert.rejects(
    setChildWardrobeItemEquipped(client, {
      childProfileId: "not-a-uuid",
      equipped: true,
      wardrobeItemId: shoesId,
    }),
    (error) => assertWardrobeError(error, "invalid_child_profile_id"),
  );
  await assert.rejects(
    setChildWardrobeItemEquipped(client, {
      childProfileId: childId,
      equipped: true,
      wardrobeItemId: "not-a-uuid",
    }),
    (error) => assertWardrobeError(error, "invalid_wardrobe_item_id"),
  );
  await assert.rejects(
    setChildWardrobeItemEquipped(client, {
      childProfileId: childId,
      equipped: "yes",
      wardrobeItemId: shoesId,
    }),
    (error) => assertWardrobeError(error, "invalid_equipped_state"),
  );

  assert.deepEqual(calls, []);
});

test("rejects duplicate active items in one exclusive position", async () => {
  const duplicateShoesId = "f1000000-0000-4000-8000-000000000002";
  const { calls, ...client } = rpcClient({
    data: [
      shoesRow,
      {
        ...shoesRow,
        catalog_item_id: duplicateShoesId,
        wardrobe_item_id: duplicateShoesId,
      },
    ],
    error: null,
  });

  await assert.rejects(
    loadChildWardrobe(client, { childProfileId: childId }),
    (error) => assertWardrobeError(error, "invalid_child_wardrobe_result"),
  );
  assert.ok(calls.length > 0);
});

test("rejects rows outside the selected child and invalid mutation results", async () => {
  const loadClient = rpcClient({
    data: [{ ...helmetRow, child_profile_id: otherChildId }],
    error: null,
  });
  const mutationClient = rpcClient({
    data: [{ ...shoesRow, is_equipped: false, equipped_at: null }],
    error: null,
  });

  await assert.rejects(
    loadChildWardrobe(loadClient, { childProfileId: childId }),
    (error) => assertWardrobeError(error, "invalid_child_wardrobe_result"),
  );
  await assert.rejects(
    setChildWardrobeItemEquipped(mutationClient, {
      childProfileId: childId,
      equipped: true,
      wardrobeItemId: shoesId,
    }),
    (error) => assertWardrobeError(error, "invalid_child_wardrobe_result"),
  );
});

test("maps database and transport failures to stable wardrobe errors", async () => {
  const denied = rpcClient({ data: null, error: { code: "42501" } });
  const failedMutation = rpcClient({
    data: null,
    error: { code: "23505", message: "sensitive detail" },
  });
  const thrown = {
    async rpc() {
      throw new Error("transport detail");
    },
  };

  await assert.rejects(
    loadChildWardrobe(denied, { childProfileId: childId }),
    (error) => assertWardrobeError(error, "child_wardrobe_access_denied"),
  );
  await assert.rejects(
    setChildWardrobeItemEquipped(failedMutation, {
      childProfileId: childId,
      equipped: true,
      wardrobeItemId: shoesId,
    }),
    (error) => assertWardrobeError(error, "child_wardrobe_mutation_failed"),
  );
  await assert.rejects(
    setChildWardrobeItemEquipped(thrown, {
      childProfileId: childId,
      equipped: true,
      wardrobeItemId: shoesId,
    }),
    (error) => assertWardrobeError(error, "child_wardrobe_mutation_failed"),
  );
});

test("fails closed when catalog identity or equipment slot disagrees", async () => {
  const wrongCatalogIdentity = rpcClient({
    data: [{ ...shoesRow, catalog_item_id: helmetId }],
    error: null,
  });
  const wrongCatalogSlot = rpcClient({
    data: [{ ...shoesRow, catalog_equip_slot: "head" }],
    error: null,
  });

  await assert.rejects(
    loadChildWardrobe(wrongCatalogIdentity, { childProfileId: childId }),
    (error) => assertWardrobeError(error, "invalid_child_wardrobe_result"),
  );
  await assert.rejects(
    loadChildWardrobe(wrongCatalogSlot, { childProfileId: childId }),
    (error) => assertWardrobeError(error, "invalid_child_wardrobe_result"),
  );
});
