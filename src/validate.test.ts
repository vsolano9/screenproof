import { strict as assert } from "node:assert";
import { test } from "node:test";

import { defaultConfig } from "./config.ts";
import type {
  AvcConfig,
  Config,
  Finding,
  LocaleScan,
  PreviewAudioTrack,
  PreviewFile,
  ScanResult,
  ScreenshotFile,
} from "./types.ts";
import { validate } from "./validate.ts";

function png(name: string, locale: string, width: number, height: number, alpha = false): ScreenshotFile {
  return {
    path: `/x/${locale}/${name}`,
    name,
    locale,
    parse: { ok: true, info: { format: "png", width, height, hasAlpha: alpha } },
  };
}

function badFile(name: string, locale: string, reason: string): ScreenshotFile {
  return { path: `/x/${locale}/${name}`, name, locale, parse: { ok: false, reason } };
}

/** One conforming stereo AAC track, so a fixture only states what it breaks. */
const STEREO_AAC: PreviewAudioTrack[] = [
  { codecFourCC: "mp4a", channelCount: 2, sampleRateHz: 44_100, bitDepth: 16, enabled: true },
];

function preview(
  name: string,
  locale: string,
  durationSeconds: number,
  width: number,
  height: number,
  opts: {
    sizeBytes?: number;
    supported?: boolean;
    reason?: string;
    codecFourCC?: string | null;
    frameRate?: number | null;
    avc?: AvcConfig | null;
    audioTracks?: PreviewAudioTrack[];
    videoTrackEnabled?: boolean;
  } = {},
): PreviewFile {
  return {
    path: `/x/${locale}/${name}`,
    name,
    locale,
    sizeBytes: opts.sizeBytes ?? 1_000_000,
    extensionSupported: opts.supported ?? true,
    parse: opts.reason
      ? { ok: false, reason: opts.reason }
      : {
          ok: true,
          info: {
            durationSeconds,
            width,
            height,
            codecFourCC: opts.codecFourCC === undefined ? "avc1" : opts.codecFourCC,
            frameRate: opts.frameRate === undefined ? 30 : opts.frameRate,
            avc: opts.avc === undefined ? { profileIndication: 100, levelIndication: 40 } : opts.avc,
            audioTracks: opts.audioTracks ?? STEREO_AAC,
            videoTrackEnabled: opts.videoTrackEnabled ?? true,
          },
        },
  };
}

function localeScan(
  locale: string,
  files: ScreenshotFile[],
  opts: { known?: boolean; unexpected?: string[]; previews?: PreviewFile[] } = {},
): LocaleScan {
  return {
    locale,
    isKnownLocale: opts.known ?? true,
    files,
    previews: opts.previews ?? [],
    unexpectedFiles: opts.unexpected ?? [],
  };
}

function scanResult(locales: LocaleScan[], opts: { mode?: "locale" | "flat"; diagnostics?: Finding[] } = {}): ScanResult {
  return { root: "/x", mode: opts.mode ?? "locale", locales, diagnostics: opts.diagnostics ?? [] };
}

function rules(overrides: Record<string, "error" | "warning" | "info" | "off">): Config {
  const config = defaultConfig();
  Object.assign(config.rules, overrides);
  return config;
}

function byRule(report: { findings: Finding[] }, rule: string): Finding[] {
  return report.findings.filter((f) => f.rule === rule);
}

test("scan diagnostics pass through with their rule level", () => {
  const scan = scanResult([], {
    diagnostics: [{ locale: "", rule: "missing-screenshots", severity: "error", message: "screenshots folder not found: /x" }],
  });
  const report = validate(scan, defaultConfig());
  assert.equal(report.ok, false);
  assert.equal(report.errorCount, 1);
  assert.match(byRule(report, "missing-screenshots")[0]!.message, /not found/);
});

test("screenshot-format fires on unparseable files", () => {
  const scan = scanResult([localeScan("en-US", [badFile("bad.png", "en-US", "truncated PNG (no IHDR)")])]);
  const report = validate(scan, defaultConfig());
  const findings = byRule(report, "screenshot-format");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, "error");
  assert.equal(findings[0]!.file, "bad.png");
  assert.match(findings[0]!.message, /cannot parse image header: truncated PNG/);
});

test("screenshot-png-alpha warns on alpha PNGs", () => {
  const scan = scanResult([localeScan("en-US", [png("01.png", "en-US", 1260, 2736, true), png("02.png", "en-US", 1260, 2736)])]);
  const report = validate(scan, defaultConfig());
  const findings = byRule(report, "screenshot-png-alpha");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.severity, "warning");
  assert.equal(findings[0]!.file, "01.png");
  assert.match(findings[0]!.message, /declares transparency/);
});

test("screenshot-unknown-dimensions errors with a nearest-size suggestion", () => {
  const scan = scanResult([localeScan("en-US", [png("01.png", "en-US", 1080, 2341)])]);
  const report = validate(scan, defaultConfig());
  const findings = byRule(report, "screenshot-unknown-dimensions");
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /1080x2341 does not match any known App Store screenshot size/);
  assert.match(findings[0]!.message, /closest is 1080x2340 \(iPhone 6.1-inch, portrait\)/);
});

test("config dimension overrides make custom sizes valid", () => {
  const config = defaultConfig();
  config.dimensions = { "my-kiosk": { portrait: [[500, 500]] } };
  const scan = scanResult([localeScan("en-US", [png("01.png", "en-US", 500, 500)])]);
  const report = validate(scan, config);
  assert.equal(byRule(report, "screenshot-unknown-dimensions").length, 0);
});

test("screenshot-count-over combines orientations within a class", () => {
  const eleven = [
    ...Array.from({ length: 7 }, (_, i) => png(`p${i}.png`, "en-US", 1260, 2736)),
    ...Array.from({ length: 4 }, (_, i) => png(`l${i}.png`, "en-US", 2736, 1260)),
  ];
  const report = validate(scanResult([localeScan("en-US", eleven)]), defaultConfig());
  const findings = byRule(report, "screenshot-count-over");
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /11 screenshots for iPhone 6.9-inch \(max 10 per device size per localization\)/);

  const ten = eleven.slice(0, 10);
  assert.equal(byRule(validate(scanResult([localeScan("en-US", ten)]), defaultConfig()), "screenshot-count-over").length, 0);
});

test("unknown-dimension files do not count toward the class limit", () => {
  const files = [
    ...Array.from({ length: 10 }, (_, i) => png(`p${i}.png`, "en-US", 1260, 2736)),
    png("weird1.png", "en-US", 500, 501),
    png("weird2.png", "en-US", 502, 503),
  ];
  const report = validate(scanResult([localeScan("en-US", files)]), defaultConfig());
  assert.equal(byRule(report, "screenshot-count-over").length, 0);
  assert.equal(byRule(report, "screenshot-unknown-dimensions").length, 2);
});

test("screenshot-unexpected-file warns for unexpected entries and stray root files", () => {
  const scan = scanResult([
    localeScan("en-US", [png("01.png", "en-US", 1260, 2736)], { unexpected: ["notes.txt", "raw/"] }),
    localeScan("", [png("stray.png", "", 1260, 2736)], { known: false }),
  ]);
  const report = validate(scan, defaultConfig());
  const findings = byRule(report, "screenshot-unexpected-file");
  assert.equal(findings.length, 3);
  const stray = findings.find((f) => f.file === "stray.png");
  assert.match(stray!.message, /screenshots must live inside a locale folder/);
});

test("flat mode does not flag its files as stray", () => {
  const scan = scanResult([localeScan("", [png("01.png", "", 1260, 2736)])], { mode: "flat" });
  const report = validate(scan, defaultConfig());
  assert.equal(byRule(report, "screenshot-unexpected-file").length, 0);
  assert.equal(report.ok, true);
});

test("screenshot-unknown-locale warns, with a special message for default/", () => {
  const scan = scanResult([
    localeScan("en_US", [png("01.png", "en_US", 1260, 2736)], { known: false }),
    localeScan("default", [png("01.png", "default", 1260, 2736)], { known: false }),
  ]);
  const report = validate(scan, defaultConfig());
  const findings = byRule(report, "screenshot-unknown-locale");
  assert.equal(findings.length, 2);
  assert.match(findings.find((f) => f.locale === "en_US")!.message, /"en_US" is not a known App Store locale folder/);
  assert.match(findings.find((f) => f.locale === "default")!.message, /deliver has no default\/ fallback for screenshots/);
});

test("screenshot-locale-empty warns on empty locale folders and missing metadata locales", () => {
  const scan = scanResult([localeScan("en-US", [png("01.png", "en-US", 1260, 2736)]), localeScan("de-DE", [])]);
  const report = validate(scan, defaultConfig(), { metadataLocales: ["en-US", "de-DE", "fr-FR"] });
  const findings = byRule(report, "screenshot-locale-empty");
  assert.equal(findings.length, 2);
  assert.match(findings.find((f) => f.locale === "de-DE")!.message, /locale folder has no screenshots/);
  assert.match(findings.find((f) => f.locale === "fr-FR")!.message, /metadata locale fr-FR has no screenshots folder/);
});

test("flat mode ignores metadata locale checks", () => {
  const scan = scanResult([localeScan("", [png("01.png", "", 1260, 2736)])], { mode: "flat" });
  const report = validate(scan, defaultConfig(), { metadataLocales: ["de-DE"] });
  assert.deepEqual(byRule(report, "screenshot-locale-empty"), []);
  assert.equal(report.ok, true);
});

test("screenshot-primary-size-missing is off by default and platform-aware when enabled", () => {
  const scan = scanResult([localeScan("en-US", [png("01.png", "en-US", 1284, 2778), png("02.png", "en-US", 1668, 2224)])]);
  assert.equal(byRule(validate(scan, defaultConfig()), "screenshot-primary-size-missing").length, 0);

  const enabled = rules({ "screenshot-primary-size-missing": "warning" });
  const findings = byRule(validate(scan, enabled), "screenshot-primary-size-missing");
  assert.equal(findings.length, 2);
  const messages = findings.map((f) => f.message).sort();
  assert.match(messages.find((m) => m.startsWith("iPhone"))!, /iPhone screenshots present but none at the current primary size \(iPhone 6.9-inch\)/);
  assert.match(messages.find((m) => m.startsWith("iPad"))!, /iPad screenshots present but none at the current primary size \(iPad 13-inch\)/);

  const withPrimary = scanResult([localeScan("en-US", [png("01.png", "en-US", 1260, 2736)])]);
  assert.equal(byRule(validate(withPrimary, enabled), "screenshot-primary-size-missing").length, 0);
});

test("screenshot-locale-parity is off by default and compares against the union when enabled", () => {
  const scan = scanResult([
    localeScan("en-US", [png("01.png", "en-US", 1260, 2736), png("02.png", "en-US", 2064, 2752)]),
    localeScan("de-DE", [png("01.png", "de-DE", 1260, 2736)]),
  ]);
  assert.equal(byRule(validate(scan, defaultConfig()), "screenshot-locale-parity").length, 0);

  const enabled = rules({ "screenshot-locale-parity": "warning" });
  const findings = byRule(validate(scan, enabled), "screenshot-locale-parity");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.locale, "de-DE");
  assert.match(findings[0]!.message, /missing device classes present in other locales: ipad-13/);
});

test("rule levels remap severity and off disables", () => {
  const scan = scanResult([localeScan("en-US", [badFile("bad.png", "en-US", "junk")])]);
  const remapped = validate(scan, rules({ "screenshot-format": "warning" }));
  assert.equal(byRule(remapped, "screenshot-format")[0]!.severity, "warning");
  assert.equal(remapped.ok, true);
  const off = validate(scan, rules({ "screenshot-format": "off" }));
  assert.equal(byRule(off, "screenshot-format").length, 0);
});

test("report assembly: counts, ok flags, deterministic order, mode copied", () => {
  const scan = scanResult([
    localeScan("de-DE", []),
    localeScan("en-US", [png("02.png", "en-US", 500, 500), png("01.png", "en-US", 1260, 2736, true)]),
  ]);
  const report = validate(scan, defaultConfig());
  assert.equal(report.mode, "locale");
  assert.equal(report.errorCount, 1);
  assert.equal(report.warningCount, 2);
  assert.equal(report.infoCount, 0);
  assert.equal(report.ok, false);
  assert.deepEqual(report.locales.map((l) => l.locale), ["de-DE", "en-US"]);
  assert.equal(report.locales[0]!.ok, true);
  assert.equal(report.locales[1]!.ok, false);
  const enUs = report.locales[1]!.findings;
  assert.deepEqual(enUs.map((f) => f.rule), ["screenshot-png-alpha", "screenshot-unknown-dimensions"]);
  assert.equal(report.findings.length, 3);
});

test("flat mode runs file-level checks only: no count, primary, or locale-empty rules", () => {
  const eleven = Array.from({ length: 11 }, (_, i) => png(`${String(i).padStart(2, "0")}.png`, "", 1284, 2778));
  const scan = scanResult([localeScan("", eleven)], { mode: "flat" });
  const report = validate(scan, rules({ "screenshot-primary-size-missing": "warning" }));
  assert.deepEqual(byRule(report, "screenshot-count-over"), []);
  assert.deepEqual(byRule(report, "screenshot-primary-size-missing"), []);
  assert.deepEqual(byRule(report, "screenshot-locale-empty"), []);
  assert.equal(report.ok, true);
});

test("flat mode still runs the per-file checks", () => {
  const scan = scanResult(
    [localeScan("", [png("a.png", "", 500, 500), badFile("b.png", "", "truncated PNG (no IHDR)")], { unexpected: ["notes.txt"] })],
    { mode: "flat" },
  );
  const report = validate(scan, defaultConfig());
  assert.equal(byRule(report, "screenshot-unknown-dimensions").length, 1);
  assert.equal(byRule(report, "screenshot-format").length, 1);
  assert.equal(byRule(report, "screenshot-unexpected-file").length, 1);
});

test("flat mode empty root reports missing-screenshots once, not locale-empty", () => {
  const scan = scanResult([localeScan("", [])], {
    mode: "flat",
    diagnostics: [{ locale: "", rule: "missing-screenshots", severity: "error", message: "no screenshots found in /x" }],
  });
  const report = validate(scan, defaultConfig());
  assert.equal(byRule(report, "missing-screenshots").length, 1);
  assert.deepEqual(byRule(report, "screenshot-locale-empty"), []);
});

test("valid app previews pass the file-level rules", () => {
  const scan = scanResult([
    localeScan("en-US", [], {
      previews: [preview("walkthrough.mp4", "en-US", 20, 886, 1920)],
    }),
  ]);
  const report = validate(scan, defaultConfig());
  assert.equal(report.errorCount, 0);
  assert.deepEqual(report.findings, []);
});

test("app-preview codec accepts H.264 containers and MOV-only ProRes 422 HQ", () => {
  const scan = scanResult([
    localeScan("", [], {
      previews: [
        preview("one.mov", "", 20, 886, 1920, { codecFourCC: "avc1" }),
        preview("two.m4v", "", 20, 886, 1920, { codecFourCC: "avc3" }),
        preview("three.mp4", "", 20, 886, 1920, { codecFourCC: "avc1" }),
        preview("four.mov", "", 20, 886, 1920, { codecFourCC: "apch" }),
      ],
    }),
  ], { mode: "flat" });
  const report = validate(scan, defaultConfig());
  assert.equal(report.ok, true);
  assert.deepEqual(byRule(report, "preview-codec"), []);
});

test("app-preview codec rejects missing, unsupported, and incompatible sample entries", () => {
  const scan = scanResult([
    localeScan("en-US", [], {
      previews: [
        preview("missing.mp4", "en-US", 20, 886, 1920, { codecFourCC: null }),
        preview("hevc.mp4", "en-US", 20, 886, 1920, { codecFourCC: "hvc1" }),
        preview("prores.mp4", "en-US", 20, 886, 1920, { codecFourCC: "apch" }),
      ],
    }),
  ]);
  const findings = byRule(validate(scan, defaultConfig()), "preview-codec");
  assert.equal(findings.length, 3);
  assert.match(findings.find((finding) => finding.file === "missing.mp4")!.message, /no video codec sample entry/);
  assert.match(findings.find((finding) => finding.file === "hevc.mp4")!.message, /hvc1.*not accepted/);
  assert.match(findings.find((finding) => finding.file === "prores.mp4")!.message, /apch.*requires a \.mov container/);
});

test("app-preview codec rule can be disabled independently", () => {
  const scan = scanResult([
    localeScan("en-US", [], {
      previews: [preview("hevc.mp4", "en-US", 20, 886, 1920, { codecFourCC: "hvc1" })],
    }),
  ]);
  assert.equal(byRule(validate(scan, rules({ "preview-codec": "off" })), "preview-codec").length, 0);
});

test("malformed sample descriptions remain preview-format failures", () => {
  const scan = scanResult([
    localeScan("en-US", [], {
      previews: [preview("malformed.mp4", "en-US", 20, 886, 1920, {
        reason: "video sample description is malformed: stsd full box is truncated",
      })],
    }),
  ]);
  const report = validate(scan, defaultConfig());
  assert.equal(byRule(report, "preview-format").length, 1);
  assert.deepEqual(byRule(report, "preview-codec"), []);
});

test("app-preview format, size, duration, and resolution rules are independent", () => {
  const scan = scanResult([
    localeScan("en-US", [], {
      previews: [
        preview("bad.webm", "en-US", 20, 886, 1920, {
          supported: false,
          reason: "unsupported app-preview extension .webm",
        }),
        preview("large.mp4", "en-US", 20, 886, 1920, { sizeBytes: 500_000_001 }),
        preview("short.mp4", "en-US", 14.9, 886, 1920),
        preview("wrong-size.mp4", "en-US", 20, 887, 1920),
      ],
    }),
  ]);
  const report = validate(scan, defaultConfig());
  assert.equal(byRule(report, "preview-format").length, 1);
  assert.equal(byRule(report, "preview-file-size").length, 1);
  assert.equal(byRule(report, "preview-duration").length, 1);
  assert.equal(byRule(report, "preview-resolution").length, 1);
});

test("a fully conforming app preview raises nothing", () => {
  const report = validate(
    scanResult([localeScan("en-US", [], { previews: [preview("ok.mp4", "en-US", 20, 886, 1920)] })]),
    defaultConfig(),
  );
  assert.deepEqual(report.findings, []);
  assert.equal(report.ok, true);
});

test("app-preview frame rate is capped at 30 fps", () => {
  const previews = [
    preview("sixty.mp4", "en-US", 20, 886, 1920, { frameRate: 60 }),
    preview("thirty.mp4", "en-US", 20, 886, 1920, { frameRate: 30 }),
    preview("ntsc.mp4", "en-US", 20, 886, 1920, { frameRate: 29.97 }),
  ];
  const findings = byRule(
    validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig()),
    "preview-frame-rate",
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.file, "sixty.mp4");
  assert.match(findings[0]!.message, /60 fps exceeds Apple's 30 fps maximum/);
});

test("app-preview frame rate is not judged when the sample table cannot supply one", () => {
  const previews = [preview("unknown.mp4", "en-US", 20, 886, 1920, { frameRate: null })];
  const report = validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig());
  assert.deepEqual(byRule(report, "preview-frame-rate"), []);
});

test("H.264 above High Profile Level 4.0 is rejected, at or below is accepted", () => {
  const previews = [
    preview("high40.mp4", "en-US", 20, 886, 1920, { avc: { profileIndication: 100, levelIndication: 40 } }),
    preview("main31.mp4", "en-US", 20, 886, 1920, { avc: { profileIndication: 77, levelIndication: 31 } }),
    preview("high41.mp4", "en-US", 20, 886, 1920, { avc: { profileIndication: 100, levelIndication: 41 } }),
    preview("high10.mp4", "en-US", 20, 886, 1920, { avc: { profileIndication: 110, levelIndication: 40 } }),
  ];
  const findings = byRule(
    validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig()),
    "preview-h264-profile",
  );
  assert.deepEqual(findings.map((f) => f.file), ["high10.mp4", "high41.mp4"]);
  assert.match(
    findings.find((f) => f.file === "high41.mp4")!.message,
    /H\.264 High Profile Level 4\.1 exceeds Apple's High Profile Level 4\.0/,
  );
  assert.match(findings.find((f) => f.file === "high10.mp4")!.message, /High 10 Profile Level 4\.0/);
});

test("a preview with no avcC is not judged on profile", () => {
  const previews = [preview("prores.mov", "en-US", 20, 886, 1920, { codecFourCC: "apch", avc: null })];
  const report = validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig());
  assert.deepEqual(byRule(report, "preview-h264-profile"), []);
});

test("a silent app preview is reported once, not as a layout problem", () => {
  const previews = [preview("silent.mp4", "en-US", 20, 886, 1920, { audioTracks: [] })];
  const report = validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig());
  const missing = byRule(report, "preview-audio-missing");
  assert.equal(missing.length, 1);
  assert.match(missing[0]!.message, /no audio track; Apple requires stereo audio/);
  assert.deepEqual(byRule(report, "preview-audio-layout"), []);
});

test("stereo is accepted as one 2-channel track or two 1-channel tracks", () => {
  const oneTrack = [{ codecFourCC: "mp4a", channelCount: 2, sampleRateHz: 44_100, bitDepth: 16, enabled: true }];
  const twoTracks = [
    { codecFourCC: "mp4a", channelCount: 1, sampleRateHz: 44_100, bitDepth: 16, enabled: true },
    { codecFourCC: "mp4a", channelCount: 1, sampleRateHz: 44_100, bitDepth: 16, enabled: true },
  ];
  for (const audioTracks of [oneTrack, twoTracks]) {
    const previews = [preview("a.mp4", "en-US", 20, 886, 1920, { audioTracks })];
    const report = validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig());
    assert.deepEqual(byRule(report, "preview-audio-layout"), []);
  }
});

test("mono and surround audio are rejected as not stereo", () => {
  const mono = [{ codecFourCC: "mp4a", channelCount: 1, sampleRateHz: 44_100, bitDepth: 16, enabled: true }];
  const surround = [{ codecFourCC: "mp4a", channelCount: 6, sampleRateHz: 48_000, bitDepth: 16, enabled: true }];
  const previews = [
    preview("mono.mp4", "en-US", 20, 886, 1920, { audioTracks: mono }),
    preview("surround.mp4", "en-US", 20, 886, 1920, { audioTracks: surround }),
  ];
  const findings = byRule(
    validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig()),
    "preview-audio-layout",
  );
  assert.deepEqual(findings.map((f) => f.file), ["mono.mp4", "surround.mp4"]);
  assert.match(findings[0]!.message, /1 track\(s\) with 1 channel\(s\)/);
});

test("PCM audio is accepted with ProRes and rejected with H.264", () => {
  const pcm = [{ codecFourCC: "sowt", channelCount: 2, sampleRateHz: 48_000, bitDepth: 24, enabled: true }];
  const previews = [
    preview("prores.mov", "en-US", 20, 886, 1920, { codecFourCC: "apch", audioTracks: pcm }),
    preview("h264.mp4", "en-US", 20, 886, 1920, { codecFourCC: "avc1", audioTracks: pcm }),
  ];
  const findings = byRule(
    validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig()),
    "preview-audio-codec",
  );
  assert.deepEqual(findings.map((f) => f.file), ["h264.mp4"]);
  assert.match(findings[0]!.message, /PCM, which Apple accepts only with ProRes 422 HQ/);
});

test("an audio codec that is neither AAC nor PCM is rejected on any video codec", () => {
  const mp3 = [{ codecFourCC: ".mp3", channelCount: 2, sampleRateHz: 44_100, bitDepth: 16, enabled: true }];
  const previews = [preview("mp3.mp4", "en-US", 20, 886, 1920, { audioTracks: mp3 })];
  const findings = byRule(
    validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig()),
    "preview-audio-codec",
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /\.mp3 is not accepted; use 256 kbps AAC/);
});

test("audio sample rate must be 44.1 or 48 kHz", () => {
  const rate = (hz: number) => [{ codecFourCC: "mp4a", channelCount: 2, sampleRateHz: hz, bitDepth: 16, enabled: true }];
  const previews = [
    preview("ok-441.mp4", "en-US", 20, 886, 1920, { audioTracks: rate(44_100) }),
    preview("ok-48.mp4", "en-US", 20, 886, 1920, { audioTracks: rate(48_000) }),
    preview("low.mp4", "en-US", 20, 886, 1920, { audioTracks: rate(22_050) }),
  ];
  const findings = byRule(
    validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig()),
    "preview-audio-sample-rate",
  );
  assert.deepEqual(findings.map((f) => f.file), ["low.mp4"]);
  assert.match(findings[0]!.message, /22050 Hz is not 44100 or 48000 Hz/);
});

test("PCM bit depth must be 16, 24, or 32, and is not judged for AAC", () => {
  const pcm = (bits: number) => [{ codecFourCC: "sowt", channelCount: 2, sampleRateHz: 48_000, bitDepth: bits, enabled: true }];
  const previews = [
    preview("pcm24.mov", "en-US", 20, 886, 1920, { codecFourCC: "apch", audioTracks: pcm(24) }),
    preview("pcm8.mov", "en-US", 20, 886, 1920, { codecFourCC: "apch", audioTracks: pcm(8) }),
    preview("aac8.mp4", "en-US", 20, 886, 1920, {
      audioTracks: [{ codecFourCC: "mp4a", channelCount: 2, sampleRateHz: 44_100, bitDepth: 8, enabled: true }],
    }),
  ];
  const findings = byRule(
    validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig()),
    "preview-audio-bit-depth",
  );
  assert.deepEqual(findings.map((f) => f.file), ["pcm8.mov"]);
});

test("a disabled track warns once per file, for video or audio", () => {
  const previews = [
    preview("novideo.mp4", "en-US", 20, 886, 1920, { videoTrackEnabled: false }),
    preview("noaudio.mp4", "en-US", 20, 886, 1920, {
      audioTracks: [{ codecFourCC: "mp4a", channelCount: 2, sampleRateHz: 44_100, bitDepth: 16, enabled: false }],
    }),
  ];
  const findings = byRule(
    validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig()),
    "preview-track-disabled",
  );
  assert.deepEqual(findings.map((f) => f.file), ["noaudio.mp4", "novideo.mp4"]);
  assert.ok(findings.every((f) => f.severity === "warning"));
});

test("each new preview rule can be turned off on its own", () => {
  const previews = [preview("bad.mp4", "en-US", 20, 886, 1920, {
    frameRate: 60,
    avc: { profileIndication: 100, levelIndication: 41 },
    audioTracks: [],
    videoTrackEnabled: false,
  })];
  const config = defaultConfig();
  for (const rule of ["preview-frame-rate", "preview-h264-profile", "preview-audio-missing", "preview-track-disabled"]) {
    config.rules[rule] = "off";
  }
  const report = validate(scanResult([localeScan("en-US", [], { previews })]), config);
  assert.deepEqual(report.findings, []);
  assert.equal(report.ok, true);
});

test("app-preview count is capped at three per device size per localization", () => {
  const previews = Array.from({ length: 4 }, (_, index) =>
    preview(`${index}.mp4`, "en-US", 20, 886, 1920),
  );
  const report = validate(
    scanResult([localeScan("en-US", [], { previews })]),
    defaultConfig(),
  );
  const findings = byRule(report, "preview-count-over");
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /4 app previews for iPhone 886x1920 \(max 3 per device size per localization\)/);
});

test("app-preview count does not add unrelated device sizes together", () => {
  // Apple allows three previews per device size per localization, so three
  // iPhone plus three iPad previews in one locale is legal, not six over cap.
  const previews = [
    ...Array.from({ length: 3 }, (_, i) => preview(`iphone-${i}.mp4`, "en-US", 20, 886, 1920)),
    ...Array.from({ length: 3 }, (_, i) => preview(`ipad-${i}.mp4`, "en-US", 20, 1200, 1600)),
  ];
  const report = validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig());
  assert.deepEqual(byRule(report, "preview-count-over"), []);
  assert.equal(report.ok, true);
});

test("app-preview count pairs portrait with landscape of the same device size", () => {
  // Portrait and landscape are the same App Store Connect slot, so they share
  // one budget of three.
  const previews = [
    preview("a.mp4", "en-US", 20, 886, 1920),
    preview("b.mp4", "en-US", 20, 1920, 886),
    preview("c.mp4", "en-US", 20, 886, 1920),
    preview("d.mp4", "en-US", 20, 1920, 886),
  ];
  const report = validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig());
  assert.equal(byRule(report, "preview-count-over").length, 1);
});

test("app-preview count reports each over-cap device size separately", () => {
  const previews = [
    ...Array.from({ length: 4 }, (_, i) => preview(`iphone-${i}.mp4`, "en-US", 20, 886, 1920)),
    ...Array.from({ length: 5 }, (_, i) => preview(`ipad-${i}.mp4`, "en-US", 20, 1200, 1600)),
  ];
  const report = validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig());
  const findings = byRule(report, "preview-count-over");
  assert.equal(findings.length, 2);
  assert.match(findings.map((f) => f.message).join("\n"), /4 app previews for iPhone 886x1920/);
  assert.match(findings.map((f) => f.message).join("\n"), /5 app previews for iPad 1200x1600/);
});

test("app-preview count ignores previews whose resolution Apple does not accept", () => {
  // Those already fail preview-resolution; they cannot be assigned to a size.
  const previews = Array.from({ length: 4 }, (_, i) => preview(`odd-${i}.mp4`, "en-US", 20, 640, 480));
  const report = validate(scanResult([localeScan("en-US", [], { previews })]), defaultConfig());
  assert.deepEqual(byRule(report, "preview-count-over"), []);
  assert.equal(byRule(report, "preview-resolution").length, 4);
});

test("app-preview duration bounds are inclusive and flat mode skips only the count rule", () => {
  const previews = [
    preview("minimum.mp4", "", 15, 886, 1920),
    preview("maximum.mp4", "", 30, 1920, 886),
    preview("third.mp4", "", 20, 1920, 1080),
    preview("fourth.mp4", "", 20, 3840, 2160),
  ];
  const report = validate(
    scanResult([localeScan("", [], { previews })], { mode: "flat" }),
    defaultConfig(),
  );
  assert.deepEqual(byRule(report, "preview-duration"), []);
  assert.deepEqual(byRule(report, "preview-count-over"), []);
  assert.equal(report.ok, true);
});
