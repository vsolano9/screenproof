# Screenproof 0.7.0 release candidate

Date: 2026-09-12. Branch: feat/screenproof-completion-2026-09-12.

## Implemented
All five release-review defects fixed with regression coverage.
Approved responsive inspector uses real scan data, not mocked findings or metrics.
Asset grouping/filtering, scope disclosure, JSON export and native intake work.
Non-media and nested-folder warnings remain visible without asset rows.
Windows parity-test normalization and cross-platform clean/package execution fixed.
CI now runs Linux and Windows. Directory junctions are tested; unsupported
POSIX permission and file-symlink cases skip with explicit capability reasons.

## Candidate checks
Windows Node 24.12: 303 root tests passed, 3 capability skips, 0 failures.
19 web tests, TypeScript, package consumer and web production build pass.
The prior core revision passed all 305 tests on macOS.
Final candidate macOS, two-OS hosted CI, browser, merge and publication checks
are the remaining release gate. No production/npm release claimed yet.

## Scope
The scanner is a local metadata/header linter, not a complete image/video decoder
or a guarantee of App Store approval. Existing documented bounded-read and
unsupported-audio-configuration limits remain conservative and explicit.
