import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseImageHeader } from "./imageheader.ts";
import { makeJpeg, makePng, PNG_SIGNATURE } from "./test-support/images.ts";

function expectOk(buf: Uint8Array) {
  const result = parseImageHeader(buf);
  assert.equal(result.ok, true, result.ok ? undefined : `expected ok, got: ${result.reason}`);
  if (!result.ok) throw new Error("unreachable");
  return result.info;
}

function expectFail(buf: Uint8Array): string {
  const result = parseImageHeader(buf);
  assert.equal(result.ok, false, "expected a parse failure");
  if (result.ok) throw new Error("unreachable");
  return result.reason;
}

test("parses an RGB PNG (colour type 2, no alpha)", () => {
  const info = expectOk(makePng(1260, 2736));
  assert.deepEqual(info, { format: "png", width: 1260, height: 2736, hasAlpha: false });
});

test("parses an RGBA PNG (colour type 6) as having alpha", () => {
  const info = expectOk(makePng(2064, 2752, { alpha: true }));
  assert.equal(info.hasAlpha, true);
  assert.equal(info.width, 2064);
  assert.equal(info.height, 2752);
});

test("parses a grayscale-alpha PNG (colour type 4) as having alpha", () => {
  const info = expectOk(makePng(100, 50, { colorType: 4 }));
  assert.equal(info.hasAlpha, true);
});

test("parses palette PNG transparency from a tRNS chunk", () => {
  const info = expectOk(makePng(100, 50, { colorType: 3, transparency: true }));
  assert.equal(info.hasAlpha, true);
});

test("keeps a palette PNG without tRNS opaque", () => {
  const info = expectOk(makePng(100, 50, { colorType: 3 }));
  assert.equal(info.hasAlpha, false);
});

test("keeps an all-opaque palette tRNS table opaque", () => {
  const info = expectOk(
    makePng(100, 50, {
      colorType: 3,
      transparency: new Uint8Array([0xff]),
    }),
  );
  assert.equal(info.hasAlpha, false);
});

test("rejects a truncated PNG", () => {
  const reason = expectFail(makePng(10, 10).slice(0, 20));
  assert.match(reason, /truncated PNG/);
});

test("rejects a PNG signature with a wrong first chunk tag", () => {
  const png = makePng(10, 10);
  const broken = Uint8Array.from(png);
  broken.set(new TextEncoder().encode("IHDX"), 12);
  const reason = expectFail(broken);
  assert.match(reason, /IHDR/);
});

test("rejects a PNG with an implausible size", () => {
  const png = makePng(10, 10);
  const broken = Uint8Array.from(png);
  broken.set(new Uint8Array([0x00, 0x00, 0x00, 0x00]), 16); // width 0
  const reason = expectFail(broken);
  assert.match(reason, /corrupt PNG/);
});

test("parses a baseline JPEG (SOF0)", () => {
  const info = expectOk(makeJpeg(1284, 2778));
  assert.deepEqual(info, { format: "jpeg", width: 1284, height: 2778, hasAlpha: false });
});

test("parses a progressive JPEG (SOF2)", () => {
  const info = expectOk(makeJpeg(750, 1334, { progressive: true }));
  assert.equal(info.width, 750);
  assert.equal(info.height, 1334);
});

test("walks past a large APP1 segment to find the frame header", () => {
  const info = expectOk(makeJpeg(2048, 2732, { leadingSegments: [{ marker: 0xe1, size: 60000 }] }));
  assert.equal(info.width, 2048);
  assert.equal(info.height, 2732);
});

test("rejects a JPEG truncated mid-segment", () => {
  const jpeg = makeJpeg(100, 100, { leadingSegments: [{ marker: 0xe1, size: 500 }] });
  const reason = expectFail(jpeg.slice(0, 60));
  assert.match(reason, /truncated JPEG/);
});

test("rejects a JPEG that ends before any frame header", () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const reason = expectFail(bytes);
  assert.match(reason, /no JPEG frame header/);
});

test("rejects an empty buffer", () => {
  const reason = expectFail(new Uint8Array(0));
  assert.match(reason, /not a PNG or JPEG/);
});

test("rejects junk bytes", () => {
  const reason = expectFail(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  assert.match(reason, /not a PNG or JPEG/);
});

test("rejects HEIC bytes (ftypheic) as not PNG or JPEG", () => {
  const heic = new Uint8Array(24);
  heic.set(new TextEncoder().encode("ftypheic"), 4);
  const reason = expectFail(heic);
  assert.match(reason, /not a PNG or JPEG/);
});

test("PNG signature constant matches the real signature", () => {
  const png = makePng(1, 1);
  assert.deepEqual(Array.from(png.slice(0, 8)), Array.from(PNG_SIGNATURE));
});

// Peer-review regressions (2026-07-09): declared-length and IHDR validation.

test("rejects a JPEG frame header with an implausible declared segment length", () => {
  // SOF0 declaring segment length 2: too short to contain precision+height+width.
  const bytes = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x02, 0x08, 0x01, 0x00, 0x01, 0x00, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  const reason = expectFail(bytes);
  assert.match(reason, /invalid JPEG frame header length/);
});

test("rejects a PNG truncated inside the IHDR data", () => {
  const reason = expectFail(makePng(10, 10).slice(0, 27));
  assert.match(reason, /truncated PNG/);
});

test("rejects a PNG whose IHDR declares the wrong length", () => {
  const png = Uint8Array.from(makePng(10, 10));
  png.set(new Uint8Array([0x00, 0x00, 0x00, 0x0c]), 8); // 12 instead of 13
  const reason = expectFail(png);
  assert.match(reason, /invalid PNG: IHDR length/);
});

test("rejects an illegal PNG color type", () => {
  const png = Uint8Array.from(makePng(10, 10));
  png[25] = 7; // not one of 0, 2, 3, 4, 6
  const reason = expectFail(png);
  assert.match(reason, /invalid color type/);
});
