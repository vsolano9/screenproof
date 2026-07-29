import { strict as assert } from "node:assert";
import { mkdtemp, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parsePreviewFile, parsePreviewHeader } from "./previewheader.ts";
import { makePreview } from "./test-support/previews.ts";

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

function preview(
  durationSeconds = 20,
  width = 886,
  height = 1920,
  codecFourCC: string | null = "avc1",
): Uint8Array {
  const mvhd = new Uint8Array(20);
  mvhd.set(u32(1_000), 12);
  mvhd.set(u32(durationSeconds * 1_000), 16);

  const tkhd = new Uint8Array(84);
  tkhd.set(u32(width * 65_536), 76);
  tkhd.set(u32(height * 65_536), 80);

  const hdlr = new Uint8Array(12);
  hdlr.set(text("vide"), 8);

  const stsd = concat([
    new Uint8Array(4),
    u32(codecFourCC === null ? 0 : 1),
    ...(codecFourCC === null ? [] : [box(codecFourCC, new Uint8Array(0))]),
  ]);

  return concat([
    box("ftyp", concat([text("isom"), u32(0), text("isom")])),
    box("moov", concat([
      box("mvhd", mvhd),
      box("trak", concat([
        box("tkhd", tkhd),
        box("mdia", concat([
          box("hdlr", hdlr),
          box("minf", box("stbl", box("stsd", stsd))),
        ])),
      ])),
    ])),
  ]);
}

test("parses duration and video dimensions from ISO base-media atoms", () => {
  assert.deepEqual(parsePreviewHeader(preview()), {
    ok: true,
    info: { durationSeconds: 20, width: 886, height: 1920, codecFourCC: "avc1" },
  });
});

test("extracts supported H.264 and ProRes sample-entry FourCC values", () => {
  for (const codecFourCC of ["avc1", "avc3", "apch"]) {
    const parsed = parsePreviewHeader(preview(20, 886, 1920, codecFourCC));
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.info.codecFourCC, codecFourCC);
  }
});

test("reports an empty video sample-description table as a null codec", () => {
  const parsed = parsePreviewHeader(preview(20, 886, 1920, null));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.info.codecFourCC, null);
});

test("rejects malformed video sample descriptions as format parse failures", () => {
  const valid = preview();
  const marker = text("stsd");
  const markerOffset = valid.findIndex((_, index) =>
    index + marker.length <= valid.length && marker.every((byte, part) => valid[index + part] === byte)
  );
  assert.notEqual(markerOffset, -1);

  const malformed = [
    (() => {
      const truncated = valid.slice();
      truncated.set(u32(12), markerOffset - 4);
      return truncated;
    })(),
    (() => {
      const wrongEntryCount = valid.slice();
      wrongEntryCount.set(u32(2), markerOffset + 8);
      return wrongEntryCount;
    })(),
  ];
  for (const bytes of malformed) {
    const parsed = parsePreviewHeader(bytes);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.match(parsed.reason, /sample description|stsd/);
  }
});

test("supports version 1 movie headers with 64-bit duration", () => {
  const mvhd = new Uint8Array(32);
  mvhd[0] = 1;
  mvhd.set(u32(1_000), 20);
  mvhd.set(u32(20_000), 28);
  const bytes = box("moov", box("mvhd", mvhd));
  const parsed = parsePreviewHeader(bytes);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.reason, /video track/);
});

test("rejects truncated and zero-timescale movie headers", () => {
  assert.deepEqual(parsePreviewHeader(new Uint8Array([0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x76])), {
    ok: false,
    reason: "moov atom has no movie header",
  });

  const mvhd = new Uint8Array(20);
  const parsed = parsePreviewHeader(box("moov", box("mvhd", mvhd)));
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.reason, /timescale/);
});

test("rejects unsupported movie-header versions", () => {
  const mvhd = new Uint8Array(20);
  mvhd[0] = 2;
  const parsed = parsePreviewHeader(box("moov", box("mvhd", mvhd)));
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.reason, /unsupported movie header version 2/);
});

test("rejects atom sizes that exceed their parent", () => {
  const malformed = concat([u32(100), text("moov"), new Uint8Array(4)]);
  const parsed = parsePreviewHeader(malformed);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.reason, /exceeds parent bounds/);
});

test("file parsing skips media payload atoms and reads moov metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "screenproof-preview-"));
  const path = join(root, "preview.mp4");
  await writeFile(path, makePreview(25, 1920, 1080, 1_000_000));
  assert.deepEqual(await parsePreviewFile(path), {
    ok: true,
    info: { durationSeconds: 25, width: 1920, height: 1080, codecFourCC: "avc1" },
  });
});

test("file parsing rejects malformed top-level atom headers without reading payloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "screenproof-preview-malformed-"));
  const cases = [
    {
      name: "truncated.mp4",
      bytes: new Uint8Array(7),
      reason: "truncated top-level atom header",
    },
    {
      name: "truncated-extended.mp4",
      bytes: concat([u32(1), text("moov"), new Uint8Array(7)]),
      reason: "moov atom has a truncated extended size",
    },
    {
      name: "undersized.mp4",
      bytes: concat([u32(4), text("moov")]),
      reason: "moov atom has an invalid size",
    },
    {
      name: "out-of-bounds.mp4",
      bytes: concat([u32(100), text("mdat")]),
      reason: "mdat atom exceeds file bounds",
    },
  ];

  for (const entry of cases) {
    const path = join(root, entry.name);
    await writeFile(path, entry.bytes);
    assert.deepEqual(await parsePreviewFile(path), { ok: false, reason: entry.reason });
  }
});

test("file parsing rejects a sparse oversized moov atom before loading it", async () => {
  const root = await mkdtemp(join(tmpdir(), "screenproof-preview-large-"));
  const path = join(root, "oversized.mp4");
  const atomSize = (64 * 1024 * 1024) + 1;
  const handle = await open(path, "w");
  try {
    await handle.write(concat([u32(atomSize), text("moov")]), 0, 8, 0);
    await handle.truncate(atomSize);
  } finally {
    await handle.close();
  }

  assert.deepEqual(await parsePreviewFile(path), {
    ok: false,
    reason: "moov atom is unreasonably large",
  });
});

test("header parsing handles deterministic malformed byte sequences without throwing", () => {
  let state = 0x51f15e;
  for (let length = 0; length <= 256; length += 1) {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < bytes.length; index += 1) {
      state = ((state * 1_664_525) + 1_013_904_223) >>> 0;
      bytes[index] = state & 0xff;
    }
    const parsed = parsePreviewHeader(bytes);
    assert.equal(typeof parsed.ok, "boolean");
  }
});
