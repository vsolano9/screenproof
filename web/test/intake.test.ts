import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inspectBrowserFixtures } from "../../src/browser.ts";
import { scan } from "../../src/scan.ts";
import { defaultConfig } from "../../src/rules.ts";
import { validate } from "../../src/validate.ts";
import { makePng } from "../../src/test-support/images.ts";
import { Inspection, readDrop, selectedPath } from "../src/intake.ts";

test("enumeration and file callback failures recover through the inspection error boundary", async () => {
  for (const entry of [
    { isDirectory: true, name: "shots", createReader: () => ({ readEntries: (_ok: unknown, fail: (error: Error) => void) => fail(new Error("denied directory")) }) },
    { isFile: true, name: "01.png", file: (_ok: unknown, fail: (error: Error) => void) => fail(new Error("denied file")) },
  ]) {
    const events: string[] = [];
    const operation = new Inspection({ start: () => events.push("loading"), complete: () => { events.push("complete"); }, error: (_label, error) => events.push((error as Error).message) });
    await operation.run("drop", current => readDrop({ items: [{ webkitGetAsEntry: () => entry }], files: [] } as unknown as DataTransfer, current));
    assert.deepEqual(events, ["loading", entry.isDirectory ? "denied directory" : "denied file"]);
    await operation.run("retry", async () => []);
    assert.equal(events.at(-1), "complete");
  }
});

test("a stale traversal cannot replace a newer selection or surface a stale error", async () => {
  const events: string[] = [];
  const operation = new Inspection({ start: label => events.push(label), complete: files => { events.push(files[0]?.name ?? "empty"); }, error: () => events.push("error") });
  let release!: (files: File[]) => void;
  const old = operation.run("old", () => new Promise(resolve => { release = resolve; }));
  await operation.run("new", async () => [{ name: "new.png" } as File]);
  release([{ name: "old.png" } as File]);
  await old;
  assert.deepEqual(events, ["old", "new", "new.png"]);
  let fail!: (error: Error) => void;
  const staleError = operation.run("old error", () => new Promise((_resolve, reject) => { fail = reject; }));
  operation.cancel();
  fail(new Error("stale"));
  await staleError;
  assert.notEqual(events.at(-1), "error");
});

test("folder selection strips exactly the selected root for flat and locale trees", () => {
  assert.equal(selectedPath({ name: "01.png", webkitRelativePath: "screenshots/01.png" } as File), "01.png");
  assert.equal(selectedPath({ name: "01.png", webkitRelativePath: "screenshots/en-US/01.png" } as File), "en-US/01.png");
  assert.equal(selectedPath({ name: "01.png", webkitRelativePath: "en-US/01.png" } as File), "01.png");
});

test("folder-picker roots produce the same flat and locale reports as the CLI", async () => {
  for (const path of ["01.png", "en-US/01.png", "en_US/01.png"]) {
    const root = await mkdtemp(join(tmpdir(), "screenproof-picker-"));
    try {
      const bytes = makePng(1320, 2868);
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), bytes);
      const file = { name: "01.png", webkitRelativePath: `selected/${path}` } as File;
      const browser = inspectBrowserFixtures([{ name: file.name, path: selectedPath(file), bytes }]);
      const cli = validate(await scan(root, defaultConfig()), defaultConfig());
      assert.deepEqual({ ...browser, root: "" }, { ...cli, root: "" });
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("payload read failures recover and empty selections complete deliberately", async () => {
  const events: string[] = [];
  const operation = new Inspection({
    start: () => {},
    complete: async files => { if (files.length) throw new Error("payload denied"); events.push("empty"); },
    error: (_label, error) => { events.push((error as Error).message); },
  });
  await operation.run("bad file", async () => [{ name: "bad.png" } as File]);
  await operation.run("empty", async () => []);
  assert.deepEqual(events, ["payload denied", "empty"]);
});
