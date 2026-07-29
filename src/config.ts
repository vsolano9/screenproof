/**
 * Configuration: built-in defaults plus a validated merge of a user config
 * file (`screenproof.json`).
 *
 * A project can override rule severities (including turning rules `off`),
 * locale allow/extra/ignore lists, and the dimension table (extend or replace
 * device-class sizes without waiting for a release when Apple ships new
 * hardware). Unknown top-level keys are ignored for forward compatibility,
 * but malformed values are rejected with a clear error.
 */

import { readFile } from "node:fs/promises";

import type { Config, DimensionOverrides, RuleLevel } from "./types.ts";

const RULE_LEVELS: ReadonlySet<string> = new Set(["error", "warning", "info", "off"]);

/** Default rule severities. Keys are stable rule ids used across the linter. */
export const DEFAULT_RULES: Readonly<Record<string, RuleLevel>> = {
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
  "preview-format": "error",
  "preview-codec": "error",
  "preview-file-size": "error",
  "preview-duration": "error",
  "preview-resolution": "error",
  "preview-count-over": "error",
};

/** A fresh default configuration. */
export function defaultConfig(): Config {
  return {
    rules: { ...DEFAULT_RULES },
    locales: { allow: null, extra: [], ignore: [] },
    dimensions: {},
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSizePairArray(value: unknown): value is [number, number][] {
  return (
    Array.isArray(value) &&
    value.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        pair.every((n) => typeof n === "number" && Number.isInteger(n) && n > 0),
    )
  );
}

function cloneConfig(base: Config): Config {
  return {
    rules: { ...base.rules },
    locales: {
      allow: base.locales.allow === null ? null : [...base.locales.allow],
      extra: [...base.locales.extra],
      ignore: [...base.locales.ignore],
    },
    dimensions: Object.fromEntries(
      Object.entries(base.dimensions).map(([id, override]) => [
        id,
        {
          ...(override.portrait ? { portrait: override.portrait.map((p) => [...p] as [number, number]) } : {}),
          ...(override.landscape ? { landscape: override.landscape.map((p) => [...p] as [number, number]) } : {}),
        },
      ]),
    ),
  };
}

/**
 * Merge a partial config (typically parsed from JSON) over a base config.
 * Returns a new config. Throws a clear error on malformed values.
 */
export function mergeConfig(base: Config, input: unknown): Config {
  const merged = cloneConfig(base);
  if (input === undefined || input === null) return merged;
  if (!isPlainObject(input)) {
    throw new Error("config must be a JSON object");
  }

  if ("rules" in input) {
    if (!isPlainObject(input.rules)) throw new Error("config.rules must be an object");
    for (const [key, value] of Object.entries(input.rules)) {
      if (!(key in DEFAULT_RULES)) {
        throw new Error(`config.rules.${key} is not a known rule id`);
      }
      if (typeof value !== "string" || !RULE_LEVELS.has(value)) {
        throw new Error(`config.rules.${key} must be one of error, warning, info, off`);
      }
      merged.rules[key] = value as RuleLevel;
    }
  }

  if ("locales" in input) {
    if (!isPlainObject(input.locales)) throw new Error("config.locales must be an object");
    const { allow, extra, ignore } = input.locales;
    if (allow !== undefined) {
      if (allow !== null && !isStringArray(allow)) {
        throw new Error("config.locales.allow must be null or an array of strings");
      }
      merged.locales.allow = allow;
    }
    if (extra !== undefined) {
      if (!isStringArray(extra)) throw new Error("config.locales.extra must be an array of strings");
      merged.locales.extra = extra;
    }
    if (ignore !== undefined) {
      if (!isStringArray(ignore)) throw new Error("config.locales.ignore must be an array of strings");
      merged.locales.ignore = ignore;
    }
  }

  if ("dimensions" in input) {
    if (!isPlainObject(input.dimensions)) throw new Error("config.dimensions must be an object");
    const overrides: DimensionOverrides = {};
    for (const [id, value] of Object.entries(input.dimensions)) {
      if (!isPlainObject(value)) {
        throw new Error(`config.dimensions.${id} must be an object with portrait/landscape arrays`);
      }
      const override: DimensionOverrides[string] = {};
      for (const orientation of ["portrait", "landscape"] as const) {
        if (!(orientation in value)) continue;
        const pairs = value[orientation];
        if (!isSizePairArray(pairs)) {
          throw new Error(`config.dimensions.${id}.${orientation} must be an array of [width, height] pairs`);
        }
        override[orientation] = pairs;
      }
      overrides[id] = override;
    }
    merged.dimensions = { ...merged.dimensions, ...overrides };
  }

  return merged;
}

/** Read a JSON config file and merge it over the defaults. */
export async function loadConfig(filePath: string, base: Config = defaultConfig()): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    throw new Error(`could not read config file "${filePath}": ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`config file "${filePath}" is not valid JSON: ${(err as Error).message}`);
  }
  return mergeConfig(base, parsed);
}
