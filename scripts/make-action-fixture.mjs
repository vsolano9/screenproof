#!/usr/bin/env node
// Generates screenshot fixture trees for the CI composite-action smoke test.
// No binaries are committed to the repo; CI builds these at run time from the
// same generator the unit tests use.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { makePng } from "../src/test-support/images.ts";

const out = process.argv[2];
if (!out) {
  console.error("usage: make-action-fixture.mjs <output-dir>");
  process.exit(2);
}

await mkdir(join(out, "good", "en-US"), { recursive: true });
await writeFile(join(out, "good", "en-US", "01.png"), makePng(1290, 2796));

await mkdir(join(out, "bad", "en-US"), { recursive: true });
await writeFile(join(out, "bad", "en-US", "01.png"), makePng(500, 500));

console.log(`fixtures written to ${out}`);
