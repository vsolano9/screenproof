import { parseImageHeader } from "./imageheader.ts";
import { fileExtension, IMAGE_EXTENSIONS, PREVIEW_EXTENSIONS, VIDEO_EXTENSIONS } from "./media.ts";
import { isKnownLocale } from "./locales.ts";
import { parsePreviewHeader } from "./previewheader.ts";
import { defaultConfig } from "./rules.ts";
import type { Config, Finding, LintReport, LocaleScan, PreviewFile, ScanResult, ScreenshotFile } from "./types.ts";
import { validate } from "./validate.ts";

export interface BrowserFixtureInput {
  /** Basename shown in findings. */
  name: string;
  /** Optional relative folder path, such as `en-US/01.png`. */
  path?: string;
  bytes: Uint8Array;
  /** Original file size when `bytes` contains only a bounded read. */
  sizeBytes?: number;
}

/**
 * Inspect already-read browser files with the same parsers, rules, severities,
 * and Apple-style messages as the CLI. This function performs no I/O.
 */
export function inspectBrowserFixtures(inputs: readonly BrowserFixtureInput[]): LintReport {
  const config = defaultConfig();
  const visible = inputs
    .map((input) => ({
      ...input,
      path: (input.path ?? input.name).replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, ""),
    }))
    .filter((input) => !input.name.startsWith("."));
  const mode = visible.some((input) => input.path.includes("/")) ? "locale" : "flat";
  const diagnostics: Finding[] = [];

  if (visible.length === 0) {
    diagnostics.push({
      locale: "",
      rule: "missing-screenshots",
      severity: "error",
      message: "screenshots folder is empty",
    });
  }

  const grouped = new Map<string, BrowserFixtureInput[]>();
  for (const input of visible) {
    const slash = input.path.indexOf("/");
    const locale = mode === "locale" && slash >= 0 ? input.path.slice(0, slash) : "";
    const group = grouped.get(locale) ?? [];
    group.push(input);
    grouped.set(locale, group);
  }

  const locales: LocaleScan[] = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([locale, entries]) => buildLocaleScan(locale, entries, mode, config));
  const scan: ScanResult = { root: "browser", mode, locales, diagnostics };
  return validate(scan, config);
}

function buildLocaleScan(
  locale: string,
  entries: readonly BrowserFixtureInput[],
  mode: ScanResult["mode"],
  config: Config,
): LocaleScan {
  const files: ScreenshotFile[] = [];
  const previews: PreviewFile[] = [];
  const unexpectedFiles: string[] = [];

  for (const input of entries) {
    const extension = fileExtension(input.name);
    if (IMAGE_EXTENSIONS.has(extension)) {
      files.push({
        path: input.path ?? input.name,
        name: input.name,
        locale,
        parse: parseImageHeader(input.bytes),
      });
      continue;
    }
    if (VIDEO_EXTENSIONS.has(extension)) {
      const extensionSupported = PREVIEW_EXTENSIONS.has(extension);
      previews.push({
        path: input.path ?? input.name,
        name: input.name,
        locale,
        sizeBytes: input.sizeBytes ?? input.bytes.byteLength,
        extensionSupported,
        parse: extensionSupported
          ? parsePreviewHeader(input.bytes)
          : { ok: false, reason: `unsupported app-preview extension ${extension}` },
      });
      continue;
    }
    unexpectedFiles.push(input.name);
  }

  return {
    locale,
    isKnownLocale: mode === "flat" || isKnownLocale(locale, config),
    files,
    previews,
    unexpectedFiles,
  };
}

