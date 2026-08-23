/**
 * Apple's App Store screenshot device classes: the accepted exact pixel sizes
 * per device, and the logic to classify an image into a class.
 *
 * Sources (both fetched and cross-checked on 2026-08-23):
 * - `apple`: App Store Connect screenshot specifications reference page.
 * - `deliver`: fastlane deliver's `app_screenshot.rb` resolution mapping,
 *   which is what actually gates a `deliver` upload.
 *
 * The shipped table is the union of both sources. It is pinned by a snapshot
 * test (`fixtures/dimensions-snapshot.json`) and extendable per project via
 * `config.dimensions` without waiting for a release, because Apple adds new
 * device sizes with new hardware.
 */

import type { DeviceClass, DimensionOverrides, Orientation, Size } from "./types.ts";

export const VERIFIED_ON = "2026-08-23";

const SOURCES = ["apple", "deliver"];

function sizes(pairs: [number, number][]): Size[] {
  return pairs.map(([width, height]) => ({ width, height }));
}

function device(
  id: string,
  label: string,
  platform: DeviceClass["platform"],
  portrait: [number, number][],
  landscape: [number, number][],
): DeviceClass {
  return {
    id,
    label,
    platform,
    portrait: sizes(portrait),
    landscape: sizes(landscape),
    verifiedOn: VERIFIED_ON,
    sources: [...SOURCES],
  };
}

export const DEFAULT_CLASSES: readonly DeviceClass[] = [
  device("iphone-6.9", "iPhone 6.9-inch", "iphone",
    [[1260, 2736], [1290, 2796], [1320, 2868]],
    [[2736, 1260], [2796, 1290], [2868, 1320]]),
  device("iphone-6.5", "iPhone 6.5-inch", "iphone",
    [[1284, 2778], [1242, 2688]],
    [[2778, 1284], [2688, 1242]]),
  device("iphone-6.3", "iPhone 6.3-inch", "iphone",
    [[1179, 2556], [1206, 2622]],
    [[2556, 1179], [2622, 1206]]),
  device("iphone-6.1", "iPhone 6.1-inch", "iphone",
    [[1170, 2532], [1125, 2436], [1080, 2340]],
    [[2532, 1170], [2436, 1125], [2340, 1080]]),
  device("iphone-5.5", "iPhone 5.5-inch", "iphone",
    [[1242, 2208]],
    [[2208, 1242]]),
  device("iphone-4.7", "iPhone 4.7-inch", "iphone",
    [[750, 1334]],
    [[1334, 750]]),
  // The 4-inch and 3.5-inch landscape sizes are not simple swaps: Apple
  // accepts with- and without-status-bar variants.
  device("iphone-4.0", "iPhone 4-inch", "iphone",
    [[640, 1096], [640, 1136]],
    [[1136, 600], [1136, 640]]),
  device("iphone-3.5", "iPhone 3.5-inch", "iphone",
    [[640, 920], [640, 960]],
    [[960, 600], [960, 640]]),
  device("ipad-13", "iPad 13-inch", "ipad",
    [[2064, 2752], [2048, 2732]],
    [[2752, 2064], [2732, 2048]]),
  // Same pixels as ipad-13's legacy size; wins only via deliver's path
  // keywords (see classify()).
  device("ipad-12.9", "iPad 12.9-inch (2nd generation)", "ipad",
    [[2048, 2732]],
    [[2732, 2048]]),
  device("ipad-11", "iPad 11-inch", "ipad",
    [[1488, 2266], [1668, 2420], [1668, 2388], [1640, 2360]],
    [[2266, 1488], [2420, 1668], [2388, 1668], [2360, 1640]]),
  device("ipad-10.5", "iPad 10.5-inch", "ipad",
    [[1668, 2224]],
    [[2224, 1668]]),
  device("ipad-9.7", "iPad 9.7-inch", "ipad",
    [[1536, 2008], [1536, 2048], [768, 1004], [768, 1024]],
    [[2048, 1496], [2048, 1536], [1024, 748], [1024, 768]]),
  device("mac", "Mac", "mac",
    [],
    [[1280, 800], [1440, 900], [2560, 1600], [2880, 1800]]),
  device("appletv", "Apple TV", "appletv",
    [],
    [[1920, 1080], [3840, 2160]]),
  // Same pixels as Apple TV 4K; wins only when the path names vision.
  device("visionpro", "Apple Vision Pro", "visionpro",
    [],
    [[3840, 2160]]),
  device("watch-ultra3", "Apple Watch Ultra 3", "watch", [[422, 514]], []),
  device("watch-ultra", "Apple Watch Ultra/Ultra 2", "watch", [[410, 502]], []),
  device("watch-s10", "Apple Watch Series 10/11", "watch", [[416, 496]], []),
  device("watch-s7", "Apple Watch Series 7/8/9", "watch", [[396, 484]], []),
  device("watch-s4", "Apple Watch Series 4/5/6/SE", "watch", [[368, 448]], []),
  device("watch-s3", "Apple Watch Series 3", "watch", [[312, 390]], []),
];

function hasSize(deviceClass: DeviceClass, width: number, height: number): boolean {
  return (
    deviceClass.portrait.some((s) => s.width === width && s.height === height) ||
    deviceClass.landscape.some((s) => s.width === width && s.height === height)
  );
}

/**
 * Classify an image into a device class by exact pixel size, mirroring
 * fastlane deliver's behavior for the two shared-resolution ambiguities:
 * keywordless 2048x2732 is the 13-inch iPad, and keywordless 3840x2160 is
 * Apple TV.
 */
export function classify(
  width: number,
  height: number,
  filePath: string,
  classes: readonly DeviceClass[],
): DeviceClass | null {
  const matches = classes.filter((c) => hasSize(c, width, height));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;

  const ids = new Set(matches.map((m) => m.id));
  const lower = filePath.toLowerCase();

  if (ids.has("ipad-13") && ids.has("ipad-12.9")) {
    // deliver: 2nd gen only when the path contains "ipad_pro_129" (note that
    // the 3rd-gen keyword ipad_pro_3gen_129 does not contain that substring)
    // or names 12.9 together with 2nd generation. Default: 13-inch.
    const secondGen =
      lower.includes("ipad_pro_129") || (lower.includes("12.9") && lower.includes("2nd"));
    const winner = secondGen ? "ipad-12.9" : "ipad-13";
    return matches.find((m) => m.id === winner)!;
  }

  if (ids.has("appletv") && ids.has("visionpro")) {
    const winner = lower.includes("vision") ? "visionpro" : "appletv";
    return matches.find((m) => m.id === winner)!;
  }

  return matches[0]!;
}

export interface NearestSize {
  size: Size;
  orientation: Orientation;
  classId: string;
  label: string;
}

/**
 * The closest valid size to a rejected one, preferring candidates with the
 * same aspect ratio (within 1 percent) so the suggestion is never a stretch.
 */
export function nearestValidSize(
  width: number,
  height: number,
  classes: readonly DeviceClass[],
): NearestSize | null {
  const candidates: NearestSize[] = [];
  for (const deviceClass of classes) {
    for (const orientation of ["portrait", "landscape"] as const) {
      for (const size of deviceClass[orientation]) {
        candidates.push({ size, orientation, classId: deviceClass.id, label: deviceClass.label });
      }
    }
  }
  if (candidates.length === 0) return null;

  const aspect = width / height;
  const area = width * height;
  const sameAspect = candidates.filter(
    (c) => Math.abs(c.size.width / c.size.height - aspect) <= 0.01,
  );
  const pool = sameAspect.length > 0 ? sameAspect : candidates;

  const distance = (c: NearestSize): number =>
    sameAspect.length > 0
      ? Math.abs(c.size.width * c.size.height - area)
      : Math.hypot(c.size.width - width, c.size.height - height);

  pool.sort((a, b) => {
    const d = distance(a) - distance(b);
    if (d !== 0) return d;
    const areaDiff = a.size.width * a.size.height - b.size.width * b.size.height;
    if (areaDiff !== 0) return areaDiff;
    return a.classId.localeCompare(b.classId);
  });

  return pool[0]!;
}

/**
 * Apply per-project dimension overrides: a known class id replaces the
 * provided orientation lists; an unknown id appends a new custom class.
 * Returns a new array; the input is not mutated.
 */
export function applyDimensionOverrides(
  classes: readonly DeviceClass[],
  overrides: DimensionOverrides,
): DeviceClass[] {
  const out: DeviceClass[] = classes.map((c) => ({
    ...c,
    portrait: [...c.portrait],
    landscape: [...c.landscape],
    sources: [...c.sources],
  }));

  for (const [id, override] of Object.entries(overrides)) {
    const existing = out.find((c) => c.id === id);
    if (existing) {
      if (override.portrait) existing.portrait = sizes(override.portrait);
      if (override.landscape) existing.landscape = sizes(override.landscape);
    } else {
      out.push({
        id,
        label: id,
        platform: "custom",
        portrait: override.portrait ? sizes(override.portrait) : [],
        landscape: override.landscape ? sizes(override.landscape) : [],
        verifiedOn: "config",
        sources: ["config"],
      });
    }
  }

  return out;
}
