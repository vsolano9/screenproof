/**
 * Shared types for screenproof.
 *
 * All values here are plain, JSON-serialisable shapes so that `--json` output
 * and the programmatic API return the same data.
 */

export type Severity = "error" | "warning" | "info";

/** A rule level as configured by the user. `off` disables the rule. */
export type RuleLevel = Severity | "off";

export type Orientation = "portrait" | "landscape";

export type Platform = "iphone" | "ipad" | "mac" | "appletv" | "visionpro" | "watch" | "custom";

export interface Size {
  width: number;
  height: number;
}

/**
 * A device class in Apple's screenshot specifications. An image belongs to a
 * class when its exact pixel size appears in `portrait` or `landscape`.
 */
export interface DeviceClass {
  /** Stable class id, e.g. `iphone-6.9`. */
  id: string;
  /** Human label, e.g. `iPhone 6.9-inch`. */
  label: string;
  platform: Platform;
  portrait: Size[];
  landscape: Size[];
  /** Date the sizes were verified against the sources, e.g. `2026-08-23`. */
  verifiedOn: string;
  /** Where the sizes come from: `apple` (spec page), `deliver` (fastlane source), `config`. */
  sources: string[];
}

export interface ImageInfo {
  format: "png" | "jpeg";
  width: number;
  height: number;
  /** True when a PNG declares transparency via colour type 4/6 or tRNS. Always false for JPEG. */
  hasAlpha: boolean;
}

export type ParseResult = { ok: true; info: ImageInfo } | { ok: false; reason: string };

/** H.264 configuration read from the `avcC` box of an `avc1`/`avc3` sample entry. */
export interface AvcConfig {
  /** `AVCProfileIndication`: 66 Baseline, 77 Main, 88 Extended, 100 High. */
  profileIndication: number;
  /** `AVCLevelIndication` in tenths, so level 4.0 is `40` and 4.1 is `41`. */
  levelIndication: number;
}

/** One audio track's declared configuration. */
export interface PreviewAudioTrack {
  /** Sample-entry FourCC, e.g. `mp4a` for AAC or `lpcm`/`sowt`/`twos` for PCM. */
  codecFourCC: string;
  channelCount: number;
  /** Sample rate in hertz, e.g. `44100`. */
  sampleRateHz: number;
  /** Declared sample size in bits. Only meaningful for PCM. */
  bitDepth: number;
  /** False when the track header's `track_enabled` flag is clear. */
  enabled: boolean;
}

export interface PreviewInfo {
  durationSeconds: number;
  width: number;
  height: number;
  /** Video sample-entry FourCC from `stsd`, or null when no entry is declared. */
  codecFourCC: string | null;
  /**
   * Frames per second, or null when the sample table does not allow a reading.
   * Exact for constant frame rate; the average over the track otherwise.
   */
  frameRate: number | null;
  /** H.264 configuration, or null for non-H.264 tracks and missing `avcC`. */
  avc: AvcConfig | null;
  /** Every audio track in the movie, in file order. */
  audioTracks: PreviewAudioTrack[];
  /** False when the video track header's `track_enabled` flag is clear. */
  videoTrackEnabled: boolean;
}

export type PreviewParseResult =
  | { ok: true; info: PreviewInfo }
  | { ok: false; reason: string };

export interface PreviewFile {
  /** Absolute path. */
  path: string;
  /** Basename, e.g. `01-walkthrough.mp4`. */
  name: string;
  /** Locale folder name, or `""` in flat mode / for root-level files. */
  locale: string;
  sizeBytes: number;
  extensionSupported: boolean;
  parse: PreviewParseResult;
}

/** One image file found in the screenshots tree. */
export interface ScreenshotFile {
  /** Absolute path. */
  path: string;
  /** Basename, e.g. `01-home.png`. */
  name: string;
  /** Locale folder name, or `""` in flat mode / for root-level files. */
  locale: string;
  parse: ParseResult;
}

export interface LocaleScan {
  locale: string;
  /** True when the folder name is a known App Store locale (config-aware). */
  isKnownLocale: boolean;
  files: ScreenshotFile[];
  /** App-preview video files found beside screenshots. */
  previews?: PreviewFile[];
  /** Visible non-image files (and `name/` subfolders) found in the folder. */
  unexpectedFiles: string[];
}

export interface ScanResult {
  root: string;
  mode: "locale" | "flat";
  locales: LocaleScan[];
  /** Scan-level findings (missing or empty root). */
  diagnostics: Finding[];
}

export interface Finding {
  /** Locale folder the finding belongs to, or `""` for root/scan-level findings. */
  locale: string;
  /** File basename, when the finding is about one file. */
  file?: string;
  /** Stable rule id, e.g. `screenshot-unknown-dimensions`. */
  rule: string;
  severity: Severity;
  message: string;
}

export interface LocaleReport {
  locale: string;
  findings: Finding[];
  /** True when the locale has no `error`-severity findings. */
  ok: boolean;
}

export interface LintReport {
  root: string;
  mode: "locale" | "flat";
  locales: LocaleReport[];
  /** Every finding, flattened and stable-ordered. */
  findings: Finding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** True when there are no `error`-severity findings. */
  ok: boolean;
}

export interface LocaleConfig {
  /** When set, only these locale folders are treated as valid (allow-list). */
  allow: string[] | null;
  /** Extra locale codes to treat as known, in addition to the built-in list. */
  extra: string[];
  /** Locale folders to ignore entirely. */
  ignore: string[];
}

/**
 * Per-class dimension overrides. A known class id replaces that class's size
 * lists; an unknown id adds a new custom class. Sizes are `[width, height]`.
 */
export type DimensionOverrides = Record<
  string,
  { portrait?: [number, number][]; landscape?: [number, number][] }
>;

export interface Config {
  /** Rule id -> level. Missing keys fall back to built-in defaults. */
  rules: Record<string, RuleLevel>;
  locales: LocaleConfig;
  dimensions: DimensionOverrides;
}
