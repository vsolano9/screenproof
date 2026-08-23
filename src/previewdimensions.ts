/**
 * Accepted App Store app-preview frame sizes, grouped by device size.
 *
 * Apple's cap is "up to three app previews per supported device size and
 * language", so counting previews needs the device size, not just a yes/no on
 * the resolution. A group is one row of Apple's accepted-resolution table: its
 * portrait size, its landscape size, and the displays that share them. Portrait
 * and landscape are the same App Store Connect slot and therefore share one
 * budget of three.
 *
 * Several displays map to one resolution (886x1920 serves iPhone 6.9-inch
 * through 6.1-inch), and a file on disk cannot say which display it was cut
 * for. The resolution group is the finest distinction a linter can honestly
 * make, and every group corresponds to at least one real upload slot.
 *
 * Source: https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications
 */

import type { Size } from "./types.ts";

/** Last date the resolution table itself was read off Apple's page. */
export const PREVIEW_VERIFIED_ON = "2026-08-23";
export const PREVIEW_SPEC_URL =
  "https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications";

/** One row of Apple's accepted-resolution table. */
export interface PreviewSizeClass {
  /** Stable id, e.g. `iphone-886x1920`. */
  id: string;
  /** Human label used in report messages, e.g. `iPhone 886x1920`. */
  label: string;
  /** Displays Apple lists for this resolution. */
  displays: readonly string[];
  /** Accepted portrait frame size, when the row has one. */
  portrait?: Size;
  /** Accepted landscape frame size. */
  landscape?: Size;
}

/**
 * Accepted resolutions grouped by device size, from Apple's live table
 * (re-verified {@link PREVIEW_VERIFIED_ON}). Landscape-only rows carry no
 * portrait size.
 */
export const PREVIEW_SIZE_CLASSES: readonly PreviewSizeClass[] = [
  {
    id: "iphone-886x1920",
    label: "iPhone 886x1920",
    displays: ["6.9-inch", "6.5-inch", "6.3-inch", "6.1-inch"],
    portrait: { width: 886, height: 1920 },
    landscape: { width: 1920, height: 886 },
  },
  {
    id: "iphone-1080x1920",
    label: "iPhone 1080x1920",
    displays: ["5.5-inch", "4.0-inch"],
    portrait: { width: 1080, height: 1920 },
    landscape: { width: 1920, height: 1080 },
  },
  {
    id: "iphone-750x1334",
    label: "iPhone 750x1334",
    displays: ["4.7-inch"],
    portrait: { width: 750, height: 1334 },
    landscape: { width: 1334, height: 750 },
  },
  {
    id: "ipad-1200x1600",
    label: "iPad 1200x1600",
    displays: ["13-inch", "12.9-inch (2nd gen)", "11-inch", "10.5-inch"],
    portrait: { width: 1200, height: 1600 },
    landscape: { width: 1600, height: 1200 },
  },
  {
    id: "ipad-900x1200",
    label: "iPad 900x1200",
    displays: ["12.9-inch (2nd gen)", "9.7-inch"],
    portrait: { width: 900, height: 1200 },
    landscape: { width: 1200, height: 900 },
  },
  {
    id: "vision-3840x2160",
    label: "Apple Vision Pro 3840x2160",
    displays: ["Apple Vision Pro"],
    landscape: { width: 3840, height: 2160 },
  },
];

/**
 * Unique accepted preview frame sizes, flattened from
 * {@link PREVIEW_SIZE_CLASSES} in table order.
 *
 * 1920x1080 is the Mac and Apple TV size as well as iPhone 5.5-inch landscape;
 * the two are indistinguishable on disk and share the `iphone-1080x1920` row.
 */
export const PREVIEW_SIZES: ReadonlyArray<Size> = (() => {
  const seen = new Set<string>();
  const sizes: Size[] = [];
  for (const group of PREVIEW_SIZE_CLASSES) {
    for (const size of [group.portrait, group.landscape]) {
      if (!size) continue;
      const key = `${size.width}x${size.height}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sizes.push(size);
    }
  }
  return sizes;
})();

/** The device-size row a preview frame belongs to, or null if Apple lists none. */
export function classifyPreviewSize(width: number, height: number): PreviewSizeClass | null {
  for (const group of PREVIEW_SIZE_CLASSES) {
    for (const size of [group.portrait, group.landscape]) {
      if (size && size.width === width && size.height === height) return group;
    }
  }
  return null;
}

export function isAcceptedPreviewSize(width: number, height: number): boolean {
  return classifyPreviewSize(width, height) !== null;
}
