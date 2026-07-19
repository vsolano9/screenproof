/**
 * Validation rules over a scanned screenshots tree.
 *
 * Each rule's severity comes from `config.rules` (built-in defaults in
 * config.ts); `off` disables a rule. Scan-level diagnostics (missing or empty
 * root) pass through here so config levels apply uniformly.
 */

import { DEFAULT_RULES } from "./config.ts";
import { applyDimensionOverrides, classify, DEFAULT_CLASSES, nearestValidSize } from "./dimensions.ts";
import { isAcceptedPreviewSize } from "./previewdimensions.ts";
import type {
  Config,
  Finding,
  LintReport,
  LocaleReport,
  RuleLevel,
  ScanResult,
  Severity,
} from "./types.ts";

export interface ValidateOptions {
  /** Locale folders of a deliver metadata tree, for the cross-tree check. */
  metadataLocales?: string[] | null;
}

/** Apple's limit: screenshots per device size per localization. */
const MAX_PER_CLASS = 10;
const MAX_PREVIEWS_PER_LOCALE = 3;
const MAX_PREVIEW_BYTES = 500_000_000;
const MIN_PREVIEW_SECONDS = 15;
const MAX_PREVIEW_SECONDS = 30;

const PRIMARY_BY_PLATFORM: ReadonlyArray<{ platform: string; classId: string; message: string }> = [
  {
    platform: "iphone",
    classId: "iphone-6.9",
    message: "iPhone screenshots present but none at the current primary size (iPhone 6.9-inch)",
  },
  {
    platform: "ipad",
    classId: "ipad-13",
    message: "iPad screenshots present but none at the current primary size (iPad 13-inch)",
  },
];

/** Run every rule and assemble the report. */
export function validate(scan: ScanResult, config: Config, options: ValidateOptions = {}): LintReport {
  const classes = applyDimensionOverrides(DEFAULT_CLASSES, config.dimensions);
  const findings: Finding[] = [];

  const levelOf = (rule: string): RuleLevel =>
    config.rules[rule] ?? DEFAULT_RULES[rule] ?? "warning";

  const emit = (rule: string, locale: string, message: string, file?: string): void => {
    const level = levelOf(rule);
    if (level === "off") return;
    findings.push({ locale, ...(file !== undefined ? { file } : {}), rule, severity: level as Severity, message });
  };

  for (const diagnostic of scan.diagnostics) {
    emit(diagnostic.rule, diagnostic.locale, diagnostic.message, diagnostic.file);
  }

  /** Device-class ids present per real locale, for parity. */
  const classIdsByLocale = new Map<string, Set<string>>();

  for (const locale of scan.locales) {
    const isSyntheticRoot = scan.mode === "locale" && locale.locale === "";

    for (const name of locale.unexpectedFiles) {
      emit("screenshot-unexpected-file", locale.locale, "unexpected non-image file in screenshots folder", name);
    }

    if (isSyntheticRoot) {
      // Loose files directly in the screenshots root: deliver only reads
      // locale folders, so every file here is a mistake.
      for (const file of locale.files) {
        emit("screenshot-unexpected-file", "", "screenshots must live inside a locale folder", file.name);
      }
      for (const file of locale.previews ?? []) {
        emit("screenshot-unexpected-file", "", "app previews must live inside a locale folder", file.name);
      }
      continue;
    }

    if (scan.mode === "locale" && !locale.isKnownLocale) {
      const message =
        locale.locale === "default"
          ? "deliver has no default/ fallback for screenshots; use real locale folders"
          : `"${locale.locale}" is not a known App Store locale folder`;
      emit("screenshot-unknown-locale", locale.locale, message);
    }

    // Locale-level rules (empty locale, per-localization count cap, primary
    // size, parity) only make sense over deliver locale folders; flat mode is
    // documented as file-level checks only.
    const localeRules = scan.mode === "locale";

    const previews = locale.previews ?? [];
    if (localeRules && locale.files.length === 0 && previews.length === 0) {
      emit("screenshot-locale-empty", locale.locale, "locale folder has no screenshots or app previews");
    }

    const countByClass = new Map<string, { label: string; count: number }>();
    const presentPlatforms = new Set<string>();
    const presentClassIds = new Set<string>();

    for (const file of locale.files) {
      if (!file.parse.ok) {
        emit("screenshot-format", locale.locale, `cannot parse image header: ${file.parse.reason}`, file.name);
        continue;
      }
      const { width, height, format, hasAlpha } = file.parse.info;

      if (format === "png" && hasAlpha) {
        emit(
          "screenshot-png-alpha",
          locale.locale,
          "PNG has an alpha channel; App Store Connect may reject transparency",
          file.name,
        );
      }

      const deviceClass = classify(width, height, file.path, classes);
      if (deviceClass === null) {
        const nearest = nearestValidSize(width, height, classes);
        const suffix = nearest
          ? `; closest is ${nearest.size.width}x${nearest.size.height} (${nearest.label}, ${nearest.orientation})`
          : "";
        emit(
          "screenshot-unknown-dimensions",
          locale.locale,
          `${width}x${height} does not match any known App Store screenshot size${suffix}`,
          file.name,
        );
        continue;
      }

      const entry = countByClass.get(deviceClass.id) ?? { label: deviceClass.label, count: 0 };
      entry.count += 1;
      countByClass.set(deviceClass.id, entry);
      presentPlatforms.add(deviceClass.platform);
      presentClassIds.add(deviceClass.id);
    }

    for (const file of previews) {
      if (file.sizeBytes > MAX_PREVIEW_BYTES) {
        emit(
          "preview-file-size",
          locale.locale,
          `${file.sizeBytes} bytes exceeds Apple's 500 MB app-preview limit`,
          file.name,
        );
      }
      if (!file.extensionSupported || !file.parse.ok) {
        const reason = file.parse.ok ? "unsupported app-preview extension" : file.parse.reason;
        emit("preview-format", locale.locale, `cannot parse app preview: ${reason}`, file.name);
        continue;
      }
      const { durationSeconds, width, height } = file.parse.info;
      if (durationSeconds < MIN_PREVIEW_SECONDS || durationSeconds > MAX_PREVIEW_SECONDS) {
        emit(
          "preview-duration",
          locale.locale,
          `${durationSeconds.toFixed(3).replace(/\.?0+$/, "")} seconds is outside Apple's 15 to 30 second range`,
          file.name,
        );
      }
      if (!isAcceptedPreviewSize(width, height)) {
        emit(
          "preview-resolution",
          locale.locale,
          `${width}x${height} does not match any accepted App Store app-preview resolution`,
          file.name,
        );
      }
    }

    if (localeRules) {
      if (previews.length > MAX_PREVIEWS_PER_LOCALE) {
        emit(
          "preview-count-over",
          locale.locale,
          `${previews.length} app previews in this localization (max ${MAX_PREVIEWS_PER_LOCALE})`,
        );
      }
      for (const { label, count } of countByClass.values()) {
        if (count > MAX_PER_CLASS) {
          emit(
            "screenshot-count-over",
            locale.locale,
            `${count} screenshots for ${label} (max ${MAX_PER_CLASS} per device size per localization)`,
          );
        }
      }

      for (const primary of PRIMARY_BY_PLATFORM) {
        if (presentPlatforms.has(primary.platform) && !presentClassIds.has(primary.classId)) {
          emit("screenshot-primary-size-missing", locale.locale, primary.message);
        }
      }

      if (locale.locale !== "default") {
        classIdsByLocale.set(locale.locale, presentClassIds);
      }
    }
  }

  if (scan.mode === "locale" && options.metadataLocales) {
    const present = new Set(scan.locales.map((l) => l.locale));
    for (const name of options.metadataLocales) {
      if (!present.has(name)) {
        emit("screenshot-locale-empty", name, `metadata locale ${name} has no screenshots folder`);
      }
    }
  }

  const union = new Set<string>();
  for (const ids of classIdsByLocale.values()) {
    for (const id of ids) union.add(id);
  }
  for (const [name, ids] of classIdsByLocale) {
    const missing = [...union].filter((id) => !ids.has(id)).sort();
    if (missing.length > 0) {
      emit(
        "screenshot-locale-parity",
        name,
        `missing device classes present in other locales: ${missing.join(", ")}`,
      );
    }
  }

  return assemble(scan, findings);
}

function assemble(scan: ScanResult, findings: Finding[]): LintReport {
  const sortFindings = (a: Finding, b: Finding): number =>
    a.rule.localeCompare(b.rule) || (a.file ?? "").localeCompare(b.file ?? "") || a.message.localeCompare(b.message);

  // Ordered locale keys: scan order first (skipping the locale-mode root
  // pseudo-locale ""), then any extra finding locales (metadata cross-check).
  const orderedLocales: string[] = [];
  for (const locale of scan.locales) {
    if (scan.mode === "locale" && locale.locale === "") continue;
    orderedLocales.push(locale.locale);
  }
  const known = new Set(orderedLocales);
  const extras = [...new Set(findings.map((f) => f.locale))]
    .filter((locale) => !known.has(locale) && !(scan.mode === "locale" && locale === ""))
    .sort((a, b) => a.localeCompare(b));
  orderedLocales.push(...extras);

  const locales: LocaleReport[] = orderedLocales.map((name) => {
    const own = findings.filter((f) => f.locale === name && !(scan.mode === "locale" && name === "")).sort(sortFindings);
    return { locale: name, findings: own, ok: own.every((f) => f.severity !== "error") };
  });

  const reportLevel = scan.mode === "locale" ? findings.filter((f) => f.locale === "").sort(sortFindings) : [];
  const flattened = [...locales.flatMap((l) => l.findings), ...reportLevel];

  const count = (severity: Severity): number => flattened.filter((f) => f.severity === severity).length;
  const errorCount = count("error");

  return {
    root: scan.root,
    mode: scan.mode,
    locales,
    findings: flattened,
    errorCount,
    warningCount: count("warning"),
    infoCount: count("info"),
    ok: errorCount === 0,
  };
}
