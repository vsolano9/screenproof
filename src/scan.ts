/**
 * Screenshot and app-preview tree scanner.
 *
 * Walks a fastlane deliver `screenshots/` tree (per-locale subfolders) or any
 * flat folder of images, reads each image's header, and reports structure.
 * Hidden files (`.DS_Store` and friends) are skipped silently everywhere:
 * this tool's audience is effectively all-macOS and Finder salts every
 * browsed folder with them.
 *
 * Rule evaluation lives in validate.ts; the only findings emitted here are
 * the missing/empty-root diagnostics.
 */

import { open, readdir, stat } from "node:fs/promises";
import { dirname, basename, join } from "node:path";

import { parseImageHeader } from "./imageheader.ts";
import { fileExtension, PREVIEW_EXTENSIONS } from "./media.ts";
import { parsePreviewFile } from "./previewfile.ts";
import { NON_LOCALE_FOLDERS } from "./locales.ts";
import { planScan, type TreeEntry } from "./scan-tree.ts";
import type { Config, Finding, PreviewFile, ScanResult, ScreenshotFile } from "./types.ts";


export interface ScanOptions {
  /** Treat the root as a flat folder of media even if locale folders exist. */
  forceFlat?: boolean;
}

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

interface DirEntry {
  name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

/**
 * Resolve what an entry actually is, following symlinks (fastlane trees may
 * share images or whole locale folders via links). "broken" is a symlink
 * whose target is gone; null is anything else (sockets, fifos).
 */
type EntryKind = "file" | "dir" | "broken" | null;

async function entryKind(dir: string, entry: DirEntry): Promise<EntryKind> {
  if (entry.isFile()) return "file";
  if (entry.isDirectory()) return "dir";
  if (entry.isSymbolicLink()) {
    try {
      const target = await stat(join(dir, entry.name));
      if (target.isFile()) return "file";
      if (target.isDirectory()) return "dir";
      return null;
    } catch {
      return "broken";
    }
  }
  return null;
}

async function scanImage(dir: string, name: string, locale: string): Promise<ScreenshotFile> {
  const path = join(dir, name);
  let parse: ScreenshotFile["parse"];
  let handle;
  try {
    handle = await open(path, "r");
    const { size } = await handle.stat();
    const bytes = Buffer.allocUnsafe(Math.min(size, 1024 * 1024));
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    parse = parseImageHeader(bytes.subarray(0, offset), size);
  } catch (err) {
    parse = { ok: false, reason: `could not read file: ${(err as Error).message}` };
  } finally {
    await handle?.close();
  }
  return { path, name, locale, parse };
}

async function scanPreview(dir: string, name: string, locale: string): Promise<PreviewFile> {
  const path = join(dir, name);
  const extensionSupported = PREVIEW_EXTENSIONS.has(fileExtension(name));
  let sizeBytes = 0;
  try {
    sizeBytes = (await stat(path)).size;
  } catch {
    return {
      path,
      name,
      locale,
      sizeBytes,
      extensionSupported,
      parse: { ok: false, reason: "could not stat file" },
    };
  }
  return {
    path,
    name,
    locale,
    sizeBytes,
    extensionSupported,
    parse: extensionSupported
      ? await parsePreviewFile(path)
      : { ok: false, reason: `unsupported app-preview extension ${fileExtension(name)}` },
  };
}

function missingFinding(message: string): Finding {
  return { locale: "", rule: "missing-screenshots", severity: "error", message };
}

/** Scan a screenshots root in locale or flat mode. */
export async function scan(root: string, config: Config, options: ScanOptions = {}): Promise<ScanResult> {
  const tree = new Map<string, Omit<TreeEntry, "path">>();
  const readDirectory = async (relative: string) => {
    const dir = join(root, relative);
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (isHidden(entry.name)) continue;
      const kind = await entryKind(dir, entry);
      if (kind) tree.set(relative ? `${relative}/${entry.name}` : entry.name, { kind });
    }
  };
  try {
    await readDirectory("");
  } catch {
    return { root, mode: "locale", locales: [], diagnostics: [missingFinding(`screenshots folder not found: ${root}`)] };
  }
  // Determine mode before enumerating children: flat scans never enter folders.
  const topPlan = planScan(root, [...tree.keys()], path => tree.get(path)!, config, options.forceFlat);
  if (topPlan.mode === "locale") {
    for (const [path, entry] of [...tree]) {
      if (entry.kind !== "dir" || config.locales.ignore.includes(path)) continue;
      try { await readDirectory(path); }
      catch (error) { entry.readError = (error as Error).message; }
    }
  }
  const plan = planScan(root, [...tree.keys()], path => tree.get(path)!, config, options.forceFlat);
  const locales = [];
  for (const locale of plan.locales) {
    const files: ScreenshotFile[] = [];
    const previews: PreviewFile[] = [];
    for (const path of locale.images) files.push(await scanImage(join(root, dirname(path)), basename(path), locale.locale));
    for (const path of locale.previews) previews.push(await scanPreview(join(root, dirname(path)), basename(path), locale.locale));
    locales.push({ locale: locale.locale, isKnownLocale: locale.isKnownLocale, files, previews, unexpectedFiles: locale.unexpectedFiles });
  }
  return { root, mode: plan.mode, locales, diagnostics: plan.diagnostics };
}

/**
 * Locale folders of a deliver metadata tree, for the `--metadata`
 * cross-check. Excludes the metadata-only `default/` fallback and the
 * non-locale folders (review information).
 */
export async function listMetadataLocales(metadataRoot: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(metadataRoot, { withFileTypes: true });
  } catch {
    throw new Error(`metadata folder not found: ${metadataRoot}`);
  }
  return entries
    .filter((entry) => entry.isDirectory() && !isHidden(entry.name))
    .map((entry) => entry.name)
    .filter((name) => name !== "default" && !NON_LOCALE_FOLDERS.has(name))
    .sort((a, b) => a.localeCompare(b));
}
