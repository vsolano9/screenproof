import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  applyDimensionOverrides,
  classify,
  DEFAULT_CLASSES,
  UPCOMING_CLASSES,
  nearestValidSize,
  VERIFIED_ON,
} from "./dimensions.ts";

test("verification date is recorded", () => {
  assert.equal(VERIFIED_ON, "2026-09-12");
});

test("classifies key sizes to their device classes", () => {
  const cases: [number, number, string][] = [
    [1260, 2736, "iphone-6.9"],
    [1320, 2868, "iphone-6.9"],
    [2868, 1320, "iphone-6.9"],
    [1284, 2778, "iphone-6.5"],
    [1242, 2688, "iphone-6.5"],
    [1179, 2556, "iphone-6.3"],
    [1206, 2622, "iphone-6.3"],
    [1170, 2532, "iphone-6.1"],
    [1080, 2340, "iphone-6.1"],
    [1242, 2208, "iphone-5.5"],
    [750, 1334, "iphone-4.7"],
    [640, 1136, "iphone-4.0"],
    [1136, 600, "iphone-4.0"],
    [640, 960, "iphone-3.5"],
    [2064, 2752, "ipad-13"],
    [1488, 2266, "ipad-11"],
    [1668, 2224, "ipad-10.5"],
    [1536, 2048, "ipad-9.7"],
    [1024, 768, "ipad-9.7"],
    [2880, 1800, "mac"],
    [1920, 1080, "appletv"],
    [416, 496, "watch-s10"],
    [312, 390, "watch-s3"],
  ];
  for (const [width, height, expected] of cases) {
    const result = classify(width, height, "en-US/01.png", DEFAULT_CLASSES);
    assert.equal(result?.id, expected, `${width}x${height} should be ${expected}, got ${result?.id}`);
  }
});

test("published iPhone Duo sizes are classified separately from uploadable sizes", () => {
  const cases: [number, number, string][] = [
    [1398, 2034, "iphone-duo-outer"],
    [2034, 1398, "iphone-duo-outer"],
    [2007, 2853, "iphone-duo-inner"],
    [2853, 2007, "iphone-duo-inner"],
  ];
  for (const [width, height, expected] of cases) {
    assert.equal(classify(width, height, "en-US/01.png", DEFAULT_CLASSES), null);
    assert.equal(classify(width, height, "en-US/01.png", UPCOMING_CLASSES)?.id, expected);
  }
});

test("Apple Watch labels name the current models for each accepted size", () => {
  const labels = new Map(DEFAULT_CLASSES.filter(({ platform }) => platform === "watch").map(({ id, label }) => [id, label]));
  assert.equal(labels.get("watch-ultra3"), "Apple Watch Ultra 4/Ultra 3");
  assert.equal(labels.get("watch-s10"), "Apple Watch Series 12/11/10");
  assert.equal(labels.get("watch-s4"), "Apple Watch Series 6/5/4/SE 3/SE 2/SE");
  assert.equal(labels.get("watch-s3"), "Apple Watch Series 3/2/1");
});

test("every table size classifies back to its class (ambiguous classes fall to their default partner)", () => {
  for (const deviceClass of DEFAULT_CLASSES) {
    const expected =
      deviceClass.id === "ipad-12.9" ? "ipad-13" : deviceClass.id === "visionpro" ? "appletv" : deviceClass.id;
    for (const size of [...deviceClass.portrait, ...deviceClass.landscape]) {
      const result = classify(size.width, size.height, "en-US/01.png", DEFAULT_CLASSES);
      assert.equal(result?.id, expected, `${size.width}x${size.height} from ${deviceClass.id}`);
    }
  }
});

test("iPad 12.9 2nd gen wins only via fastlane's exact path predicates", () => {
  assert.equal(classify(2048, 2732, "en-US/APP_IPAD_PRO_129_01.png", DEFAULT_CLASSES)?.id, "ipad-12.9");
  assert.equal(
    classify(2048, 2732, "en-US/iPad Pro (12.9-inch) (2nd generation) 01.png", DEFAULT_CLASSES)?.id,
    "ipad-12.9",
  );
  for (const nearMiss of [
    "en-US/IPAD_PRO_129_01.png",
    "en-US/iPad Pro (12.9-inch) (2nd) 01.png",
    "en-US/IPAD_PRO_3GEN_129_01.png",
  ]) {
    assert.equal(classify(2048, 2732, nearMiss, DEFAULT_CLASSES)?.id, "ipad-13", nearMiss);
  }
  assert.equal(classify(2732, 2048, "en-US/01.png", DEFAULT_CLASSES)?.id, "ipad-13");
});

test("Vision Pro wins over Apple TV only when the path names vision", () => {
  assert.equal(classify(3840, 2160, "en-US/vision-01.png", DEFAULT_CLASSES)?.id, "visionpro");
  assert.equal(classify(3840, 2160, "en-US/tv-01.png", DEFAULT_CLASSES)?.id, "appletv");
});

test("unknown sizes return null", () => {
  assert.equal(classify(1080, 2341, "en-US/01.png", DEFAULT_CLASSES), null);
  assert.equal(classify(500, 500, "en-US/01.png", DEFAULT_CLASSES), null);
});

test("nearestValidSize prefers a same-aspect candidate", () => {
  const nearest = nearestValidSize(1080, 2341, DEFAULT_CLASSES);
  assert.ok(nearest);
  assert.deepEqual(nearest.size, { width: 1080, height: 2340 });
  assert.equal(nearest.classId, "iphone-6.1");
  assert.equal(nearest.orientation, "portrait");
});

test("nearestValidSize works for landscape inputs", () => {
  const nearest = nearestValidSize(2737, 1260, DEFAULT_CLASSES);
  assert.ok(nearest);
  assert.deepEqual(nearest.size, { width: 2736, height: 1260 });
  assert.equal(nearest.classId, "iphone-6.9");
  assert.equal(nearest.orientation, "landscape");
});

test("nearestValidSize never suggests a stretch when a same-aspect size exists", () => {
  const nearest = nearestValidSize(1242, 2690, DEFAULT_CLASSES);
  assert.ok(nearest);
  assert.deepEqual(nearest.size, { width: 1242, height: 2688 });
  assert.equal(nearest.classId, "iphone-6.5");
});

test("dimension overrides replace only the provided orientation of a known class", () => {
  const classes = applyDimensionOverrides(DEFAULT_CLASSES, {
    "iphone-6.9": { portrait: [[1000, 2000]] },
  });
  assert.equal(classify(1000, 2000, "en-US/01.png", classes)?.id, "iphone-6.9");
  assert.equal(classify(1260, 2736, "en-US/01.png", classes), null);
  // Landscape untouched.
  assert.equal(classify(2736, 1260, "en-US/01.png", classes)?.id, "iphone-6.9");
  // DEFAULT_CLASSES itself is not mutated.
  assert.equal(classify(1260, 2736, "en-US/01.png", DEFAULT_CLASSES)?.id, "iphone-6.9");
});

test("dimension overrides append unknown ids as custom classes", () => {
  const classes = applyDimensionOverrides(DEFAULT_CLASSES, {
    "my-kiosk": { portrait: [[1000, 3000]] },
  });
  const result = classify(1000, 3000, "en-US/01.png", classes);
  assert.equal(result?.id, "my-kiosk");
  assert.equal(result?.platform, "custom");
  assert.deepEqual(result?.landscape, []);
});

test("no size maps to more than one class except the two documented ambiguities", () => {
  const bySize = new Map<string, string[]>();
  for (const deviceClass of DEFAULT_CLASSES) {
    for (const size of [...deviceClass.portrait, ...deviceClass.landscape]) {
      const key = `${size.width}x${size.height}`;
      bySize.set(key, [...(bySize.get(key) ?? []), deviceClass.id]);
    }
  }
  const allowed = new Set(["ipad-12.9|ipad-13", "appletv|visionpro"]);
  for (const [key, ids] of bySize) {
    if (ids.length === 1) continue;
    assert.equal(ids.length, 2, `${key} maps to ${ids.join(", ")}`);
    assert.ok(allowed.has([...ids].sort().join("|")), `${key}: ${ids.join(", ")}`);
  }
});

test("shipped table matches the checked-in snapshot", async () => {
  const raw = await readFile(new URL("../fixtures/dimensions-snapshot.json", import.meta.url), "utf8");
  assert.deepEqual(JSON.parse(raw), JSON.parse(JSON.stringify(DEFAULT_CLASSES)));
});

test("upcoming table matches the checked-in snapshot", async () => {
  const raw = await readFile(new URL("../fixtures/upcoming-dimensions-snapshot.json", import.meta.url), "utf8");
  assert.deepEqual(JSON.parse(raw), JSON.parse(JSON.stringify(UPCOMING_CLASSES)));
});
