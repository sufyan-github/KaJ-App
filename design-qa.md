# Kaaj UI design QA

## Comparison target

- Source visual truth: /run/media/sufyan/Study & Career/00.Professional Career/9.App Dev/Kaaj/exports/kaaj-ui-images/all-pages/
- Primary source screens:
  - 08-customer-home.png
  - 30-settings.png
- Rendered implementation:
  - design-qa-artifacts/comparison-home-final-full.png
  - design-qa-artifacts/comparison-settings-final-full.png
- Focused comparisons:
  - design-qa-artifacts/comparison-home-final-top.png
  - design-qa-artifacts/comparison-settings-final-top.png
- State: authenticated customer, Bangla locale, dark theme, home and settings routes.

## Viewport and normalization

- Source: 390 × 844 pixels at 390 × 844 design/CSS points, 1× density.
- Implementation device: Motorola edge 60 fusion, Android 16, 1220 × 2712 physical pixels.
- Comparison capture: Android density was temporarily set to 500 dpi so the Flutter viewport was 390 logical dp wide. It was restored to the device's prior 382 dpi override immediately after capture.
- Native status/navigation chrome was removed from the 1220 × 2712 captures. The app region was resampled to 390 × 844 pixels for equal-size comparison.
- The native app's safe-area height differs slightly from the browser-style source canvas, so the report avoids false pixel precision at the top and bottom system insets.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: Hind Siliguri is bundled at regular, medium, semibold, and bold weights. Bangla shaping, hierarchy, wrapping, and contrast are correct. The implementation deliberately keeps body text and tap labels slightly larger than the compact reference; this is accepted P3 accessibility polish rather than a fidelity defect.
- Spacing and layout rhythm: 16 dp page margins, compact 8/16/24 dp spacing, 12 dp card/input radii, outlined surfaces, three-column popular-service cards, trust banner, hero, and bottom navigation follow the source. Additional existing marketplace actions continue below the reference's shorter home state so no workflow was removed.
- Colors and visual tokens: background #111713, surface #19211C, alternate surface #203029, border #34443A, mint #55C795, orange #FF9A45, and danger #FF7A7A match the source palette and keep readable contrast.
- Image quality and asset fidelity: these target screens contain no raster illustrations or product imagery. Material icons are used consistently for the same functional meanings; no emoji, CSS art, placeholder image, or handcrafted SVG substitute was introduced.
- Copy and content: the reference itself mixes Bangla and English. The implementation intentionally uses complete Bangla in the captured state, and the centralized catalog supplies the corresponding complete English state, matching the product requirement to avoid mixed-language UI.
- Icons and controls: icon size, stroke family, alignment, selected-state color, chevrons, segmented role control, and bottom-navigation states are consistent and have practical mobile tap targets.
- Responsiveness and accessibility: automated coverage passes at 320/360 dp and 100%/200% text scaling. Forms, report submission, grids, cards, notifications, OTP entry, verification, and settings remain reachable without overflow.

## Full-view comparison evidence

- Home comparison: the overall hierarchy matches—brand header, need statement, search/local controls, mint quick-post hero, three popular categories, amber trust row, and five-item bottom navigation. The extra “All features” grid is an intentional preservation of the existing production workflow.
- Settings comparison: the post-fix version matches the source's compact title, Account heading, Personal information and Language rows, outlined cards, chevrons, and dark/mint styling. Existing role, billing, trust, privacy, and safety settings remain below those primary controls.

## Focused-region evidence

- Home top-region comparison confirms the typography hierarchy, input borders, mint/orange hero treatment, category-card alignment, icon family, and trust banner.
- Settings top-region comparison confirms that Personal information and Language are above the role control, with aligned icon/title/subtitle/chevron rows and consistent section rhythm.

## Comparison history

1. Initial pass:
   - [P2] Settings used a large profile header that materially displaced the source's primary Account controls below the fold.
   - Fix: removed the decorative profile header and moved the existing profile destination into a compact Personal information row at the start of Account. Language remains immediately below it.
2. Post-fix pass:
   - Recaptured the installed Android app at a 390 logical-dp width.
   - Compared the source and implementation together in the final full-view and focused-region artifacts listed above.
   - The hierarchy mismatch is resolved; no P0/P1/P2 finding remains.

## Verification

- flutter analyze: passed with no issues.
- flutter test: 83 tests passed.
- flutter build apk --debug --flavor dev: passed.
- APK installed and launched on connected Motorola phone.
- Home-to-Settings bottom-navigation interaction verified through the Android accessibility tree.
- Backend health endpoint returned status ok.
- Android runtime logs showed no Flutter exception, fatal exception, or RenderFlex overflow during the verified flow.

## Follow-up polish

- [P3] The production implementation uses larger, more accessible text than the very small labels in the source. Keep this unless a later brand review explicitly prioritizes tighter density over readability.
- [P3] The source home screen has one combined search field; the implementation retains separate location and service controls because local discovery is a core existing workflow.

final result: passed
