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

/** Build the structural atoms screenproof needs, without encoded media. */
export function makePreview(
  durationSeconds = 20,
  width = 886,
  height = 1920,
  mediaPayloadBytes = 0,
): Uint8Array {
  const mvhd = new Uint8Array(20);
  mvhd.set(u32(1_000), 12);
  mvhd.set(u32(durationSeconds * 1_000), 16);

  const tkhd = new Uint8Array(84);
  tkhd.set(u32(width * 65_536), 76);
  tkhd.set(u32(height * 65_536), 80);

  const hdlr = new Uint8Array(12);
  hdlr.set(text("vide"), 8);

  return concat([
    box("ftyp", concat([text("isom"), u32(0), text("isom")])),
    box("mdat", new Uint8Array(mediaPayloadBytes)),
    box("moov", concat([
      box("mvhd", mvhd),
      box("trak", concat([box("tkhd", tkhd), box("mdia", box("hdlr", hdlr))])),
    ])),
  ]);
}
