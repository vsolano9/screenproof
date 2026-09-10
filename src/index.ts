/**
 * screenproof programmatic API.
 *
 * The CLI is a thin layer over these functions; `--json` output matches the
 * shapes returned here.
 */

export { defaultConfig, DEFAULT_RULES, loadConfig, mergeConfig } from "./config.ts";
export {
  applyDimensionOverrides,
  classify,
  DEFAULT_CLASSES,
  nearestValidSize,
  VERIFIED_ON,
} from "./dimensions.ts";
export { parseImageHeader } from "./imageheader.ts";
export { inspectBrowserFixtures } from "./browser.ts";
export type { BrowserFixtureInput } from "./browser.ts";
export { parsePreviewFile } from "./previewfile.ts";
export { parsePreviewHeader } from "./previewheader.ts";
export {
  classifyPreviewSize,
  isAcceptedPreviewSize,
  PREVIEW_SIZE_CLASSES,
  PREVIEW_SIZES,
  PREVIEW_SPEC_URL,
  PREVIEW_VERIFIED_ON,
} from "./previewdimensions.ts";
export type { PreviewSizeClass } from "./previewdimensions.ts";
export { isKnownLocale, KNOWN_LOCALES, NON_LOCALE_FOLDERS } from "./locales.ts";
export { IMAGE_EXTENSIONS, PREVIEW_EXTENSIONS } from "./media.ts";
export { exitCode, renderHuman, renderJson } from "./report.ts";
export { listMetadataLocales, scan } from "./scan.ts";
export { validate } from "./validate.ts";
export type {
  AvcConfig,
  Config,
  DeviceClass,
  DimensionOverrides,
  Finding,
  ImageInfo,
  LintReport,
  LocaleReport,
  LocaleScan,
  Orientation,
  ParseResult,
  Platform,
  PreviewAudioTrack,
  PreviewFile,
  PreviewInfo,
  PreviewParseResult,
  RuleLevel,
  ScanResult,
  ScreenshotFile,
  Severity,
  Size,
} from "./types.ts";
