import { fileExtension, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "./media.ts";
import { isKnownLocale } from "./locales.ts";
import type { Config, Finding, ScanResult } from "./types.ts";

export interface TreeEntry {
  /** Slash-separated path relative to the selected root. */
  path: string;
  kind: "file" | "dir" | "broken";
  readError?: string;
}

interface PlannedLocale {
  locale: string;
  isKnownLocale: boolean;
  images: string[];
  previews: string[];
  unexpectedFiles: string[];
}

const isMedia = (path: string) => IMAGE_EXTENSIONS.has(fileExtension(path)) || VIDEO_EXTENSIONS.has(fileExtension(path));

/** Pure tree policy. Adapters provide paths and a metadata reader, never file payloads. */
export function planScan(
  root: string,
  paths: readonly string[],
  readEntry: (path: string) => Omit<TreeEntry, "path">,
  config: Config,
  forceFlat = false,
): { root: string; mode: ScanResult["mode"]; locales: PlannedLocale[]; diagnostics: Finding[] } {
  const entries = paths.filter(path => !path.split("/").some(part => part.startsWith(".")))
    .map(path => ({ path, ...readEntry(path) })).sort((a, b) => a.path.localeCompare(b.path));
  const top = entries.filter(entry => !entry.path.includes("/"));
  const dirs = top.filter(entry => entry.kind === "dir");
  const rootAssets = top.some(entry => entry.kind === "file" && isMedia(entry.path));
  const mode = !forceFlat && (dirs.some(entry => entry.path === "default" || isKnownLocale(entry.path, config)) || (dirs.length > 0 && !rootAssets)) ? "locale" : "flat";
  const locales: PlannedLocale[] = [];
  const diagnostics: Finding[] = [];
  const missing = (message: string) => diagnostics.push({ locale: "", rule: "missing-screenshots", severity: "error", message });
  const folder = (locale: string, children: TreeEntry[], foldersAsUnexpected: boolean): PlannedLocale => {
    const result: PlannedLocale = { locale, isKnownLocale: mode === "flat" || (locale !== "default" && isKnownLocale(locale, config)), images: [], previews: [], unexpectedFiles: [] };
    for (const entry of children) {
      const name = entry.path.split("/").at(-1)!;
      if (entry.kind === "dir") {
        if (foldersAsUnexpected) result.unexpectedFiles.push(`${name}/`);
      } else if (entry.kind === "broken") result.unexpectedFiles.push(name);
      else if (IMAGE_EXTENSIONS.has(fileExtension(name))) result.images.push(entry.path);
      else if (VIDEO_EXTENSIONS.has(fileExtension(name))) result.previews.push(entry.path);
      else result.unexpectedFiles.push(name);
    }
    return result;
  };
  if (mode === "flat") {
    const locale = folder("", top, false);
    locales.push(locale);
    if (!locale.images.length && !locale.previews.length) missing(`no screenshots or app previews found in ${root}`);
  } else {
    for (const dir of dirs) {
      if (config.locales.ignore.includes(dir.path)) continue;
      if (dir.readError !== undefined) {
        diagnostics.push({ locale: dir.path, rule: "screenshot-unreadable", severity: "error", message: `locale folder could not be read: ${dir.readError}` });
        continue;
      }
      locales.push(folder(dir.path, entries.filter(entry => entry.path.startsWith(`${dir.path}/`) && entry.path.split("/").length === 2), true));
    }
    const loose = top.filter(entry => entry.kind !== "dir");
    if (loose.length) locales.push(folder("", loose, false));
    if (!locales.length && !diagnostics.length) missing(`no screenshots found in ${root}`);
  }
  return { root, mode, locales, diagnostics };
}

/** Browser File inputs do not represent empty directories; infer nonempty ancestors. */
export function fileTree(paths: readonly string[]): Map<string, Omit<TreeEntry, "path">> {
  const entries = new Map<string, Omit<TreeEntry, "path">>();
  for (const path of paths) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) entries.set(parts.slice(0, i).join("/"), { kind: "dir" });
    entries.set(path, { kind: "file" });
  }
  return entries;
}
