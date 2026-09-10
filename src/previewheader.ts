/**
 * Minimal ISO base-media and QuickTime atom parser for App Store previews.
 *
 * It reads structural metadata only — never encoded media. That is enough for
 * every rule screenproof enforces: movie duration, the video track's display
 * dimensions, sample-entry FourCC, H.264 profile and level from `avcC`, frame
 * rate from the `stts` sample table, track-enabled flags and the transform
 * matrix from `tkhd`, and each audio track's codec, channel count, sample rate,
 * and bit depth from its sample entry.
 *
 * Two documented requirements are deliberately not read here:
 *
 * - **Progressive vs interlaced.** Reliably answering it means decoding the SPS
 *   (`frame_mbs_only_flag`) or trusting a QuickTime `fiel` atom that most
 *   encoders never write. Neither is container metadata.
 * - **Target bit rate (10-12 Mbps H.264, ~220 Mbps ProRes).** Apple states a
 *   target, not a limit, and a figure derived from file size over duration
 *   folds in audio and container overhead. A rule built on it would warn on
 *   conforming files.
 */


import type { AvcConfig, PreviewAudioTrack, PreviewParseResult } from "./types.ts";


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

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function handlerType(bytes: Uint8Array, trak: Atom): string | null {
  const mdia = child(trak, bytes, "mdia");
  if (!mdia) return null;
  const hdlr = child(mdia, bytes, "hdlr");
  if (!hdlr || hdlr.dataStart + 12 > hdlr.end) return null;
  return atomType(bytes, hdlr.dataStart + 8);
}

function isVideoTrack(bytes: Uint8Array, trak: Atom): boolean {
  return handlerType(bytes, trak) === "vide";
}

function isAudioTrack(bytes: Uint8Array, trak: Atom): boolean {
  return handlerType(bytes, trak) === "soun";
}

/** The sample table of a track, or undefined when the chain is incomplete. */
function sampleTable(bytes: Uint8Array, trak: Atom): Atom | undefined {
  const mdia = child(trak, bytes, "mdia");
  if (!mdia) return undefined;
  const minf = child(mdia, bytes, "minf");
  if (!minf) return undefined;
  return child(minf, bytes, "stbl");
}

/** Sample entries declared by a track's `stsd`, validated against its count. */
function sampleEntries(bytes: Uint8Array, trak: Atom): Atom[] {
  const stbl = sampleTable(bytes, trak);
  if (!stbl) return [];
  const stsd = child(stbl, bytes, "stsd");
  if (!stsd) return [];
  if (stsd.end - stsd.dataStart < 8) throw new Error("stsd full box is truncated");
  const version = bytes[stsd.dataStart];
  if (version !== 0) throw new Error(`unsupported stsd version ${version}`);
  const declaredEntryCount = u32(bytes, stsd.dataStart + 4);
  const entries = atoms(bytes, stsd.dataStart + 8, stsd.end);
  if (entries.length !== declaredEntryCount) {
    throw new Error(`stsd declares ${declaredEntryCount} entries but contains ${entries.length}`);
  }
  return entries;
}

/** `track_enabled` is bit 0 of the `tkhd` flags, the low 24 bits of the full-box header. */
function trackEnabled(bytes: Uint8Array, trak: Atom): boolean {
  const tkhd = child(trak, bytes, "tkhd");
  if (!tkhd || tkhd.dataStart + 4 > tkhd.end) return true;
  return (u32(bytes, tkhd.dataStart) & 0x000001) !== 0;
}

/**
 * Frames per second from the video track's `stts` sample table and `mdhd`
 * timescale. Exact when every sample shares one delta; otherwise the average
 * over the track, which is what a variable-frame-rate file can honestly report.
 */
function trackFrameRate(bytes: Uint8Array, trak: Atom): number | null {
  const mdia = child(trak, bytes, "mdia");
  if (!mdia) return null;
  const mdhd = child(mdia, bytes, "mdhd");
  if (!mdhd || mdhd.dataStart + 4 > mdhd.end) return null;
  const version = bytes[mdhd.dataStart];
  if (version !== 0 && version !== 1) return null;
  const timescaleOffset = mdhd.dataStart + (version === 1 ? 20 : 12);
  if (timescaleOffset + 4 > mdhd.end) return null;
  const timescale = u32(bytes, timescaleOffset);
  if (timescale === 0) return null;

  const stbl = sampleTable(bytes, trak);
  if (!stbl) return null;
  const stts = child(stbl, bytes, "stts");
  if (!stts || stts.dataStart + 8 > stts.end) return null;
  const entryCount = u32(bytes, stts.dataStart + 4);
  if (entryCount === 0) return null;
  if (stts.dataStart + 8 + entryCount * 8 > stts.end) {
    throw new Error("stts entry count exceeds the atom bounds");
  }

  let samples = 0;
  let ticks = 0;
  let firstDelta: number | null = null;
  let uniform = true;
  for (let index = 0; index < entryCount; index++) {
    const offset = stts.dataStart + 8 + index * 8;
    const count = u32(bytes, offset);
    const delta = u32(bytes, offset + 4);
    samples += count;
    ticks += count * delta;
    if (firstDelta === null) firstDelta = delta;
    else if (delta !== firstDelta) uniform = false;
  }
  if (samples === 0 || ticks === 0) return null;
  if (uniform && firstDelta !== null && firstDelta > 0) return timescale / firstDelta;
  return samples / (ticks / timescale);
}

/**
 * H.264 profile and level from the `avcC` box.
 *
 * `avcC` is a child of the sample entry, which begins with 78 bytes of fixed
 * `VisualSampleEntry` fields before any child box.
 */
function avcConfig(bytes: Uint8Array, entry: Atom): AvcConfig | null {
  const childStart = entry.dataStart + 78;
  if (childStart >= entry.end) return null;
  const avcC = atoms(bytes, childStart, entry.end).find((box) => box.type === "avcC");
  if (!avcC || avcC.dataStart + 4 > avcC.end) return null;
  return {
    profileIndication: bytes[avcC.dataStart + 1]!,
    levelIndication: bytes[avcC.dataStart + 3]!,
  };
}

/**
 * One audio track's configuration from its sample entry.
 *
 * Version 0 and 1 sound descriptions carry the channel count, sample size, and
 * a 16.16 sample rate in the fixed header. Version 2 replaces them with a
 * struct holding a float64 sample rate and a 32-bit channel count, which is
 * what QuickTime writes for high-rate or multichannel PCM.
 */
function audioTrackInfo(bytes: Uint8Array, trak: Atom): PreviewAudioTrack | null {
  const entry = sampleEntries(bytes, trak)[0];
  if (!entry) return null;
  const enabled = trackEnabled(bytes, trak);
  if (entry.dataStart + 28 > entry.end) {
    return { codecFourCC: entry.type, channelCount: 0, sampleRateHz: 0, bitDepth: 0, enabled };
  }

  const version = u16(bytes, entry.dataStart + 8);
  if (version === 2) {
    if (entry.dataStart + 44 > entry.end) {
      return { codecFourCC: entry.type, channelCount: 0, sampleRateHz: 0, bitDepth: 0, enabled };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset + entry.dataStart + 32, 12);
    return {
      codecFourCC: entry.type,
      channelCount: view.getUint32(8),
      sampleRateHz: Math.round(view.getFloat64(0)),
      // Version 2 moves bit depth into the format-specific flags; the fixed
      // header no longer carries a usable sample size.
      bitDepth: 0,
      enabled,
    };
  }

  return {
    codecFourCC: entry.type,
    channelCount: u16(bytes, entry.dataStart + 16),
    bitDepth: u16(bytes, entry.dataStart + 18),
    sampleRateHz: u16(bytes, entry.dataStart + 24),
    enabled,
  };
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

function videoSampleEntry(bytes: Uint8Array, trak: Atom): Atom | null {
  try {
    return sampleEntries(bytes, trak)[0] ?? null;
  } catch (error) {
    throw new Error(`video sample description is malformed: ${(error as Error).message}`);
  }
}

/** Parse a complete `moov`-containing byte range. */
export function parsePreviewHeader(bytes: Uint8Array): PreviewParseResult {
  try {
    const moov = atoms(bytes, 0, bytes.length).find((entry) => entry.type === "moov");
    if (!moov) return { ok: false, reason: "file has no moov atom" };
    const mvhd = child(moov, bytes, "mvhd");
    if (!mvhd) return { ok: false, reason: "moov atom has no movie header" };
    const durationSeconds = movieDuration(bytes, mvhd);
    const traks = atoms(bytes, moov.dataStart, moov.end).filter((entry) => entry.type === "trak");
    const videoTrack = traks.find((entry) => isVideoTrack(bytes, entry));
    if (!videoTrack) return { ok: false, reason: "moov atom has no video track" };
    const { width, height } = trackDimensions(bytes, videoTrack);
    const entry = videoSampleEntry(bytes, videoTrack);
    const codecFourCC = entry?.type ?? null;
    const audioTracks: PreviewAudioTrack[] = [];
    for (const trak of traks) {
      if (!isAudioTrack(bytes, trak)) continue;
      const info = audioTrackInfo(bytes, trak);
      if (info) audioTracks.push(info);
    }
    return {
      ok: true,
      info: {
        durationSeconds,
        width,
        height,
        codecFourCC,
        frameRate: trackFrameRate(bytes, videoTrack),
        avc: entry && (entry.type === "avc1" || entry.type === "avc3") ? avcConfig(bytes, entry) : null,
        audioTracks,
        videoTrackEnabled: trackEnabled(bytes, videoTrack),
      },
    };
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
}

