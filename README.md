# screenproof

Lint your App Store screenshots and app previews before you submit.

`screenproof` checks a [fastlane `deliver`](https://docs.fastlane.tools/actions/deliver/) `screenshots/` tree (or any folder of media) against Apple's published screenshot and app-preview rules: exact dimensions, format validity, video codec/container compatibility, duration, file size, per-localization counts, and locale-folder hygiene. It runs offline, catches problems before an upload fails late with a vague error, and returns a non-zero exit code so it can gate CI.

It is the visual-asset sibling of [metaproof](https://github.com/vsolano9/metaproof), which lints the text metadata half of the same submission.

- Exact-size validation against Apple's current specification table, with the nearest valid size suggested for every rejected image (same aspect ratio preferred, so it never suggests a stretch).
- Device-class detection by pixel resolution, mirroring deliver's behavior including the iPad 12.9"/13" and Apple TV/Vision Pro shared-resolution disambiguation.
- Per-locale checks: counts over Apple's 10-per-device limit, required Apple Watch exact-size consistency across localizations, empty locale folders, typo locale names (`en_US`), stray files.
- Optional cross-checks: locale parity across localizations, current-primary-size presence, and a `--metadata` comparison against your deliver metadata tree.
- App-preview checks: `.mov`/`.m4v`/`.mp4` container structure, H.264 or ProRes 422 HQ codec/container compatibility, 500 MB size ceiling, 15 to 30 second duration, accepted resolution, and the three-per-device-size limit in each localization.
- Zero-dependency PNG and JPEG header parsing. **Fully offline. No network, no credentials, no telemetry.**
- Zero-dependency ISO base-media and QuickTime atom parsing that skips encoded media payloads.

## Browser fixture inspector

Open **[screenproof.vercel.app](https://screenproof.vercel.app)** to inspect files
or a fastlane locale folder without installing anything. User files never leave
the browser. The bundled examples are synthetic, including this deliberate
failure:

```text
FAIL  screenshot-unknown-dimensions
1170x2500 does not match any known App Store screenshot size;
closest is 1170x2532 (iPhone 6.1-inch, portrait)
```

Choose **Wrong size** to reproduce it, or drop your own PNG, JPEG, MOV, M4V, or
MP4. The inspector runs the package's shared parsers and validation rules; it
does not upload, persist, or log user media.

## Requirements

Node.js 24 or newer, and zero runtime dependencies. The published package ships compiled JavaScript, so `npx screenproof` and `npm install` just work with no build step on your side.

## Install

Run it without installing:

```bash
npx screenproof fastlane/screenshots
```

Or add it to a project:

```bash
npm install --save-dev screenproof
```

## Usage

```bash
screenproof [path] [options]
```

If `path` is omitted, screenproof looks for `./fastlane/screenshots`, then `./screenshots`. Point it at a deliver tree (per-locale folders) or any flat folder of images; the mode is detected automatically. A root that contains subfolders and no loose images is treated as a locale tree (so misspelled locale folders still get flagged); loose images at the root mean flat mode. Symlinked images and locale folders are followed, and broken symlinks are flagged as unexpected files.

| Option | Description |
| --- | --- |
| `--config <file>` | JSON config to override rules, locales, and the dimension table. |
| `--metadata <folder>` | deliver `metadata/` folder to cross-check against a locale tree: warns when a metadata locale has no screenshots. Cannot be combined with explicit `--flat`. |
| `--flat` | Treat the path as a flat folder of images (file-level checks only). |
| `--strict` | Make warnings fail the effective `gate` as well as errors. |
| `--json` | Print the complete report, including `ok`, effective `gate`, findings, and unverified checks, as JSON. |
| `--quiet` | Hide clean locales and info findings. |
| `--no-color` | Disable ANSI color (also respects `NO_COLOR`). |
| `-h, --help` | Show help. |
| `-v, --version` | Show the version. |

Exit codes: `0` effective gate passed, `1` effective gate failed, `2` usage or config error. Warnings produce `pass-with-warnings` normally and `fail` under `--strict`.

## Rules

| Rule | Default | Fires when |
| --- | --- | --- |
| `missing-screenshots` | error | The screenshots folder is missing or contains no screenshots. |
| `screenshot-unreadable` | error | A locale folder exists but cannot be read (permissions, or deleted mid-scan). |
| `screenshot-unknown-dimensions` | error | An image's pixel size matches no known App Store size (the classic late-upload failure). The finding names the closest valid size. |
| `screenshot-count-over` | error | More than 10 screenshots resolve to one device size in one locale (orientations combined). |
| `screenshot-format` | error | A `.png`/`.jpg`/`.jpeg` file has an invalid or unsupported header, including impossible PNG bit-depth/colour-type combinations and unsupported JPEG frame types. |
| `screenshot-png-alpha` | error | A PNG declares an alpha channel or transparency through a `tRNS` chunk. App Store screenshots must not contain alpha channels or transparency. |
| `screenshot-unexpected-file` | warning | A visible non-image file sits in a locale folder, or files sit directly in the screenshots root. |
| `screenshot-unknown-locale` | warning | A folder name is not a known App Store locale (catches `en_US`-style typos; also flags `default/`, which deliver does not support for screenshots). |
| `screenshot-locale-empty` | warning | A locale folder has no screenshots or app previews; with `--metadata`, also a metadata locale with no screenshots folder. |
| `screenshot-primary-size-missing` | off | A locale has iPhone or iPad screenshots but none at the platform's current primary size. Off by default because Apple auto-scales from the largest size. |
| `screenshot-locale-parity` | off | A locale is missing a device class that other locales have. |
| `screenshot-watch-size-consistency` | error | Apple Watch screenshots use more than one exact pixel size across the app's localizations. |
| `preview-format` | error | A video uses an unsupported extension or its ISO base-media/QuickTime atoms cannot be parsed. |
| `preview-codec` | error | A video has no codec sample entry, uses a codec other than H.264 (`avc1`/`avc3`) or ProRes 422 HQ (`apch`), or places ProRes 422 HQ in a non-`.mov` container. |
| `preview-file-size` | error | An app preview exceeds Apple's 500 MB limit. |
| `preview-duration` | error | An app preview is shorter than 15 seconds or longer than 30 seconds. |
| `preview-resolution` | error | Video display dimensions do not match an accepted App Store app-preview resolution. |
| `preview-count-over` | error | A localization contains more than three app previews for one device size. Apple's cap is three "per supported device size and language", so iPhone and iPad previews have separate budgets; portrait and landscape share one, since they are the same upload slot. |
| `preview-frame-rate` | error | An app preview runs faster than Apple's 30 fps maximum when the sample table exposes a frame rate. A 60 fps simulator recording is the usual cause. |
| `preview-h264-profile` | error | H.264 above High Profile Level 4.0 when the file exposes an `avcC` configuration box. |
| `preview-audio-missing` | error | An app preview has no audio track. Apple requires stereo audio, and a silent screen recording is the usual cause. |
| `preview-audio-layout` | error | Audio is not stereo. Apple accepts one 2-channel track or two 1-channel tracks. |
| `preview-audio-codec` | error | Audio is not AAC, or PCM is used without ProRes 422 HQ. This rule identifies the actual MPEG-4 audio object type; it does not measure Apple's 256 kbps AAC requirement. |
| `preview-audio-sample-rate` | error | Audio is not sampled at 44.1 kHz or 48 kHz. |
| `preview-audio-bit-depth` | error | PCM audio is not 16-, 24-, or 32-bit when its sample description exposes the depth. Not applied to AAC. |
| `preview-track-disabled` | warning | A video or audio track's `track_enabled` flag is clear. Apple writes that all tracks *should* be enabled, so this warns rather than fails. |

Enable the opt-in rules via config: `{ "rules": { "screenshot-locale-parity": "warning" } }`.

### Coverage status

`PASS` means no enabled rule produced an error. `PASS WITH WARNINGS` means no
errors but at least one warning. Neither verdict claims that unavailable or
out-of-scope properties conform. The JSON report lists skipped measurements in
`unverifiedChecks`, separately from findings.

| Status | Requirements | Behavior |
| --- | --- | --- |
| Checked | Exact screenshot/preview dimensions; PNG/JPEG headers and declared PNG transparency; per-size counts; Watch-size consistency; preview container, video and audio codec, file size, duration, resolution, audio layout/sample rate, and track-enabled flags | Enforced by the rules above and covered by fixture-backed tests. |
| Checked when present | Preview frame rate (`stts`), H.264 profile/level (`avcC`), MPEG-4 audio object type (`esds`), and PCM bit depth (QuickTime sound description) | Enforced when the required container metadata exists; otherwise named in `unverifiedChecks`. |
| Not verifiable from a partial folder | Whether every remote App Store slot has an asset, and whether the same-resolution file belongs to every possible mixed-platform slot | Counts use Apple's resolution groups. A local folder proves only what it contains. |
| Out of scope | EXIF orientation transforms, rotation matrices, progressive/interlaced decoding, AAC 256 kbps and target video bitrate, and full image/video decoding | Reported here rather than guessed from file size or incomplete metadata. |

## Accepted sizes

Verified against Apple's [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) and fastlane deliver's resolution source on **2026-09-12**. `DEFAULT_CLASSES` is the union of sizes currently supported by those sources; `UPCOMING_CLASSES` keeps Apple-published sizes separate until upload availability and fastlane compatibility are verified.

| Class id | Device | Portrait | Landscape |
| --- | --- | --- | --- |
| `iphone-6.9` | iPhone 6.9-inch | 1260x2736, 1290x2796, 1320x2868 | swapped |
| `iphone-6.5` | iPhone 6.5-inch | 1284x2778, 1242x2688 | swapped |
| `iphone-6.3` | iPhone 6.3-inch | 1179x2556, 1206x2622 | swapped |
| `iphone-6.1` | iPhone 6.1-inch | 1170x2532, 1125x2436, 1080x2340 | swapped |
| `iphone-5.5` | iPhone 5.5-inch | 1242x2208 | swapped |
| `iphone-4.7` | iPhone 4.7-inch | 750x1334 | swapped |
| `iphone-4.0` | iPhone 4-inch | 640x1096, 640x1136 | 1136x600, 1136x640 |
| `iphone-3.5` | iPhone 3.5-inch | 640x920, 640x960 | 960x600, 960x640 |
| `ipad-13` | iPad 13-inch | 2064x2752, 2048x2732 | swapped |
| `ipad-12.9` | iPad 12.9-inch (2nd gen) | 2048x2732 (via deliver filename keyword) | swapped |
| `ipad-11` | iPad 11-inch | 1488x2266, 1668x2420, 1668x2388, 1640x2360 | swapped |
| `ipad-10.5` | iPad 10.5-inch | 1668x2224 | swapped |
| `ipad-9.7` | iPad 9.7-inch | 1536x2008, 1536x2048, 768x1004, 768x1024 | 2048x1496, 2048x1536, 1024x748, 1024x768 |
| `mac` | Mac | none | 1280x800, 1440x900, 2560x1600, 2880x1800 |
| `appletv` | Apple TV | none | 1920x1080, 3840x2160 |
| `visionpro` | Apple Vision Pro | none | 3840x2160 (via `vision` in the file path) |
| `watch-*` | Apple Watch (Ultra 4 to Series 1 and SE) | 422x514 (Ultra 4/3), 410x502 (Ultra 2/Ultra), 416x496 (Series 12/11/10), 396x484 (Series 9/8/7), 368x448 (Series 6/5/4, SE 3, SE 2, SE), 312x390 (Series 3/2/1) | none |

Apple also documents these iPhone Duo dimensions, but its app-preview page says
App Store Connect asset uploads for the device will become available later in
2026, and fastlane does not yet map them. They are exposed through
`UPCOMING_CLASSES` and deliberately fail default validation until availability
is verified.

| Upcoming class id | Display | Portrait | Landscape |
| --- | --- | --- | --- |
| `iphone-duo-outer` | iPhone Duo outer display | 1398x2034 | 2034x1398 |
| `iphone-duo-inner` | iPhone Duo inner display | 2007x2853 | 2853x2007 |

The deterministic source snapshots are `fixtures/dimensions-snapshot.json`,
`fixtures/upcoming-dimensions-snapshot.json`, and
`fixtures/preview-dimensions-snapshot.json`. A freshness review re-reads the
linked Apple pages and fastlane mapping, then updates the dates and snapshots
in the same change; tests intentionally do not make network requests.

Apple requires one Apple Watch screenshot size to be used consistently across all localizations for an app. `screenshot-watch-size-consistency` enforces that requirement using the exact pixel sizes above; localizations without Watch screenshots are ignored.

Ambiguities are resolved the way deliver resolves them: keywordless `2048x2732` is the 13-inch iPad (add `IPAD_PRO_129`-style keywords for 2nd gen), and keywordless `3840x2160` is Apple TV (name the file `vision-...` for Vision Pro).

## Accepted app-preview sizes

Verified against Apple's [app-preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/) on **2026-09-12**.

| Platform family | Accepted portrait | Accepted landscape |
| --- | --- | --- |
| Modern iPhone | 886x1920 | 1920x886 |
| 5.5-inch and 4-inch iPhone | 1080x1920 | 1920x1080 |
| 4.7-inch iPhone | 750x1334 | 1334x750 |
| Current iPad | 1200x1600 | 1600x1200 |
| Legacy iPad | 900x1200 | 1200x900 |
| Mac and Apple TV | none | 1920x1080 |
| Apple Vision Pro | none | 3840x2160 |

The preview table is pinned by the source snapshots above.

## Config

Drop a `screenproof.json` next to where you run the tool, or pass `--config`. Every key is optional and merges over defaults. Unknown rule ids are rejected with an error, so a typo cannot silently disable a rule. See [examples/](examples/) for a commented example.

```json
{
  "rules": { "screenshot-locale-parity": "warning" },
  "locales": { "extra": [], "ignore": ["archive"] },
  "dimensions": {
    "iphone-7.0": { "portrait": [[1350, 2934]], "landscape": [[2934, 1350]] }
  }
}
```

`dimensions` entries with a known class id replace that class's sizes; unknown ids add new classes. This is the escape hatch for brand-new Apple sizes.

## GitHub Action

```yaml
- uses: vsolano9/screenproof@v0.6.0
  with:
    path: fastlane/screenshots
    strict: "true"
    metadata: fastlane/metadata
```

The exact tag keeps CI reproducible and includes the complete shipped app-preview
rule set plus `tRNS` transparency validation. The moving `@v0` tag points to the
same `v0.6.0` release.

## Programmatic API

There is no single `lint()` wrapper. The CLI scans, then validates:

```ts
import {
  defaultConfig,
  scan,
  validate,
  renderHuman,
  exitCode,
} from "screenproof";

const config = defaultConfig();
const scanned = await scan("fastlane/screenshots", config);
const report = validate(scanned, config);
console.log(renderHuman(report));
process.exit(exitCode(report, false));
```

`scan(root, config, { forceFlat?: boolean })` walks a deliver tree or a flat folder. `validate(scan, config, { metadataLocales?, strict? })` applies the rule table. `LintReport.ok` keeps its API meaning: no error findings. `LintReport.gate` is the effective `"pass"`, `"pass-with-warnings"`, or `"fail"` decision and incorporates strict warning policy. `defaultConfig()`, `mergeConfig()`, and `loadConfig()` build config. `renderHuman()`, `renderJson()`, and `exitCode()` format and gate. Header parsers (`parseImageHeader`, `parsePreviewFile`) and the current and upcoming dimension tables are also exported for tools that already have the bytes.

Browser tools can import the side-effect-free entry without pulling in Node
filesystem modules:

```ts
import { inspectBrowserFixtures } from "screenproof/browser";

const bytes = new Uint8Array(await file.arrayBuffer());
const report = inspectBrowserFixtures([{ name: file.name, bytes }]);
```

`inspectBrowserFixtures` performs no I/O. Callers choose how bytes enter memory;
the hosted inspector reads browser `File` objects locally.

The browser and CLI use the same flat/locale folder rules: known top-level locale
folders select locale mode; folders-only trees also select locale mode so unknown
locales are reported. Hidden folders are ignored, and nested folders inside a
locale are reported rather than recursively inspected. Selecting a folder treats
that folder as the root (select its parent to validate its locale name).
Browser file inputs cannot represent empty directories, so a completely empty
locale folder cannot be diagnosed individually. An empty or text-only selection
does not produce a clean result.

The hosted inspector reads at most two files concurrently. Images use a 1 MiB
header slice; previews seek over encoded media to read only movie metadata,
including a late `moov` atom (64 MiB maximum). Previews above Apple's 500 MB
limit are rejected before reading their payload. A selection has a 128 MiB
cumulative slice budget, not counting browser-managed `File` storage and report
objects; selecting fewer files or using the CLI recovers from a budget error.
Unusually large pre-image metadata beyond the 1 MiB image header budget fails
conservatively rather than implying that transparency was checked. The CLI
also reads 1 MiB image heads and seeks preview metadata, one file at a time.


## Flat mode

Point screenproof at any folder of images (no fastlane required):

```bash
screenproof ~/Desktop/new-screenshots --flat
```

Flat mode runs the file-level checks only (dimensions, format, alpha, preview size and duration, unexpected files); locale and count rules need a deliver tree. A partial folder cannot prove that every App Store slot is populated.
`--metadata` cannot be combined with explicit `--flat`. If screenproof auto-detects a flat folder while `--metadata` is present, it still runs the file-level checks and skips the locale comparison.

## Known limitations

- EXIF orientation metadata is not applied; dimensions are read from the image frame header.
- JPEG validation covers bounded baseline, extended-sequential, and progressive frame headers (SOF0/1/2). It validates framing, component/table declarations, and marker bounds, but does not decode entropy-coded image data.
- The default dimension table reflects verified upload support as of the date above, never a guarantee. Apple-published upcoming sizes are separate; a different missing new size produces a false error (extend via config), and a retired size can produce a false pass.
- A malformed app preview with a `moov` atom larger than 64 MB is rejected to keep validation memory-bounded.

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run test:pack       # pack, install, strict-typecheck, and run a consumer
npm --prefix web test
npm --prefix web run build
```

`.github/workflows/ci.yml` runs these gates on Node 24 and also proves the local
composite Action accepts a conforming fixture and rejects a nonconforming one.

## Design

`DESIGN.md` at the repo root owns the CLI visual system; `web/DESIGN.md` owns the browser inspector. Gate each contract to 0 lint errors. Theme files listed under `tcv.exports` are generated; edit the owning DESIGN.md and re-export.

## Changelog

Release history, including which changes can flip a run's result, is in
[CHANGELOG.md](CHANGELOG.md).

## Roadmap

- [x] Hardened PNG/JPEG headers and real-media app-preview codec/PCM parsing against the audited false-pass corpus.
- [x] Explicit report gates and named unverified metadata checks without changing `LintReport.ok`.
- [x] Packed TypeScript declaration consumer plus root, web, and composite-Action CI gates.
- [x] Source-dated current and upcoming screenshot tables, including iPhone Duo and current Apple Watch labels.

## Maintainer

`screenproof` and its metadata sibling [metaproof](https://github.com/vsolano9/metaproof) are built and maintained by [Victor Solano](https://thechosenvictor.com/open-source), who runs them against twelve App Store apps before every submission.

## License

MIT (c) TheChosenVictor LLC
