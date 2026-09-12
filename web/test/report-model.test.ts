import { strict as assert } from "node:assert";
import { test } from "node:test";
import { inspectBrowserSelection } from "../../src/browser.ts";
import { makePng } from "../../src/test-support/images.ts";
import { makePreviewFile } from "../../src/test-support/previews.ts";
import { assetRows, presentation } from "../src/report-model.ts";
import { filteredFindings } from "../src/report-view.ts";
const good = makePng(1320, 2868);
function selection(inputs: Parameters<typeof inspectBrowserSelection>[0]) {
  const { scan, report } = inspectBrowserSelection(inputs);
  return { scan, report, rows: assetRows(scan, report) };
}
test("report shows real dimensions and a clear asset for a valid screenshot", () => {
  const { rows, report } = selection([{ name: "01.png", bytes: good }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "pass");
  assert.equal(rows[0]?.dimensions, "1320 × 2868");
  assert.equal(presentation(report).title, "Local checks passed");
});
test("warnings use review presentation and never imply App Store approval", () => {
  const { rows, report } = selection([
    { name: "01.png", path: "en_US/01.png", bytes: good },
  ]);
  assert.equal(report.gate, "pass-with-warnings");
  assert.equal(presentation(report).state, "review");
  assert.equal(rows[0]?.status, "review");
});
test("unverified metadata is review even when the technical gate passes", () => {
  const { rows, report } = selection([
    { name: "preview.mp4", bytes: makePreviewFile({ frameRate: null }) },
  ]);
  assert.equal(report.gate, "pass");
  assert.equal(presentation(report).state, "review");
  assert.equal(rows[0]?.status, "review");
});
test("duplicate inputs remain two blocked rows, not a misleading clear asset", () => {
  const { rows } = selection([
    { name: "01.png", bytes: good },
    { name: "01.png", bytes: makePng(100, 100) },
  ]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.status === "fail"));
});
test("loose locale-root images are explicitly not checked", () => {
  const { rows } = selection([
    { name: "01.png", path: "en-US/01.png", bytes: good },
    { name: "loose.png", bytes: good },
  ]);
  assert.equal(rows.find((row) => row.name === "loose.png")?.status, "skipped");
});
test("locale and device filters and search scope the actual asset rows", () => {
  const { rows, report } = selection(
    ["en-US", "de-DE"].map((locale) => ({
      name: "01.png",
      path: `${locale}/01.png`,
      bytes: good,
    })),
  );
  const html = filteredFindings(rows, report, {
    locale: "de-DE",
    device: "*",
    search: "01",
    issues: false,
  });
  assert.ok(html.includes("de-DE/01.png"));
  assert.ok(!html.includes("en-US/01.png"));
  assert.ok(
    filteredFindings(rows, report, {
      locale: "*",
      device: "*",
      search: "absent",
      issues: false,
    }).includes("No matching assets"),
  );
});
test("user-provided file names are escaped in report markup", () => {
  const { rows, report } = selection([
    { name: "<b>unsafe</b>.png", bytes: good },
  ]);
  const html = filteredFindings(rows, report, {
    locale: "*",
    device: "*",
    search: "",
    issues: false,
  });
  assert.ok(!html.includes("<b>unsafe</b>"));
});
