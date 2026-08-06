import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  classifyPreviewSize,
  isAcceptedPreviewSize,
  PREVIEW_SIZE_CLASSES,
  PREVIEW_SIZES,
  PREVIEW_SPEC_URL,
  PREVIEW_VERIFIED_ON,
} from "./previewdimensions.ts";

test("app-preview sizes match the checked-in Apple snapshot", async () => {
  const raw = await readFile(
    new URL("../fixtures/preview-dimensions-snapshot.json", import.meta.url),
    "utf8",
  );
  assert.deepEqual(JSON.parse(raw), {
    verifiedOn: PREVIEW_VERIFIED_ON,
    source: PREVIEW_SPEC_URL,
    sizes: PREVIEW_SIZES,
    classes: PREVIEW_SIZE_CLASSES,
  });
});

test("app-preview size matching is exact", () => {
  assert.equal(isAcceptedPreviewSize(886, 1920), true);
  assert.equal(isAcceptedPreviewSize(1920, 886), true);
  assert.equal(isAcceptedPreviewSize(887, 1920), false);
});

test("every accepted size belongs to exactly one device-size class", () => {
  for (const size of PREVIEW_SIZES) {
    const matches = PREVIEW_SIZE_CLASSES.filter((group) =>
      [group.portrait, group.landscape].some((s) => s && s.width === size.width && s.height === size.height),
    );
    assert.equal(matches.length, 1, `${size.width}x${size.height} matched ${matches.length} classes`);
  }
});

test("classifyPreviewSize pairs portrait and landscape into one class", () => {
  assert.equal(classifyPreviewSize(886, 1920)?.id, classifyPreviewSize(1920, 886)?.id);
  assert.equal(classifyPreviewSize(1200, 1600)?.id, classifyPreviewSize(1600, 1200)?.id);
  assert.notEqual(classifyPreviewSize(886, 1920)?.id, classifyPreviewSize(1200, 1600)?.id);
  assert.equal(classifyPreviewSize(640, 480), null);
});

test("the landscape-only Vision Pro class carries no portrait size", () => {
  const vision = PREVIEW_SIZE_CLASSES.find((group) => group.id === "vision-3840x2160");
  assert.equal(vision?.portrait, undefined);
  assert.deepEqual(vision?.landscape, { width: 3840, height: 2160 });
});
