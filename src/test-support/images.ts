/**
 * Test-only image byte builders.
 *
 * `makePng` produces a real, decodable PNG (zero-filled pixels, correct CRCs,
 * deflated IDAT via the node:zlib builtin). `makeJpeg` produces header-valid
 * JPEG bytes: a correct marker stream through the SOF frame header, with no
 * entropy-coded scan data, which is all the parser under test reads.
 *
 * This folder is excluded from the published build (tsconfig.build.json).
 */

import { deflateSync } from "node:zlib";

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = (CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = concat([typeBytes, data]);
  return concat([u32be(data.length), body, u32be(crc32(body))]);
}

export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Build a real PNG. Colour types: 2 = RGB (no alpha), 4 = grayscale+alpha,
 * 6 = RGBA. `alpha: true` is shorthand for colour type 6.
 */
export function makePng(
  width: number,
  height: number,
  opts: { alpha?: boolean; colorType?: 2 | 4 | 6 } = {},
): Uint8Array {
  const colorType = opts.colorType ?? (opts.alpha ? 6 : 2);
  const bytesPerPixel = colorType === 2 ? 3 : colorType === 4 ? 2 : 4;

  const ihdr = concat([
    u32be(width),
    u32be(height),
    new Uint8Array([8, colorType, 0, 0, 0]),
  ]);

  // Each scanline: 1 filter byte (0 = None) + zero-filled pixel bytes.
  const raw = new Uint8Array((1 + width * bytesPerPixel) * height);
  const idat = new Uint8Array(deflateSync(raw));

  return concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * Build header-valid JPEG bytes: SOI, optional filler segments, an SOF frame
 * header carrying the dimensions, and EOI. Parser-valid, not viewer-valid.
 */
export function makeJpeg(
  width: number,
  height: number,
  opts: { progressive?: boolean; leadingSegments?: { marker: number; size: number }[] } = {},
): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];

  for (const segment of opts.leadingSegments ?? []) {
    const length = segment.size + 2;
    parts.push(new Uint8Array([0xff, segment.marker, (length >>> 8) & 0xff, length & 0xff]));
    parts.push(new Uint8Array(segment.size));
  }

  const sofMarker = opts.progressive ? 0xc2 : 0xc0;
  parts.push(
    new Uint8Array([
      0xff, sofMarker,
      0x00, 0x0b, // segment length: 11
      0x08, // precision
      (height >>> 8) & 0xff, height & 0xff,
      (width >>> 8) & 0xff, width & 0xff,
      0x01, // one component
      0x01, 0x11, 0x00,
    ]),
  );

  parts.push(new Uint8Array([0xff, 0xd9]));
  return concat(parts);
}
