import { icon } from "./icons.ts";
export const exampleFiles = [
  {
    id: "valid-size",
    label: "Valid screenshot",
    detail: "Correct size and format",
    source: "/fixtures/correct-1320x2868.png",
    path: "01.png",
    status: "pass",
  },
  {
    id: "wrong-size",
    label: "Wrong dimensions",
    detail: "See the exact size to fix",
    source: "/fixtures/wrong-size-1170x2500.png",
    path: "01.png",
    status: "fail",
  },
  {
    id: "wrong-locale",
    label: "Unknown locale",
    detail: "Spot a folder name typo",
    source: "/fixtures/correct-1320x2868.png",
    path: "en_US/01.png",
    status: "review",
  },
] as const;
export function emptyState(): string {
  return `<div class="empty-state"><div class="empty-document" aria-hidden="true">${icon("file")}<span>${icon("check")}</span></div>
    <h3>Your next submission,<br>with fewer surprises.</h3><p>Add your assets to see the exact dimensions,<br class="desktop-break"> file checks, and fixes that matter.</p>
    <div class="empty-checks"><span>${icon("check")}Actionable findings</span><span>${icon("lock")}Nothing uploaded</span></div></div>`;
}
export function shell(): string {
  return `<a class="skip-link" href="#inspector">Skip to inspector</a>
  <header class="site-header"><div class="header-inner">
    <a class="brand" href="/" aria-label="Screenproof home"><span class="brand-mark">${icon("check")}</span><span><strong>Screenproof</strong><small>App Store asset validation</small></span></a>
    <nav aria-label="Project links"><a href="https://github.com/vsolano9/screenproof#readme">Docs</a><a href="#cli">CLI</a><a href="https://github.com/vsolano9/screenproof">Open source</a></nav>
    <div class="header-end"><span class="privacy-pill"><span></span>Local processing · No uploads</span><a class="github-link" href="https://github.com/vsolano9/screenproof" aria-label="Screenproof on GitHub">${icon("github")}</a></div>
  </div></header>
  <main>
    <section class="hero" aria-labelledby="hero-heading"><div class="hero-copy"><h1 id="hero-heading">Ship App Store assets<br>with confidence.</h1>
      <p>Check your screenshots and app previews before App Store Connect does. Catch issues early, fix them fast. Your files never leave your device.</p>
      <div class="benefits"><div>${icon("lock")}<span><strong>100% local processing</strong><small>Your assets stay on your device</small></span></div><div>${icon("shield")}<span><strong>Built for developers</strong><small>Open source and transparent</small></span></div><div>${icon("bolt")}<span><strong>Fewer surprises</strong><small>Catch issues before submission</small></span></div></div>
    </div><div class="hero-art" aria-hidden="true"><img src="/validation-stack-transparent-v2.webp" width="1344" height="464" alt="" fetchpriority="high" decoding="async"></div></section>
    <div class="workspace" id="inspector" tabindex="-1">
      <div class="input-column">
        <section class="panel input-panel" aria-labelledby="input-heading"><h2 id="input-heading">${icon("upload")}Add your assets</h2>
          <div class="drop-zone" id="drop-zone"><div class="drop-symbol">${icon("upload")}</div><h3>Drop screenshots or app previews here</h3><p class="formats">PNG, JPEG, MP4, MOV, M4V</p>
            <div class="chooser-row"><button class="button primary" id="choose-files" type="button">${icon("file")}Choose files</button><button class="button secondary" id="choose-folder" type="button">${icon("folder")}Choose folder</button></div>
            <input id="file-input" type="file" multiple accept=".png,.jpg,.jpeg,.mp4,.mov,.m4v" hidden><input id="folder-input" type="file" multiple webkitdirectory hidden>
            <p class="local-note">${icon("lock")}Processed locally in your browser</p><span class="drag-message">Drop to inspect locally</span>
          </div>
          <div class="examples-heading"><h3>${icon("lab")}Try an example</h3><span>No files needed</span></div>
          <div class="example-list">${exampleFiles.map((e) => `<button type="button" class="example-button" data-fixture="${e.id}" aria-pressed="false"><span class="example-art ${e.status}">${icon(e.status === "review" ? "folder" : "file")}<i>${icon(e.status === "pass" ? "check" : e.status === "fail" ? "x" : "warning")}</i></span><span><strong>${e.label}</strong><small>${e.detail}</small></span>${icon("chevron")}</button>`).join("")}</div>
          <p class="intake-hint">Checking localizations? Choose the folder containing <code>en-US/</code>, <code>de-DE/</code>, and your other locales.</p>
        </section>
        <section class="panel coverage-panel" aria-labelledby="coverage-heading"><h2 id="coverage-heading">${icon("shield")}What Screenproof checks</h2>
          <div class="coverage-grid">${[
            ["Dimensions", "Exact accepted pixel sizes", "file"],
            ["Screenshot count", "Per device size, in locale folders", "file"],
            ["File format", "PNG/JPEG headers and transparency", "check"],
            ["Preview metadata", "Duration, codec, audio and more", "check"],
            ["Locale layout", "Folder structure and locale names", "folder"],
            [
              "Content and approval",
              "Not checked. Human review required.",
              "minus",
            ],
          ]
            .map(
              ([title, detail, symbol]) =>
                `<div class="coverage-item ${symbol === "minus" ? "muted" : ""}">${icon(symbol!)}<span><strong>${title}</strong><small>${detail}</small></span></div>`,
            )
            .join("")}</div>
          <details class="coverage-details"><summary>Coverage and limitations ${icon("chevron")}</summary><p>Checks depend on the selected assets and readable metadata. Flat-file selections do not check locale counts. Empty directories cannot be detected in the browser.</p><p>This tool does not decode every image or video, assess visual quality, verify bitrate, or guarantee App Store approval. Unavailable metadata is listed in the report.</p><a href="https://github.com/vsolano9/screenproof#known-limitations">Read the full coverage contract</a></details>
        </section>
        <section class="cli-panel" id="cli" aria-labelledby="cli-heading"><h2 id="cli-heading">${icon("terminal")}Same checks. In your terminal.</h2><div><code>npx screenproof &lt;folder&gt;</code><button type="button" id="copy-command" aria-label="Copy CLI command">${icon("copy")}</button></div><p>Offline CLI. Zero runtime dependencies. Ready for CI.</p></section>
      </div>
      <section class="panel results-panel" aria-labelledby="results-heading"><div class="report-heading"><h2 id="results-heading">${icon("shield")}Validation report</h2><div class="report-actions" aria-label="Report actions"><button id="copy-json" class="button compact" disabled>${icon("copy")}<span>Copy JSON</span></button><button id="download-json" class="button compact" disabled>${icon("download")}<span>Download JSON</span></button><button id="clear" class="button compact" disabled>${icon("trash")}<span>Clear</span></button></div></div>
        <p id="scan-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
        <div id="results">${emptyState()}</div><p id="export-status" class="export-status" role="status" aria-live="polite"></p>
        <p class="report-disclaimer">A pass covers enabled local checks, not App Store approval. <a href="https://github.com/vsolano9/screenproof#known-limitations">Know what's checked.</a></p>
      </section>
    </div>
  </main><footer><span>Screenproof · Built by <a href="https://thechosenvictor.com">TheChosenVictor</a></span><span>No uploads. No telemetry. MIT licensed.</span></footer>`;
}
