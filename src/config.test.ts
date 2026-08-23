import { strict as assert } from "node:assert";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { DEFAULT_RULES, defaultConfig, loadConfig, mergeConfig } from "./config.ts";

test("default rule levels match the plan", () => {
  assert.deepEqual(DEFAULT_RULES, {
    "missing-screenshots": "error",
    "screenshot-unreadable": "error",
    "screenshot-unknown-dimensions": "error",
    "screenshot-count-over": "error",
    "screenshot-format": "error",
    "screenshot-png-alpha": "warning",
    "screenshot-unexpected-file": "warning",
    "screenshot-unknown-locale": "warning",
    "screenshot-locale-empty": "warning",
    "screenshot-primary-size-missing": "off",
    "screenshot-locale-parity": "off",
    "screenshot-watch-size-consistency": "error",
    "preview-format": "error",
    "preview-codec": "error",
    "preview-file-size": "error",
    "preview-duration": "error",
    "preview-resolution": "error",
    "preview-count-over": "error",
    "preview-frame-rate": "error",
    "preview-h264-profile": "error",
    "preview-audio-missing": "error",
    "preview-audio-layout": "error",
    "preview-audio-codec": "error",
    "preview-audio-sample-rate": "error",
    "preview-audio-bit-depth": "error",
    "preview-track-disabled": "warning",
  });
});

test("defaultConfig returns fresh copies", () => {
  const a = defaultConfig();
  const b = defaultConfig();
  a.rules["screenshot-format"] = "off";
  a.locales.extra.push("xx-XX");
  assert.equal(b.rules["screenshot-format"], "error");
  assert.deepEqual(b.locales.extra, []);
});

test("mergeConfig overrides rule levels and rejects bad ones", () => {
  const merged = mergeConfig(defaultConfig(), { rules: { "screenshot-png-alpha": "error" } });
  assert.equal(merged.rules["screenshot-png-alpha"], "error");
  assert.throws(
    () => mergeConfig(defaultConfig(), { rules: { "screenshot-png-alpha": "loud" } }),
    /must be one of error, warning, info, off/,
  );
});

test("mergeConfig rejects unknown rule ids so typos cannot silently disable a rule", () => {
  assert.throws(
    () => mergeConfig(defaultConfig(), { rules: { "screenshot-png-alfa": "off" } }),
    /config\.rules\.screenshot-png-alfa is not a known rule id/,
  );
});

test("mergeConfig rejects a non-object config", () => {
  assert.throws(() => mergeConfig(defaultConfig(), "nope"), /config must be a JSON object/);
});

test("mergeConfig merges locale lists", () => {
  const merged = mergeConfig(defaultConfig(), {
    locales: { allow: ["en-US"], extra: ["xx-XX"], ignore: ["archive"] },
  });
  assert.deepEqual(merged.locales, { allow: ["en-US"], extra: ["xx-XX"], ignore: ["archive"] });
  assert.throws(() => mergeConfig(defaultConfig(), { locales: { allow: 5 } }), /locales.allow/);
});

test("mergeConfig validates dimension overrides", () => {
  const merged = mergeConfig(defaultConfig(), {
    dimensions: { "iphone-6.9": { portrait: [[1000, 2000]] } },
  });
  assert.deepEqual(merged.dimensions, { "iphone-6.9": { portrait: [[1000, 2000]] } });

  assert.throws(
    () => mergeConfig(defaultConfig(), { dimensions: { x: "nope" } }),
    /config.dimensions.x must be an object/,
  );
  assert.throws(
    () => mergeConfig(defaultConfig(), { dimensions: { x: { portrait: [[1]] } } }),
    /config.dimensions.x.portrait must be an array of \[width, height\] pairs/,
  );
  assert.throws(
    () => mergeConfig(defaultConfig(), { dimensions: { x: { landscape: "y" } } }),
    /config.dimensions.x.landscape must be an array of \[width, height\] pairs/,
  );
});

test("loadConfig reads and merges a JSON file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "screenproof-config-"));
  const file = join(dir, "screenproof.json");
  await writeFile(file, JSON.stringify({ rules: { "screenshot-locale-parity": "warning" } }));
  const config = await loadConfig(file);
  assert.equal(config.rules["screenshot-locale-parity"], "warning");
});

test("loadConfig errors clearly on a missing file and invalid JSON", async () => {
  await assert.rejects(loadConfig("/nonexistent/screenproof.json"), /could not read config file/);
  const dir = await mkdtemp(join(tmpdir(), "screenproof-config-"));
  const file = join(dir, "bad.json");
  await writeFile(file, "{not json");
  await assert.rejects(loadConfig(file), /not valid JSON/);
});
