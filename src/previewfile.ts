import { open, type FileHandle } from "node:fs/promises";

import { parsePreviewHeader } from "./previewheader.ts";
import type { PreviewParseResult } from "./types.ts";

const MAX_MOOV_BYTES = 64 * 1024 * 1024;

async function readExact(
  handle: FileHandle,
  buffer: Uint8Array,
  length: number,
  position: number,
): Promise<boolean> {
  let total = 0;
  while (total < length) {
    const result = await handle.read(buffer, total, length - total, position + total);
    if (result.bytesRead === 0) return false;
    total += result.bytesRead;
  }
  return true;
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! * 0x1000000) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function u64(bytes: Uint8Array, offset: number): number {
  return u32(bytes, offset) * 0x100000000 + u32(bytes, offset + 4);
}

function atomType(bytes: Uint8Array, offset: number): string {
  return new TextDecoder("latin1").decode(bytes.subarray(offset, offset + 4));
}

/** Read only top-level headers and the `moov` atom, skipping media payloads. */
export async function parsePreviewFile(path: string): Promise<PreviewParseResult> {
  let handle;
  try {
    handle = await open(path, "r");
    const { size } = await handle.stat();
    let offset = 0;
    const header = new Uint8Array(16);
    while (offset < size) {
      if (!(await readExact(handle, header, 8, offset))) {
        return { ok: false, reason: "truncated top-level atom header" };
      }
      const size32 = u32(header, 0);
      const type = atomType(header, 4);
      let atomSize = size32;
      let headerSize = 8;
      if (size32 === 1) {
        if (!(await readExact(handle, header.subarray(8), 8, offset + 8))) {
          return { ok: false, reason: `${type} atom has a truncated extended size` };
        }
        atomSize = u64(header, 8);
        headerSize = 16;
      } else if (size32 === 0) {
        atomSize = size - offset;
      }
      if (!Number.isSafeInteger(atomSize) || atomSize < headerSize) {
        return { ok: false, reason: `${type} atom has an invalid size` };
      }
      if (offset + atomSize > size) return { ok: false, reason: `${type} atom exceeds file bounds` };
      if (type === "moov") {
        if (atomSize > MAX_MOOV_BYTES) return { ok: false, reason: "moov atom is unreasonably large" };
        const bytes = new Uint8Array(atomSize);
        if (!(await readExact(handle, bytes, atomSize, offset))) {
          return { ok: false, reason: "could not read complete moov atom" };
        }
        return parsePreviewHeader(bytes);
      }
      offset += atomSize;
    }
    return { ok: false, reason: "file has no moov atom" };
  } catch (error) {
    return { ok: false, reason: `could not read file: ${(error as Error).message}` };
  } finally {
    await handle?.close();
  }
}
