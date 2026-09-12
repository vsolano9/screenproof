# Screenproof 0.7.0: released and verified

Verified 2026-09-12. Release commit: `8c143d35fc9f0361c16c25764a7cfbeada974ff6`.
PR #1 is merged. `v0.7.0` (annotated) and `v0` both resolve to that release commit.
The npm registry's `latest` tag is `0.7.0`. No release implementation work remains pending.
GitHub release: https://github.com/vsolano9/screenproof/releases/tag/v0.7.0
Production inspector: https://screenproof.vercel.app/

## Delivered
All five release-review regressions are fixed and covered by tests.
The approved responsive inspector uses real scan data, grouped findings,
locale/device/search filters, Issues/All assets, JSON export and native intake.
Warnings and unverified metadata are shown as review, not guaranteed approval.
Windows parity-test normalization and cross-platform clean/package execution are fixed.

## Final verification
Main Linux/Windows CI passed: https://github.com/vsolano9/screenproof/actions/runs/34706939864
Fresh local Windows Node 24.12: 303 core tests passed, 3 explicit capability skips, 0 failures; 19 web tests passed; typecheck and packed strict-TypeScript/runtime consumer passed.
The skipped tests require POSIX chmod semantics or unavailable Windows file-symlink privileges. Directory junctions are tested.
Published npm tarball installed successfully; both entry points compile and run. The npm CLI also runs on macOS Node 26.8.
All 45 published file contents match a fresh build of the release source. Archive modes differ between build platforms; independently built archives are not claimed byte-identical.
Registry tarball SHA-256: `5b9ec69eaeef06ec698e306c9adc4fe87d2752b8d3a81bc466de4b3bf007ae52`.
Registry SHA-1 matches npm metadata: `9f10c24a47ae76fc1545423775109e8f5e5d421e`.
Vercel production deployment `dpl_5FqLfDow8g3raGFd5UVkQs1F6uPp` is READY for the release commit and owns the public alias.

## Live browser checks
Playwright Chromium, Firefox and WebKit each passed on the public production URL: 24 assets across 3 locale folders, combined filters, unexpected-file warnings, metadata-gap review, malformed-video recovery and real late-moov report parity.
Warning states at 1586, 390 and 320 CSS pixels had no overflow or automated WCAG A/AA violations. No page errors or network write requests were observed in these flows.
Desktop Chromium and mobile WebKit screenshots were visually compared with the approved concept. Browser plugin unavailable; Playwright was the fallback.

## Scope and retained evidence
This is a bounded local metadata/header linter, not a complete media decoder or an App Store approval guarantee. Documented read budgets and unsupported audio configurations remain explicit.
WebKit automation is not real-device Safari testing; manual screen-reader certification is not claimed.
Detailed scripts, live screenshots, JSON reports and tarball comparisons are outside the repo in `%LOCALAPPDATA%/Temp/screenproof-browser-qa-20260912` on the Windows device. The release tarball and its checksum are attached to the GitHub release.
This closeout changes only handoff documentation; the version tag remains fixed to the released source commit.
