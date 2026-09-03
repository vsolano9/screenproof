---
version: alpha
name: screenproof
description: Lint App Store screenshots and app previews for indie iOS teams in CI; the report must make PASS or FAIL and the failing file obvious at a glance.
tcv:
  spec: 1
  platform: tui
  profile: tui
  audience: "Indie iOS maintainers and CI · local TTY and GitHub Actions logs · deciding whether this screenshot tree can ship"
  status: live
  colorScheme: dark
  fonts:
    - { family: "Menlo", source: system, license: "Apple system font" }
  exports:
    - { target: ansi-ts, path: src/colors.generated.ts }
  checks: { contrast: AA, spacingScaleOnly: true, typeRolesOnly: true, maxFontFamilies: 2 }
  scenarios:
    - { id: screen-80x24, surface: src/report.ts, viewport: "80x24", modes: [dark] }
    - { id: screen-120x40, surface: src/report.ts, viewport: "120x40", modes: [dark] }
    - { id: error-state, surface: src/report.ts, viewport: "80x24", modes: [dark] }
  tui:
    roles: { bg: "{colors.canvas}", fg: "{colors.on-canvas}", muted: "{colors.on-surface-secondary}", accent: "{colors.primary}", error: "{colors.danger}", warning: "{colors.warning}", success: "{colors.success}" }
    ansi: { error: red, warning: yellow, info: cyan, success: green, muted: dim }
colors:
  canvas: "#081018"
  on-canvas: "#EAF6FA"
  surface: "#101A22"
  on-surface: "#EAF6FA"
  on-surface-secondary: "#8AA3AE"
  line: "#6A8490"
  primary: "#3AD6EC"
  on-primary: "#042028"
  primary-surface: "#0C2C36"
  success: "#5FD38A"
  warning: "#F2B84B"
  danger: "#FF8A80"
  on-danger: "#3B0A08"
typography:
  title: { fontFamily: "Menlo", fontSize: 13px, fontWeight: 700, lineHeight: 16px, letterSpacing: 0px }
  heading: { fontFamily: "Menlo", fontSize: 13px, fontWeight: 700, lineHeight: 16px, letterSpacing: 0px }
  body: { fontFamily: "Menlo", fontSize: 13px, fontWeight: 400, lineHeight: 16px, letterSpacing: 0px }
  body-emphasis: { fontFamily: "Menlo", fontSize: 13px, fontWeight: 700, lineHeight: 16px, letterSpacing: 0px }
  muted: { fontFamily: "Menlo", fontSize: 13px, fontWeight: 400, lineHeight: 16px, letterSpacing: 0px }
  code: { fontFamily: "Menlo", fontSize: 13px, fontWeight: 400, lineHeight: 16px, letterSpacing: 0px }
  status: { fontFamily: "Menlo", fontSize: 13px, fontWeight: 700, lineHeight: 16px, letterSpacing: 0px }
  prompt: { fontFamily: "Menlo", fontSize: 13px, fontWeight: 700, lineHeight: 16px, letterSpacing: 0px }
  timestamp: { fontFamily: "Menlo", fontSize: 13px, fontWeight: 400, lineHeight: 16px, letterSpacing: 0px }
rounded: { none: 0px, sm: 0px, md: 0px, lg: 0px, xl: 0px, full: 0px }
spacing: { "1": 4px, "2": 8px, "3": 12px, "4": 16px, "5": 20px, "6": 24px, "8": 32px, "10": 40px, "12": 48px, "16": 64px }
components:
  button-primary: { backgroundColor: "{colors.primary}", textColor: "{colors.on-primary}", typography: "{typography.body-emphasis}" }
  button-secondary: { backgroundColor: "{colors.primary-surface}", textColor: "{colors.primary}", typography: "{typography.body}" }
  field: { backgroundColor: "{colors.surface}", textColor: "{colors.on-surface}", typography: "{typography.code}" }
  card: { backgroundColor: "{colors.surface}", textColor: "{colors.on-surface}", borderColor: "{colors.line}" }
  list-row: { backgroundColor: "{colors.canvas}", textColor: "{colors.on-canvas}", typography: "{typography.body}" }
  sheet: { backgroundColor: "{colors.surface}", textColor: "{colors.on-surface}", borderColor: "{colors.line}" }
  chip: { backgroundColor: "{colors.primary-surface}", textColor: "{colors.primary}", typography: "{typography.status}" }
  header: { backgroundColor: "{colors.canvas}", textColor: "{colors.on-canvas}", typography: "{typography.title}" }
elevation:
  level-0: { shadow: none }
  level-1: { shadow: none, border: single }
  level-2: { shadow: none, border: single }
  level-3: { shadow: none, border: double }
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

Job: lint this App Store screenshots tree before I upload so CI fails for the real reason, not a vague App Store Connect error. Audience: indie iOS maintainers and CI. Context: a one-shot CLI in an 80-column GitHub Actions log or a laptop TTY, five to thirty seconds. Feeling: forensic certainty, not decorative dashboard calm. Constraints: Node 24+, zero runtime dependencies, MIT, `--json` colorless, `--no-color` and `NO_COLOR` already part of the contract. Monetization: none.

Visual thesis: a CI log that reads like a proofing station. One dim title, locale rows as scanlines, findings indented four cells with a 24-cell file column, and a last-line verdict that detonates in phosphor cyan or danger. Color is a hint on top of glyphs and words. Truecolor paints the lockup; 16-color falls back to green, red, yellow, cyan, dim; `NO_COLOR` keeps the words and ASCII `+` / `x` / `!`.

Signature decision: verdict cinema. The Summary line is a truecolor lockup (glyph plus the words PASS or FAIL in `primary` or `danger`) with a dim crop-tick scanline; 16-color green/red; `NO_COLOR` keeps `[PASS]` / `[FAIL]` and the ASCII glyphs. That lockup is the only maximal move. Everything else is scanlines.

Rejected category layout: the CI dashboard of boxed locale cards, and ruff's `file:line:col` flatten. Screenshots have no source span; the unit is a localization. Boxes wrap and explode at 80 columns.

Priority ladder:

1. Preserve supplied facts, prices, units, legal text, privacy requirements, and task constraints.
2. Preserve the host stack, routes, native components, and this DESIGN.md's tokens.
3. Make the reader's job and the one primary action immediately clear.
4. Establish the product's authorship through its type, accent, spacing rhythm, and restraint.
5. Choose a composition specific to this screen; reject both generic defaults and a fixed template.
6. Refine motion, depth, and detail without weakening hierarchy.
7. screenproof: when a flourish and a finding collide, the filename, the rule id, and the words PASS/FAIL win.

## Colors

Accent is phosphor cyan, OKLCH L 0.81 C 0.13 h 204 (`primary` `#3AD6EC`). It is the fill, the ink on `canvas` (primary-text), and the text on `primary-surface` `#0C2C36`. `on-primary` `#042028` sits on the fill. Neutrals take the same hue at very low chroma so the greys belong to the proofing CRT: `canvas` `#081018`, `surface` `#101A22`, `on-canvas` / `on-surface` `#EAF6FA`, `on-surface-secondary` `#8AA3AE`, `line` `#6A8490` (3:1 on both grounds). `success` `#5FD38A`, `warning` `#F2B84B`, `danger` `#FF8A80` mark status only; each finding also carries the word `error`, `warning`, or `info`. Truecolor roles map onto 16-color-safe ANSI in `tcv.tui.ansi`. `NO_COLOR` and `--no-color` disable every escape, including on stderr.

## Typography

The terminal owns the face; `Menlo` is the declared system mono. Roles map to weight and color only. A report uses at most three: `title` for the dim `screenproof  <root>` header, `status` for the padded severity word, `body` for the message. `body-emphasis` is the PASS/FAIL lockup. `code` is the file column. `muted` is the header and crop ticks. Never a fourth role on one report.

## Layout

Cell grid. One cell between the glyph and the locale id; two cells before `ok`. Findings indent four cells, then a 7-cell severity column, then a 24-cell file column, then the message. One blank line before Summary. Wrap only the message; never the locale id, never the filename, never PASS/FAIL. Layout must hold at 80x24 with no wrap mid-token. 120x40 gains more locale rows, not new columns or panes. ASCII fallback when the terminal is not UTF-8: `+` `x` `!` `.` for `✓` `✖` `!` `·`.

## Elevation & Depth

Tier 0, flat. No shadows. `level-1` exists in the schema as a single box-drawing border and is not used on the report: borders never wrap a locale or a finding (`tui-04`). `level-3` double border is reserved for a future confirm sheet this CLI does not have.

## Shapes

Radii are all 0. No corners. Box drawing, if it ever appears, is one light set (`│ ─ ┌ ┐ └ ┘`) and only to separate panes, never to decorate a list row. The current report draws zero boxes. Crop ticks on the verdict line are dim `muted` characters, not a second border weight.

## Components

| Component | Role | Notes |
| --- | --- | --- |
| button-primary | PASS lockup | `body-emphasis` in `success` / `primary`; word PASS required |
| button-secondary | ok locale | `✓ <locale>  ok` in `success` plus the word `ok` |
| field | file column | 24 cells, `code` role, never wraps |
| card | locale group | scanline, no box |
| list-row | finding | 4-cell indent, severity word, file, message |
| sheet | report-level finding | empty locale in locale mode; glyph tracks severity |
| chip | severity word | `error` `warning` `info` padded to 7, never color-only |
| header | title line | `screenproof  <root>` in `muted`; `(flat mode)` suffix |

## Motion

One-shot paint. The verdict lockup is the designed effect: it appears in `duration-fast` on a TTY with truecolor, mapped to 16-color green/red otherwise. Reduced-motion equivalent is `reduced-motion: crossfade-120` plus `NO_COLOR` / `--no-color`: the words remain, the escapes go. No spinner, no progress bar, no redraw on a non-TTY stream (`tui-08`). Perf budget: one write to stdout, zero animation frames.

## States

- `default` — designed: locale scanlines plus Summary.
- `hover/press` — N/A: not interactive.
- `focus-visible` — N/A: not interactive.
- `disabled` — N/A: no controls.
- `loading` — N/A: one-shot, no spinner.
- `empty` — designed: `missing-screenshots` as a report-level error and FAIL.
- `sparse` — designed: one locale, one finding, Summary still last.
- `error` — designed: `✖` plus the word `error` plus FAIL.
- `validation` — designed: usage/config failures on stderr, exit 2, HELP text uncolored.
- `permission` — designed: `screenshot-unreadable` as an error finding.
- `offline/retry` — N/A: the tool is offline by contract.
- `success` — designed: `✓` plus `ok` plus PASS.
- `selected` — N/A: no selection.
- `destructive-confirm` — N/A: no destructive command.
- `interrupted` — N/A: Ctrl-C is the shell.

## Do's and Don'ts

- Do: paint the severity as the word `error`, `warning`, or `info`. Don't: drop the word and keep only a colored glyph.
- Do: keep `✓ en-US  ok` on one line at 80 columns. Don't: wrap the locale id.
- Do: pad the file column to 24 cells so `01.png` lines up. Don't: let `01-iphone-6.9-display.png` shove the message into a wrap of the filename.
- Do: use `✖` only for errors. Don't: paint `✖` on `screenshot-unexpected-file` (that line is `!` plus `warning`).
- Do: honor `--no-color` and `NO_COLOR` on stdout. Don't: leave the Summary verdict colored when either is set.
- Do: show `(flat mode)` in the dim header. Don't: invent a second pane for flat versus locale.
- Do: print `FAIL` as a word on the Summary line. Don't: encode failure as red-only.
- Do: ASCII-fallback `x` / `+` / `!` when UTF-8 is off. Don't: emit `✓` / `✖` into a non-UTF-8 log.
- Do: group findings under the locale. Don't: flatten to ruff `file:line:col` (screenshots have no source line).
- Do: keep `--json` colorless and identical to the API. Don't: put ANSI inside JSON.

## Anti-patterns

Inherits tcv-tui anti-patterns.

- screenproof-01 Color-only verdict: PASS or FAIL missing as a word.
- screenproof-02 Ruff-flatten: findings without locale grouping.
- screenproof-03 Dashboard cards: box-drawing around every locale in a CI log.
- screenproof-04 Second accent for device class (iPhone versus Watch).

## Verification

| Scenario | Command | Pass criteria |
| --- | --- | --- |
| screen-80x24 | `COLUMNS=80 node --test src/report.test.ts` then capture `renderHuman` of a two-locale tree to `_receipts/design-system/screenproof/2026-09-03/screen-80x24-dark.txt` | header, locale scanlines, Summary fit 80 columns; no wrap mid-filename; `tr -cd '\033' \| wc -c` > 0 when color is on |
| screen-120x40 | same renderer, `COLUMNS=120`, `_receipts/design-system/screenproof/2026-09-03/screen-120x40-dark.txt` | extra width is trailing space, not a new pane; file column still 24 cells |
| error-state | `renderHuman` of `screenshot-unknown-dimensions` plus a report-level `missing-screenshots` to `_receipts/design-system/screenproof/2026-09-03/error-state-dark.txt` | `✖` and the word `error` and `FAIL` all present; `NO_COLOR=1` capture `error-state-nocolor.txt` contains zero `ESC[` bytes and still carries `error` and `FAIL` |

Last verified: 2026-09-03 · receipts `_receipts/design-system/screenproof/2026-09-03/` · `designmd audit` count: 0 before wiring, 0 after.
