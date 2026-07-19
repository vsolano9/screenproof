# screenproof

Lint your App Store screenshots and app previews before you submit.

`screenproof` checks a [fastlane `deliver`](https://docs.fastlane.tools/actions/deliver/) `screenshots/` tree (or any folder of media) against Apple's published screenshot and app-preview rules: exact dimensions, format validity, duration, file size, per-localization counts, and locale-folder hygiene. It runs offline, catches problems before an upload fails late with a vague error, and returns a non-zero exit code so it can gate CI.

It is the visual-asset sibling of [metaproof](https://github.com/vsolano9/metaproof), which lints the text metadata half of the same submission.

- Exact-size validation against Apple's current specification table, with the nearest valid size suggested for every rejected image (same aspect ratio preferred, so it never suggests a stretch).
- Device-class detection by pixel resolution, mirroring deliver's behavior including the iPad 12.9"/13" and Apple TV/Vision Pro shared-resolution disambiguation.
- Per-locale checks: counts over Apple's 10-per-device limit, empty locale folders, typo locale names (`en_US`), stray files.
- Optional cross-checks: locale parity across localizations, current-primary-size presence, and a `--metadata` comparison against your deliver metadata tree.
- App-preview checks: `.mov`/`.m4v`/`.mp4` container structure, 500 MB size ceiling, 15 to 30 second duration, accepted resolution, and the three-per-localization limit.
- Zero-dependency PNG and JPEG header parsing. **Fully offline. No network, no credentials, no telemetry.**
- Zero-dependency ISO base-media and QuickTime atom parsing that skips encoded media payloads.

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
| `--strict` | Exit non-zero on warnings as well as errors. |
| `--json` | Print the report as JSON. |
| `--quiet` | Hide clean locales and info findings. |
| `--no-color` | Disable ANSI color (also respects `NO_COLOR`). |
| `-h, --help` | Show help. |
| `-v, --version` | Show the version. |

Exit codes: `0` clean, `1` lint errors (or warnings under `--strict`), `2` usage or config error.

## Rules

| Rule | Default | Fires when |
| --- | --- | --- |
| `missing-screenshots` | error | The screenshots folder is missing or contains no screenshots. |
| `screenshot-unreadable` | error | A locale folder exists but cannot be read (permissions, or deleted mid-scan). |
| `screenshot-unknown-dimensions` | error | An image's pixel size matches no known App Store size (the classic late-upload failure). The finding names the closest valid size. |
| `screenshot-count-over` | error | More than 10 screenshots resolve to one device size in one locale (orientations combined). |
| `screenshot-format` | error | A `.png`/`.jpg`/`.jpeg` file whose header does not parse (corrupt, truncated, or mislabeled, like HEIC bytes behind a `.png` name). |
| `screenshot-png-alpha` | warning | A PNG declares an alpha channel. App Store Connect may reject transparency. |
| `screenshot-unexpected-file` | warning | A visible non-image file sits in a locale folder, or files sit directly in the screenshots root. |
| `screenshot-unknown-locale` | warning | A folder name is not a known App Store locale (catches `en_US`-style typos; also flags `default/`, which deliver does not support for screenshots). |
| `screenshot-locale-empty` | warning | A locale folder has no screenshots or app previews; with `--metadata`, also a metadata locale with no screenshots folder. |
| `screenshot-primary-size-missing` | off | A locale has iPhone or iPad screenshots but none at the platform's current primary size. Off by default because Apple auto-scales from the largest size. |
| `screenshot-locale-parity` | off | A locale is missing a device class that other locales have. |
| `preview-format` | error | A video uses an unsupported extension or its ISO base-media/QuickTime atoms cannot be parsed. |
| `preview-file-size` | error | An app preview exceeds Apple's 500 MB limit. |
| `preview-duration` | error | An app preview is shorter than 15 seconds or longer than 30 seconds. |
| `preview-resolution` | error | Video display dimensions do not match an accepted App Store app-preview resolution. |
| `preview-count-over` | error | A localization contains more than three app previews. |

Enable the opt-in rules via config: `{ "rules": { "screenshot-locale-parity": "warning" } }`.

## Accepted sizes

Verified against Apple's screenshot specifications page and fastlane deliver's source on **2026-07-09**. The shipped table is the union of both. Apple adds sizes with new hardware: if a size is missing here, extend it via `dimensions` in config the same day (see below), and expect updated releases after Apple device events.

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
| `watch-*` | Apple Watch (Ultra 3 to Series 3) | 422x514, 410x502, 416x496, 396x484, 368x448, 312x390 | none |

Ambiguities are resolved the way deliver resolves them: keywordless `2048x2732` is the 13-inch iPad (add `IPAD_PRO_129`-style keywords for 2nd gen), and keywordless `3840x2160` is Apple TV (name the file `vision-...` for Vision Pro).

## Accepted app-preview sizes

Verified against Apple's [app-preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications) on **2026-07-19**.

| Platform family | Accepted portrait | Accepted landscape |
| --- | --- | --- |
| Modern iPhone | 886x1920 | 1920x886 |
| 5.5-inch and 4-inch iPhone | 1080x1920 | 1920x1080 |
| 4.7-inch iPhone | 750x1334 | 1334x750 |
| Current iPad | 1200x1600 | 1600x1200 |
| Legacy iPad | 900x1200 | 1200x900 |
| Mac and Apple TV | none | 1920x1080 |
| Apple Vision Pro | none | 3840x2160 |

The repository snapshot is `fixtures/preview-dimensions-snapshot.json`.

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
- uses: vsolano9/screenproof@v0
  with:
    path: fastlane/screenshots
    strict: "true"
    metadata: fastlane/metadata
```

(Pin an exact `@v0.x.y` tag for reproducible CI.)

## Flat mode

Point screenproof at any folder of images (no fastlane required):

```bash
screenproof ~/Desktop/new-screenshots --flat
```

Flat mode runs the file-level checks only (dimensions, format, alpha, preview size and duration, unexpected files); locale and count rules need a deliver tree.
`--metadata` cannot be combined with explicit `--flat`. If screenproof auto-detects a flat folder while `--metadata` is present, it still runs the file-level checks and skips the locale comparison.

## Known limitations

- EXIF orientation metadata is not applied; dimensions are read from the image frame header.
- PNG transparency via a `tRNS` chunk (palette transparency without an alpha color type) is not detected; only alpha color types 4 and 6 are flagged.
- Rare JPEG variants outside baseline, extended, and progressive surface as parse findings rather than being silently accepted.
- The dimension table reflects Apple's published sizes as of the date above, never a guarantee: a missing new size produces false errors (extend via config), and a retired size produces false passes.
- App-preview codec profile, audio layout, bitrate, frame rate, and rotation-matrix checks are not enforced yet. The current parser validates the container, movie duration, and video track display dimensions without decoding media.
- A malformed app preview with a `moov` atom larger than 64 MB is rejected to keep validation memory-bounded.

## Validation

```bash
npm run lint   # typecheck + tests
npm test       # node --test
npm run build  # compile dist/
```

## Roadmap

- [x] App preview checks: duration, count, resolution, format, and file size via zero-dependency MP4/MOV atom parsing.
- [ ] Fixture-backed app-preview codec, audio, bitrate, and frame-rate checks.
- [ ] `tRNS`-chunk PNG transparency detection.

## License

MIT (c) TheChosenVictor LLC
