import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { defaultConfig } from "./config.ts";
import { listMetadataLocales, scan } from "./scan.ts";
import { makePng } from "./test-support/images.ts";

async function tree(): Promise<string> {
  return mkdtemp(join(tmpdir(), "screenproof-scan-"));
}

const PNG = makePng(1260, 2736);

test("missing root produces a missing-screenshots error diagnostic", async () => {
  const result = await scan("/nonexistent/screenshots", defaultConfig());
  assert.equal(result.locales.length, 0);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]!.rule, "missing-screenshots");
  assert.equal(result.diagnostics[0]!.severity, "error");
  assert.match(result.diagnostics[0]!.message, /not found: \/nonexistent\/screenshots/);
});

test("empty root reports no screenshots found", async () => {
  const root = await tree();
  const result = await scan(root, defaultConfig());
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0]!.message, /no screenshots found/);
});

test("a folder of images with no locale dirs scans in flat mode", async () => {
  const root = await tree();
  await writeFile(join(root, "01.png"), PNG);
  await writeFile(join(root, "02.png"), PNG);
  const result = await scan(root, defaultConfig());
  assert.equal(result.mode, "flat");
  assert.equal(result.locales.length, 1);
  assert.equal(result.locales[0]!.locale, "");
  assert.equal(result.locales[0]!.isKnownLocale, true);
  assert.equal(result.locales[0]!.files.length, 2);
  assert.equal(result.locales[0]!.files[0]!.parse.ok, true);
  assert.equal(result.diagnostics.length, 0);
});

test("a known locale subfolder triggers locale mode", async () => {
  const root = await tree();
  await mkdir(join(root, "en-US"));
  await writeFile(join(root, "en-US", "01.png"), PNG);
  const result = await scan(root, defaultConfig());
  assert.equal(result.mode, "locale");
  assert.equal(result.locales.length, 1);
  assert.equal(result.locales[0]!.locale, "en-US");
  assert.equal(result.locales[0]!.isKnownLocale, true);
  assert.equal(result.locales[0]!.files[0]!.locale, "en-US");
});

test("forceFlat wins over locale detection", async () => {
  const root = await tree();
  await mkdir(join(root, "en-US"));
  await writeFile(join(root, "en-US", "01.png"), PNG);
  await writeFile(join(root, "loose.png"), PNG);
  const result = await scan(root, defaultConfig(), { forceFlat: true });
  assert.equal(result.mode, "flat");
  assert.equal(result.locales.length, 1);
  assert.equal(result.locales[0]!.files.length, 1);
  assert.equal(result.locales[0]!.files[0]!.name, "loose.png");
});

test("hidden files are skipped silently everywhere", async () => {
  const root = await tree();
  await mkdir(join(root, "en-US"));
  await writeFile(join(root, ".DS_Store"), new Uint8Array([0]));
  await writeFile(join(root, "en-US", ".DS_Store"), new Uint8Array([0]));
  await writeFile(join(root, "en-US", "01.png"), PNG);
  const result = await scan(root, defaultConfig());
  const flattened = JSON.stringify(result);
  assert.equal(flattened.includes(".DS_Store"), false);
  assert.equal(result.locales[0]!.files.length, 1);
  assert.deepEqual(result.locales[0]!.unexpectedFiles, []);
});

test("visible non-image files and nested folders are recorded as unexpected", async () => {
  const root = await tree();
  await mkdir(join(root, "en-US"));
  await mkdir(join(root, "en-US", "raw"));
  await writeFile(join(root, "en-US", "01.png"), PNG);
  await writeFile(join(root, "en-US", "notes.txt"), "todo");
  const result = await scan(root, defaultConfig());
  assert.deepEqual(result.locales[0]!.unexpectedFiles.sort(), ["notes.txt", "raw/"]);
});

test("ignored locale folders are skipped entirely", async () => {
  const root = await tree();
  await mkdir(join(root, "en-US"));
  await mkdir(join(root, "archive"));
  await writeFile(join(root, "en-US", "01.png"), PNG);
  await writeFile(join(root, "archive", "old.png"), PNG);
  const config = defaultConfig();
  config.locales.ignore = ["archive"];
  const result = await scan(root, config);
  assert.deepEqual(result.locales.map((l) => l.locale), ["en-US"]);
});

test("a default/ folder scans with isKnownLocale false", async () => {
  const root = await tree();
  await mkdir(join(root, "default"));
  await writeFile(join(root, "default", "01.png"), PNG);
  const result = await scan(root, defaultConfig());
  assert.equal(result.mode, "locale");
  assert.equal(result.locales[0]!.locale, "default");
  assert.equal(result.locales[0]!.isKnownLocale, false);
});

test("loose root files in locale mode land in a synthetic empty-name entry", async () => {
  const root = await tree();
  await mkdir(join(root, "en-US"));
  await writeFile(join(root, "en-US", "01.png"), PNG);
  await writeFile(join(root, "stray.png"), PNG);
  const result = await scan(root, defaultConfig());
  const synthetic = result.locales.find((l) => l.locale === "");
  assert.ok(synthetic);
  assert.equal(synthetic.isKnownLocale, false);
  assert.equal(synthetic.files[0]!.name, "stray.png");
});

test("corrupt image files carry a failed parse, not a crash", async () => {
  const root = await tree();
  await mkdir(join(root, "en-US"));
  await writeFile(join(root, "en-US", "bad.png"), new Uint8Array([1, 2, 3]));
  const result = await scan(root, defaultConfig());
  const file = result.locales[0]!.files[0]!;
  assert.equal(file.parse.ok, false);
});

test("locales and files are sorted deterministically", async () => {
  const root = await tree();
  for (const locale of ["fr-FR", "de-DE", "en-US"]) {
    await mkdir(join(root, locale));
    await writeFile(join(root, locale, "b.png"), PNG);
    await writeFile(join(root, locale, "a.png"), PNG);
  }
  const result = await scan(root, defaultConfig());
  assert.deepEqual(result.locales.map((l) => l.locale), ["de-DE", "en-US", "fr-FR"]);
  assert.deepEqual(result.locales[0]!.files.map((f) => f.name), ["a.png", "b.png"]);
});

test("listMetadataLocales returns real locales only", async () => {
  const root = await tree();
  for (const dir of ["en-US", "de-DE", "default", "review_information"]) {
    await mkdir(join(root, dir));
  }
  assert.deepEqual(await listMetadataLocales(root), ["de-DE", "en-US"]);
});

test("listMetadataLocales throws on a missing folder", async () => {
  await assert.rejects(listMetadataLocales("/nonexistent/metadata"), /metadata folder not found/);
});
