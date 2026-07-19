/**
 * CLI core: argument parsing and the runnable `run(argv, io)` entry point.
 *
 * Kept separate from `cli.ts` (the thin executable) so the whole command is
 * unit-testable with an injected IO object and no child processes.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { defaultConfig, loadConfig } from "./config.ts";
import { exitCode, renderHuman, renderJson } from "./report.ts";
import { listMetadataLocales, scan } from "./scan.ts";
import { validate } from "./validate.ts";

export interface Io {
  /** Write to standard output. */
  write(text: string): void;
  /** Write to standard error. */
  error(text: string): void;
  cwd: string;
  isTTY: boolean;
  env: Record<string, string | undefined>;
}

export interface ParsedArgs {
  path?: string;
  config?: string;
  /** Path to a deliver metadata folder for the cross-tree locale check. */
  metadata?: string;
  /** Treat the target as a flat folder of images. */
  flat: boolean;
  strict: boolean;
  json: boolean;
  quiet: boolean;
  /** false when `--no-color` was passed, otherwise undefined (auto). */
  color?: boolean;
  help: boolean;
  version: boolean;
}

export const HELP = `screenproof - lint App Store screenshots and app previews before you submit

Usage:
  screenproof [path] [options]

Arguments:
  path                 Path to a fastlane deliver screenshots/ folder, or any
                       folder of screenshot and preview media. Defaults to ./fastlane/screenshots
                       or ./screenshots.

Options:
  --config <file>      JSON config to override rules, locales, dimensions.
  --metadata <folder>  deliver metadata/ folder to cross-check: warns when a
                       metadata locale has no screenshots. Locale trees only;
                       cannot be combined with --flat.
  --flat               Treat the path as a flat folder of media (file-level
                       checks only, no locale rules).
  --strict             Exit non-zero on warnings as well as errors.
  --json               Print the report as JSON.
  --quiet              Hide clean locales and info findings.
  --no-color           Disable ANSI colour (also respects NO_COLOR).
  -h, --help           Show this help.
  -v, --version        Show the version.

Exit codes:
  0  no errors (and no warnings under --strict)
  1  lint errors found (or warnings under --strict)
  2  usage or config error
`;

/** Parse CLI arguments. Throws on invalid usage. */
export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    flat: false,
    strict: false,
    json: false,
    quiet: false,
    help: false,
    version: false,
  };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--flat") args.flat = true;
    else if (token === "--strict") args.strict = true;
    else if (token === "--json") args.json = true;
    else if (token === "--quiet") args.quiet = true;
    else if (token === "--no-color") args.color = false;
    else if (token === "-h" || token === "--help") args.help = true;
    else if (token === "-v" || token === "--version") args.version = true;
    else if (token === "--config") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--config requires a file path");
      args.config = value;
    } else if (token.startsWith("--config=")) {
      const value = token.slice("--config=".length);
      if (value === "") throw new Error("--config requires a file path");
      args.config = value;
    } else if (token === "--metadata") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--metadata requires a folder path");
      args.metadata = value;
    } else if (token.startsWith("--metadata=")) {
      const value = token.slice("--metadata=".length);
      if (value === "") throw new Error("--metadata requires a folder path");
      args.metadata = value;
    } else if (token.startsWith("-")) {
      throw new Error(`unknown option: ${token}`);
    } else {
      positionals.push(token);
    }
  }

  if (positionals.length > 1) throw new Error(`unexpected extra argument: ${positionals[1]}`);
  if (positionals.length === 1) args.path = positionals[0];
  return args;
}

function resolvePath(rawPath: string | undefined, cwd: string): string {
  if (rawPath) return isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
  const fastlane = join(cwd, "fastlane", "screenshots");
  if (existsSync(fastlane)) return fastlane;
  const bare = join(cwd, "screenshots");
  if (existsSync(bare)) return bare;
  return fastlane; // report the conventional path as missing
}

/** Explicit `--config` wins; otherwise auto-load `screenproof.json` from cwd. */
async function resolveConfig(configArg: string | undefined, cwd: string) {
  if (configArg) return loadConfig(resolve(cwd, configArg));
  const auto = join(cwd, "screenproof.json");
  if (existsSync(auto)) return loadConfig(auto);
  return defaultConfig();
}

async function readVersion(): Promise<string> {
  try {
    const raw = await readFile(new URL("../package.json", import.meta.url), "utf8");
    return String(JSON.parse(raw).version ?? "0.0.0");
  } catch {
    return "0.0.0";
  }
}

/** Run the CLI. Returns the process exit code. */
export async function run(argv: string[], io: Io): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    io.error(`${(err as Error).message}\n\n${HELP}`);
    return 2;
  }

  if (args.help) {
    io.write(HELP);
    return 0;
  }
  if (args.version) {
    io.write(`${await readVersion()}\n`);
    return 0;
  }

  if (args.flat && args.metadata !== undefined) {
    io.error(`--metadata cannot be used with --flat\n\n${HELP}`);
    return 2;
  }

  let config;
  try {
    config = await resolveConfig(args.config, io.cwd);
  } catch (err) {
    io.error(`${(err as Error).message}\n`);
    return 2;
  }

  let metadataLocales: string[] | null = null;
  if (args.metadata !== undefined) {
    const metadataPath = isAbsolute(args.metadata) ? args.metadata : resolve(io.cwd, args.metadata);
    try {
      metadataLocales = await listMetadataLocales(metadataPath);
    } catch (err) {
      io.error(`${(err as Error).message}\n`);
      return 2;
    }
  }

  const path = resolvePath(args.path, io.cwd);
  const scanned = await scan(path, config, { forceFlat: args.flat });
  const report = validate(scanned, config, { metadataLocales });

  if (args.json) {
    io.write(`${renderJson(report)}\n`);
  } else {
    const color = args.color ?? (io.isTTY && !io.env.NO_COLOR);
    io.write(`${renderHuman(report, { color, quiet: args.quiet })}\n`);
  }

  return exitCode(report, args.strict);
}
