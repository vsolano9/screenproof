/**
 * Zero-dependency PNG and JPEG header parsing.
 *
 * screenproof only needs pixel dimensions and (for PNG) whether transparency
 * is declared through an alpha colour type or tRNS chunk, so it reads image
 * headers directly instead of pulling in an image library. Every read is
 * bounds-checked: corrupt or truncated files produce a `ParseResult` failure,
 * never a crash.
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

function chunkTypeEquals(buf: Uint8Array, offset: number, type: string): boolean {
  return (
    buf[offset] === type.charCodeAt(0) &&
    buf[offset + 1] === type.charCodeAt(1) &&
    buf[offset + 2] === type.charCodeAt(2) &&
    buf[offset + 3] === type.charCodeAt(3)
  );
}

/** Legal PNG colour types (spec: 0 gray, 2 RGB, 3 palette, 4 gray+alpha, 6 RGBA). */
const PNG_COLOR_TYPES: ReadonlySet<number> = new Set([0, 2, 3, 4, 6]);
const PNG_BIT_DEPTHS_BY_COLOR_TYPE: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

/**
 * Callers may pass a bounded prefix of a larger file. A structure that ends
 * past the loaded bytes but inside the real file exhausted that read budget;
 * it is not evidence that the file itself is truncated.
 */
const PNG_BUDGET = "PNG metadata exceeds the bounded header read; transparency could not be checked";
const JPEG_BUDGET = "JPEG metadata exceeds the bounded header read; the frame header was not reached";

function parsePng(buf: Uint8Array, sizeBytes: number): ParseResult {
  // Signature (8) + length (4) + "IHDR" (4) + data (13) + CRC (4) = 33.
  if (buf.length < 33) return { ok: false, reason: "truncated PNG (incomplete IHDR)" };
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
  const bitDepth = buf[24]!;
  if (!PNG_BIT_DEPTHS_BY_COLOR_TYPE[colorType]!.includes(bitDepth)) {
    return { ok: false, reason: `corrupt PNG: invalid bit depth ${bitDepth} for color type ${colorType}` };
  }

  let hasAlpha = colorType === 4 || colorType === 6;
  let offset = 33;
  while (!hasAlpha) {
    if (offset + 8 > buf.length) {
      return { ok: false, reason: offset + 8 > sizeBytes ? "truncated PNG (incomplete chunk header before IDAT)" : PNG_BUDGET };
    }
    const length = readU32BE(buf, offset);
    if (length > 0x7fffffff) {
      return { ok: false, reason: "corrupt PNG: chunk length exceeds PNG limit" };
    }
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > sizeBytes) {
      return { ok: false, reason: "truncated PNG (chunk exceeds file bounds)" };
    }
    const isImageData = chunkTypeEquals(buf, offset + 4, "IDAT");
    const isImageEnd = chunkTypeEquals(buf, offset + 4, "IEND");
    if (isImageData || isImageEnd) break;
    if (chunkEnd > buf.length) {
      return { ok: false, reason: PNG_BUDGET };
    }
    if (chunkTypeEquals(buf, offset + 4, "tRNS")) {
      if (colorType === 3) {
        const dataStart = offset + 8;
        hasAlpha = buf.subarray(dataStart, dataStart + length).some((alpha) => alpha < 0xff);
      } else {
        // Grayscale and truecolor tRNS chunks identify one transparent sample.
        hasAlpha = true;
      }
      break;
    }
    offset = chunkEnd;
  }

  return { ok: true, info: { format: "png", width, height, hasAlpha } };
}

function isSofMarker(marker: number): boolean {
  // SOF0..SOF15 are C0..CF, excluding DHT (C4), JPG (C8), and DAC (CC).
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function parseJpeg(buf: Uint8Array, sizeBytes: number): ParseResult {
  const outOfBytes: ParseResult = {
    ok: false,
    reason: buf.length < sizeBytes ? JPEG_BUDGET : "truncated JPEG (no frame header)",
  };
  let i = 2; // past SOI
  while (true) {
    if (i + 1 >= buf.length) return outOfBytes;
    if (buf[i] !== 0xff) return { ok: false, reason: "invalid JPEG marker structure" };

    // Skip fill bytes: any number of 0xFF may pad before the marker byte.
    let j = i + 1;
    while (j < buf.length && buf[j] === 0xff) j++;
    if (j >= buf.length) return outOfBytes;
    const marker = buf[j]!;

    // Standalone markers without a length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i = j + 1;
      continue;
    }
    if (marker === 0xd9) return { ok: false, reason: "no JPEG frame header found" };

    if (j + 2 >= buf.length) {
      return { ok: false, reason: j + 2 >= sizeBytes ? "truncated JPEG (segment length)" : JPEG_BUDGET };
    }
    const segmentLength = readU16BE(buf, j + 1);
    if (segmentLength < 2) return { ok: false, reason: "invalid JPEG segment length" };

    if (isSofMarker(marker)) {
      if (marker !== 0xc0 && marker !== 0xc1 && marker !== 0xc2) {
        return { ok: false, reason: `unsupported JPEG frame type SOF${marker - 0xc0}` };
      }
      // Segment layout after the marker: length (2), precision (1),
      // height (2), width (2), component count (1), then 3 bytes per component.
      if (segmentLength < 8) return { ok: false, reason: "invalid JPEG frame header length: missing component count" };
      const segmentEnd = j + 1 + segmentLength;
      if (segmentEnd > buf.length) {
        return { ok: false, reason: segmentEnd > sizeBytes ? "truncated JPEG (frame segment exceeds file bounds)" : JPEG_BUDGET };
      }
      const componentCount = buf[j + 8]!;
      if (componentCount === 0) {
        return { ok: false, reason: "invalid JPEG frame header: component count is zero" };
      }
      if (segmentLength !== 8 + componentCount * 3) {
        return { ok: false, reason: "invalid JPEG frame header: incomplete component table" };
      }
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

/**
 * Parse a PNG or JPEG header from raw bytes. `sizeBytes` is the original file
 * size when `buf` is a bounded prefix: PNG parsing stops at IDAT, and both
 * parsers distinguish a real truncation from an exhausted read budget.
 */
export function parseImageHeader(buf: Uint8Array, sizeBytes = buf.length): ParseResult {
  if (isPng(buf)) return parsePng(buf, sizeBytes);
  if (isJpeg(buf)) return parseJpeg(buf, sizeBytes);
  return { ok: false, reason: "not a PNG or JPEG file" };
}
