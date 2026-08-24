import assert from "node:assert/strict";
import test from "node:test";

import {
  findChildTopic,
  getAutomaticWardrobeRenderKey,
  getCurrentTopicPortraitImage,
  getTopicPhotoErrorMessage,
  getTopicPortraitErrorMessage,
  isCurrentTopicPortraitImageFailure,
} from "../src/topics/core.ts";
import { ChildTopicPortraitError } from "@bare-traen/api-client";

const football = {
  accentColor: "#008378",
  description: "Leg med bolden.",
  icon: "⚽",
  id: "b1000000-0000-4000-8000-000000000001",
  photo: null,
  slug: "fodbold",
  sortOrder: 0,
  title: "Fodbold",
};

const currentBase = {
  expiresInSeconds: 60,
  jobId: "b1000000-0000-4000-8000-000000000010",
  mediaAssetId: "b1000000-0000-4000-8000-000000000011",
  mimeType: "image/png",
  signedUrl: "https://example.test/private-base.png",
};

const staleWardrobePortrait = {
  base: currentBase,
  baseSourceMediaAssetId: "b1000000-0000-4000-8000-000000000012",
  childProfileId: "b1000000-0000-4000-8000-000000000013",
  currentLook: {
    ...currentBase,
    jobId: "b1000000-0000-4000-8000-000000000014",
    mediaAssetId: "b1000000-0000-4000-8000-000000000015",
    signedUrl: "https://example.test/old-derived-look.png",
  },
  currentReferenceMediaAssetId: "b1000000-0000-4000-8000-000000000012",
  displayEquipmentFingerprint: "a".repeat(64),
  displayKind: "wardrobe",
  displayedWardrobeItemIds: ["b1000000-0000-4000-8000-000000000016"],
  familyId: "b1000000-0000-4000-8000-000000000017",
  hasLiveEquipmentRenderAttempt: false,
  isBaseStale: false,
  isLookStale: true,
  liveEquipmentFingerprint: "b".repeat(64),
  liveWardrobeItemIds: ["b1000000-0000-4000-8000-000000000018"],
  pendingJob: null,
  topicId: football.id,
  updatedAt: "2026-08-24T10:00:00.000Z",
};

test("finds only an exact published topic id from the selected child list", () => {
  assert.equal(findChildTopic([football], football.id), football);
  assert.equal(findChildTopic([football], "not-a-topic"), null);
  assert.equal(
    findChildTopic([football], "b1000000-0000-4000-8000-000000000002"),
    null,
  );
});

test("maps topic-photo failures to short child-safe messages", () => {
  assert.match(
    getTopicPhotoErrorMessage({ code: "session_changed" }),
    /Profilen skiftede/,
  );
  assert.match(
    getTopicPhotoErrorMessage({ code: "invalid_image_bytes" }),
    /andet billede/,
  );
  assert.match(
    getTopicPhotoErrorMessage({ code: "upload_limit_reached" }),
    /spørg en voksen/,
  );
  assert.doesNotMatch(
    getTopicPhotoErrorMessage({ code: "upload_limit_reached" }),
    /Prøv igen/,
  );
  assert.doesNotMatch(getTopicPhotoErrorMessage(new Error("secret")), /secret/);
});

test("maps skill portrait errors without leaking provider details", () => {
  assert.match(
    getTopicPortraitErrorMessage(
      new ChildTopicPortraitError("daily_limit_reached"),
    ),
    /i morgen/,
  );
  assert.match(
    getTopicPortraitErrorMessage(
      new ChildTopicPortraitError("portrait_unavailable"),
    ),
    /Vælg og gem/,
  );
  assert.doesNotMatch(
    getTopicPortraitErrorMessage(new Error("provider secret")),
    /provider secret/,
  );
});

test("plans one wardrobe refresh while preserving the last successful look", () => {
  assert.equal(
    getAutomaticWardrobeRenderKey(staleWardrobePortrait),
    `${currentBase.mediaAssetId}:${"b".repeat(64)}`,
  );
  assert.equal(
    getCurrentTopicPortraitImage(staleWardrobePortrait),
    staleWardrobePortrait.currentLook,
  );

  assert.equal(
    getAutomaticWardrobeRenderKey({
      ...staleWardrobePortrait,
      hasLiveEquipmentRenderAttempt: true,
    }),
    null,
  );
  assert.equal(
    getAutomaticWardrobeRenderKey({
      ...staleWardrobePortrait,
      pendingJob: {
        id: "b1000000-0000-4000-8000-000000000019",
        publicErrorCode: null,
        status: "processing",
      },
    }),
    null,
  );
  assert.equal(
    getAutomaticWardrobeRenderKey({
      ...staleWardrobePortrait,
      liveWardrobeItemIds: [],
    }),
    null,
  );
  assert.equal(
    getCurrentTopicPortraitImage({
      ...staleWardrobePortrait,
      currentLook: null,
    }),
    currentBase,
  );
});

test("keeps topic image failures scoped to one expiring signed URL", () => {
  const expiredUrl = "https://example.test/topic-look.png?token=old";
  const renewedUrl = "https://example.test/topic-look.png?token=new";

  assert.equal(
    isCurrentTopicPortraitImageFailure(expiredUrl, expiredUrl),
    true,
  );
  assert.equal(
    isCurrentTopicPortraitImageFailure(expiredUrl, renewedUrl),
    false,
  );
  assert.equal(isCurrentTopicPortraitImageFailure(null, renewedUrl), false);
});
