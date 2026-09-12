import { classify, DEFAULT_CLASSES } from "../../src/dimensions.ts";
import { classifyPreviewSize } from "../../src/previewdimensions.ts";
import type {
  Finding,
  LintReport,
  ScanResult,
  UnverifiedCheck,
} from "../../src/types.ts";

export type AssetStatus = "pass" | "review" | "fail" | "skipped";
export interface AssetRow {
  id: number;
  path: string;
  name: string;
  locale: string;
  device: string;
  dimensions: string;
  kind: "Screenshot" | "Preview";
  status: AssetStatus;
  findings: Finding[];
  unverified: UnverifiedCheck[];
}
export function assetRows(scan: ScanResult, report: LintReport): AssetRow[] {
  const rows: AssetRow[] = [];
  for (const locale of scan.locales) {
    const skipped = scan.mode === "locale" && locale.locale === "";
    for (const file of [...locale.files, ...(locale.previews ?? [])]) {
      const preview = "sizeBytes" in file;
      const info = file.parse.ok ? file.parse.info : null;
      const device = info
        ? ((preview
            ? classifyPreviewSize(info.width, info.height)
            : classify(info.width, info.height, file.path, DEFAULT_CLASSES)
          )?.label ?? "Unrecognized size")
        : "Unreadable metadata";
      const findings = report.findings.filter(
        (f) =>
          (f.locale === locale.locale &&
            (!f.file || f.file === file.name || f.file === file.path)) ||
          (f.locale === "" && (!f.file || f.file === file.path)),
      );
      const unverified = report.unverifiedChecks.filter(
        (f) => f.locale === locale.locale && (!f.file || f.file === file.name),
      );
      const status: AssetStatus = skipped
        ? "skipped"
        : findings.some((f) => f.severity === "error")
          ? "fail"
          : findings.some((f) => f.severity === "warning") ||
              unverified.length > 0
            ? "review"
            : "pass";
      rows.push({
        id: rows.length,
        path: file.path,
        name: file.name,
        locale: locale.locale,
        device,
        dimensions: info ? `${info.width} × ${info.height}` : "Not readable",
        kind: preview ? "Preview" : "Screenshot",
        status,
        findings,
        unverified,
      });
    }
  }
  return rows;
}
export function presentation(report: LintReport): {
  state: "pass" | "review" | "fail";
  label: string;
  title: string;
  detail: string;
} {
  if (report.gate === "fail")
    return {
      state: "fail",
      label: "FAIL",
      title: "Fix before submitting",
      detail: `${report.errorCount} blocking ${report.errorCount === 1 ? "issue needs" : "issues need"} attention. Review the findings below.`,
    };
  if (report.warningCount || report.unverifiedChecks.length)
    return {
      state: "review",
      label: report.warningCount
        ? "PASS WITH WARNINGS"
        : "PASS · CHECKS INCOMPLETE",
      title: "Review recommended",
      detail:
        "No blocking rule fired. Review warnings and anything the metadata could not verify.",
    };
  return {
    state: "pass",
    label: "PASS",
    title: "Local checks passed",
    detail:
      "No enabled error or warning rule fired. App Store approval is not guaranteed.",
  };
}
