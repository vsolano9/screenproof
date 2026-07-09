import { strict as assert } from "node:assert";
import { test } from "node:test";

import { defaultConfig } from "./config.ts";
import { isKnownLocale, KNOWN_LOCALES, NON_LOCALE_FOLDERS } from "./locales.ts";

test("common App Store locales are known", () => {
  const config = defaultConfig();
  for (const locale of ["en-US", "de-DE", "ja", "zh-Hans", "pt-BR"]) {
    assert.equal(isKnownLocale(locale, config), true, locale);
  }
});

test("default is NOT a known screenshots locale (deliver has no default/ fallback for screenshots)", () => {
  assert.equal(KNOWN_LOCALES.has("default"), false);
  assert.equal(isKnownLocale("default", defaultConfig()), false);
});

test("typo locales are unknown", () => {
  const config = defaultConfig();
  assert.equal(isKnownLocale("en_US", config), false);
  assert.equal(isKnownLocale("english", config), false);
});

test("locales.extra extends the known set", () => {
  const config = defaultConfig();
  config.locales.extra = ["xx-XX"];
  assert.equal(isKnownLocale("xx-XX", config), true);
});

test("locales.allow narrows to an allow-list", () => {
  const config = defaultConfig();
  config.locales.allow = ["en-US"];
  assert.equal(isKnownLocale("en-US", config), true);
  assert.equal(isKnownLocale("de-DE", config), false);
});

test("metadata non-locale folders are listed", () => {
  assert.equal(NON_LOCALE_FOLDERS.has("review_information"), true);
});
