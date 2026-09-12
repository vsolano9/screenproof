#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const temporary = await mkdtemp(join(tmpdir(), "screenproof-pack-"));

function run(command, args, cwd, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    if (capture && child.stdout) child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} ${args.join(" ")} exited ${signal ?? code}`));
    });
  });
}

try {
  const packed = await run(npm, ["pack", "--json", "--pack-destination", temporary], root, true);
  const [{ filename }] = JSON.parse(packed);
  const tarball = join(temporary, filename);
  await writeFile(join(temporary, "package.json"), JSON.stringify({ private: true }));
  await run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], temporary);
  await writeFile(join(temporary, "use.mts"), await readFile(join(root, "scripts", "pack-consumer", "use.mts")));
  await writeFile(join(temporary, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      strict: true,
      target: "ES2023",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      skipLibCheck: false,
      outDir: "compiled",
    },
    include: ["use.mts"],
  }));
  await run(process.execPath, [join(root, "node_modules", "typescript", "bin", "tsc")], temporary);
  await run(process.execPath, [join(temporary, "compiled", "use.mjs")], temporary);
  console.log(`packed consumer passed: ${filename}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
