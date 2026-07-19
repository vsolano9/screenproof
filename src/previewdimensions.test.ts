import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  isAcceptedPreviewSize,
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
  });
});

test("app-preview size matching is exact", () => {
  assert.equal(isAcceptedPreviewSize(886, 1920), true);
  assert.equal(isAcceptedPreviewSize(1920, 886), true);
  assert.equal(isAcceptedPreviewSize(887, 1920), false);
});
