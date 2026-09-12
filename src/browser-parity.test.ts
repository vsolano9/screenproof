import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { inspectBrowserFixtures } from "./browser.ts";
import { scan } from "./scan.ts";
import { validate } from "./validate.ts";
import { defaultConfig } from "./rules.ts";
import { makePng } from "./test-support/images.ts";

// Paths reproduce the audit's browser/{textonly,nested,mixed,hidden} trees.
for (const [label, paths, mode, count, rules] of [
  ["textonly", ["note.txt"], "flat", 0, ["missing-screenshots", "screenshot-unexpected-file"]],
  ["nested", ["en-US/archive/01.png"], "locale", 0, ["screenshot-locale-empty", "screenshot-unexpected-file"]],
  ["mixed", ["01.png", "misc/02.png"], "flat", 1, []],
  ["hidden", ["en-US/01.png", ".archive/02.png"], "locale", 1, []],
  ["recognized locale", ["en-US/01.png"], "locale", 1, []],
  ["unknown locale", ["en_US/01.png"], "locale", 1, ["screenshot-unknown-locale"]],
] as const) {
  test(`CLI/browser parity: ${label}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "screenproof-parity-"));
    try {
      const inputs = [];
      for (const path of paths) {
        const bytes = label.includes("locale")
          ? makePng(1320, 2868)
          : await readFile(join(import.meta.dirname, "test-support/browser-trees", label, path));
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), bytes);
        inputs.push({ name: path.split("/").at(-1)!, path, bytes });
      }
      const scanned = await scan(root, defaultConfig());
      const cli = validate(scanned, defaultConfig());
      const browser = inspectBrowserFixtures(inputs);
      const normalize = (report: typeof cli) => JSON.parse(JSON.stringify(report).replaceAll(root, "ROOT").replaceAll("browser", "ROOT"));
      assert.equal(browser.mode, mode);
      assert.equal(scanned.locales.reduce((sum, locale) => sum + locale.files.length, 0), count);
      assert.deepEqual(browser.findings.map(f => f.rule).sort(), [...rules].sort());
      assert.deepEqual(normalize(browser), normalize(cli));
      if (count === 0) assert.ok(browser.errorCount + browser.warningCount > 0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
