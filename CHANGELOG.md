# Changelog

All notable changes to screenproof are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). While screenproof is
`0.x`, a change that can flip a run's result ships in a minor release and is
called out below.

## [0.5.2] - 2026-09-02

### Fixed

- `screenshot-unknown-locale` no longer flags the 11 App Store locales Apple
  and fastlane now accept: `bn-BD`, `gu-IN`, `kn-IN`, `ml-IN`, `mr-IN`,
  `or-IN`, `pa-IN`, `sl-SI`, `ta-IN`, `te-IN`, `ur-PK`. A valid
  `screenshots/ta-IN/` folder was reported as unknown. Apple's [App Store
  localizations](https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations)
  reference and the [App Store Connect API locale-shortcode table](https://developer.apple.com/documentation/appstoreconnectapi/managing-metadata-in-your-app-by-using-locale-shortcodes)
  list 50 locales; fastlane `FastlaneCore::Languages::ALL_LANGUAGES` in
  `fastlane_core/lib/fastlane_core/languages.rb` on `master` matches.
  `KNOWN_LOCALES` now holds that table. Screenshots still have no `default/`
  fallback.

## [0.5.1] - 2026-08-24

### Changed

- `homepage` now points at https://thechosenvictor.com/open-source, which
  documents this package, rather than back at this README. No behaviour change.
- Added a Maintainer section to the README.

## [0.5.0] - 2026-08-23

Verified against Apple's screenshot and app-preview specification pages and
fastlane deliver's current screenshot-resolution source, all re-read
2026-08-23. The accepted resolution values are unchanged.

### Added

- `screenshot-watch-size-consistency` (error): Apple Watch screenshots must use
  one exact pixel size across every localization that supplies Watch assets.
  Localizations without Watch screenshots are ignored, and flat mode does not
  run the cross-localization rule.

### Changed

- **A tree that passed 0.4.0 can fail 0.5.0.** Screenproof previously accepted
  different valid Watch sizes in different localizations even though Apple
  requires one size consistently across the app. The rule can be disabled on
  its own through `rules`.
- Refreshed screenshot and app-preview provenance dates after verifying the
  live sources, and corrected the stale package-lock package version.

## [0.4.0] - 2026-08-06

Verified against Apple's app-preview specification and the App Store Connect
upload page, both re-read 2026-08-06.

### Added

Eight rules covering the parts of Apple's preview specification that were
documented but never enforced. All read container structure only — no media is
decoded.

- `preview-frame-rate` (error): faster than Apple's 30 fps maximum, computed
  from the video track's `mdhd` timescale and `stts` sample table. Exact for
  constant frame rate, averaged otherwise. A 60 fps simulator recording is the
  usual cause, and nothing caught it before.
- `preview-h264-profile` (error): H.264 above High Profile Level 4.0, read from
  the `avcC` box.
- `preview-audio-missing` (error): no audio track at all. Apple requires stereo
  audio; a silent screen recording is the usual cause.
- `preview-audio-layout` (error): audio that is not stereo, accepting either one
  2-channel track or two 1-channel tracks, as Apple specifies.
- `preview-audio-codec` (error): audio that is not AAC. PCM is accepted only
  alongside ProRes 422 HQ.
- `preview-audio-sample-rate` (error): audio not sampled at 44.1 or 48 kHz.
- `preview-audio-bit-depth` (error): PCM audio that is not 16-, 24-, or 32-bit.
  Not applied to AAC, where the field is not a bit depth.
- `preview-track-disabled` (warning): a track whose `track_enabled` flag is
  clear. Apple writes that tracks *should* be enabled, so this warns.

`PreviewInfo` now carries `frameRate`, `avc`, `audioTracks`, and
`videoTrackEnabled`; `AvcConfig` and `PreviewAudioTrack` are exported.

### Changed

- **A preview that passed 0.3.0 can fail 0.4.0.** That is the point: on a
  five-file sample, 0.3.0 reported one problem and 0.4.0 reported six. Each rule
  can be disabled on its own through `rules`.

### Not implemented, on purpose

Two documented requirements are left alone rather than guessed at, and the
reasons are in the README and in `previewheader.ts`:

- **Progressive vs interlaced** needs the H.264 sequence parameter set or a
  `fiel` atom most encoders never write. Neither is container metadata.
- **Target bit rate** (10-12 Mbps H.264, ~220 Mbps ProRes) is a target, not a
  limit, and a figure derived from file size over duration folds in audio and
  container overhead. The rule would warn on conforming files.

Rotation is readable from the `tkhd` matrix but carries no Apple requirement to
enforce, so no rule was added and the field was left off the public type.

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

[0.5.2]: https://github.com/vsolano9/screenproof/releases/tag/v0.5.2
[0.5.1]: https://github.com/vsolano9/screenproof/releases/tag/v0.5.1
[0.5.0]: https://github.com/vsolano9/screenproof/releases/tag/v0.5.0
[0.4.0]: https://github.com/vsolano9/screenproof/releases/tag/v0.4.0
[0.3.0]: https://github.com/vsolano9/screenproof/releases/tag/v0.3.0
[0.2.1]: https://github.com/vsolano9/screenproof/releases/tag/v0.2.1
[0.2.0]: https://github.com/vsolano9/screenproof/releases/tag/v0.2.0
[0.1.2]: https://github.com/vsolano9/screenproof/releases/tag/v0.1.2
[0.1.1]: https://github.com/vsolano9/screenproof/releases/tag/v0.1.1
[0.1.0]: https://github.com/vsolano9/screenproof/releases/tag/v0.1.0
