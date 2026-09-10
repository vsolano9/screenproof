import { strict as assert } from "node:assert";
import test from "node:test";

import { inspectBrowserFixtures } from "./browser.ts";
import { makePreviewFile } from "./test-support/previews.ts";

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 2;
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes;
}

test("browser inspection reports the exact unknown-dimensions rule and reason", () => {
  const report = inspectBrowserFixtures([
    { name: "wrong-size.png", bytes: pngHeader(1170, 2500) },
  ]);

  assert.equal(report.ok, false);
  assert.deepEqual(report.findings.map(({ rule, message }) => ({ rule, message })), [
    {
      rule: "screenshot-unknown-dimensions",
      message: "1170x2500 does not match any known App Store screenshot size; closest is 1170x2532 (iPhone 6.1-inch, portrait)",
    },
  ]);
});

test("browser inspection accepts a correct 1320x2868 PNG", () => {
  const report = inspectBrowserFixtures([
    { name: "correct-1320x2868.png", bytes: pngHeader(1320, 2868) },
  ]);

  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
});

test("browser inspection derives locale mode from relative paths", () => {
  const report = inspectBrowserFixtures([
    { name: "01.png", path: "en_US/01.png", bytes: pngHeader(1320, 2868) },
  ]);

  assert.equal(report.mode, "locale");
  assert.deepEqual(report.findings.map(({ rule, locale, message }) => ({ rule, locale, message })), [
    {
      rule: "screenshot-unknown-locale",
      locale: "en_US",
      message: "\"en_US\" is not a known App Store locale folder",
    },
  ]);
});

test("browser inspection runs the pure MOV parser and preview rules", () => {
  const report = inspectBrowserFixtures([
    {
      name: "too-short.mov",
      bytes: makePreviewFile({ durationSeconds: 10 }),
    },
  ]);

  assert.equal(report.ok, false);
  assert.equal(report.findings.some((finding) => finding.rule === "preview-duration"), true);
  assert.equal(report.findings.find((finding) => finding.rule === "preview-duration")?.message,
    "10 seconds is outside Apple's 15 to 30 second range");
});
