/**
 * Minimal ISO base-media and QuickTime atom parser for App Store previews.
 *
 * It reads only structural metadata needed by screenproof: movie duration and
 * the first video track's display dimensions. Codec, audio, bitrate, and frame
 * rate checks remain outside this parser until they have fixture-backed rules.
 */

import { open } from "node:fs/promises";

import type { PreviewParseResult } from "./types.ts";

const MAX_MOOV_BYTES = 64 * 1024 * 1024;

async function readExact(
  handle: Awaited<ReturnType<typeof open>>,
  buffer: Uint8Array,
  length: number,
  position: number,
): Promise<boolean> {
  let total = 0;
  while (total < length) {
    const result = await handle.read(buffer, total, length - total, position + total);
    if (result.bytesRead === 0) return false;
    total += result.bytesRead;
  }
  return true;
}

interface Atom {
  type: string;
  dataStart: number;
  end: number;
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! * 0x1000000) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function u64(bytes: Uint8Array, offset: number): number {
  const high = u32(bytes, offset);
  const low = u32(bytes, offset + 4);
  return high * 0x100000000 + low;
}

function atomType(bytes: Uint8Array, offset: number): string {
  return new TextDecoder("latin1").decode(bytes.subarray(offset, offset + 4));
}

function atoms(bytes: Uint8Array, start: number, end: number): Atom[] {
  const result: Atom[] = [];
  let offset = start;
  while (offset < end) {
    if (end - offset < 8) throw new Error("truncated atom header");
    const size32 = u32(bytes, offset);
    const type = atomType(bytes, offset + 4);
    let size = size32;
    let headerSize = 8;
    if (size32 === 1) {
      if (end - offset < 16) throw new Error(`${type} atom has a truncated extended size`);
      size = u64(bytes, offset + 8);
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (!Number.isSafeInteger(size) || size < headerSize) {
      throw new Error(`${type} atom has an invalid size`);
    }
    const atomEnd = offset + size;
    if (atomEnd > end) throw new Error(`${type} atom exceeds parent bounds`);
    result.push({ type, dataStart: offset + headerSize, end: atomEnd });
    offset = atomEnd;
  }
  return result;
}

function child(parent: Atom, bytes: Uint8Array, type: string): Atom | undefined {
  return atoms(bytes, parent.dataStart, parent.end).find((entry) => entry.type === type);
}

function movieDuration(bytes: Uint8Array, mvhd: Atom): number {
  const version = bytes[mvhd.dataStart];
  if (version !== 0 && version !== 1) throw new Error(`unsupported movie header version ${version}`);
  const timescaleOffset = mvhd.dataStart + (version === 1 ? 20 : 12);
  const durationOffset = mvhd.dataStart + (version === 1 ? 24 : 16);
  const required = durationOffset + (version === 1 ? 8 : 4);
  if (required > mvhd.end) throw new Error("movie header is truncated");
  const timescale = u32(bytes, timescaleOffset);
  if (timescale === 0) throw new Error("movie header has a zero timescale");
  const duration = version === 1 ? u64(bytes, durationOffset) : u32(bytes, durationOffset);
  if (!Number.isSafeInteger(duration)) throw new Error("movie duration exceeds the safe integer range");
  return duration / timescale;
}

function isVideoTrack(bytes: Uint8Array, trak: Atom): boolean {
  const mdia = child(trak, bytes, "mdia");
  if (!mdia) return false;
  const hdlr = child(mdia, bytes, "hdlr");
  if (!hdlr || hdlr.dataStart + 12 > hdlr.end) return false;
  return atomType(bytes, hdlr.dataStart + 8) === "vide";
}

function trackDimensions(bytes: Uint8Array, trak: Atom): { width: number; height: number } {
  const tkhd = child(trak, bytes, "tkhd");
  if (!tkhd || tkhd.end - tkhd.dataStart < 8) throw new Error("video track has no usable track header");
  const width = u32(bytes, tkhd.end - 8) / 65_536;
  const height = u32(bytes, tkhd.end - 4) / 65_536;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("video track has invalid display dimensions");
  }
  return { width, height };
}

/** Parse a complete `moov`-containing byte range. */
export function parsePreviewHeader(bytes: Uint8Array): PreviewParseResult {
  try {
    const moov = atoms(bytes, 0, bytes.length).find((entry) => entry.type === "moov");
    if (!moov) return { ok: false, reason: "file has no moov atom" };
    const mvhd = child(moov, bytes, "mvhd");
    if (!mvhd) return { ok: false, reason: "moov atom has no movie header" };
    const durationSeconds = movieDuration(bytes, mvhd);
    const videoTrack = atoms(bytes, moov.dataStart, moov.end)
      .filter((entry) => entry.type === "trak")
      .find((entry) => isVideoTrack(bytes, entry));
    if (!videoTrack) return { ok: false, reason: "moov atom has no video track" };
    const { width, height } = trackDimensions(bytes, videoTrack);
    return { ok: true, info: { durationSeconds, width, height } };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

/** Read only top-level headers and the `moov` atom, skipping media payloads. */
export async function parsePreviewFile(path: string): Promise<PreviewParseResult> {
  let handle;
  try {
    handle = await open(path, "r");
    const { size } = await handle.stat();
    let offset = 0;
    const header = new Uint8Array(16);
    while (offset < size) {
      if (!(await readExact(handle, header, 8, offset))) {
        return { ok: false, reason: "truncated top-level atom header" };
      }
      const size32 = u32(header, 0);
      const type = atomType(header, 4);
      let atomSize = size32;
      let headerSize = 8;
      if (size32 === 1) {
        if (!(await readExact(handle, header.subarray(8), 8, offset + 8))) {
          return { ok: false, reason: `${type} atom has a truncated extended size` };
        }
        atomSize = u64(header, 8);
        headerSize = 16;
      } else if (size32 === 0) {
        atomSize = size - offset;
      }
      if (!Number.isSafeInteger(atomSize) || atomSize < headerSize) {
        return { ok: false, reason: `${type} atom has an invalid size` };
      }
      if (offset + atomSize > size) return { ok: false, reason: `${type} atom exceeds file bounds` };
      if (type === "moov") {
        if (atomSize > MAX_MOOV_BYTES) return { ok: false, reason: "moov atom is unreasonably large" };
        const bytes = new Uint8Array(atomSize);
        if (!(await readExact(handle, bytes, atomSize, offset))) {
          return { ok: false, reason: "could not read complete moov atom" };
        }
        return parsePreviewHeader(bytes);
      }
      offset += atomSize;
    }
    return { ok: false, reason: "file has no moov atom" };
  } catch (error) {
    return { ok: false, reason: `could not read file: ${(error as Error).message}` };
  } finally {
    await handle?.close();
  }
}
