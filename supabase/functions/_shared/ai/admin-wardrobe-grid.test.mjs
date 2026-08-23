import assert from "node:assert/strict";
import test from "node:test";

import { decode, encode } from "fast-png";

import {
  buildWardrobeGridImagePrompt,
  cropWardrobeGridPng,
  parseWardrobeGridImageInput,
  WardrobeGridImageError,
} from "./admin-wardrobe-grid.ts";

const codec = { decode, encode };

function imageItem(ordinal, overrides = {}) {
  return {
    ordinal,
    name: `Fodboldting ${ordinal}`,
    visualDescription: `A blue football wardrobe item, variant ${ordinal}.`,
    equipSlot: ordinal % 2 === 0 ? "feet" : "accessory",
    ...overrides,
  };
}

function imageInput(overrides = {}) {
  return {
    topic: {
      title: "Fodboldfest",
      description: "Leg med bold, finter og små mål i trygge omgivelser.",
    },
    items: Array.from({ length: 16 }, (_, index) => imageItem(index + 1)),
    ...overrides,
  };
}

function assertGridError(error, attemptCode) {
  assert.ok(error instanceof WardrobeGridImageError);
  assert.equal(error.attemptCode, attemptCode);
  return true;
}

test("builds a bounded prompt with literal topic context and ordered manifest", () => {
  const inputData = imageInput();
  const prompt = buildWardrobeGridImagePrompt({
    inputData,
    promptTemplate:
      "Create one friendly stylized 3D wardrobe sheet as a 4 by 4 grid.",
  });

  assert.ok(prompt.startsWith("Create one friendly stylized 3D wardrobe"));
  assert.match(prompt, /TOPIC_CONTEXT_JSON:/);
  assert.ok(prompt.includes(JSON.stringify(inputData.topic)));
  assert.ok(prompt.includes(JSON.stringify(inputData.items)));
  assert.ok(prompt.indexOf('"ordinal":1') < prompt.indexOf('"ordinal":16'));
  assert.match(prompt, /ordinal 1 is top-left/i);
});

test("accepts only sixteen exact row-major image manifest items", () => {
  assert.deepEqual(parseWardrobeGridImageInput(imageInput()), imageInput());

  for (const inputData of [
    imageInput({ items: imageInput().items.slice(0, 15) }),
    imageInput({
      items: imageInput().items.map((item, index) =>
        index === 4 ? { ...item, ordinal: 4 } : item,
      ),
    }),
    imageInput({
      items: imageInput().items.map((item, index) =>
        index === 0 ? { ...item, icon: "⚽" } : item,
      ),
    }),
  ]) {
    assert.throws(
      () => parseWardrobeGridImageInput(inputData),
      (error) => assertGridError(error, "invalid_wardrobe_grid_input"),
    );
  }
});

test("crops a square PNG into sixteen equal images in row-major order", () => {
  const width = 8;
  const height = 8;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileRow = Math.floor(y / 2);
      const tileColumn = Math.floor(x / 2);
      const ordinal = tileRow * 4 + tileColumn + 1;
      const offset = (y * width + x) * 4;
      data.set([ordinal, tileRow, tileColumn, 255], offset);
    }
  }

  const sheet = encode({ channels: 4, data, depth: 8, height, width });
  const crops = cropWardrobeGridPng(sheet, codec);

  assert.equal(crops.length, 16);

  for (const [index, crop] of crops.entries()) {
    const decoded = decode(crop.bytes, { checkCrc: true });
    const expectedOrdinal = index + 1;
    const expectedRow = Math.floor(index / 4);
    const expectedColumn = index % 4;

    assert.equal(crop.ordinal, expectedOrdinal);
    assert.equal(crop.width, 2);
    assert.equal(crop.height, 2);
    assert.equal(decoded.width, 2);
    assert.equal(decoded.height, 2);
    assert.deepEqual(Array.from(decoded.data.subarray(0, 4)), [
      expectedOrdinal,
      expectedRow,
      expectedColumn,
      255,
    ]);
  }
});

test("rejects non-square and non-divisible provider PNG sheets", () => {
  for (const [width, height] of [
    [8, 4],
    [6, 6],
  ]) {
    const sheet = encode({
      channels: 4,
      data: new Uint8Array(width * height * 4),
      depth: 8,
      height,
      width,
    });

    assert.throws(
      () => cropWardrobeGridPng(sheet, codec),
      (error) => assertGridError(error, "invalid_wardrobe_grid_dimensions"),
    );
  }
});
