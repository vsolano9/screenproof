import { strict as assert } from "node:assert";
import { test } from "node:test";

import { exitCode, renderHuman, renderJson } from "./report.ts";
import type { Finding, LintReport } from "./types.ts";

function report(findings: Finding[], opts: { mode?: "locale" | "flat" } = {}): LintReport {
  const locales = [...new Set(findings.map((f) => f.locale))].map((locale) => {
    const own = findings.filter((f) => f.locale === locale);
    return { locale, findings: own, ok: own.every((f) => f.severity !== "error") };
  });
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return {
    root: "/x/screenshots",
    mode: opts.mode ?? "locale",
    locales,
    findings,
    errorCount,
    warningCount: findings.filter((f) => f.severity === "warning").length,
    infoCount: findings.filter((f) => f.severity === "info").length,
    ok: errorCount === 0,
  };
}

const ERROR: Finding = {
  locale: "en-US",
  file: "01.png",
  rule: "screenshot-unknown-dimensions",
  severity: "error",
  message: "500x500 does not match any known App Store screenshot size",
};

const WARNING: Finding = {
  locale: "en-US",
  file: "02.png",
  rule: "screenshot-png-alpha",
  severity: "warning",
  message: "PNG declares transparency; App Store Connect may reject it",
};

const INFO: Finding = { locale: "en-US", rule: "screenshot-note", severity: "info", message: "note" };

test("renderJson round-trips the report", () => {
  const r = report([ERROR]);
  assert.deepEqual(JSON.parse(renderJson(r)), JSON.parse(JSON.stringify(r)));
});

test("human output shows findings, counts, and a FAIL verdict", () => {
  const text = renderHuman(report([ERROR, WARNING]));
  assert.match(text, /screenproof {2}\/x\/screenshots/);
  assert.match(text, /01\.png/);
  assert.match(text, /1 error, 1 warning, 0 info/);
  assert.match(text, /FAIL/);
});

test("human output shows PASS and ok locales when clean", () => {
  const clean = report([]);
  clean.locales.push({ locale: "en-US", findings: [], ok: true });
  const text = renderHuman(clean);
  assert.match(text, /en-US {2}ok/);
  assert.match(text, /PASS/);
});

test("quiet hides clean locales and info findings", () => {
  const r = report([INFO]);
  r.locales.push({ locale: "de-DE", findings: [], ok: true });
  const text = renderHuman(r, { quiet: true });
  assert.equal(text.includes("de-DE"), false);
  assert.equal(text.includes("note"), false);
});

test("flat mode shows a mode marker and renders the empty locale as a dot", () => {
  const r = report([{ ...ERROR, locale: "" }], { mode: "flat" });
  const text = renderHuman(r);
  assert.match(text, /\(flat mode\)/);
  assert.match(text, /✖ \./);
});

test("report-level findings (empty locale, locale mode) render without a locale section", () => {
  const r = report([]);
  const rootFinding: Finding = { locale: "", rule: "missing-screenshots", severity: "error", message: "screenshots folder not found: /x" };
  r.findings = [rootFinding];
  r.errorCount = 1;
  r.ok = false;
  r.locales = [];
  const text = renderHuman(r);
  assert.match(text, /screenshots folder not found/);
  assert.match(text, /FAIL/);
});

test("exit codes: 0 clean, 1 errors, 1 warnings under strict only", () => {
  assert.equal(exitCode(report([]), false), 0);
  assert.equal(exitCode(report([ERROR]), false), 1);
  assert.equal(exitCode(report([WARNING]), false), 0);
  assert.equal(exitCode(report([WARNING]), true), 1);
  assert.equal(exitCode(report([INFO]), true), 0);
});

test("report-level warnings render the warning marker and file name, not the error glyph", () => {
  const r = report([]);
  const stray: Finding = {
    locale: "",
    file: "stray.txt",
    rule: "screenshot-unexpected-file",
    severity: "warning",
    message: "screenshots must live inside a locale folder",
  };
  r.findings = [stray];
  r.warningCount = 1;
  r.locales = [];
  const text = renderHuman(r);
  const line = text.split("\n").find((l) => l.includes("must live inside"));
  assert.ok(line, "expected the report-level warning line");
  assert.equal(line.includes("✖"), false);
  assert.match(line, /warning/);
  assert.match(line, /stray\.txt/);
  assert.match(text, /PASS/);
});
