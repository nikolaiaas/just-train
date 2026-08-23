import assert from "node:assert/strict";
import test from "node:test";

import {
  attachWardrobeGridImages,
  createWardrobeGridImageInput,
  deriveWardrobeGridImageRequestId,
  parseWardrobeGridImageOutput,
} from "./wardrobe-grid.ts";

const jobId = "a9ed2205-4ab3-4a28-99d0-a8e61e4a2260";

function plannedItems() {
  return Array.from({ length: 16 }, (_, index) => ({
    ordinal: index + 1,
    name: `Fodboldting ${index + 1}`,
    description: "En syntetisk ting til fodboldlegen.",
    visualDescription: "A friendly blue football training object, centered.",
    category: "equipment",
    equipSlot: index % 2 === 0 ? "held" : "accessory",
    rarity: "common",
    points: 100,
    unlockRule: "",
    reason: "Passer til emnets bevægelsesleg.",
    imagePath: "",
    imageUrl: "",
  }));
}

function imageOutput() {
  return {
    sheetPath: `${jobId}/sheet.png`,
    items: Array.from({ length: 16 }, (_, index) => ({
      ordinal: index + 1,
      imagePath: `${jobId}/${String(index + 1).padStart(2, "0")}.png`,
    })),
  };
}

test("derives one stable operation-specific image request id", async () => {
  const first = await deriveWardrobeGridImageRequestId(jobId);
  const second = await deriveWardrobeGridImageRequestId(jobId.toUpperCase());

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.notEqual(first, jobId);
  await assert.rejects(() => deriveWardrobeGridImageRequestId("bad"));
});

test("passes the subject text and ordered visual manifest to the image job", () => {
  const input = createWardrobeGridImageInput(
    { title: "Fodbold", description: "Boldkontrol, leg og bevægelse." },
    plannedItems(),
  );

  assert.deepEqual(input.topic, {
    title: "Fodbold",
    description: "Boldkontrol, leg og bevægelse.",
  });
  assert.equal(input.items.length, 16);
  assert.equal(input.items[0].ordinal, 1);
  assert.equal(input.items[15].ordinal, 16);
  assert.equal(Object.hasOwn(input.items[0], "description"), false);
});

test("accepts only the exact row-major sheet and crop paths", () => {
  assert.deepEqual(
    parseWardrobeGridImageOutput(imageOutput(), jobId),
    imageOutput(),
  );

  const wrongOrder = imageOutput();
  wrongOrder.items[4].ordinal = 6;
  assert.equal(parseWardrobeGridImageOutput(wrongOrder, jobId), null);

  const foreignPath = imageOutput();
  foreignPath.items[0].imagePath = `${crypto.randomUUID()}/01.png`;
  assert.equal(parseWardrobeGridImageOutput(foreignPath, jobId), null);
});

test("attaches public URLs without changing the planned metadata order", () => {
  const attached = attachWardrobeGridImages(
    plannedItems(),
    imageOutput(),
    (path) =>
      `https://example.supabase.co/storage/v1/object/public/wardrobe-images/${path}`,
  );

  assert.equal(attached?.length, 16);
  assert.equal(attached?.[0].ordinal, 1);
  assert.equal(attached?.[0].imagePath, `${jobId}/01.png`);
  assert.match(attached?.[15].imageUrl ?? "", /16\.png$/);
});
