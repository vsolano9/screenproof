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

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

import { parseImageHeader } from "./imageheader.ts";
import { parsePreviewFile } from "./previewheader.ts";
import { isKnownLocale, NON_LOCALE_FOLDERS } from "./locales.ts";
import type { Config, Finding, LocaleScan, PreviewFile, ScanResult, ScreenshotFile } from "./types.ts";

export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([".png", ".jpg", ".jpeg"]);
export const PREVIEW_EXTENSIONS: ReadonlySet<string> = new Set([".mov", ".m4v", ".mp4"]);
const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  ...PREVIEW_EXTENSIONS,
  ".3gp",
  ".avi",
  ".flv",
  ".mkv",
  ".m2ts",
  ".mpeg",
  ".mpg",
  ".mts",
  ".ogv",
  ".ts",
  ".webm",
  ".wmv",
]);

export interface ScanOptions {
  /** Treat the root as a flat folder of media even if locale folders exist. */
  forceFlat?: boolean;
}

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(name).toLowerCase());
}

function isPreviewFile(name: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(name).toLowerCase());
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
  try {
    parse = parseImageHeader(new Uint8Array(await readFile(path)));
  } catch (err) {
    parse = { ok: false, reason: `could not read file: ${(err as Error).message}` };
  }
  return { path, name, locale, parse };
}

async function scanPreview(dir: string, name: string, locale: string): Promise<PreviewFile> {
  const path = join(dir, name);
  const extensionSupported = PREVIEW_EXTENSIONS.has(extname(name).toLowerCase());
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
      : { ok: false, reason: `unsupported app-preview extension ${extname(name).toLowerCase()}` },
  };
}

interface FolderScan {
  files: ScreenshotFile[];
  previews: PreviewFile[];
  unexpectedFiles: string[];
}

async function scanFiles(
  dir: string,
  locale: string,
  entries: DirEntry[],
  options: { foldersAsUnexpected: boolean },
): Promise<FolderScan> {
  const files: ScreenshotFile[] = [];
  const previews: PreviewFile[] = [];
  const unexpectedFiles: string[] = [];
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    if (isHidden(entry.name)) continue;
    const kind = await entryKind(dir, entry);
    if (kind === "dir") {
      if (options.foldersAsUnexpected) unexpectedFiles.push(`${entry.name}/`);
      continue;
    }
    if (kind === "broken") {
      unexpectedFiles.push(entry.name);
      continue;
    }
    if (kind !== "file") continue;
    if (isImageFile(entry.name)) {
      files.push(await scanImage(dir, entry.name, locale));
    } else if (isPreviewFile(entry.name)) {
      previews.push(await scanPreview(dir, entry.name, locale));
    } else {
      unexpectedFiles.push(entry.name);
    }
  }
  return { files, previews, unexpectedFiles };
}

function missingFinding(message: string): Finding {
  return { locale: "", rule: "missing-screenshots", severity: "error", message };
}

/** Scan a screenshots root in locale or flat mode. */
export async function scan(root: string, config: Config, options: ScanOptions = {}): Promise<ScanResult> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return {
      root,
      mode: "locale",
      locales: [],
      diagnostics: [missingFinding(`screenshots folder not found: ${root}`)],
    };
  }

  const visible = entries.filter((entry) => !isHidden(entry.name));
  const kinds = new Map<string, EntryKind>();
  for (const entry of visible) {
    kinds.set(entry.name, await entryKind(root, entry));
  }
  const dirs = visible
    .filter((entry) => kinds.get(entry.name) === "dir")
    .sort((a, b) => a.name.localeCompare(b.name));

  // Locale mode when any folder is a recognized locale, or when the root is
  // folders-only (no loose images): a deliver tree with misspelled locale
  // folders must still scan as a tree so the unknown-locale rule can fire,
  // instead of being mistaken for an empty flat folder.
  const rootAssets = visible.some(
    (entry) => kinds.get(entry.name) === "file" && (isImageFile(entry.name) || isPreviewFile(entry.name)),
  );
  const localeMode =
    !options.forceFlat &&
    (dirs.some((dir) => dir.name === "default" || isKnownLocale(dir.name, config)) ||
      (dirs.length > 0 && !rootAssets));

  if (!localeMode) {
    const { files, previews, unexpectedFiles } = await scanFiles(root, "", visible, {
      foldersAsUnexpected: false,
    });
    const diagnostics: Finding[] =
      files.length === 0 && previews.length === 0
        ? [missingFinding(`no screenshots or app previews found in ${root}`)]
        : [];
    return {
      root,
      mode: "flat",
      locales: [{ locale: "", isKnownLocale: true, files, previews, unexpectedFiles }],
      diagnostics,
    };
  }

  const locales: LocaleScan[] = [];
  const diagnostics: Finding[] = [];
  for (const dir of dirs) {
    if (config.locales.ignore.includes(dir.name)) continue;
    const dirPath = join(root, dir.name);
    let children;
    try {
      children = await readdir(dirPath, { withFileTypes: true });
    } catch (err) {
      diagnostics.push({
        locale: dir.name,
        rule: "screenshot-unreadable",
        severity: "error",
        message: `locale folder could not be read: ${(err as Error).message}`,
      });
      continue;
    }
    const { files, previews, unexpectedFiles } = await scanFiles(dirPath, dir.name, children, {
      foldersAsUnexpected: true,
    });
    locales.push({
      locale: dir.name,
      isKnownLocale: dir.name === "default" ? false : isKnownLocale(dir.name, config),
      files,
      previews,
      unexpectedFiles,
    });
  }

  // Loose visible files directly in the root belong inside locale folders;
  // they land in a synthetic "" entry that validate flags.
  const rootLoose = visible.filter((entry) => {
    const kind = kinds.get(entry.name);
    return kind === "file" || kind === "broken";
  });
  if (rootLoose.length > 0) {
    const { files, previews, unexpectedFiles } = await scanFiles(root, "", rootLoose, {
      foldersAsUnexpected: false,
    });
    if (files.length > 0 || previews.length > 0 || unexpectedFiles.length > 0) {
      locales.push({ locale: "", isKnownLocale: false, files, previews, unexpectedFiles });
    }
  }

  if (locales.length === 0 && diagnostics.length === 0) {
    diagnostics.push(missingFinding(`no screenshots found in ${root}`));
  }
  return { root, mode: "locale", locales, diagnostics };
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
