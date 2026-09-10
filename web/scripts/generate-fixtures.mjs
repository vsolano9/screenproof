import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const output = new URL("../public/fixtures/", import.meta.url);
const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

function u32(value) {
  return Buffer.from([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return Buffer.concat([u32(data.length), name, data, u32((crc ^ 0xffffffff) >>> 0)]);
}

function png(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let offset = 1; offset < row.length; offset += 3) row.set(rgb, offset);
  const pixels = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y += 1) row.copy(pixels, y * row.length);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(output, { recursive: true });
await writeFile(new URL("wrong-size-1170x2500.png", output), png(1170, 2500, [12, 44, 54]));
await writeFile(new URL("correct-1320x2868.png", output), png(1320, 2868, [8, 121, 138]));
