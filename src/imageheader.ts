/**
 * Zero-dependency PNG and JPEG header parsing.
 *
 * screenproof only needs pixel dimensions and (for PNG) whether an alpha
 * channel is declared, so it reads image headers directly instead of pulling
 * in an image library. Every read is bounds-checked: corrupt or truncated
 * files produce a `ParseResult` failure, never a crash.
 */

import type { ParseResult } from "./types.ts";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Reject absurd dimensions instead of trusting a corrupt header. */
const MAX_DIMENSION = 100000;

function readU32BE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset]! << 24) | (buf[offset + 1]! << 16) | (buf[offset + 2]! << 8) | buf[offset + 3]!
  ) >>> 0;
}

function readU16BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset]! << 8) | buf[offset + 1]!) >>> 0;
}

function isPng(buf: Uint8Array): boolean {
  if (buf.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => buf[index] === byte);
}

function isJpeg(buf: Uint8Array): boolean {
  return buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

/** Legal PNG colour types (spec: 0 gray, 2 RGB, 3 palette, 4 gray+alpha, 6 RGBA). */
const PNG_COLOR_TYPES: ReadonlySet<number> = new Set([0, 2, 3, 4, 6]);

function parsePng(buf: Uint8Array): ParseResult {
  // Signature (8) + IHDR length (4) + "IHDR" (4) + 13 data bytes = 29 bytes.
  // Require the complete IHDR data, not just the fields we read.
  if (buf.length < 29) return { ok: false, reason: "truncated PNG (incomplete IHDR)" };
  if (readU32BE(buf, 8) !== 13) {
    return { ok: false, reason: "invalid PNG: IHDR length is not 13" };
  }
  if (
    buf[12] !== 0x49 || // I
    buf[13] !== 0x48 || // H
    buf[14] !== 0x44 || // D
    buf[15] !== 0x52 // R
  ) {
    return { ok: false, reason: "invalid PNG: first chunk is not IHDR" };
  }

  const width = readU32BE(buf, 16);
  const height = readU32BE(buf, 20);
  const colorType = buf[25]!;

  if (width === 0 || height === 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return { ok: false, reason: `corrupt PNG: implausible dimensions ${width}x${height}` };
  }
  if (!PNG_COLOR_TYPES.has(colorType)) {
    return { ok: false, reason: `corrupt PNG: invalid color type ${colorType}` };
  }

  const hasAlpha = colorType === 4 || colorType === 6;
  return { ok: true, info: { format: "png", width, height, hasAlpha } };
}

function isSofMarker(marker: number): boolean {
  // SOF0..SOF15 are C0..CF, excluding DHT (C4), JPG (C8), and DAC (CC).
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function parseJpeg(buf: Uint8Array): ParseResult {
  let i = 2; // past SOI
  while (true) {
    if (i + 1 >= buf.length) return { ok: false, reason: "truncated JPEG (no frame header)" };
    if (buf[i] !== 0xff) return { ok: false, reason: "invalid JPEG marker structure" };

    // Skip fill bytes: any number of 0xFF may pad before the marker byte.
    let j = i + 1;
    while (j < buf.length && buf[j] === 0xff) j++;
    if (j >= buf.length) return { ok: false, reason: "truncated JPEG (no frame header)" };
    const marker = buf[j]!;

    // Standalone markers without a length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i = j + 1;
      continue;
    }
    if (marker === 0xd9) return { ok: false, reason: "no JPEG frame header found" };

    if (j + 2 >= buf.length) return { ok: false, reason: "truncated JPEG (segment length)" };
    const segmentLength = readU16BE(buf, j + 1);
    if (segmentLength < 2) return { ok: false, reason: "invalid JPEG segment length" };

    if (isSofMarker(marker)) {
      // Segment layout after the marker: length (2), precision (1),
      // height (2), width (2). The declared length must cover those five
      // payload bytes; do not read past what the segment claims to contain.
      if (segmentLength < 7) return { ok: false, reason: "invalid JPEG frame header length" };
      if (j + 7 >= buf.length) return { ok: false, reason: "truncated JPEG (frame header)" };
      const height = readU16BE(buf, j + 4);
      const width = readU16BE(buf, j + 6);
      if (width === 0 || height === 0) {
        return { ok: false, reason: `corrupt JPEG: implausible dimensions ${width}x${height}` };
      }
      return { ok: true, info: { format: "jpeg", width, height, hasAlpha: false } };
    }

    i = j + 1 + segmentLength;
  }
}

/** Parse a PNG or JPEG header from raw file bytes. */
export function parseImageHeader(buf: Uint8Array): ParseResult {
  if (isPng(buf)) return parsePng(buf);
  if (isJpeg(buf)) return parseJpeg(buf);
  return { ok: false, reason: "not a PNG or JPEG file" };
}
