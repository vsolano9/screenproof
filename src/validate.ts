/**
 * Validation rules over a scanned screenshots tree.
 *
 * Each rule's severity comes from `config.rules` (built-in defaults in
 * config.ts); `off` disables a rule. Scan-level diagnostics (missing or empty
 * root) pass through here so config levels apply uniformly.
 */

import { applyDimensionOverrides, classify, DEFAULT_CLASSES, nearestValidSize } from "./dimensions.ts";
import { fileExtension } from "./media.ts";
import { classifyPreviewSize } from "./previewdimensions.ts";
import { DEFAULT_RULES } from "./rules.ts";
import type {
  Config,
  Finding,
  LintReport,
  LocaleReport,
  PreviewAudioTrack,
  RuleLevel,
  ScanResult,
  Severity,
} from "./types.ts";

export interface ValidateOptions {
  /** Locale folders of a deliver metadata tree, for the cross-tree check. */
  metadataLocales?: string[] | null;
}

/**
 * Apple's per-localization ceilings.
 *
 * "You can upload up to three app previews per supported device size and
 * language" — App Store Connect Help, Upload app previews and screenshots,
 * read 2026-08-06:
 * https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots
 */
const MAX_PER_CLASS = 10;
const MAX_PREVIEWS_PER_CLASS = 3;
const MAX_PREVIEW_BYTES = 500_000_000;
const MIN_PREVIEW_SECONDS = 15;
const MAX_PREVIEW_SECONDS = 30;

/** Apple: "Max frame rate: 30 frames per second", for H.264 and ProRes alike. */
const MAX_PREVIEW_FPS = 30;

/**
 * H.264 must be High Profile Level 4.0. `AVCProfileIndication` 100 is High;
 * `AVCLevelIndication` is in tenths, so 40 is level 4.0.
 */
const H264_MAX_PROFILE = 100;
const H264_MAX_LEVEL = 40;

const H264_PROFILE_NAMES: Readonly<Record<number, string>> = {
  66: "Baseline",
  77: "Main",
  88: "Extended",
  100: "High",
  110: "High 10",
  122: "High 4:2:2",
  244: "High 4:4:4 Predictive",
};

/** Uncompressed audio sample entries, which Apple allows only alongside ProRes. */
const PCM_FOURCCS: ReadonlySet<string> = new Set([
  "lpcm", "sowt", "twos", "raw ", "in24", "in32", "fl32", "fl64",
]);

/** Apple: "44.1kHz or 48kHz". */
const AUDIO_SAMPLE_RATES: ReadonlySet<number> = new Set([44_100, 48_000]);

/** Apple, for PCM only: "16-, 24-, or 32-bit". */
const PCM_BIT_DEPTHS: ReadonlySet<number> = new Set([16, 24, 32]);

function profileName(indication: number): string {
  return H264_PROFILE_NAMES[indication] ?? `profile ${indication}`;
}

/** Render a level indication in tenths as Apple writes it, e.g. 41 -> "4.1". */
function levelName(indication: number): string {
  return `${Math.floor(indication / 10)}.${indication % 10}`;
}

/** Trim a computed frame rate to something readable: 29.97, 30, 59.94. */
function formatRate(rate: number): string {
  return Number(rate.toFixed(2)).toString();
}

/**
 * Apple's audio requirements, checked against every audio track.
 *
 * Stereo can arrive two ways — one track carrying two channels, or two tracks
 * carrying one each — so the layout rule looks at the set, while codec, sample
 * rate, and bit depth are per track. PCM is accepted only alongside ProRes 422
 * HQ; an H.264 preview must use AAC.
 */
function audioProblems(
  tracks: readonly PreviewAudioTrack[],
  videoCodecFourCC: string | null,
): Array<{ rule: string; message: string }> {
  if (tracks.length === 0) {
    return [{
      rule: "preview-audio-missing",
      message: "app preview has no audio track; Apple requires stereo audio",
    }];
  }

  const problems: Array<{ rule: string; message: string }> = [];
  const channels = tracks.map((track) => track.channelCount);
  const isStereo =
    (tracks.length === 1 && channels[0] === 2) ||
    (tracks.length === 2 && channels.every((count) => count === 1));
  if (!isStereo) {
    problems.push({
      rule: "preview-audio-layout",
      message: `audio is ${tracks.length} track(s) with ${channels.join(" + ")} channel(s); Apple requires stereo as one 2-channel track or two 1-channel tracks`,
    });
  }

  const prores = videoCodecFourCC === "apch";
  const seenCodecProblem = new Set<string>();
  for (const track of tracks) {
    const isPcm = PCM_FOURCCS.has(track.codecFourCC);
    const isAac = track.codecFourCC === "mp4a";
    if (!isAac && !(isPcm && prores) && !seenCodecProblem.has(track.codecFourCC)) {
      seenCodecProblem.add(track.codecFourCC);
      problems.push({
        rule: "preview-audio-codec",
        message: isPcm
          ? `audio sample entry ${track.codecFourCC} is PCM, which Apple accepts only with ProRes 422 HQ; an H.264 preview needs 256 kbps AAC`
          : `audio sample entry ${track.codecFourCC} is not accepted; use 256 kbps AAC${prores ? " or PCM" : ""}`,
      });
    }

    if (track.sampleRateHz > 0 && !AUDIO_SAMPLE_RATES.has(track.sampleRateHz)) {
      problems.push({
        rule: "preview-audio-sample-rate",
        message: `audio sample rate ${track.sampleRateHz} Hz is not 44100 or 48000 Hz`,
      });
    }

    if (isPcm && track.bitDepth > 0 && !PCM_BIT_DEPTHS.has(track.bitDepth)) {
      problems.push({
        rule: "preview-audio-bit-depth",
        message: `PCM audio is ${track.bitDepth}-bit; Apple accepts 16-, 24-, or 32-bit`,
      });
    }
  }

  return problems;
}

function previewCodecProblem(name: string, codecFourCC: string | null): string | null {
  if (codecFourCC === null) {
    return "app preview has no video codec sample entry";
  }
  const extension = fileExtension(name);
  if (codecFourCC === "avc1" || codecFourCC === "avc3") return null;
  if (codecFourCC === "apch") {
    return extension === ".mov"
      ? null
      : "ProRes 422 HQ sample entry apch requires a .mov container";
  }
  return `video codec sample entry ${codecFourCC} is not accepted; use H.264 (avc1 or avc3) or ProRes 422 HQ (apch)`;
}

const PRIMARY_BY_PLATFORM: ReadonlyArray<{ platform: string; classId: string; message: string }> = [
  {
    platform: "iphone",
    classId: "iphone-6.9",
    message: "iPhone screenshots present but none at the current primary size (iPhone 6.9-inch)",
  },
  {
    platform: "ipad",
    classId: "ipad-13",
    message: "iPad screenshots present but none at the current primary size (iPad 13-inch)",
  },
];

/** Run every rule and assemble the report. */
export function validate(scan: ScanResult, config: Config, options: ValidateOptions = {}): LintReport {
  const classes = applyDimensionOverrides(DEFAULT_CLASSES, config.dimensions);
  const findings: Finding[] = [];

  const levelOf = (rule: string): RuleLevel =>
    config.rules[rule] ?? DEFAULT_RULES[rule] ?? "warning";

  const emit = (rule: string, locale: string, message: string, file?: string): void => {
    const level = levelOf(rule);
    if (level === "off") return;
    findings.push({ locale, ...(file !== undefined ? { file } : {}), rule, severity: level as Severity, message });
  };

  for (const diagnostic of scan.diagnostics) {
    emit(diagnostic.rule, diagnostic.locale, diagnostic.message, diagnostic.file);
  }

  /** Device-class ids present per real locale, for parity. */
  const classIdsByLocale = new Map<string, Set<string>>();
  /** Exact Apple Watch screenshot sizes present per real locale. */
  const watchSizesByLocale = new Map<string, Set<string>>();

  for (const locale of scan.locales) {
    const isSyntheticRoot = scan.mode === "locale" && locale.locale === "";

    for (const name of locale.unexpectedFiles) {
      emit("screenshot-unexpected-file", locale.locale, "unexpected non-image file in screenshots folder", name);
    }

    if (isSyntheticRoot) {
      // Loose files directly in the screenshots root: deliver only reads
      // locale folders, so every file here is a mistake.
      for (const file of locale.files) {
        emit("screenshot-unexpected-file", "", "screenshots must live inside a locale folder", file.name);
      }
      for (const file of locale.previews ?? []) {
        emit("screenshot-unexpected-file", "", "app previews must live inside a locale folder", file.name);
      }
      continue;
    }

    if (scan.mode === "locale" && !locale.isKnownLocale) {
      const message =
        locale.locale === "default"
          ? "deliver has no default/ fallback for screenshots; use real locale folders"
          : `"${locale.locale}" is not a known App Store locale folder`;
      emit("screenshot-unknown-locale", locale.locale, message);
    }

    // Locale-level rules (empty locale, per-localization count cap, primary
    // size, parity) only make sense over deliver locale folders; flat mode is
    // documented as file-level checks only.
    const localeRules = scan.mode === "locale";

    const previews = locale.previews ?? [];
    if (localeRules && locale.files.length === 0 && previews.length === 0) {
      emit("screenshot-locale-empty", locale.locale, "locale folder has no screenshots or app previews");
    }

    const countByClass = new Map<string, { label: string; count: number }>();
    const previewCountByClass = new Map<string, { label: string; count: number }>();
    const presentPlatforms = new Set<string>();
    const presentClassIds = new Set<string>();
    const presentWatchSizes = new Set<string>();

    for (const file of locale.files) {
      if (!file.parse.ok) {
        emit("screenshot-format", locale.locale, `cannot parse image header: ${file.parse.reason}`, file.name);
        continue;
      }
      const { width, height, format, hasAlpha } = file.parse.info;

      if (format === "png" && hasAlpha) {
        emit(
          "screenshot-png-alpha",
          locale.locale,
          "PNG declares transparency; App Store Connect may reject it",
          file.name,
        );
      }

      const deviceClass = classify(width, height, file.path, classes);
      if (deviceClass === null) {
        const nearest = nearestValidSize(width, height, classes);
        const suffix = nearest
          ? `; closest is ${nearest.size.width}x${nearest.size.height} (${nearest.label}, ${nearest.orientation})`
          : "";
        emit(
          "screenshot-unknown-dimensions",
          locale.locale,
          `${width}x${height} does not match any known App Store screenshot size${suffix}`,
          file.name,
        );
        continue;
      }

      const entry = countByClass.get(deviceClass.id) ?? { label: deviceClass.label, count: 0 };
      entry.count += 1;
      countByClass.set(deviceClass.id, entry);
      presentPlatforms.add(deviceClass.platform);
      presentClassIds.add(deviceClass.id);
      if (deviceClass.platform === "watch") {
        presentWatchSizes.add(`${width}x${height}`);
      }
    }

    for (const file of previews) {
      if (file.sizeBytes > MAX_PREVIEW_BYTES) {
        emit(
          "preview-file-size",
          locale.locale,
          `${file.sizeBytes} bytes exceeds Apple's 500 MB app-preview limit`,
          file.name,
        );
      }
      if (!file.extensionSupported || !file.parse.ok) {
        const reason = file.parse.ok ? "unsupported app-preview extension" : file.parse.reason;
        emit("preview-format", locale.locale, `cannot parse app preview: ${reason}`, file.name);
        continue;
      }
      const {
        durationSeconds,
        width,
        height,
        codecFourCC,
        frameRate,
        avc,
        audioTracks,
        videoTrackEnabled,
      } = file.parse.info;
      const codecProblem = previewCodecProblem(file.name, codecFourCC);
      if (codecProblem !== null) {
        emit("preview-codec", locale.locale, codecProblem, file.name);
      }

      if (frameRate !== null && frameRate > MAX_PREVIEW_FPS) {
        emit(
          "preview-frame-rate",
          locale.locale,
          `${formatRate(frameRate)} fps exceeds Apple's ${MAX_PREVIEW_FPS} fps maximum`,
          file.name,
        );
      }

      if (avc !== null && (avc.profileIndication > H264_MAX_PROFILE || avc.levelIndication > H264_MAX_LEVEL)) {
        emit(
          "preview-h264-profile",
          locale.locale,
          `H.264 ${profileName(avc.profileIndication)} Profile Level ${levelName(avc.levelIndication)} exceeds Apple's High Profile Level 4.0`,
          file.name,
        );
      }

      if (!videoTrackEnabled) {
        emit("preview-track-disabled", locale.locale, "video track is not enabled", file.name);
      }
      for (const track of audioTracks) {
        if (!track.enabled) {
          emit("preview-track-disabled", locale.locale, "an audio track is not enabled", file.name);
          break;
        }
      }

      for (const problem of audioProblems(audioTracks, codecFourCC)) {
        emit(problem.rule, locale.locale, problem.message, file.name);
      }
      if (durationSeconds < MIN_PREVIEW_SECONDS || durationSeconds > MAX_PREVIEW_SECONDS) {
        emit(
          "preview-duration",
          locale.locale,
          `${durationSeconds.toFixed(3).replace(/\.?0+$/, "")} seconds is outside Apple's 15 to 30 second range`,
          file.name,
        );
      }
      const sizeClass = classifyPreviewSize(width, height);
      if (sizeClass === null) {
        emit(
          "preview-resolution",
          locale.locale,
          `${width}x${height} does not match any accepted App Store app-preview resolution`,
          file.name,
        );
        continue;
      }
      // Portrait and landscape are one App Store Connect slot, so they share a
      // budget. A preview Apple lists no resolution for cannot be assigned to a
      // slot at all, and has already been reported above.
      const entry = previewCountByClass.get(sizeClass.id) ?? { label: sizeClass.label, count: 0 };
      entry.count += 1;
      previewCountByClass.set(sizeClass.id, entry);
    }

    if (localeRules) {
      for (const { label, count } of previewCountByClass.values()) {
        if (count > MAX_PREVIEWS_PER_CLASS) {
          emit(
            "preview-count-over",
            locale.locale,
            `${count} app previews for ${label} (max ${MAX_PREVIEWS_PER_CLASS} per device size per localization)`,
          );
        }
      }
      for (const { label, count } of countByClass.values()) {
        if (count > MAX_PER_CLASS) {
          emit(
            "screenshot-count-over",
            locale.locale,
            `${count} screenshots for ${label} (max ${MAX_PER_CLASS} per device size per localization)`,
          );
        }
      }

      for (const primary of PRIMARY_BY_PLATFORM) {
        if (presentPlatforms.has(primary.platform) && !presentClassIds.has(primary.classId)) {
          emit("screenshot-primary-size-missing", locale.locale, primary.message);
        }
      }

      if (locale.locale !== "default") {
        classIdsByLocale.set(locale.locale, presentClassIds);
      }
      if (locale.isKnownLocale && presentWatchSizes.size > 0) {
        watchSizesByLocale.set(locale.locale, presentWatchSizes);
      }
    }
  }

  if (scan.mode === "locale" && options.metadataLocales) {
    const present = new Set(scan.locales.map((l) => l.locale));
    for (const name of options.metadataLocales) {
      if (!present.has(name)) {
        emit("screenshot-locale-empty", name, `metadata locale ${name} has no screenshots folder`);
      }
    }
  }

  const union = new Set<string>();
  for (const ids of classIdsByLocale.values()) {
    for (const id of ids) union.add(id);
  }
  for (const [name, ids] of classIdsByLocale) {
    const missing = [...union].filter((id) => !ids.has(id)).sort();
    if (missing.length > 0) {
      emit(
        "screenshot-locale-parity",
        name,
        `missing device classes present in other locales: ${missing.join(", ")}`,
      );
    }
  }

  const watchSizes = [...new Set([...watchSizesByLocale.values()].flatMap((sizes) => [...sizes]))].sort();
  if (watchSizes.length > 1) {
    for (const [name, sizes] of watchSizesByLocale) {
      emit(
        "screenshot-watch-size-consistency",
        name,
        `Apple requires one Apple Watch screenshot size across all localizations; this locale uses ${[...sizes].sort().join(", ")}, while the app uses ${watchSizes.join(", ")}`,
      );
    }
  }

  return assemble(scan, findings);
}

function assemble(scan: ScanResult, findings: Finding[]): LintReport {
  const sortFindings = (a: Finding, b: Finding): number =>
    a.rule.localeCompare(b.rule) || (a.file ?? "").localeCompare(b.file ?? "") || a.message.localeCompare(b.message);

  // Ordered locale keys: scan order first (skipping the locale-mode root
  // pseudo-locale ""), then any extra finding locales (metadata cross-check).
  const orderedLocales: string[] = [];
  for (const locale of scan.locales) {
    if (scan.mode === "locale" && locale.locale === "") continue;
    orderedLocales.push(locale.locale);
  }
  const known = new Set(orderedLocales);
  const extras = [...new Set(findings.map((f) => f.locale))]
    .filter((locale) => !known.has(locale) && !(scan.mode === "locale" && locale === ""))
    .sort((a, b) => a.localeCompare(b));
  orderedLocales.push(...extras);

  const locales: LocaleReport[] = orderedLocales.map((name) => {
    const own = findings.filter((f) => f.locale === name && !(scan.mode === "locale" && name === "")).sort(sortFindings);
    return { locale: name, findings: own, ok: own.every((f) => f.severity !== "error") };
  });

  const reportLevel = scan.mode === "locale" ? findings.filter((f) => f.locale === "").sort(sortFindings) : [];
  const flattened = [...locales.flatMap((l) => l.findings), ...reportLevel];

  const count = (severity: Severity): number => flattened.filter((f) => f.severity === severity).length;
  const errorCount = count("error");

  return {
    root: scan.root,
    mode: scan.mode,
    locales,
    findings: flattened,
    errorCount,
    warningCount: count("warning"),
    infoCount: count("info"),
    ok: errorCount === 0,
  };
}
