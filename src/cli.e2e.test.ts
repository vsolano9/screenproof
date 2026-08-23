import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { makePng } from "./test-support/images.ts";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url));

test("the executable lints a real tree end to end", async () => {
  const root = await mkdtemp(join(tmpdir(), "screenproof-e2e-"));
  await mkdir(join(root, "en-US"));
  await writeFile(join(root, "en-US", "01.png"), makePng(1260, 2736));

  const { stdout } = await execFileAsync(process.execPath, [CLI, root, "--json"]);
  const report = JSON.parse(stdout) as { ok: boolean; errorCount: number };
  assert.equal(report.ok, true);
  assert.equal(report.errorCount, 0);
});

test("the executable exits 1 on a failing tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "screenproof-e2e-"));
  await mkdir(join(root, "en-US"));
  await writeFile(join(root, "en-US", "bad.png"), makePng(500, 500));

  await assert.rejects(
    execFileAsync(process.execPath, [CLI, root]),
    (err: Error & { code?: number }) => err.code === 1,
  );
});

test("the executable exits 1 when Watch screenshot sizes differ by localization", async () => {
  const root = await mkdtemp(join(tmpdir(), "screenproof-e2e-"));
  await mkdir(join(root, "en-US"));
  await mkdir(join(root, "de-DE"));
  await writeFile(join(root, "en-US", "watch.png"), makePng(422, 514));
  await writeFile(join(root, "de-DE", "watch.png"), makePng(410, 502));

  await assert.rejects(
    execFileAsync(process.execPath, [CLI, root, "--json"]),
    (err: Error & { code?: number; stdout?: string }) => {
      if (err.code !== 1 || !err.stdout) return false;
      const report = JSON.parse(err.stdout) as { findings: Array<{ rule: string }> };
      return report.findings.filter((finding) => finding.rule === "screenshot-watch-size-consistency").length === 2;
    },
  );
});
