import { icon, escapeHtml as esc } from "./icons.ts";
import {
  presentation,
  type AssetRow,
  type AssetStatus,
} from "./report-model.ts";
import type { Finding, LintReport } from "../../src/types.ts";
const statusText: Record<AssetStatus, string> = {
  pass: "Passed",
  review: "Review",
  fail: "Blocked",
  skipped: "Not checked",
};
const statusIcon: Record<AssetStatus, string> = {
  pass: "check",
  review: "warning",
  fail: "x",
  skipped: "minus",
};
export interface Filters {
  locale: string;
  device: string;
  search: string;
  issues: boolean;
}
export function reportView(
  report: LintReport,
  rows: AssetRow[],
  selected: number,
): string {
  const state = presentation(report);
  const checked = rows.filter((row) => row.status !== "skipped").length;
  const clear = rows.filter((row) => row.status === "pass").length;
  const options = (values: string[]) =>
    [...new Set(values)]
      .sort()
      .map(
        (value) =>
          `<option value="${esc(value)}">${esc(value || "No locale / flat files")}</option>`,
      )
      .join("");
  return `<div class="verdict is-${state.state}" data-testid="verdict"><span class="verdict-icon">${icon(statusIcon[state.state])}</span><div><span class="verdict-label">${state.label}</span><h3>${state.title}</h3><p>${state.detail}</p></div></div>
    <div class="metrics">${[
      ["file", checked, "assets checked", "neutral"],
      ["x", report.errorCount, "errors", "fail"],
      ["warning", report.warningCount, "warnings", "review"],
      ["check", clear, "clear assets", "pass"],
    ]
      .map(
        ([symbol, value, label, status]) =>
          `<div class="metric"><span class="metric-icon ${status}">${icon(String(symbol))}</span><span><strong>${value}</strong><small>${label}</small></span></div>`,
      )
      .join("")}</div>
    <p class="scope-note">${selected} selected · ${report.mode === "locale" ? "Locale folder checks enabled" : "Flat files: locale counts not checked"}${selected > checked ? ` · ${selected - checked} not inspected` : ""}</p>
    <div class="findings-heading"><h3>Findings</h3><div class="view-switch" aria-label="Report view"><button data-view="issues" aria-pressed="${report.findings.length > 0 || report.unverifiedChecks.length > 0}">Issues</button><button data-view="all" aria-pressed="${report.findings.length === 0 && report.unverifiedChecks.length === 0}">All assets</button></div></div>
    <div class="report-filters"><label><span class="sr-only">Filter locale</span><select id="filter-locale"><option value="*">All locales</option>${options(rows.map((row) => row.locale))}</select></label><label><span class="sr-only">Filter device</span><select id="filter-device"><option value="*">All devices</option>${options(rows.map((row) => row.device))}</select></label><label class="search-field">${icon("search")}<span class="sr-only">Search assets</span><input id="filter-search" type="search" placeholder="Search assets…"></label></div>
    <div id="finding-list"></div>
    ${report.unverifiedChecks.length ? `<details class="unverified" open><summary>${icon("info")}${report.unverifiedChecks.length} checks could not be verified</summary><ul>${report.unverifiedChecks.map((check) => `<li><strong>${esc(check.file ?? check.locale)}</strong>: ${esc(check.reason)} <code>${esc(check.check)}</code></li>`).join("")}</ul></details>` : ""}`;
}
function finding(f: Finding): string {
  return `<div class="finding ${f.severity}">${icon(f.severity === "error" ? "x" : f.severity === "warning" ? "warning" : "info")}<div><p>${esc(f.message)}</p><code>${esc(f.rule)}</code></div></div>`;
}
export function filteredFindings(
  rows: AssetRow[],
  report: LintReport,
  filter: Filters,
): string {
  const search = filter.search.trim().toLocaleLowerCase();
  const visible = rows.filter(
    (row) =>
      (filter.locale === "*" || row.locale === filter.locale) &&
      (filter.device === "*" || row.device === filter.device) &&
      (!filter.issues || row.status !== "pass") &&
      `${row.path} ${row.device} ${row.status}`
        .toLocaleLowerCase()
        .includes(search),
  );
  const groups = new Map<string, AssetRow[]>();
  for (const row of visible) {
    const key = `${row.locale}\u0000${row.device}`;
    const entries = groups.get(key) ?? [];
    entries.push(row);
    groups.set(key, entries);
  }
  const context = report.findings.filter(
    (f) => !f.file && (filter.locale === "*" || filter.locale === f.locale),
  );
  const contextHtml = context.length
    ? `<div class="selection-findings"><h4>Folder and selection findings</h4>${context.map(finding).join("")}</div>`
    : "";
  if (!visible.length)
    return (
      contextHtml +
      `<div class="no-matches">${icon(context.length ? "info" : "check")}<h4>${filter.issues && !search && filter.locale === "*" && filter.device === "*" ? "No file-level issues" : "No matching assets"}</h4><p>${filter.issues ? "Choose All assets to see every inspected file." : "Try another search or reset the filters."}</p></div>`
    );
  return (
    contextHtml +
    [...groups.values()]
      .map((group) => {
        const first = group[0]!;
        const state: AssetStatus = group.some((row) => row.status === "fail")
          ? "fail"
          : group.some((row) => row.status === "review")
            ? "review"
            : group.some((row) => row.status === "skipped")
              ? "skipped"
              : "pass";
        return `<details class="asset-group" open><summary>${icon("chevron", "disclosure")}<span class="status-dot ${state}">${icon(statusIcon[state])}</span><strong>${esc(first.locale || "Selected files")}</strong><span class="device-label">${esc(first.device)}</span><small>${group.length} ${group.length === 1 ? "asset" : "assets"}</small></summary><div class="asset-rows">${group.map((row) => `<details class="asset-row ${row.status}" ${row.status === "fail" || row.status === "review" ? "open" : ""}><summary><span class="file-name">${icon(row.kind === "Preview" ? "file" : "file")}<strong>${esc(row.name)}</strong></span><span class="dimensions">${esc(row.dimensions)}</span><span class="status-text ${row.status}">${icon(statusIcon[row.status])}${statusText[row.status]}</span>${icon("chevron", "disclosure")}</summary><div class="asset-detail"><p class="asset-path">${esc(row.path)} · ${row.kind}</p>${row.findings.map(finding).join("")}${row.unverified.map((check) => `<p class="metadata-warning">${icon("info")}${esc(check.reason)}</p>`).join("")}${!row.findings.length && !row.unverified.length ? `<p>${row.status === "skipped" ? "Not inspected by the locale-folder policy. Place this file inside its locale folder." : "No enabled rule found a problem in the metadata checked for this asset."}</p>` : ""}</div></details>`).join("")}</div></details>`;
      })
      .join("")
  );
}
