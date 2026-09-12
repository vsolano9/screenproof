import { inspectBrowserFixtures, type BrowserFixtureInput } from "../../src/browser.ts";
import type { Finding, LintReport } from "../../src/types.ts";
import { Inspection, readDrop, selectedPath } from "./intake.ts";

import "./tokens.generated.css";
import "./styles.css";

interface FixtureDefinition {
  id: string;
  label: string;
  detail: string;
  source: string;
  path?: string;
}

const fixtures: readonly FixtureDefinition[] = [
  {
    id: "wrong-size",
    label: "Wrong size",
    detail: "1170 × 2500 PNG",
    source: "/fixtures/wrong-size-1170x2500.png",
  },
  {
    id: "valid-size",
    label: "Accepted size",
    detail: "1320 × 2868 PNG",
    source: "/fixtures/correct-1320x2868.png",
  },
  {
    id: "wrong-locale",
    label: "Wrong locale folder",
    detail: "en_US/01.png",
    source: "/fixtures/correct-1320x2868.png",
    path: "en_US/01.png",
  },
];

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("missing app root");

app.innerHTML = `
  <header class="site-header">
    <a class="wordmark" href="https://github.com/vsolano9/screenproof">screenproof</a>
    <span class="product-name">App Store fixture inspector</span>
    <span class="runtime-note">browser runtime / local only</span>
    <nav aria-label="Project links">
      <a href="https://github.com/vsolano9/screenproof">GitHub</a>
      <a href="https://www.npmjs.com/package/screenproof">npm</a>
    </nav>
  </header>
  <main class="workspace">
    <section class="input-panel" aria-labelledby="input-heading">
      <div class="section-heading">
        <span aria-hidden="true">1.</span>
        <div>
          <h1 id="input-heading">Inspect a fixture</h1>
          <p>Drop screenshots, app previews, or a locale folder.</p>
        </div>
      </div>

      <div class="drop-zone" id="drop-zone" tabindex="0" role="button" aria-describedby="local-note">
        <span class="crop crop-nw" aria-hidden="true"></span>
        <span class="crop crop-ne" aria-hidden="true"></span>
        <span class="crop crop-sw" aria-hidden="true"></span>
        <span class="crop crop-se" aria-hidden="true"></span>
        <div class="file-glyph" aria-hidden="true"><span></span></div>
        <strong>Drop files or a folder here</strong>
        <span>PNG, JPEG, MOV, M4V, or MP4</span>
        <p id="local-note">All processing stays in your browser.</p>
      </div>

      <div class="chooser-row">
        <label class="button primary" for="file-input">Choose files</label>
        <input id="file-input" type="file" multiple accept=".png,.jpg,.jpeg,.mov,.m4v,.mp4" />
        <label class="button secondary" for="folder-input">Choose folder</label>
        <input id="folder-input" type="file" multiple webkitdirectory />
      </div>

      <h2 class="fixture-heading">Synthetic fixtures</h2>
      <div class="fixture-list" id="fixture-list">
        ${fixtures.map((fixture) => `
          <button type="button" class="fixture-button" data-fixture="${fixture.id}" aria-pressed="false">
            <span>${fixture.label}</span>
            <small>${fixture.detail}</small>
          </button>
        `).join("")}
      </div>
    </section>

    <section class="results-panel" aria-labelledby="results-heading" aria-live="polite">
      <div class="section-heading">
        <span aria-hidden="true">2.</span>
        <div>
          <h2 id="results-heading">Inspection</h2>
          <p>Same parsers, rules, and reasons as the CLI.</p>
        </div>
      </div>
      <div id="results" class="results-body">
        <div class="empty-state">
          <div class="empty-frame" aria-hidden="true"></div>
          <h3>No fixture selected</h3>
          <p>Choose a synthetic failure or inspect your own files. Nothing is uploaded.</p>
        </div>
      </div>
    </section>
  </main>
  <footer>
    <span>screenproof browser inspector</span>
    <span>offline rules · no telemetry · MIT</span>
  </footer>
`;

const results = requiredElement<HTMLDivElement>("#results");
const fileInput = requiredElement<HTMLInputElement>("#file-input");
const folderInput = requiredElement<HTMLInputElement>("#folder-input");
const dropZone = requiredElement<HTMLDivElement>("#drop-zone");
const inspection = new Inspection({
  start: beginInspection,
  complete: async (files, current) => {
    const inputs = await Promise.all(files.map(async (file): Promise<BrowserFixtureInput> => ({
      name: file.name, path: selectedPath(file), bytes: new Uint8Array(await file.arrayBuffer()), sizeBytes: file.size,
    })));
    if (current()) renderReport(inspectBrowserFixtures(inputs), inputs.map(input => input.path ?? input.name));
  },
  error: renderReadError,
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-fixture]")) {
  button.addEventListener("click", () => void loadFixture(button.dataset.fixture ?? ""));
}

fileInput.addEventListener("change", () => void inspectFiles([...fileInput.files ?? []]));
folderInput.addEventListener("change", () => void inspectFiles([...folderInput.files ?? []]));

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
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
  void inspection.run("local folder", current => readDrop(event.dataTransfer, current));
});

const requestedFixture = new URLSearchParams(location.search).get("fixture");
if (requestedFixture && fixtures.some((fixture) => fixture.id === requestedFixture)) {
  void loadFixture(requestedFixture);
}

async function loadFixture(id: string): Promise<void> {
  const fixture = fixtures.find(candidate => candidate.id === id);
  if (!fixture) return;
  setSelectedFixture(id);
  await inspection.run(fixture.label, async current => {
    const response = await fetch(fixture.source);
    if (!current()) return [];
    if (!response.ok) throw new Error(`fixture request returned ${response.status}`);
    const file = new File([await response.blob()], fixture.path?.split("/").at(-1) ?? fixture.source.split("/").at(-1)!);
    if (fixture.path) Object.defineProperty(file, "webkitRelativePath", { value: `example/${fixture.path}` });
    return [file];
  });
}

async function inspectFiles(files: readonly File[]): Promise<void> {
  setSelectedFixture("");
  await inspection.run(files.length === 1 ? files[0]!.name : `${files.length} files`, async () => [...files]);
}

function beginInspection(label: string): void {
  results.innerHTML = `<div class="loading-state"><span>Inspecting locally</span><strong>${escapeHtml(label)}</strong></div>`;
  setControlsDisabled(true);
}

function renderReport(report: LintReport, paths: readonly string[]): void {
  setControlsDisabled(false);
  const status = report.ok ? "PASS" : "FAIL";
  const summary = report.ok
    ? "No enabled error rule fired."
    : `${report.errorCount} error${report.errorCount === 1 ? "" : "s"} block this fixture.`;
  const rows = report.findings.length > 0
    ? report.findings.map((finding) => findingRow(finding)).join("")
    : `<tr class="result-success"><td data-label="Result"><strong>PASS</strong></td><td data-label="File">${escapeHtml(paths.join(", "))}</td><td data-label="Rule"><code>all enabled rules</code></td><td data-label="Apple-style reason">No screenproof finding was emitted.</td></tr>`;
  results.innerHTML = `
    <div class="verdict ${report.ok ? "is-pass" : "is-fail"}" data-testid="verdict">
      <div>
        <span>Selected fixture</span>
        <h3>${escapeHtml(paths.length === 1 ? paths[0]! : `${paths.length} files`)}</h3>
      </div>
      <div class="verdict-lockup"><strong>${status}</strong><span>${escapeHtml(summary)}</span></div>
    </div>
    <div class="matrix-wrap">
      <table class="result-matrix">
        <thead><tr><th>Result</th><th>File</th><th>Rule</th><th>Apple-style reason</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="report-note">
      <strong>${report.mode === "locale" ? "Locale tree" : "Flat files"}</strong>
      <span>${report.warningCount} warning${report.warningCount === 1 ? "" : "s"} · ${report.errorCount} error${report.errorCount === 1 ? "" : "s"}</span>
    </div>
  `;
}

function findingRow(finding: Finding): string {
  const result = finding.severity === "error" ? "FAIL" : finding.severity === "warning" ? "WARN" : "INFO";
  return `<tr class="result-${finding.severity}" data-rule="${escapeHtml(finding.rule)}">
    <td data-label="Result"><strong>${result}</strong></td>
    <td data-label="File">${escapeHtml(finding.file ?? (finding.locale || "fixture"))}</td>
    <td data-label="Rule"><code>${escapeHtml(finding.rule)}</code></td>
    <td data-label="Apple-style reason">${escapeHtml(finding.message)}</td>
  </tr>`;
}

function renderReadError(label: string, error: unknown): void {
  setControlsDisabled(false);
  results.innerHTML = `<div class="read-error"><strong>Could not inspect ${escapeHtml(label)}</strong><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p></div>`;
}

function setSelectedFixture(id: string): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-fixture]")) {
    button.setAttribute("aria-pressed", String(button.dataset.fixture === id));
  }
}

function setControlsDisabled(disabled: boolean): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-fixture]")) button.disabled = disabled;
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
