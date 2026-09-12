# Screenproof inspector design

Approved direction: Victor's light/blue Screenproof concept, 2026-09-12.

## Visual system
White panels on a cool light-blue page; navy type; blue primary actions.
Native HTML/CSS/SVG interface, 8-14px corner radii and thin blue-gray borders.
The hero uses the approved custom Screenproof Validation Stack illustration, replacing the generic phone artwork. No screenshot is used as the interactive UI.
Header, compact hero, three benefits, two-column inspector, coverage and CLI follow the approved composition.
Mobile order: intake, report, coverage, CLI. Artwork hides on narrow screens.

## Intentional corrections to the concept
No invented stars, unowned domain, low-contrast analysis or fake report data.
Warnings are amber Review recommended, not green Ready for submission.
Success says Local checks passed and never guarantees App Store approval.
Unknown metadata produces a review presentation even when the technical gate passes.
Counts derive from the real scan; duplicates remain separate inputs and excluded files are not checked.
The initial empty state does not fabricate successful checks.

## Implementation
main.ts owns events and inspection state; shell.ts owns static page composition.
report-model.ts derives actual asset states; report-view.ts renders escaped data and filters.
intake.ts and file-read.ts retain bounded local reading and stale-operation protection.
No new production dependencies, remote fonts, telemetry or upload service.

## Visual verification
Compared the accepted image and Chromium screenshots at 1586px: composition, navy/blue palette, typography, controls, artwork and report hierarchy.
Checked responsive layouts at 1280, 768, 390 and 320px with no horizontal overflow.
Visually inspected final desktop and mobile screenshots.
Fixed 320px export-toolbar overflow, annotation cropping, encoding and contrast defects.
Axe WCAG A/AA checks reported zero violations on the tested desktop and mobile warning states; this is not a complete accessibility certification.

## Custom hero asset (2026-09-12)

Source: the user-approved transparent `screenproof_validation_pipeline.png` (2135 x 737, RGBA), SHA-256 `5e71b9122ec12ab853d4259706044ebac9b61d7668144d44cb6f87bed6b122db`.
Production: `web/public/validation-stack-transparent.webp`, 1344 x 464, RGBA, 123,982 bytes, SHA-256 `d0b625f794dfc9599da15d1f70a9df80769b555ea6909f1e5c35b9a6cc2ab788`.
The prepared WebP preserves the full transparent composition with no cropping, recoloring, added copy or new artwork generation. Its original conversion used Lanczos resizing, WebP quality 88, method 6, alpha quality 100 and exact=True. Native alpha now places the art on the existing light-blue hero surface; no CSS masks or background blending attenuate it.
Vercel's public asset response uses `max-age=0, must-revalidate`, and the build config adds no cache override. The distinct transparent filename also avoids reusing the older opaque asset's cache key; the obsolete asset is removed.
The illustration depicts screenshot/video metadata checks; it is decorative,
not a live verdict, and remains hidden from assistive technology with empty alt.
The panorama is centered in the desktop art area and hidden at 1100px or below to keep it clear of the hero copy and preserve the compact mobile workflow.
No validator, package version, npm release or release tags change in this update.

Transparent replacement verification: 19 existing web tests and the production build passed. Chrome browser renders at 320, 390, 768, 980, 1100, 1101, 1280, 1440 and 1586px had no horizontal overflow. All three examples and Clear were exercised at 320, 390 and 1586px. The established light-only design remains unchanged under a dark system preference; desktop and 320px reduced-motion captures are included in `web/receipts/hero-transparent-*.png`.
