/**
 * App Store locale codes for screenshots folders.
 *
 * These are the localisation codes App Store Connect and fastlane deliver use
 * for `screenshots/<locale>/` folders. Unlike metadata text, screenshots have
 * NO `default/` fallback in deliver (verified 2026-07-09), so `default` is
 * intentionally not in this set; a `default/` screenshots folder gets its own
 * specific warning. The list can be extended per project via config
 * (`locales.extra`) if Apple adds a localisation.
 */

import type { Config } from "./types.ts";

/** Known App Store localisation codes. */
export const KNOWN_LOCALES: ReadonlySet<string> = new Set([
  "ar-SA",
  "ca",
  "cs",
  "da",
  "de-DE",
  "el",
  "en-AU",
  "en-CA",
  "en-GB",
  "en-US",
  "es-ES",
  "es-MX",
  "fi",
  "fr-CA",
  "fr-FR",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "ko",
  "ms",
  "nl-NL",
  "no",
  "pl",
  "pt-BR",
  "pt-PT",
  "ro",
  "ru",
  "sk",
  "sv",
  "th",
  "tr",
  "uk",
  "vi",
  "zh-Hans",
  "zh-Hant",
]);

/**
 * Metadata subfolders that are not locales. Used when cross-checking a
 * deliver metadata tree via `--metadata`.
 */
export const NON_LOCALE_FOLDERS: ReadonlySet<string> = new Set([
  "review_information",
  "trade_representative_contact_information",
]);

/**
 * True when `name` is a valid locale folder under the active config: the
 * allow-list decides when set, otherwise the built-in list plus extras.
 */
export function isKnownLocale(name: string, config: Config): boolean {
  if (config.locales.allow !== null) return config.locales.allow.includes(name);
  return KNOWN_LOCALES.has(name) || config.locales.extra.includes(name);
}
