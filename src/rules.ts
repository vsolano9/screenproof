import type { Config, RuleLevel } from "./types.ts";

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
};

/** A fresh default configuration. */
export function defaultConfig(): Config {
  return {
    rules: { ...DEFAULT_RULES },
    locales: { allow: null, extra: [], ignore: [] },
    dimensions: {},
  };
}
