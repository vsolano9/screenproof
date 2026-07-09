/**
 * Rendering and exit-code policy for a {@link LintReport}.
 *
 * Human output is CI-log friendly: it uses text markers and severity words (no
 * colour-only signalling), with optional ANSI colour that is disabled under
 * `NO_COLOR` or `--no-color`. JSON output is the same data the API returns.
 */

import type { LintReport, Severity } from "./types.ts";

export interface HumanOptions {
  /** Enable ANSI colour. Defaults to false. */
  color?: boolean;
  /** Hide clean locales and info findings. */
  quiet?: boolean;
}

const COLORS: Record<Severity | "reset" | "dim" | "green", string> = {
  error: "\u001b[31m",
  warning: "\u001b[33m",
  info: "\u001b[36m",
  green: "\u001b[32m",
  dim: "\u001b[2m",
  reset: "\u001b[0m",
};

function paint(text: string, code: string, color: boolean): string {
  return color ? `${code}${text}${COLORS.reset}` : text;
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

  const modeSuffix = report.mode === "flat" ? "  (flat mode)" : "";
  lines.push(paint(`screenproof  ${report.root}${modeSuffix}`, COLORS.dim, color));
  lines.push("");

  for (const locale of report.locales) {
    const visible = quiet
      ? locale.findings.filter((f) => f.severity !== "info")
      : locale.findings;
    if (quiet && visible.length === 0) continue;

    const label = locale.locale === "" ? "." : locale.locale;
    if (locale.ok && visible.length === 0) {
      lines.push(`${paint("✓", COLORS.green, color)} ${label}  ok`);
      continue;
    }

    const marker = locale.ok ? paint("✓", COLORS.green, color) : paint("✖", COLORS.error, color);
    lines.push(`${marker} ${label}`);
    for (const finding of visible) {
      const fileLabel = finding.file ?? "-";
      const sev = paint(finding.severity.padEnd(7), COLORS[finding.severity], color);
      lines.push(`    ${sev} ${fileLabel.padEnd(24)} ${finding.message}`);
    }
  }

  // Report-level findings: locale "" in locale mode (missing root, stray
  // root files). In flat mode "" is a real locale section above.
  const reportLevel =
    report.mode === "locale" ? report.findings.filter((f) => f.locale === "") : [];
  for (const finding of reportLevel) {
    const sev = paint(finding.severity.padEnd(7), COLORS[finding.severity], color);
    lines.push(`${paint("✖", COLORS.error, color)} ${sev} ${finding.message}`);
  }

  lines.push("");
  const verdict = report.ok ? paint("PASS", COLORS.green, color) : paint("FAIL", COLORS.error, color);
  lines.push(
    `Summary: ${severityCounts(report)} across ${report.locales.length} locale${report.locales.length === 1 ? "" : "s"} - ${verdict}`,
  );

  return lines.join("\n");
}

/** Process exit code: non-zero on errors, or on warnings when strict. */
export function exitCode(report: LintReport, strict: boolean): number {
  if (report.errorCount > 0) return 1;
  if (strict && report.warningCount > 0) return 1;
  return 0;
}
