# Changelog

All notable changes to screenproof are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). While screenproof is
`0.x`, a change that can flip a run's result ships in a minor release and is
called out below.

## [0.3.0] - 2026-08-06

### Fixed

- `preview-count-over` no longer fails a legal tree. Apple's cap is three app
  previews "per supported device size and language"; screenproof counted three
  per localization in total, so a locale with three iPhone previews and three
  iPad previews — six files, all accepted by App Store Connect — failed CI with
  a hard error. Budgets are now per device size. Portrait and landscape still
  share one budget, since they are the same upload slot.
- The message names the size it counted: `5 app previews for iPhone 886x1920
  (max 3 per device size per localization)`.

### Added

- `preview-codec`: an app preview with no video sample entry, a codec other than
  H.264 (`avc1`/`avc3`) or ProRes 422 HQ (`apch`), or ProRes 422 HQ outside a
  `.mov` container. Error by default, disableable on its own.
- `PREVIEW_SIZE_CLASSES` and `classifyPreviewSize()` are exported: Apple's
  accepted-resolution table grouped by device size, with the displays each row
  serves. The provenance snapshot now pins the groups too, so a silent drift in
  the table fails a test.

### Changed

- A preview whose resolution Apple does not list is reported by
  `preview-resolution` and left out of the count, since it cannot be assigned to
  an upload slot.

## [0.2.1] - 2026-07-19

### Added

- `screenshot-png-alpha` detects PNG transparency declared through a `tRNS`
  chunk, not only through the color type.

## [0.2.0] - 2026-07-19

### Added

- App preview validation: extension whitelist, 500 MB file-size ceiling,
  15-to-30-second duration, and accepted display resolutions, read from
  ISO base-media/QuickTime atoms without decoding any media.
- `--metadata` cross-check: a deliver metadata locale with no screenshots
  folder is reported.

## [0.1.2] - 2026-07-10

### Fixed

- `--metadata` is rejected in explicit flat mode instead of being ignored.
- Report-level findings render severity glyphs and file names.

## [0.1.1] - 2026-07-10

### Fixed

- Empty `--config=` and `--metadata=` values and unknown rule ids are rejected.
- Flat mode runs file-level checks only, as the README documents.
- Folders-only roots scan in locale mode so `screenshot-unknown-locale` fires.
- Unreadable locale folders no longer abort the run; symlinks are followed.

## [0.1.0] - 2026-07-09

### Added

- Initial release: offline, zero-dependency linting of an App Store screenshots
  tree against Apple's published device sizes — dimension classification, format
  and header parsing, PNG alpha, per-device-size count caps, locale checks, and
  optional primary-size and locale-parity rules.
- CLI with locale and flat modes, `--json`, `--strict`, `--quiet`, `--no-color`,
  `--config`, and `--metadata`, plus a programmatic API and a GitHub Action.

[0.3.0]: https://github.com/vsolano9/screenproof/releases/tag/v0.3.0
[0.2.1]: https://github.com/vsolano9/screenproof/releases/tag/v0.2.1
[0.2.0]: https://github.com/vsolano9/screenproof/releases/tag/v0.2.0
[0.1.2]: https://github.com/vsolano9/screenproof/releases/tag/v0.1.2
[0.1.1]: https://github.com/vsolano9/screenproof/releases/tag/v0.1.1
[0.1.0]: https://github.com/vsolano9/screenproof/releases/tag/v0.1.0
