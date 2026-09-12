import { strict as assert } from "node:assert";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { defaultConfig } from "./config.ts";
import { parsePreviewFile } from "./previewfile.ts";
import type { LintReport, PreviewFile, PreviewParseResult } from "./types.ts";
import { validate } from "./validate.ts";

async function inspectFixture(name: string): Promise<{ parse: PreviewParseResult; report: LintReport }> {
  const url = new URL(`../fixtures/media/${name}`, import.meta.url);
  const path = fileURLToPath(url);
  const parse = await parsePreviewFile(path);
  const preview: PreviewFile = {
    path,
    name,
    locale: "en-US",
    sizeBytes: (await stat(path)).size,
    extensionSupported: true,
    parse,
  };
  const report = validate({
    root: fileURLToPath(new URL("../fixtures/media", import.meta.url)),
    mode: "locale",
    locales: [{ locale: "en-US", isKnownLocale: true, files: [], previews: [preview], unexpectedFiles: [] }],
    diagnostics: [],
  }, defaultConfig());
  return { parse, report };
}

test("real mp4a-tagged MP3 fails the audio codec rule", async () => {
  const { parse, report } = await inspectFixture("mp3.mp4");
  assert.equal(parse.ok, true, parse.ok ? undefined : parse.reason);
  if (!parse.ok) return;
  assert.equal(parse.info.audioTracks[0]?.codecFourCC, "mp4a");
  assert.equal(parse.info.audioTracks[0]?.codec, "mp3");
  assert.equal(parse.info.audioTracks[0]?.bitDepth, null);
  assert.equal(report.findings.some((finding) => finding.rule === "preview-audio-codec"), true);
});

test("real fl64 PCM fails the audio bit-depth rule", async () => {
  const { parse, report } = await inspectFixture("pcm64.mov");
  assert.equal(parse.ok, true, parse.ok ? undefined : parse.reason);
  if (!parse.ok) return;
  assert.equal(parse.info.audioTracks[0]?.codecFourCC, "fl64");
  assert.equal(parse.info.audioTracks[0]?.codec, "pcm");
  assert.equal(parse.info.audioTracks[0]?.bitDepth, 64);
  assert.equal(report.findings.some((finding) => finding.rule === "preview-audio-bit-depth"), true);
});

test("real AAC is identified from esds and judged independently from its mono layout", async () => {
  const { parse, report } = await inspectFixture("mono.mp4");
  assert.equal(parse.ok, true, parse.ok ? undefined : parse.reason);
  if (!parse.ok) return;
  assert.equal(parse.info.audioTracks[0]?.codecFourCC, "mp4a");
  assert.equal(parse.info.audioTracks[0]?.codec, "aac");
  assert.equal(parse.info.audioTracks[0]?.bitDepth, null);
  assert.equal(report.findings.some((finding) => finding.rule === "preview-audio-codec"), false);
  assert.equal(report.findings.some((finding) => finding.rule === "preview-audio-layout"), true);
});
