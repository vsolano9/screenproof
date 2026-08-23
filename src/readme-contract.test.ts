import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readReleaseDocs(): Promise<{
  readme: string;
  version: string;
}> {
  const [readme, packageJson] = await Promise.all([
    readFile(new URL("README.md", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);

  return {
    readme,
    version: (JSON.parse(packageJson) as { version: string }).version,
  };
}

test("the GitHub Action example pins the current release", async () => {
  const { readme, version } = await readReleaseDocs();

  assert.match(
    readme,
    new RegExp(`uses: vsolano9/screenproof@v${version.replaceAll(".", "\\.")}`),
  );
  assert.match(
    readme,
    new RegExp(
      "The moving `@v0` tag points to the\\s+same `v" +
        version.replaceAll(".", "\\.") +
        "` release\\.",
    ),
  );
});

test("the limitations section does not deny shipped preview checks", async () => {
  const { readme } = await readReleaseDocs();

  assert.doesNotMatch(
    readme,
    /H\.264 profile, audio layout, bitrate, frame rate, and rotation-matrix checks are not enforced yet/,
  );
});

test("the rules table documents Apple Watch cross-localization consistency", async () => {
  const { readme } = await readReleaseDocs();

  assert.match(readme, /`screenshot-watch-size-consistency` \| error/);
  assert.match(
    readme,
    /Apple requires one Apple Watch screenshot size to be used consistently across all localizations/,
  );
});
