import { strict as assert } from "node:assert";
import { test } from "node:test";
import { inspectBrowserFixtures, inspectBrowserSelection } from "./browser.ts";
import { parseImageHeader } from "./imageheader.ts";
import { parsePreviewHeader } from "./previewheader.ts";
import { makePng, makeJpeg } from "./test-support/images.ts";
import { makePreviewFile } from "./test-support/previews.ts";

function asc(type: number, frequency = 4, channels = 2): Uint8Array {
  const binary = (value: number, bits: number) => value.toString(2).padStart(bits, "0");
  let bits = (type < 32 ? binary(type, 5) : "11111" + binary(type - 32, 6)) + binary(frequency, 4) + binary(channels, 4) + "000";
  bits = bits.padEnd(Math.ceil(bits.length / 8) * 8, "0");
  return Uint8Array.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte, 2)));
}
for (const [label, config] of [
  ["MPEG Layer 3", asc(34)], ["CELP", asc(8)], ["missing config", null],
  ["empty config", new Uint8Array()], ["truncated AAC", new Uint8Array([0x12])],
  ["reserved frequency", asc(2, 13)], ["reserved channels", asc(2, 15)],
] as const) {
  test(`RR-01: MPEG-4 ${label} cannot pass as AAC`, () => {
    const bytes = makePreviewFile({ audio: [{ audioSpecificConfig: config }] });
    const report = inspectBrowserFixtures([{ name: "preview.mp4", bytes }]);
    assert.equal(report.ok, false);
    assert.ok(report.findings.some(f => ["preview-audio-codec", "preview-format"].includes(f.rule)));
  });
}
for (const type of [1, 2, 3, 4]) {
  test(`RR-01: AAC object type ${type} retains a passing control`, () => {
    const bytes = makePreviewFile({ audio: [{ audioSpecificConfig: asc(type) }] });
    const parse = parsePreviewHeader(bytes);
    assert.ok(parse.ok);
    assert.equal(parse.info.audioTracks[0]?.codec, "aac");
    assert.equal(inspectBrowserFixtures([{ name: "preview.mp4", bytes }]).ok, true);
  });
}
test("RR-01: HE-AAC with an AAC-LC core is recognized", () => {
  // AOT 5, 22.05 kHz core, stereo, 44.1 kHz extension, AOT 2, GAS flags.
  const bytes = makePreviewFile({ audio: [{ audioSpecificConfig: new Uint8Array([0x2b, 0x92, 0x08, 0x00]) }] });
  assert.equal(inspectBrowserFixtures([{ name: "preview.mp4", bytes }]).ok, true);
});
const valid = makePng(1320, 2868);
const invalid = makePng(100, 100);
test("RR-02: duplicate selection never loses an input and is order independent", () => {
  const files = [{ name: "01.png", bytes: invalid }, { name: "01.png", bytes: valid }];
  const selection = inspectBrowserSelection(files);
  assert.equal(selection.scan.locales[0]?.files.length, 2);
  const a = selection.report;
  const b = inspectBrowserFixtures([...files].reverse());
  assert.equal(a.ok, false);
  assert.deepEqual(a, b);
  assert.ok(a.findings.some(f => f.rule === "screenshot-unknown-dimensions"));
  assert.ok(a.findings.some(f => /same path/.test(f.message)));
});
test("RR-02: identical names in different locales do not collide", () => {
  const report = inspectBrowserFixtures(["en-US", "de-DE"].map(locale => ({ name: "01.png", path: `${locale}/01.png`, bytes: valid })));
  assert.equal(report.ok, true);
});
test("RR-02: normalized duplicate paths also fail", () => {
  const report = inspectBrowserFixtures([{ name: "01.png", path: "./en-US/01.png", bytes: valid }, { name: "01.png", path: "en-US/01.png", bytes: valid }]);
  assert.equal(report.ok, false);
});
for (const [offset, value, label] of [[26, 1, "compression"], [27, 1, "filter"], [28, 2, "interlace"]] as const) {
  test(`RR-03: invalid PNG ${label} fails`, () => {
    const bytes = valid.slice(); bytes[offset] = value;
    assert.equal(parseImageHeader(bytes).ok, false);
    assert.equal(inspectBrowserFixtures([{ name: "01.png", bytes }]).ok, false);
  });
}
for (const [offset, value, label] of [[6, 0, "precision"], [6, 12, "baseline precision"], [13, 0, "zero sampling"], [13, 0x51, "oversize sampling"], [14, 4, "quantization selector"]] as const) {
  test(`RR-04: invalid JPEG ${label} fails`, () => {
    const bytes = makeJpeg(1320, 2868); bytes[offset] = value;
    assert.equal(parseImageHeader(bytes).ok, false);
  });
}
test("RR-04: duplicate JPEG component identifiers fail", () => {
  const one = makeJpeg(1320, 2868);
  const bytes = new Uint8Array([...one.slice(0, 15), 1, 0x11, 0, ...one.slice(15)]);
  bytes[5] = 14; bytes[11] = 2;
  assert.equal(parseImageHeader(bytes).ok, false);
});
for (const rate of [0, NaN, -1, Infinity, 44100.4]) {
  test(`RR-05: invalid sample rate ${rate} fails rather than skipping`, () => {
    const bytes = makePreviewFile({ codecFourCC: "apch", audio: [{ codecFourCC: "lpcm", soundDescriptionVersion: 2, sampleRateHz: rate }] });
    const report = inspectBrowserFixtures([{ name: "preview.mov", bytes }]);
    assert.equal(report.ok, false);
    assert.ok(report.findings.some(f => f.rule === "preview-audio-sample-rate"));
  });
}
