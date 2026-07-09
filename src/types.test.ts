import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Finding } from "./types.ts";

test("Finding shape is constructible and JSON-serialisable", () => {
  const finding: Finding = {
    locale: "en-US",
    file: "01-home.png",
    rule: "screenshot-unknown-dimensions",
    severity: "error",
    message: "example",
  };
  const roundTripped = JSON.parse(JSON.stringify(finding)) as Finding;
  assert.deepEqual(roundTripped, finding);
});
