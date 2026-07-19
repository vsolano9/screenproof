import { strict as assert } from "node:assert";
import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { defaultConfig } from "./config.ts";
import { listMetadataLocales, scan } from "./scan.ts";
import { makePng } from "./test-support/images.ts";
import { makePreview } from "./test-support/previews.ts";

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
  assert.match(result.diagnostics[0]!.message, /no screenshots or app previews found/);
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

test("app-preview files are discovered separately from screenshots", async () => {
  const root = await tree();
  await mkdir(join(root, "en-US"));
  await writeFile(join(root, "en-US", "01.png"), PNG);
  await writeFile(join(root, "en-US", "walkthrough.mp4"), makePreview());
  await writeFile(join(root, "en-US", "unsupported.webm"), new Uint8Array([1, 2, 3]));
  const result = await scan(root, defaultConfig());
  const locale = result.locales[0]!;
  assert.equal(locale.files.length, 1);
  assert.deepEqual(locale.previews?.map((file) => file.name), [
    "unsupported.webm",
    "walkthrough.mp4",
  ]);
  assert.equal(locale.previews?.[0]?.extensionSupported, false);
  assert.equal(locale.previews?.[1]?.extensionSupported, true);
  assert.equal(locale.previews?.[1]?.parse.ok, true);
  assert.deepEqual(locale.unexpectedFiles, []);
});

test("a flat folder containing only app previews is not reported as empty", async () => {
  const root = await tree();
  await writeFile(join(root, "walkthrough.mp4"), new Uint8Array([1, 2, 3]));
  const result = await scan(root, defaultConfig());
  assert.equal(result.mode, "flat");
  assert.equal(result.locales[0]!.previews?.length, 1);
  assert.deepEqual(result.diagnostics, []);
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

test("a tree of only unknown locale folders scans in locale mode, not flat", async () => {
  const root = await tree();
  await mkdir(join(root, "en_US"));
  await writeFile(join(root, "en_US", "01.png"), PNG);
  const result = await scan(root, defaultConfig());
  assert.equal(result.mode, "locale");
  assert.equal(result.locales.length, 1);
  assert.equal(result.locales[0]!.locale, "en_US");
  assert.equal(result.locales[0]!.isKnownLocale, false);
  assert.equal(result.locales[0]!.files.length, 1);
});

test("root images beside non-locale folders keep flat mode", async () => {
  const root = await tree();
  await mkdir(join(root, "originals"));
  await writeFile(join(root, "01.png"), PNG);
  const result = await scan(root, defaultConfig());
  assert.equal(result.mode, "flat");
  assert.equal(result.locales[0]!.files.length, 1);
});

test("an unreadable locale folder becomes a screenshot-unreadable diagnostic, not a crash", async (t) => {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    t.skip("running as root, chmod 000 is not enforced");
    return;
  }
  const root = await tree();
  await mkdir(join(root, "en-US"));
  await writeFile(join(root, "en-US", "01.png"), PNG);
  await mkdir(join(root, "de-DE"));
  await chmod(join(root, "de-DE"), 0o000);
  try {
    const result = await scan(root, defaultConfig());
    const diag = result.diagnostics.find((d) => d.rule === "screenshot-unreadable");
    assert.ok(diag, "expected a screenshot-unreadable diagnostic");
    assert.equal(diag.locale, "de-DE");
    assert.match(diag.message, /could not be read/);
    assert.ok(result.locales.some((l) => l.locale === "en-US" && l.files.length === 1));
  } finally {
    await chmod(join(root, "de-DE"), 0o755);
  }
});

test("symlinked images and locale folders are followed", async () => {
  const root = await tree();
  const assets = await tree();
  await writeFile(join(assets, "real.png"), PNG);
  await mkdir(join(assets, "shared-locale"));
  await writeFile(join(assets, "shared-locale", "01.png"), PNG);
  await mkdir(join(root, "en-US"));
  await symlink(join(assets, "real.png"), join(root, "en-US", "linked.png"));
  await symlink(join(assets, "shared-locale"), join(root, "de-DE"));
  const result = await scan(root, defaultConfig());
  const en = result.locales.find((l) => l.locale === "en-US");
  assert.ok(en);
  assert.equal(en.files.length, 1);
  assert.equal(en.files[0]!.name, "linked.png");
  assert.equal(en.files[0]!.parse.ok, true);
  const de = result.locales.find((l) => l.locale === "de-DE");
  assert.ok(de, "symlinked locale folder should scan as a locale");
  assert.equal(de.files.length, 1);
});

test("broken symlinks are recorded as unexpected files", async () => {
  const root = await tree();
  await mkdir(join(root, "en-US"));
  await writeFile(join(root, "en-US", "01.png"), PNG);
  await symlink(join(root, "gone.png"), join(root, "en-US", "dead.png"));
  const result = await scan(root, defaultConfig());
  assert.equal(result.locales[0]!.files.length, 1);
  assert.deepEqual(result.locales[0]!.unexpectedFiles, ["dead.png"]);
});
