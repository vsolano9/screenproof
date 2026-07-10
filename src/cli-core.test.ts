import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseArgs, run, type Io } from "./cli-core.ts";
import { makePng } from "./test-support/images.ts";

const PNG = makePng(1260, 2736);
const ALPHA_PNG = makePng(1260, 2736, { alpha: true });
const BAD_PNG = makePng(500, 500);

function fakeIo(cwd: string): Io & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    write: (text: string) => void stdout.push(text),
    error: (text: string) => void stderr.push(text),
    cwd,
    isTTY: false,
    env: {},
  };
}

async function localeTree(files: Record<string, Uint8Array>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "screenproof-cli-"));
  const screenshots = join(root, "screenshots");
  for (const [relative, bytes] of Object.entries(files)) {
    const path = join(screenshots, relative);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, bytes);
  }
  return root;
}

test("parseArgs handles every flag", () => {
  const args = parseArgs([
    "shots", "--config", "c.json", "--metadata", "m", "--flat", "--strict", "--json", "--quiet", "--no-color",
  ]);
  assert.deepEqual(args, {
    path: "shots",
    config: "c.json",
    metadata: "m",
    flat: true,
    strict: true,
    json: true,
    quiet: true,
    color: false,
    help: false,
    version: false,
  });
});

test("parseArgs supports = forms and rejects bad usage", () => {
  assert.equal(parseArgs(["--config=c.json"]).config, "c.json");
  assert.equal(parseArgs(["--metadata=m"]).metadata, "m");
  assert.throws(() => parseArgs(["--metadata"]), /--metadata requires a folder path/);
  assert.throws(() => parseArgs(["--config"]), /--config requires a file path/);
  assert.throws(() => parseArgs(["--metadata="]), /--metadata requires a folder path/);
  assert.throws(() => parseArgs(["--config="]), /--config requires a file path/);
  assert.throws(() => parseArgs(["--wat"]), /unknown option/);
  assert.throws(() => parseArgs(["a", "b"]), /unexpected extra argument/);
});

test("run lints a clean locale tree and exits 0", async () => {
  const cwd = await localeTree({ "en-US/01.png": PNG });
  const io = fakeIo(cwd);
  const code = await run([join(cwd, "screenshots")], io);
  assert.equal(code, 0);
  assert.match(io.stdout.join(""), /PASS/);
});

test("run discovers ./screenshots from cwd", async () => {
  const cwd = await localeTree({ "en-US/01.png": PNG });
  const io = fakeIo(cwd);
  const code = await run([], io);
  assert.equal(code, 0);
});

test("run exits 1 on errors and prints them", async () => {
  const cwd = await localeTree({ "en-US/01.png": BAD_PNG });
  const io = fakeIo(cwd);
  const code = await run([], io);
  assert.equal(code, 1);
  assert.match(io.stdout.join(""), /does not match any known App Store screenshot size/);
});

test("run --json prints a parseable report", async () => {
  const cwd = await localeTree({ "en-US/01.png": PNG });
  const io = fakeIo(cwd);
  const code = await run(["--json"], io);
  assert.equal(code, 0);
  const parsed = JSON.parse(io.stdout.join("")) as { ok: boolean; mode: string };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.mode, "locale");
});

test("run --strict fails on warnings", async () => {
  const cwd = await localeTree({ "en-US/01.png": ALPHA_PNG });
  const io = fakeIo(cwd);
  assert.equal(await run([], io), 0);
  assert.equal(await run(["--strict"], io), 1);
});

test("run reports a missing root as an error exit", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "screenproof-empty-"));
  const io = fakeIo(cwd);
  const code = await run([], io);
  assert.equal(code, 1);
  assert.match(io.stdout.join(""), /screenshots folder not found/);
});

test("run exits 2 on a bad config path", async () => {
  const cwd = await localeTree({ "en-US/01.png": PNG });
  const io = fakeIo(cwd);
  const code = await run(["--config", "/nonexistent/screenproof.json"], io);
  assert.equal(code, 2);
  assert.match(io.stderr.join(""), /could not read config file/);
});

test("run auto-loads screenproof.json from cwd", async () => {
  const cwd = await localeTree({ "en-US/01.png": ALPHA_PNG });
  await writeFile(join(cwd, "screenproof.json"), JSON.stringify({ rules: { "screenshot-png-alpha": "off" } }));
  const io = fakeIo(cwd);
  const code = await run(["--strict"], io);
  assert.equal(code, 0);
});

test("run exits 2 when --metadata points at a missing folder", async () => {
  const cwd = await localeTree({ "en-US/01.png": PNG });
  const io = fakeIo(cwd);
  const code = await run(["--metadata", "nope"], io);
  assert.equal(code, 2);
  assert.match(io.stderr.join(""), /metadata folder not found/);
});

test("run --metadata cross-checks metadata locales", async () => {
  const cwd = await localeTree({ "en-US/01.png": PNG });
  await mkdir(join(cwd, "metadata", "en-US"), { recursive: true });
  await mkdir(join(cwd, "metadata", "de-DE"), { recursive: true });
  const io = fakeIo(cwd);
  const code = await run(["--metadata", "metadata"], io);
  assert.equal(code, 0);
  assert.match(io.stdout.join(""), /metadata locale de-DE has no screenshots folder/);
});

test("run --flat forces flat mode", async () => {
  const cwd = await localeTree({ "en-US/01.png": PNG, "loose.png": PNG });
  const io = fakeIo(cwd);
  const code = await run(["--flat", "--json"], io);
  assert.equal(code, 0);
  const parsed = JSON.parse(io.stdout.join("")) as { mode: string };
  assert.equal(parsed.mode, "flat");
});

test("help and version exit 0", async () => {
  const io = fakeIo("/");
  assert.equal(await run(["--help"], io), 0);
  assert.match(io.stdout.join(""), /Usage:/);
  const io2 = fakeIo("/");
  assert.equal(await run(["--version"], io2), 0);
  assert.match(io2.stdout.join(""), /^\d+\.\d+\.\d+\n$/);
});
