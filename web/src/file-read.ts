import type { BrowserFixtureInput } from "../../src/browser.ts";
import { fileExtension, IMAGE_EXTENSIONS, PREVIEW_EXTENSIONS } from "../../src/media.ts";
import { fileTree, planScan } from "../../src/scan-tree.ts";
import { defaultConfig } from "../../src/rules.ts";
import { selectedPath } from "./intake.ts";

const IMAGE_HEAD_BYTES = 1024 * 1024;
const MAX_MOOV_BYTES = 64 * 1024 * 1024;
const MAX_SELECTION_BYTES = 128 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 500_000_000;

/** Two reads in flight; at most 128 MiB of header/metadata slices per selection. */
export async function readFiles(files: readonly File[], current: () => boolean): Promise<BrowserFixtureInput[]> {
  const tree = fileTree(files.map(selectedPath));
  const plan = planScan("browser", [...tree.keys()], path => tree.get(path)!, defaultConfig());
  const selected = new Set(plan.locales.flatMap(locale => [...locale.images, ...locale.previews]));
  const inputs: BrowserFixtureInput[] = new Array(files.length);
  let next = 0;
  let reserved = 0;
  let failed = false;
  const readSlice = async (file: File, start: number, end: number) => {
    if (!current() || failed) throw new Error("inspection superseded");
    reserved += end - start;
    if (reserved > MAX_SELECTION_BYTES) throw new Error("Selected metadata exceeds the 128 MiB browser budget. Select fewer files or use the CLI.");
    const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
    if (bytes.length !== end - start) throw new Error(`Could not read complete metadata from ${file.name}`);
    return bytes;
  };
  const worker = async () => {
    try {
      while (current() && !failed && next < files.length) {
        const index = next++;
        const file = files[index]!;
        const path = selectedPath(file);
        const extension = fileExtension(file.name);
        let bytes = new Uint8Array(0);
        if (selected.has(path) && IMAGE_EXTENSIONS.has(extension)) {
          bytes = await readSlice(file, 0, Math.min(file.size, IMAGE_HEAD_BYTES));
        } else if (selected.has(path) && PREVIEW_EXTENSIONS.has(extension) && file.size <= MAX_PREVIEW_BYTES) {
          let offset = 0;
          let atoms = 0;
          while (offset < file.size && current()) {
            if (++atoms > 4096) throw new Error(`${file.name} exceeds the browser's top-level atom budget`);
            const header = await readSlice(file, offset, Math.min(offset + 16, file.size));
            if (header.length < 8) throw new Error(`${file.name}: truncated atom header`);
            const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
            const size32 = view.getUint32(0);
            const type = String.fromCharCode(...header.subarray(4, 8));
            if (size32 === 1 && header.length < 16) throw new Error(`${file.name}: truncated extended atom size`);
            const size = size32 === 1 ? view.getUint32(8) * 0x100000000 + view.getUint32(12) : size32 === 0 ? file.size - offset : size32;
            if (!Number.isSafeInteger(size) || size < (size32 === 1 ? 16 : 8) || offset + size > file.size) throw new Error(`${file.name}: invalid ${type} atom bounds`);
            if (type === "moov") {
              if (size > MAX_MOOV_BYTES) throw new Error(`${file.name}: moov metadata exceeds 64 MiB`);
              bytes = await readSlice(file, offset, offset + size);
              break;
            }
            offset += size;
          }
        }
        if (current() && !failed) inputs[index] = { name: file.name, path, bytes, sizeBytes: file.size };
      }
    } catch (error) { failed = true; throw error; }
  };
  await Promise.all([worker(), worker()]);
  return current() ? inputs : [];
}
