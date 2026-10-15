# Design system: Clay-inspired civic atlas

Reference: https://github.com/nexu-io/open-design/blob/main/design-systems/clay/DESIGN.md

The user selected Open Design's Clay reference on 14 October 2026. This replaces the previous dark dashboard colour direction. Apply the palette to all report, account, moderation, provenance, incident, road and map inspection surfaces. Preserve product content and behaviour.

## Product adaptation

The app is a public road atlas with evidence and source history. Use an inviting light canvas and clearly separated paper surfaces. Keep dense data readable and controls predictable. Avoid promotional decoration, exaggerated hover movement, or inventing claims. Existing typography is retained for this colour-focused change; do not imply the proprietary Roobert font is bundled.

## Semantic colours

- Canvas: #faf9f7. Surface: #ffffff. Secondary surface: #eee9df.
- Ink: #24231f. Supporting text: #55534e. Quieter labels and placeholders: #69645c.
- Oat separator: #dad4c8. Control outline: #8a8275.
- Contribution actions: deep Matcha #02492a, hover #076d42, white labels.
- Official records and road selection: deep cyan #005b73, with #edfaff backgrounds.
- Damage and warnings: amber #805407, with #fff9e9 backgrounds.
- Restoration: green #076d42, with #f0fbf3 backgrounds.
- News/source categories: purple #58378d, with #f6f2ff backgrounds.
- Errors/disputes: red #a12d3b, with #fff2f3 backgrounds.

Use named canvas/surface/soft/ink/muted/quiet/line tokens instead of the old slate colour scale. Existing accent utility names are compatibility aliases for the new semantic palette, not literal dark-theme ramps. Deep tones are used for text because the reference's bright swatches are insufficiently legible on paper. Data geometry colours can be brighter for map visibility; legends retain text labels.

## Shapes and interaction

Use rounded report panels, rounded controls and pill contribution buttons. Keep data rows compact. Bound any hard offset hover shadow to primary evidence actions; no moving or rotating form controls. Focus uses a visible dark cyan outline. Support reduced motion, keyboard input and 44px touch targets. No glowing navigation decoration.

## Maps and accessibility

The globe canvas uses a warm neutral space background and readable OSM raster colours. Floating controls and dossiers share the paper palette. Preserve map/source attribution. Contrast targets are 4.5:1 for normal text and 3:1 for large text and essential controls. Status always retains an accompanying label or symbol.
## Dark mode

Dark mode uses warm charcoal (#211f1b), brown-charcoal panels (#2b2823), cream text and the same Clay hue families. Status foregrounds become lighter while badge surfaces become deeper. A header switch saves the explicit choice locally; first visit follows the device preference. Apply the initial theme before hydration to prevent a bright flash. The globe map surface keeps its original colours in both modes; only the surrounding space background and UI change. The evidence location map and browser colour scheme follow the selected mode. Keep the original cream theme available.
