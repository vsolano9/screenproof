/**
 * Screenshots tree scanner.
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

import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { parseImageHeader } from "./imageheader.ts";
import { isKnownLocale, NON_LOCALE_FOLDERS } from "./locales.ts";
import type { Config, Finding, LocaleScan, ScanResult, ScreenshotFile } from "./types.ts";

export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([".png", ".jpg", ".jpeg"]);

export interface ScanOptions {
  /** Treat the root as a flat folder of images even if locale folders exist. */
  forceFlat?: boolean;
}

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(name).toLowerCase());
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

interface FolderScan {
  files: ScreenshotFile[];
  unexpectedFiles: string[];
}

async function scanFiles(
  dir: string,
  locale: string,
  entries: { name: string; isFile(): boolean; isDirectory(): boolean }[],
  options: { foldersAsUnexpected: boolean },
): Promise<FolderScan> {
  const files: ScreenshotFile[] = [];
  const unexpectedFiles: string[] = [];
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    if (isHidden(entry.name)) continue;
    if (entry.isDirectory()) {
      if (options.foldersAsUnexpected) unexpectedFiles.push(`${entry.name}/`);
      continue;
    }
    if (!entry.isFile()) continue;
    if (isImageFile(entry.name)) {
      files.push(await scanImage(dir, entry.name, locale));
    } else {
      unexpectedFiles.push(entry.name);
    }
  }
  return { files, unexpectedFiles };
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
  const dirs = visible
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const localeMode =
    !options.forceFlat &&
    dirs.some((dir) => dir.name === "default" || isKnownLocale(dir.name, config));

  if (!localeMode) {
    const { files, unexpectedFiles } = await scanFiles(root, "", visible, {
      foldersAsUnexpected: false,
    });
    const diagnostics: Finding[] = files.length === 0 ? [missingFinding(`no screenshots found in ${root}`)] : [];
    return {
      root,
      mode: "flat",
      locales: [{ locale: "", isKnownLocale: true, files, unexpectedFiles }],
      diagnostics,
    };
  }

  const locales: LocaleScan[] = [];
  for (const dir of dirs) {
    if (config.locales.ignore.includes(dir.name)) continue;
    const dirPath = join(root, dir.name);
    const children = await readdir(dirPath, { withFileTypes: true });
    const { files, unexpectedFiles } = await scanFiles(dirPath, dir.name, children, {
      foldersAsUnexpected: true,
    });
    locales.push({
      locale: dir.name,
      isKnownLocale: dir.name === "default" ? false : isKnownLocale(dir.name, config),
      files,
      unexpectedFiles,
    });
  }

  // Loose visible files directly in the root belong inside locale folders;
  // they land in a synthetic "" entry that validate flags.
  const rootLoose = visible.filter((entry) => entry.isFile());
  if (rootLoose.length > 0) {
    const { files, unexpectedFiles } = await scanFiles(root, "", rootLoose, {
      foldersAsUnexpected: false,
    });
    if (files.length > 0 || unexpectedFiles.length > 0) {
      locales.push({ locale: "", isKnownLocale: false, files, unexpectedFiles });
    }
  }

  const diagnostics: Finding[] =
    locales.length === 0 ? [missingFinding(`no screenshots found in ${root}`)] : [];
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
