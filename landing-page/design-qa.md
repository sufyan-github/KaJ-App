# Design QA

- Source visual truth: `/home/sufyan/.codex/generated_images/01a06ea8-4471-7dd2-959a-26f6a97de044/exec-8d10139f-b42b-413c-81f2-974759d80ad2.png`
- Verified implementation: `http://localhost:4173/`
- Viewports: desktop 1440 × 1024; mobile 390 × 844
- States checked: English, বাংলা, FAQ filter/accordion, mobile navigation, search CTA toast, cPanel-style subfolder serving
- Source pixels: 725 × 2167
- Captures: `qa/implementation-hero-desktop.png`, `qa/implementation-mobile.png`
- Combined comparison: `qa/comparison-source-vs-implementation.jpg`
- Hero refinement capture: `qa/hero-refined-default.jpg`
- Hero refinement comparison: `qa/hero-refined-comparison.jpg`

## Findings

- No open P0, P1, or P2 visual defects.
- The implementation preserves the selected direction's dark-green map background, bright green emphasis, orange conversion actions, phone-led hero, compact service grid, and restrained professional typography.
- Desktop layout has no horizontal overflow (`1440px` viewport / `1440px` document width).
- Mobile layout has no horizontal overflow (`390px` viewport / `375px` content width with browser scrollbar/chrome accounted for).
- All hero-visible images loaded at both tested viewports. Production assets were also validated directly as valid PNG files.
- The only browser console warning was Vite's development-only HMR websocket connection warning; it is absent from the static production package and is not an application error.

## Interaction and content verification

- FAQ search reduced six questions to the matching operator question; the accordion exposed `aria-expanded="true"` and the correct Robi/Airtel answer.
- বাংলা mode showed the exact daily charge, Bengali FAQ heading, localized footer headings, and localized Rajshahi location.
- Mobile menu opened as a visible flex menu and closed after navigation.
- The local marketplace search CTA displayed the expected app-download message.
- The temporary APK URL was removed; Android and iOS are clearly presented as pending without broken links.
- Contact details point to `abusufyan.cse20@gmail.com` and `01776669345`.
- `contact.php` passed PHP syntax validation and returned HTTP 422 with JSON for an incomplete server-side validation test.
- Production output loaded from a nested `/client/` path with HTTP 200 responses for HTML, favicon, JavaScript, and CSS, confirming relative cPanel-safe asset paths.

## Comparison history

- Initial implementation matched the selected composition and palette.
- Completion pass added About/Mission/Vision, Rajshahi coverage, honest testimonial placeholders, searchable FAQ, complete Bengali footer localization, accessible pending-download states, and responsive rules for the new sections.
- Final combined source/implementation comparison found no launch-blocking visual mismatch.
- Hero refinement pass added a consistent 16px desktop gutter, 28px lower corner radius, intentional bottom margin, stronger section shadow, a 900px search panel, and more disciplined CTA/content spacing. The updated source/implementation comparison has no open P0/P1/P2 issue.
- Screenshot follow-up (`/home/sufyan/Pictures/Screenshots/Screenshot From 2026-09-05 20-53-01.png`): the hero was visually over-wide at 1920px, leaving only a 16px outer gutter and exaggerating the phone crop. The hero is now capped at 1600px with a fluid 24px minimum gutter, producing 160px side margins at the reported viewport while preserving the aligned 1180px content grid. Tablet and mobile rules remain unchanged and overflow-free.
- Release integration pass: verified GitHub release `v1.0.0`, direct APK asset `Kaaj-1.0.0-android.apk`, Android 8.0 minimum, and the rendered download/release links. The optimized 99,520-byte logo is now used by the header, footer, favicon, and download card. The download section has no visible broken images or horizontal overflow, and the cPanel archive contains only referenced production assets.

final result: passed
