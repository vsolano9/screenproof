import { inspectBrowserSelection } from "../../src/browser.ts";
import type { LintReport } from "../../src/types.ts";
import { Inspection, readDrop } from "./intake.ts";
import { readFiles } from "./file-read.ts";

import { shell, exampleFiles } from "./shell.ts";
import { assetRows, presentation, type AssetRow } from "./report-model.ts";
import { reportView, filteredFindings, type Filters } from "./report-view.ts";
import "./styles.css";

const fixtures = exampleFiles;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("missing app root");

app.innerHTML = shell();

const results = requiredElement<HTMLDivElement>("#results");
const fileInput = requiredElement<HTMLInputElement>("#file-input");
const folderInput = requiredElement<HTMLInputElement>("#folder-input");
const dropZone = requiredElement<HTMLDivElement>("#drop-zone");
const emptyResults = results.innerHTML;
const scanStatus = requiredElement<HTMLParagraphElement>("#scan-status");
const clearButton = requiredElement<HTMLButtonElement>("#clear");
let currentRows: AssetRow[] = [];
let filters: Filters = { locale: "*", device: "*", search: "", issues: false };
const copyButton = requiredElement<HTMLButtonElement>("#copy-json");
const downloadButton = requiredElement<HTMLButtonElement>("#download-json");
const exportStatus = requiredElement<HTMLParagraphElement>("#export-status");
let currentReport: LintReport | undefined;
const inspection = new Inspection({
  start: beginInspection,
  complete: async (files, current) => {
    const inputs = await readFiles(files, current);
    if (current()) {
      const { scan, report } = inspectBrowserSelection(inputs);
      renderReport(report, assetRows(scan, report), inputs.length);
    }
  },
  error: renderReadError,
});

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-fixture]",
)) {
  button.addEventListener(
    "click",
    () => void loadFixture(button.dataset.fixture ?? ""),
  );
}

fileInput.addEventListener("change", () => {
  const files = [...(fileInput.files ?? [])];
  fileInput.value = "";
  if (files.length) void inspectFiles(files);
});
folderInput.addEventListener("change", () => {
  const files = [...(folderInput.files ?? [])];
  folderInput.value = "";
  if (files.length) void inspectFiles(files);
});
requiredElement<HTMLButtonElement>("#choose-files").addEventListener(
  "click",
  () => fileInput.click(),
);
requiredElement<HTMLButtonElement>("#choose-folder").addEventListener(
  "click",
  () => folderInput.click(),
);

requiredElement<HTMLButtonElement>("#clear").addEventListener("click", () => {
  inspection.cancel();
  currentReport = undefined;
  results.innerHTML = emptyResults;
  currentRows = [];
  clearButton.disabled = true;
  scanStatus.textContent = "Selection cleared.";
  fileInput.value = "";
  folderInput.value = "";
  setSelectedFixture("");
  setControlsDisabled(false);
  copyButton.disabled = downloadButton.disabled = true;
  exportStatus.textContent = "";
});
copyButton.addEventListener("click", async () => {
  const report = currentReport;
  if (!report) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    if (currentReport === report) exportStatus.textContent = "JSON copied.";
  } catch {
    if (currentReport === report)
      exportStatus.textContent =
        "Clipboard access is unavailable. Use Download JSON instead.";
  }
});
downloadButton.addEventListener("click", () => {
  if (!currentReport) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(currentReport, null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "screenproof-report.json";
  link.click();
  // Give the browser a task to consume the download before releasing its URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  exportStatus.textContent = "JSON download started.";
});

dropZone.addEventListener("click", (event) => {
  if (
    !(event.target instanceof Element && event.target.closest("button")) &&
    !fileInput.disabled
  )
    fileInput.click();
});
for (const type of ["dragenter", "dragover"] as const) {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.dataset.dragging = "true";
  });
}
for (const type of ["dragleave", "drop"] as const) {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    delete dropZone.dataset.dragging;
  });
}
dropZone.addEventListener("drop", (event) => {
  setSelectedFixture("");
  void inspection.run("local folder", (current) =>
    readDrop(event.dataTransfer, current),
  );
});

const requestedFixture = new URLSearchParams(location.search).get("fixture");
if (
  requestedFixture &&
  fixtures.some((fixture) => fixture.id === requestedFixture)
) {
  void loadFixture(requestedFixture);
}

async function loadFixture(id: string): Promise<void> {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) return;
  setSelectedFixture(id);
  await inspection.run(fixture.label, async (current) => {
    const response = await fetch(fixture.source);
    if (!current()) return [];
    if (!response.ok)
      throw new Error(`example request returned ${response.status}`);
    const file = new File(
      [await response.blob()],
      fixture.path?.split("/").at(-1) ?? fixture.source.split("/").at(-1)!,
    );
    if (fixture.path)
      Object.defineProperty(file, "webkitRelativePath", {
        value: `example/${fixture.path}`,
      });
    return [file];
  });
}

async function inspectFiles(files: readonly File[]): Promise<void> {
  setSelectedFixture("");
  await inspection.run(
    files.length === 1 ? files[0]!.name : `${files.length} files`,
    async () => [...files],
  );
}

function beginInspection(label: string): void {
  currentReport = undefined;
  copyButton.disabled = downloadButton.disabled = true;
  exportStatus.textContent = "";
  clearButton.disabled = false;
  scanStatus.textContent = "Inspecting locally.";
  results.innerHTML = `<div class="loading-state"><span>Inspecting locally</span><strong>${escapeHtml(label)}</strong></div>`;
  setControlsDisabled(true);
}

function renderReport(
  report: LintReport,
  rows: AssetRow[],
  selected: number,
): void {
  setControlsDisabled(false);
  currentReport = report;
  currentRows = rows;
  copyButton.disabled = downloadButton.disabled = clearButton.disabled = false;
  filters = {
    locale: "*",
    device: "*",
    search: "",
    issues: report.findings.length > 0 || report.unverifiedChecks.length > 0,
  };
  results.innerHTML = reportView(report, rows, selected);
  refreshFindings();
  scanStatus.textContent = `${presentation(report).title}. ${rows.length} assets, ${report.errorCount} errors, ${report.warningCount} warnings.`;
}
function refreshFindings(): void {
  if (!currentReport) return;
  requiredElement<HTMLDivElement>("#finding-list").innerHTML = filteredFindings(
    currentRows,
    currentReport,
    filters,
  );
  for (const button of results.querySelectorAll<HTMLButtonElement>(
    "[data-view]",
  )) {
    button.setAttribute(
      "aria-pressed",
      String((button.dataset.view === "issues") === filters.issues),
    );
  }
}

function renderReadError(label: string, error: unknown): void {
  setControlsDisabled(false);
  clearButton.disabled = false;
  scanStatus.textContent =
    "The selection could not be inspected. Choose files again or select fewer files.";
  results.innerHTML = `<div class="read-error"><strong>Could not inspect ${escapeHtml(label)}</strong><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p></div>`;
  results.insertAdjacentHTML(
    "beforeend",
    `<p class="recovery-note">Choose your files again, or select fewer files. Nothing was uploaded.</p>`,
  );
}

function setSelectedFixture(id: string): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-fixture]",
  )) {
    button.setAttribute("aria-pressed", String(button.dataset.fixture === id));
  }
}

function setControlsDisabled(disabled: boolean): void {
  results.setAttribute("aria-busy", String(disabled));
  dropZone.classList.toggle("is-busy", disabled);
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-fixture], #choose-files, #choose-folder",
  ))
    button.disabled = disabled;
  fileInput.disabled = disabled;
  folderInput.disabled = disabled;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
}

function escapeHtml(value: string): string {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

results.addEventListener("input", (event) => {
  const target = event.target;
  if (!(
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement
  ))
    return;
  if (target.id === "filter-locale") filters.locale = target.value;
  else if (target.id === "filter-device") filters.device = target.value;
  else if (target.id === "filter-search") filters.search = target.value;
  else return;
  refreshFindings();
});
results.addEventListener("click", (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-view]")
      : null;
  if (!button) return;
  filters.issues = button.dataset.view === "issues";
  refreshFindings();
});
requiredElement<HTMLButtonElement>("#copy-command").addEventListener(
  "click",
  async () => {
    try {
      await navigator.clipboard.writeText("npx screenproof <folder>");
      exportStatus.textContent =
        "CLI command copied. Replace <folder> with your assets folder.";
    } catch {
      exportStatus.textContent =
        "Clipboard unavailable. Select and copy the command from the terminal panel.";
    }
  },
);
