/**
 * Rendering and exit-code policy for a {@link LintReport}.
 *
 * Human output is CI-log friendly: it uses text markers and severity words (no
 * colour-only signalling), with optional ANSI colour that is disabled under
 * `NO_COLOR` or `--no-color`. JSON output is the same data the API returns.
 */

import { paint as themePaint, type Role } from "./colors.generated.ts";
import type { LintReport } from "./types.ts";

export interface HumanOptions {
  /** Enable ANSI colour. Defaults to false. */
  color?: boolean;
  /** Hide clean locales and info findings. */
  quiet?: boolean;
}

function paint(text: string, role: Role, color: boolean): string {
  if (!color) return text;
  return themePaint(text, role);
}

/** Pretty JSON, matching the programmatic report shape. */
export function renderJson(report: LintReport): string {
  return JSON.stringify(report, null, 2);
}

function severityCounts(report: LintReport): string {
  const parts = [
    `${report.errorCount} error${report.errorCount === 1 ? "" : "s"}`,
    `${report.warningCount} warning${report.warningCount === 1 ? "" : "s"}`,
    `${report.infoCount} info`,
  ];
  return parts.join(", ");
}

/** Render a human-readable report. */
export function renderHuman(report: LintReport, options: HumanOptions = {}): string {
  const color = options.color ?? false;
  const quiet = options.quiet ?? false;
  const lines: string[] = [];
  const visibleFinding = (finding: LintReport["findings"][number]): boolean =>
    !quiet || finding.severity !== "info";

  const modeSuffix = report.mode === "flat" ? "  (flat mode)" : "";
  lines.push(paint(`screenproof  ${report.root}${modeSuffix}`, "muted", color));
  lines.push("");

  for (const locale of report.locales) {
    const visible = locale.findings.filter(visibleFinding);
    if (quiet && visible.length === 0) continue;

    const label = locale.locale === "" ? "." : locale.locale;
    if (locale.ok && visible.length === 0) {
      lines.push(`${paint("✓", "success", color)} ${label}  ok`);
      continue;
    }

    const marker = locale.ok ? paint("✓", "success", color) : paint("✖", "error", color);
    lines.push(`${marker} ${label}`);
    for (const finding of visible) {
      const fileLabel = finding.file ?? "-";
      const sev = paint(finding.severity.padEnd(7), finding.severity, color);
      lines.push(`    ${sev} ${fileLabel.padEnd(24)} ${finding.message}`);
    }
  }

  // Report-level findings: locale "" in locale mode (missing root, stray
  // root files). In flat mode "" is a real locale section above. The glyph
  // tracks severity; ✖ is reserved for errors.
  const reportLevel =
    report.mode === "locale"
      ? report.findings.filter((finding) => finding.locale === "" && visibleFinding(finding))
      : [];
  for (const finding of reportLevel) {
    const sev = paint(finding.severity.padEnd(7), finding.severity, color);
    const glyph =
      finding.severity === "error"
        ? paint("✖", "error", color)
        : paint("!", finding.severity, color);
    const fileLabel = finding.file ?? "-";
    lines.push(`${glyph} ${sev} ${fileLabel.padEnd(24)} ${finding.message}`);
  }

  if (report.unverifiedChecks.length > 0) {
    lines.push("");
    lines.push(paint("Unverified checks:", "warning", color));
    for (const check of report.unverifiedChecks) {
      const location = [check.locale, check.file].filter(Boolean).join("/");
      lines.push(`    ? ${location.padEnd(24)} ${check.check}: ${check.reason}`);
    }
  }

  lines.push("");
  const verdict =
    report.gate === "fail"
      ? paint("FAIL", "error", color)
      : report.gate === "pass-with-warnings"
        ? paint("PASS WITH WARNINGS", "warning", color)
        : paint("PASS", "success", color);
  lines.push(
    `Summary: ${severityCounts(report)} across ${report.locales.length} locale${report.locales.length === 1 ? "" : "s"} - ${verdict}`,
  );

  return lines.join("\n");
}

/** Process exit code from the effective gate, with a strict override for callers that compute a non-strict report. */
export function exitCode(report: LintReport, strict: boolean): number {
  if (report.gate === "fail") return 1;
  if (strict && report.warningCount > 0) return 1;
  return 0;
}
