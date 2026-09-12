import { parseImageHeader } from "./imageheader.ts";
import { fileExtension, PREVIEW_EXTENSIONS } from "./media.ts";
import { parsePreviewHeader } from "./previewheader.ts";
import { defaultConfig } from "./rules.ts";
import { fileTree, planScan } from "./scan-tree.ts";
import type { LintReport, ScanResult } from "./types.ts";
import { validate } from "./validate.ts";

export interface BrowserFixtureInput {
  name: string;
  /** Path relative to the selected root, such as en-US/01.png. */
  path?: string;
  bytes: Uint8Array;
  /** Original file size when bytes contains only a bounded read. */
  sizeBytes?: number;
}

/** Inspect once and expose the actual scan for an accurate asset-level UI. */
export function inspectBrowserSelection(inputs: readonly BrowserFixtureInput[]): { scan: ScanResult; report: LintReport } {
  const config = defaultConfig();
  // Equal names can occur in a FileList. Never overwrite an earlier input.
  const files = new Map<string, BrowserFixtureInput[]>();
  for (const input of inputs) {
    const path = (input.path ?? input.name).replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
    const entries = files.get(path) ?? [];
    entries.push(input);
    files.set(path, entries);
  }
  const tree = fileTree([...files.keys()]);
  const plan = planScan("browser", [...tree.keys()], path => tree.get(path)!, config);
  const scan: ScanResult = {
    root: plan.root, mode: plan.mode,
    diagnostics: [
      ...plan.diagnostics,
      ...[...files].filter(([, entries]) => entries.length > 1).map(([path, entries]) => ({
        locale: "", file: path, rule: "screenshot-unreadable", severity: "error" as const,
        message: `${entries.length} selected files have the same path "${path}". No file was discarded. Choose their parent folder to preserve distinct paths, or rename the files.`,
      })),
    ],
    locales: plan.locales.map(locale => ({
      locale: locale.locale, isKnownLocale: locale.isKnownLocale, unexpectedFiles: locale.unexpectedFiles,
      files: locale.images.flatMap(path => files.get(path)!.map(input => ({
        path, name: path.split("/").at(-1)!, locale: locale.locale,
        parse: parseImageHeader(input.bytes, input.sizeBytes),
      }))),
      previews: locale.previews.flatMap(path => files.get(path)!.map(input => {
        const extensionSupported = PREVIEW_EXTENSIONS.has(fileExtension(path));
        return { path, name: path.split("/").at(-1)!, locale: locale.locale,
          sizeBytes: input.sizeBytes ?? input.bytes.byteLength, extensionSupported,
          parse: extensionSupported ? parsePreviewHeader(input.bytes) : { ok: false as const, reason: `unsupported app-preview extension ${fileExtension(path)}` },
        };
      })),
    })),
  };
  return { scan, report: validate(scan, config) };
}

/** Backwards-compatible report-only browser API. */
export function inspectBrowserFixtures(inputs: readonly BrowserFixtureInput[]): LintReport {
  return inspectBrowserSelection(inputs).report;
}
