# Screenproof inspector design

Approved direction: Victor's light/blue Screenproof concept, 2026-09-12.

## Visual system
White panels on a cool light-blue page; navy type; blue primary actions.
Native HTML/CSS/SVG interface, 8-14px corner radii and thin blue-gray borders.
The approved hero artwork is reused, not regenerated. No screenshot is used as the interactive UI.
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
