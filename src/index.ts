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
export { isKnownLocale, KNOWN_LOCALES, NON_LOCALE_FOLDERS } from "./locales.ts";
export { exitCode, renderHuman, renderJson } from "./report.ts";
export { IMAGE_EXTENSIONS, listMetadataLocales, scan } from "./scan.ts";
export { validate } from "./validate.ts";
export type {
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
  RuleLevel,
  ScanResult,
  ScreenshotFile,
  Severity,
  Size,
} from "./types.ts";
