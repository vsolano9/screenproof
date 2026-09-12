function u16(value: number): Uint8Array {
  return new Uint8Array([(value >>> 8) & 0xff, value & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function box(type: string, payload: Uint8Array): Uint8Array {
  return concat([u32(payload.length + 8), text(type), payload]);
}

function descriptor(tag: number, payload: Uint8Array): Uint8Array {
  if (payload.length >= 0x80) throw new Error("test descriptor payload is too large");
  return concat([new Uint8Array([tag, payload.length]), payload]);
}

function elementaryStreamDescriptor(objectTypeIndication: number, config: Uint8Array | null): Uint8Array {
  const decoderConfig = descriptor(0x04, concat([
    new Uint8Array([objectTypeIndication, 0x15]),
    new Uint8Array(11),
    ...(config === null ? [] : [descriptor(0x05, config)]),
  ]));
  const es = descriptor(0x03, concat([
    u16(1),
    new Uint8Array([0]),
    decoderConfig,
    descriptor(0x06, new Uint8Array([2])),
  ]));
  return box("esds", concat([new Uint8Array(4), es]));
}

/**
 * A version-0 `tkhd`: version and flags, 20 bytes through the duration, 16
 * bytes of layer and volume fields, the 9-value transform matrix, then
 * fixed-point width and height.
 */
function trackHeader(width: number, height: number, enabled = true): Uint8Array {
  const identity = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
  return box("tkhd", concat([
    u32(enabled ? 1 : 0), // version 0; bit 0 of the flags is track_enabled
    new Uint8Array(20),
    new Uint8Array(16),
    ...identity.map((value) => u32(value >>> 0)),
    u32(width * 65_536),
    u32(height * 65_536),
  ]));
}

function handler(kind: string): Uint8Array {
  const payload = new Uint8Array(12);
  payload.set(text(kind), 8);
  return box("hdlr", payload);
}

/** A version-0 `mdhd` carrying the media timescale the frame-rate maths needs. */
function mediaHeader(timescale: number, duration: number): Uint8Array {
  return box("mdhd", concat([new Uint8Array(12), u32(timescale), u32(duration)]));
}

/** A constant-frame-rate `stts`: one entry of `sampleCount` samples, `delta` apart. */
function timeToSample(sampleCount: number, delta: number): Uint8Array {
  return box("stts", concat([new Uint8Array(4), u32(1), u32(sampleCount), u32(delta)]));
}

/** `avcC`: configuration version, profile indication, compatibility, level. */
function avcC(profileIndication: number, levelIndication: number): Uint8Array {
  return box("avcC", new Uint8Array([1, profileIndication, 0, levelIndication]));
}

/** A `VisualSampleEntry`: 78 fixed bytes, then child boxes such as `avcC`. */
function visualSampleEntry(codecFourCC: string, avc: AvcSpec | null): Uint8Array {
  const fixed = new Uint8Array(78);
  return box(
    codecFourCC,
    avc ? concat([fixed, avcC(avc.profileIndication, avc.levelIndication)]) : fixed,
  );
}

/**
 * A versioned QuickTime audio sample entry. Version 0 uses the fixed fields,
 * version 1 appends packet sizing, and version 2 carries the ASBD-style
 * constant bit depth and format flags.
 */
function audioSampleEntry(track: AudioTrackSpec): Uint8Array {
  const codecFourCC = track.codecFourCC ?? "mp4a";
  const version = track.soundDescriptionVersion ?? 0;
  let fixed: Uint8Array;
  if (version === 2) {
    fixed = new Uint8Array(64);
    fixed.set(u16(2), 8);
    fixed.set(u16(3), 16);
    fixed.set(u16(16), 18);
    fixed.set(u16(0xfffe), 20);
    fixed.set(u32(0x00010000), 24);
    fixed.set(u32(72), 28);
    const view = new DataView(fixed.buffer);
    view.setFloat64(32, track.sampleRateHz ?? 44_100);
    view.setUint32(40, track.channelCount ?? 2);
    view.setUint32(44, 0x7f000000);
    view.setUint32(48, track.bitDepth ?? 16);
    view.setUint32(52, track.formatSpecificFlags ?? 0);
    view.setUint32(56, (track.channelCount ?? 2) * Math.ceil((track.bitDepth ?? 16) / 8));
    view.setUint32(60, 1);
  } else {
    fixed = concat([
      new Uint8Array(8),
      u16(version),
      u16(0),
      new Uint8Array(4),
      u16(track.channelCount ?? 2),
      u16(track.bitDepth ?? 16),
      u16(0),
      u16(0),
      u16(track.sampleRateHz ?? 44_100),
      u16(0),
      ...(version === 1 ? [new Uint8Array(16)] : []),
    ]);
  }
  const objectType = track.objectTypeIndication === undefined ? 0x40 : track.objectTypeIndication;
  const extensions = codecFourCC === "mp4a" && objectType !== null
    ? elementaryStreamDescriptor(objectType, track.audioSpecificConfig === undefined ? new Uint8Array([0x12, 0x10]) : track.audioSpecificConfig)
    : new Uint8Array(0);
  return box(codecFourCC, concat([fixed, extensions]));
}

function sampleDescription(entries: Uint8Array[]): Uint8Array {
  return box("stsd", concat([new Uint8Array(4), u32(entries.length), ...entries]));
}

export interface AvcSpec {
  profileIndication: number;
  levelIndication: number;
}

export interface AudioTrackSpec {
  /** Sample-entry FourCC. Actual `mp4a` codec identity comes from `esds`. */
  codecFourCC?: string;
  channelCount?: number;
  sampleRateHz?: number;
  /** Declared PCM sample size in bits. */
  bitDepth?: number;
  enabled?: boolean;
  soundDescriptionVersion?: 0 | 1 | 2;
  /** MPEG-4 DecoderConfigDescriptor object type; null omits `esds`. */
  objectTypeIndication?: number | null;
  /** DecoderSpecificInfo; null omits it, undefined writes AAC-LC stereo. */
  audioSpecificConfig?: Uint8Array | null;
  /** Version-2 Core Audio format flags. */
  formatSpecificFlags?: number;
}

export interface PreviewSpec {
  durationSeconds?: number;
  width?: number;
  height?: number;
  mediaPayloadBytes?: number;
  /** Video sample-entry FourCC. `null` writes an `stsd` with no entry. */
  codecFourCC?: string | null;
  /** H.264 profile and level for `avcC`. `null` omits the box. */
  avc?: AvcSpec | null;
  /** Frames per second to encode into `mdhd` and `stts`. `null` omits `stts`. */
  frameRate?: number | null;
  /** Audio tracks to append. Defaults to one conforming stereo AAC track. */
  audio?: AudioTrackSpec[];
  videoTrackEnabled?: boolean;
}

/** One conforming stereo AAC track, matching Apple's audio requirement. */
const CONFORMING_AUDIO: AudioTrackSpec = {
  codecFourCC: "mp4a",
  channelCount: 2,
  sampleRateHz: 44_100,
};

/**
 * Build the structural atoms screenproof reads, without encoded media.
 *
 * Defaults describe a preview that satisfies every documented requirement, so a
 * test states only the one field it is putting out of spec.
 */
export function makePreviewFile(spec: PreviewSpec = {}): Uint8Array {
  const durationSeconds = spec.durationSeconds ?? 20;
  const codecFourCC = spec.codecFourCC === undefined ? "avc1" : spec.codecFourCC;
  const frameRate = spec.frameRate === undefined ? 30 : spec.frameRate;
  const audio = spec.audio ?? [CONFORMING_AUDIO];
  const avc = spec.avc === undefined ? { profileIndication: 100, levelIndication: 40 } : spec.avc;
  const isH264 = codecFourCC === "avc1" || codecFourCC === "avc3";

  const mvhd = new Uint8Array(20);
  mvhd.set(u32(1_000), 12);
  mvhd.set(u32(durationSeconds * 1_000), 16);

  // 600 divides evenly for the frame rates these fixtures use.
  const timescale = 600;
  const videoSampleTable: Uint8Array[] = [
    sampleDescription(codecFourCC === null ? [] : [visualSampleEntry(codecFourCC, isH264 ? avc : null)]),
  ];
  if (frameRate !== null) {
    videoSampleTable.push(
      timeToSample(Math.round(durationSeconds * frameRate), Math.round(timescale / frameRate)),
    );
  }

  const videoTrak = box("trak", concat([
    trackHeader(spec.width ?? 886, spec.height ?? 1920, spec.videoTrackEnabled ?? true),
    box("mdia", concat([
      handler("vide"),
      mediaHeader(timescale, Math.round(durationSeconds * timescale)),
      box("minf", box("stbl", concat(videoSampleTable))),
    ])),
  ]));

  const audioTraks = audio.map((track) => box("trak", concat([
    trackHeader(0, 0, track.enabled ?? true),
    box("mdia", concat([
      handler("soun"),
      mediaHeader(track.sampleRateHz ?? 44_100, Math.round(durationSeconds * (track.sampleRateHz ?? 44_100))),
      box("minf", box("stbl", sampleDescription([audioSampleEntry(track)]))),
    ])),
  ])));

  return concat([
    box("ftyp", concat([text("isom"), u32(0), text("isom")])),
    box("mdat", new Uint8Array(spec.mediaPayloadBytes ?? 0)),
    box("moov", concat([box("mvhd", mvhd), videoTrak, ...audioTraks])),
  ]);
}

/**
 * Positional wrapper the earlier preview tests use.
 *
 * Passing `null` for the codec writes an `stsd` with no sample entry, which is
 * how those tests exercise the missing-codec path.
 */
export function makePreview(
  durationSeconds = 20,
  width = 886,
  height = 1920,
  mediaPayloadBytes = 0,
  codecFourCC: string | null = "avc1",
): Uint8Array {
  return makePreviewFile({ durationSeconds, width, height, mediaPayloadBytes, codecFourCC });
}
