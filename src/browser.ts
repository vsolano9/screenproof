import { parseImageHeader } from "./imageheader.ts";
import { fileExtension, PREVIEW_EXTENSIONS } from "./media.ts";
import { parsePreviewHeader } from "./previewheader.ts";
import { defaultConfig } from "./rules.ts";
import { fileTree, planScan } from "./scan-tree.ts";
import type { LintReport, ScanResult } from "./types.ts";
import { validate } from "./validate.ts";

export interface BrowserFixtureInput {
  /** Basename shown in findings. */
  name: string;
  /** Path relative to the selected root, such as `en-US/01.png`. */
  path?: string;
  bytes: Uint8Array;
  /** Original file size when `bytes` contains only a bounded read. */
  sizeBytes?: number;
}

/** Inspect already-read browser files with the CLI's tree policy and validators. No I/O. */
export function inspectBrowserFixtures(inputs: readonly BrowserFixtureInput[]): LintReport {
  const config = defaultConfig();
  const files = new Map(inputs.map(input => [
    (input.path ?? input.name).replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, ""), input,
  ]));
  const tree = fileTree([...files.keys()]);
  const plan = planScan("browser", [...tree.keys()], path => tree.get(path)!, config);
  const scan: ScanResult = {
    root: plan.root, mode: plan.mode, diagnostics: plan.diagnostics,
    locales: plan.locales.map(locale => ({
      locale: locale.locale, isKnownLocale: locale.isKnownLocale, unexpectedFiles: locale.unexpectedFiles,
      files: locale.images.map(path => ({ path, name: path.split("/").at(-1)!, locale: locale.locale, parse: parseImageHeader(files.get(path)!.bytes, files.get(path)!.sizeBytes) })),
      previews: locale.previews.map(path => {
        const input = files.get(path)!;
        const extension = fileExtension(path);
        const extensionSupported = PREVIEW_EXTENSIONS.has(extension);
        return { path, name: path.split("/").at(-1)!, locale: locale.locale,
          sizeBytes: input.sizeBytes ?? input.bytes.byteLength, extensionSupported,
          parse: extensionSupported ? parsePreviewHeader(input.bytes) : { ok: false as const, reason: `unsupported app-preview extension ${extension}` },
        };
      }),
    })),
  };
  return validate(scan, config);
}
