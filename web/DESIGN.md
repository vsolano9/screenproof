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

Source: ChatGPT's `screenproof-validation-stack-object-only-2135x737.png` handoff in the [Screenproof conversation](https://chatgpt.com/g/g-p-6a9a86ad28888191a22664fec52a1238/c/6aa53152-410c-83eb-9b50-85151e77b290), following OMP's background-removal clarification on 2026-09-12. This authorized cleanup preserves the approved turn-30 Validation Stack composition while removing central haze and background residue. PNG: 2135 x 737, RGBA, SHA-256 `d3452fdc6c46992d813ae9afdf5b8d22e7c36c884917484562895445b59b4359`.
Production: `web/public/validation-stack-transparent-v2.webp`, 1344 x 464, RGBA, 105,122 bytes, SHA-256 `cd57d2776d255f93088f2c0065c6ce9988b50ca965f9168f1d89c944ba2886b7`.
Conversion: proportional Lanczos resize, WebP quality 95, method 6, exact=True. Decoded alpha spans 0-255: 404,793 fully transparent, 23,047 partially transparent and 195,776 opaque pixels. White and site-blue composites were visually inspected: no rectangular backdrop remains.
The old `.hero:before` radial gradient independently painted a clipped blue backdrop even with a transparent image. It is removed, not masked or blended away. Keep the hero on the uniform page canvas; do not reintroduce a background panel behind the objects. The versioned filename busts the old asset cache key, and the obsolete WebP is removed.
The illustration depicts screenshot/video metadata checks; it is decorative,
not a live verdict, and remains hidden from assistive technology with empty alt.
The panorama is centered in the desktop art area and hidden at 1100px or below to keep it clear of the hero copy and preserve the compact mobile workflow.
No validator, package version, npm release or release tags change in this update.

Background-free replacement verification: the exact original turn-30 image was recovered directly from the chat and compared with the earlier opaque artwork, the cleaned handoff and the live page. Alpha is necessary but not sufficient: inspect the rendered hero for both baked-in image residue and CSS-painted backdrops. Desktop and narrow-screen captures live under `web/receipts/hero-no-background-v2-*.png`; source, white/blue composites and live receipts are retained in Work's `_receipts/2026-09-12/screenproof-hero/`.
