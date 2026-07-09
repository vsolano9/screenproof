#!/usr/bin/env node
/**
 * screenproof executable. Thin wrapper over `run(argv, io)` in cli-core.ts.
 * The published npm package ships this compiled to dist/cli.js; the GitHub
 * Action and local development run this source directly on Node >= 24.
 */

import { run, type Io } from "./cli-core.ts";

const io: Io = {
  write: (text) => void process.stdout.write(text),
  error: (text) => void process.stderr.write(text),
  cwd: process.cwd(),
  isTTY: Boolean(process.stdout.isTTY),
  env: process.env,
};

run(process.argv.slice(2), io).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`screenproof: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 2;
  },
);
