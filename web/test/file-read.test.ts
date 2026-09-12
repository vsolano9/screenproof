import { strict as assert } from "node:assert";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readFiles } from "../src/file-read.ts";
import { inspectBrowserFixtures } from "../../src/browser.ts";
import { makePng } from "../../src/test-support/images.ts";
import { makePreview } from "../../src/test-support/previews.ts";

test("oversize previews fail size validation without reading any payload", async () => {
  const file = { name: "oversize.mp4", size: 500_000_001, webkitRelativePath: "", slice() { assert.fail("oversize payload was read"); }, arrayBuffer() { assert.fail("whole file was read"); } } as unknown as File;
  const inputs = await readFiles([file], () => true);
  const report = inspectBrowserFixtures(inputs);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some(f => f.rule === "preview-file-size"));
});

test("image reads stay under 1 MiB and at most two files read concurrently", async () => {
  const png = makePng(1320, 2868);
  const head = new Uint8Array(1024 * 1024);
  head.set(png);
  let active = 0, peak = 0, largest = 0;
  const files = Array.from({ length: 5 }, (_, i) => ({ name: `${i}.png`, size: 32 * 1024 * 1024, webkitRelativePath: "", slice(start: number, end: number) {
    largest = Math.max(largest, end - start);
    return { async arrayBuffer() { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return head.buffer; } };
  }, arrayBuffer() { assert.fail("whole file was read"); } }) as unknown as File);
  const report = inspectBrowserFixtures(await readFiles(files, () => true));
  assert.equal(report.ok, true);
  assert.equal(peak, 2);
  assert.ok(largest <= 1024 * 1024);
});

test("late moov previews seek past media payload without reading it", async () => {
  // Real H.264/AAC control generated with ffmpeg; the synthetic control makes
  // the skipped mdat allocation much larger than the metadata.
  for (const bytes of [await readFile(new URL("./media/late-moov.mp4", import.meta.url)), makePreview(20, 886, 1920, 2 * 1024 * 1024)]) {
    let readBytes = 0;
    const blob = new Blob([bytes]);
    const file = { name: "late.mp4", size: blob.size, webkitRelativePath: "", slice(start: number, end: number) { readBytes += end - start; return blob.slice(start, end); }, arrayBuffer() { assert.fail("whole file was read"); } } as unknown as File;
    const report = inspectBrowserFixtures(await readFiles([file], () => true));
    assert.equal(report.ok, true);
    assert.ok(readBytes < blob.size / 2, `read ${readBytes} of ${blob.size} bytes`);
  }
});

test("stale selections stop scheduling payload reads", async () => {
  let reads = 0;
  const files = Array.from({ length: 5 }, (_, i) => ({ name: `${i}.png`, size: 45, slice() { reads++; return new Blob([makePng(1320, 2868)]); } }) as unknown as File);
  await readFiles(files, () => false);
  assert.equal(reads, 0);
});

test("a large selection cannot retain more than the metadata budget", async () => {
  const buffer = new ArrayBuffer(1024 * 1024);
  const files = Array.from({ length: 129 }, (_, i) => ({ name: `${i}.png`, size: buffer.byteLength, slice() { return { arrayBuffer: async () => buffer }; } }) as unknown as File);
  await assert.rejects(readFiles(files, () => true), /128 MiB browser budget/);
});
