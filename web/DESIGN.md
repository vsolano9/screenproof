---
version: alpha
name: screenproof
description: Inspect App Store screenshot fixtures entirely in the browser; the exact failing rule and Apple-style reason must be obvious before upload.
tcv:
  spec: 1
  platform: web
  profile: web
  audience: "Indie iOS maintainers and release engineers · desktop browser beside Xcode or fastlane · deciding whether a screenshot tree can ship"
  status: live
  colorScheme: both
  fonts:
    - { family: "Menlo", source: system, license: "Apple system font" }
  exports:
    - { target: css, path: src/tokens.generated.css }
    - { target: json, path: src/tokens.generated.json }
  checks: { contrast: AA, spacingScaleOnly: true, typeRolesOnly: true, maxFontFamilies: 2 }
  scenarios:
    - { id: wrong-size, surface: "/?fixture=wrong-size", viewport: "1280x800", modes: [light, dark, xxl] }
    - { id: valid-size, surface: "/?fixture=valid-size", viewport: "390x844", modes: [light, dark, xxl] }
    - { id: wrong-locale, surface: "/?fixture=wrong-locale", viewport: "1280x800", modes: [light, dark, xxl] }
colors:
  canvas: "#F5FAFC"
  canvas-dark: "#081018"
  on-canvas: "#081018"
  on-canvas-dark: "#EAF6FA"
  surface: "#FFFFFF"
  surface-dark: "#101A22"
  on-surface: "#081018"
  on-surface-dark: "#EAF6FA"
  on-surface-secondary: "#4D6772"
  on-surface-secondary-dark: "#8AA3AE"
  line: "#6A8490"
  line-dark: "#6A8490"
  primary: "#08798A"
  primary-dark: "#3AD6EC"
  on-primary: "#FFFFFF"
  on-primary-dark: "#042028"
  primary-surface: "#D9F6FA"
  primary-surface-dark: "#0C2C36"
  success: "#187A43"
  success-dark: "#5FD38A"
  warning: "#815400"
  warning-dark: "#F2B84B"
  danger: "#B3261E"
  danger-dark: "#FF8A80"
  on-danger: "#FFFFFF"
  on-danger-dark: "#3B0A08"
typography:
  display: { fontFamily: "Menlo", fontSize: 56px, fontWeight: 700, lineHeight: 60px, letterSpacing: -1.5px }
  title-1: { fontFamily: "Menlo", fontSize: 36px, fontWeight: 700, lineHeight: 42px, letterSpacing: -0.8px }
  title-2: { fontFamily: "Menlo", fontSize: 24px, fontWeight: 700, lineHeight: 30px, letterSpacing: -0.4px }
  headline: { fontFamily: "Menlo", fontSize: 18px, fontWeight: 700, lineHeight: 26px, letterSpacing: 0px }
  body: { fontFamily: "Menlo", fontSize: 17px, fontWeight: 400, lineHeight: 27px, letterSpacing: 0px }
  body-emphasis: { fontFamily: "Menlo", fontSize: 17px, fontWeight: 700, lineHeight: 27px, letterSpacing: 0px }
  small: { fontFamily: "Menlo", fontSize: 14px, fontWeight: 400, lineHeight: 20px, letterSpacing: 0px }
  caption: { fontFamily: "Menlo", fontSize: 12px, fontWeight: 700, lineHeight: 16px, letterSpacing: 0.2px }
  code: { fontFamily: "Menlo", fontSize: 14px, fontWeight: 400, lineHeight: 22px, letterSpacing: 0px, fontFeature: "tnum" }
rounded: { none: 0px, sm: 0px, md: 0px, lg: 0px, xl: 0px, full: 0px }
spacing: { "1": 4px, "2": 8px, "3": 12px, "4": 16px, "5": 20px, "6": 24px, "8": 32px, "10": 40px, "12": 48px, "16": 64px }
components:
  button-primary: { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", borderRadius: "{rounded.none}", height: 44px, typography: "{typography.body-emphasis}" }
  button-secondary: { backgroundColor: "{colors.primary-surface}", textColor: "{colors.primary}", borderRadius: "{rounded.none}", height: 44px, typography: "{typography.body-emphasis}" }
  field: { backgroundColor: "{colors.surface}", textColor: "{colors.on-surface}", borderRadius: "{rounded.none}", height: 44px, padding: "{spacing.3}", borderColor: "{colors.line}", typography: "{typography.body}" }
  card: { backgroundColor: "{colors.surface}", textColor: "{colors.on-surface}", borderRadius: "{rounded.none}", padding: "{spacing.6}", elevation: level-1 }
  list-row: { backgroundColor: "{colors.canvas}", textColor: "{colors.on-canvas}", minHeight: 44px, padding: "{spacing.4}", typography: "{typography.body}" }
  sheet: { backgroundColor: "{colors.surface}", textColor: "{colors.on-surface}", borderRadius: "{rounded.none}", padding: "{spacing.6}", elevation: level-1 }
  chip: { backgroundColor: "{colors.primary-surface}", textColor: "{colors.primary}", borderRadius: "{rounded.none}", height: 32px, padding: "{spacing.2}", typography: "{typography.caption}" }
  header: { backgroundColor: "{colors.canvas}", textColor: "{colors.on-canvas}", height: 64px, typography: "{typography.headline}" }
  result-row: { backgroundColor: "{colors.canvas}", textColor: "{colors.on-canvas}", borderColor: "{colors.line}", minHeight: 44px, padding: "{spacing.4}", typography: "{typography.code}" }
elevation:
  level-0: { shadow: none }
  level-1: { shadow: "0 2px 8px {colors.on-canvas}@0.08", material: regular }
  level-2: { shadow: "0 4px 12px {colors.on-canvas}@0.10" }
  level-3: { shadow: "0 8px 24px {colors.on-canvas}@0.14", material: regular }
motion:
  duration-fast: 120ms
  duration-base: 200ms
  duration-slow: 340ms
  duration-emphasis: 480ms
  ease-standard: "cubic-bezier(0.2,0,0,1)"
  ease-entrance: "cubic-bezier(0,0,0.2,1)"
  ease-exit: "cubic-bezier(0.4,0,1,1)"
  spring-snappy: "response 0.22, damping 0.78"
  spring-smooth: "response 0.34, damping 0.86"
  reduced-motion: crossfade-120
---

## Overview

Job: inspect this App Store screenshot or locale folder before uploading it. Audience: indie iOS maintainers and release engineers who already understand fastlane and pixel exports. Context: a short desktop-browser check beside Xcode or a release terminal. Feeling: forensic certainty, not dashboard calm. Constraints: Vite and TypeScript, no runtime dependencies, no user-file network calls, synthetic fixtures only, and the CLI remains unchanged. Monetization: none.

Visual thesis: a browser proofing station translated directly from screenproof's CI report. A split workspace puts local input on the left and a dense rule matrix on the right. Square crop marks, scanlines, monospaced evidence, and phosphor cyan carry the CLI identity; error red is reserved for the exact failing row. Light mode is paper proof, dark mode is the CRT bench. The uploaded pixels never become decoration.

Signature decision: the selected fixture is framed by four crop marks; when inspection completes, the marks draw inward over `duration-base` while the matching result row receives a single horizontal scan. Reduced motion shows the final crop marks and row immediately.

Rejected category layout: a centered upload hero followed by three feature cards. This is a task surface, so the input and evidence matrix share the first screen.

Priority ladder:

1. Preserve supplied facts, prices, units, legal text, privacy requirements, and task constraints.
2. Preserve the host stack, routes, native components, and this DESIGN.md's tokens.
3. Make the reader's job and the one primary action immediately clear.
4. Establish the product's authorship through its type, accent, spacing rhythm, and restraint.
5. Choose a composition specific to this screen; reject both generic defaults and a fixed template.
6. Refine motion, depth, and detail without weakening hierarchy.
7. screenproof: the filename, exact rule id, Apple-style reason, and local-processing promise outrank visual flourish.

## References

| ref | source | job | what to borrow | what must be newly invented |
| --- | --- | --- | --- | --- |
| Tide Guide iPad | App Store screenshot `mobile/tide-guide-ipad-01.jpg` | interface hierarchy | one immediate focal object backed by dense evidence | a desktop file-to-rule workspace with no product imagery |
| Insight Films | `brand/insight-films-system.jpg` | material | dark ink depth and hard horizontal crop tension | square proofing geometry with no cinematic content |
| Vercel home | `https://vercel.com/home` captured 2026-09-10 | composition | asymmetric first-screen balance and one dominant proof object | screenproof's split inspector rather than a marketing hero |
| Squoosh | `https://squoosh.app/` captured 2026-09-10 | state language | drag target before any settings and preloaded examples as immediate entry | explicit local-processing trust copy and deterministic rule rows |

## Colors

The light `primary` is deep phosphor cyan (OKLCH approximately L 0.53 C 0.10 h 204) so white-on-fill and accent-on-`primary-surface` remain AA. Dark mode raises lightness to the CLI's `#3AD6EC`. Neutral canvases keep the same cool hue at low chroma. `line` remains at least 3:1 against both surfaces. Success, warning, and danger always appear with PASS, WARN, or FAIL text.

## Typography

Menlo is the system mono used by the CLI and declared here without a web-font request. `title-1` names the selected fixture, `headline` names the workspace sections, `body` carries instructions, and `code` carries evidence. Each region uses at most three roles. Fluid CSS may reduce titles with rem floors but never below the role's readable equivalent.

## Layout

A 12-column, 75rem workspace uses five columns for input and seven for inspection. The vertical divider is one `line`; internal groups use spacing rather than nested cards. At 48rem the panes stack input before results. At 320 CSS pixels every matrix row becomes a label-value list with no horizontal page scroll.

## Elevation & Depth

Tier 1. The result workspace alone uses `level-1`; the input plane remains level 0. One top light source, ink-tinted alpha 0.08. No glass and no more than two visible depth levels.

## Shapes

All radii are zero to preserve the CLI crop-frame identity. Native file controls receive square 44px hit targets. Crop marks, not rounded containers, identify the active fixture.

## Components

| Component | Role | Notes |
| --- | --- | --- |
| button-primary | choose files | filled once in the input rail |
| button-secondary | preloaded fixture | selected state uses `primary-surface` plus text |
| field | hidden file and folder inputs | native semantics, visually routed through labels |
| card | result workspace | one outer surface only |
| list-row | fixture choice and file summary | direct labels, no metadata pills |
| sheet | drag target | dashed line and crop marks, no nested surface |
| chip | PASS, WARN, FAIL word | square direct status label, never color-only |
| header | product and source links | local-only state stays visible at the far edge |
| result-row | rule matrix record | status, exact rule id, and reason remain together |

## Motion

The crop-frame draw and one-row scan use `duration-base` with `ease-entrance`; hover and focus color changes use `duration-fast`. `prefers-reduced-motion` removes travel and retains a 120ms opacity crossfade. Perf budget: static assets under 100 KB, no runtime network requests for inspection, LCP under 2.5 seconds, INP under 200ms, CLS below 0.1 in lab smoke tests.

## States

- `default` — designed: empty input and an explanation in the results pane.
- `hover/press` — designed: file target line strengthens; buttons translate by one token-safe pixel-free inset effect.
- `focus-visible` — designed: 2px `primary` outline at 2px offset on every control and link.
- `disabled` — designed: fixture controls disable during byte reads and retain labels.
- `loading` — designed: selected filename plus `Inspecting locally…`, no spinner.
- `empty` — designed: `Drop files or choose a synthetic fixture` and no fake result rows.
- `sparse` — designed: one file still shows the complete rule matrix.
- `error` — designed: FAIL word, rule id, and reason in one row.
- `validation` — designed: unreadable or unsupported files produce `screenshot-format` or `preview-format`.
- `permission` — designed: folder reads rejected by the browser surface as an interruption message.
- `offline/retry` — designed: static app remains usable once loaded; no retry control because inspection is local.
- `success` — designed: PASS word and `No enabled rules failed`.
- `selected` — designed: fixture button uses `primary-surface`, a left rule, and `aria-pressed`.
- `destructive-confirm` — N/A: clearing local in-memory results is reversible and has no server effect.
- `interrupted` — designed: a newer selection supersedes an older read and the latest filename wins.

## Do's and Don'ts

- Do: keep input and rule evidence above the fold at 1280x800. Don't: put a marketing hero before the inspector.
- Do: print the exact stable rule id. Don't: replace it with a friendly paraphrase.
- Do: preserve Apple's dimensions and reason text. Don't: shorten the nearest-size evidence.
- Do: say `All processing stays in your browser.` beside the input. Don't: hide privacy copy in a footer.
- Do: show PASS, WARN, or FAIL as words. Don't: use cyan, amber, or red alone.
- Do: keep uploaded files in memory. Don't: send a user file through fetch, forms, analytics, or logs.
- Do: use three synthetic fixtures. Don't: bundle customer screenshots or real App Store listings.
- Do: let folder paths establish locale mode. Don't: guess a locale from a bare filename.
- Do: render every matrix row as status, rule, and reason. Don't: turn rules into icon cards.
- Do: stack the input before evidence on mobile. Don't: hide result reasons to fit 320px.

## Anti-patterns

Inherits tcv-web anti-patterns.

- screenproof-01 Upload hero: a centered drop circle with the report below the fold.
- screenproof-02 Rule badges: rule ids broken into floating pills away from their reasons.
- screenproof-03 Screenshot decoration: rendering user pixels as a promotional visual.
- screenproof-04 Local-only footnote: the privacy promise moved away from the file controls.

## Verification

| Scenario | Command | Pass criteria |
| --- | --- | --- |
| wrong-size | browser screenshot of `/?fixture=wrong-size` at 1280x800, light/dark/200% | FAIL row names `screenshot-unknown-dimensions` and the closest size; local note visible |
| valid-size | browser screenshot of `/?fixture=valid-size` at 390x844, light/dark/200% | PASS result fits without page-level horizontal scroll |
| wrong-locale | browser screenshot of `/?fixture=wrong-locale` at 1280x800, light/dark/200% | WARN row names `screenshot-unknown-locale` and `en_US` |

Last verified: 2026-09-10 against `https://screenproof.vercel.app` · receipts `receipts/live-*.png` · `designmd audit` count: 0.
