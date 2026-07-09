import { strict as assert } from "node:assert";
import { test } from "node:test";

import { defaultConfig } from "./config.ts";
import type { Config, Finding, LocaleScan, ScanResult, ScreenshotFile } from "./types.ts";
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

function localeScan(locale: string, files: ScreenshotFile[], opts: { known?: boolean; unexpected?: string[] } = {}): LocaleScan {
  return { locale, isKnownLocale: opts.known ?? true, files, unexpectedFiles: opts.unexpected ?? [] };
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
  assert.match(findings[0]!.message, /alpha channel/);
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
