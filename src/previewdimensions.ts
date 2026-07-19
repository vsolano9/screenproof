import type { Size } from "./types.ts";

export const PREVIEW_VERIFIED_ON = "2026-07-19";
export const PREVIEW_SPEC_URL =
  "https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications";

/** Unique accepted App Store preview frame sizes from Apple's live table. */
export const PREVIEW_SIZES: ReadonlyArray<Size> = [
  { width: 886, height: 1920 },
  { width: 1920, height: 886 },
  { width: 1080, height: 1920 },
  { width: 1920, height: 1080 },
  { width: 750, height: 1334 },
  { width: 1334, height: 750 },
  { width: 1200, height: 1600 },
  { width: 1600, height: 1200 },
  { width: 900, height: 1200 },
  { width: 1200, height: 900 },
  { width: 3840, height: 2160 },
];

export function isAcceptedPreviewSize(width: number, height: number): boolean {
  return PREVIEW_SIZES.some((size) => size.width === width && size.height === height);
}
