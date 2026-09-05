# KAAJ production-readiness audit — 2026-09-05

## Outcome

The existing KAAJ product was retained and improved in place. The Flutter app now has a persistent Bangla/English preference, localized system UI and API requests, clearer local-job entry points, corrected availability and scheduled-job language, improved mobile/accessibility semantics, and verified phone/OTP input visibility. The NestJS API now returns bilingual notification and cancellation copy, and the existing Next.js operations console has a persistent Bangla/English switch and responsive navigation. An additive Version 1 commercial layer now provides provider-neutral Robi/Airtel operator hints, configurable subscriptions, guarded entitlements, and zero-commission offline cash-payment records without claiming that online billing, wallets, or withdrawals exist.

This pass closes the application defects that were safe to address without changing the marketplace's core behavior. It does not claim that external providers, deployment infrastructure, or every destructive production action have been certified.

## Existing product and architecture

### Flutter mobile app

- Material 3 design system with reusable KAAJ buttons, fields, empty/error states, cards, spacing, and color tokens.
- Riverpod state management, GoRouter navigation and guarded authentication/onboarding routes.
- Dio API layer with rotating-token refresh, idempotency keys, structured failures, timeouts and locale headers.
- Secure token storage, Hive-backed onboarding/chat/catalog/preferences caches, connectivity banner, Sentry integration and permission handling.
- OTP authentication; worker/client role switching; onboarding for profile, role, location, skills and availability.
- Category/subtype discovery, local job feed, time matching, job creation, application, applicant review, worker matching, bookings, assignments and reviews.
- Realtime chat, images, blocking/reporting, notifications, verification, attendance, disputes, portfolio, privacy and account controls.
- Subscription status/history, supported-operator state, plan selection, cash job-payment history, and assignment-level cash confirmation.

### Backend and operations

- NestJS/Prisma API with PostgreSQL, Redis and S3-compatible uploads.
- Validation, authorization/RBAC, idempotency, job state rules, verification, notifications, chat safety, moderation, geofence, cancellation and dispute logic.
- Next.js operations console for catalog, users, jobs, verification, disputes, risk and operational actions.
- Provider-neutral operator/subscription schema and adapter port, configurable entitlement guards, separate subscription/job-payment ledgers, and audited subscription/payment administration.

## What was broken or incomplete

### Critical before this pass

- English was disabled in Settings and the selected locale could not persist.
- The app only had a small ARB translation set; most feature, validation, loading, empty, error, dialog and accessibility copy was hardcoded in Bangla.
- API requests always sent `Accept-Language: bn`; English users could still receive Bangla system responses.
- Bilingual category, location, skill, badge and job-summary fields were parsed but English values were discarded by parts of the mobile data model.
- Availability editing looked like onboarding step 5/5 and saved weekday rows could not render clean English.
- Scheduled work was described as a posting time in the application flow.
- Notification payloads and cancellation previews lacked complete English system copy.
- Phone/OTP and form-value visibility needed real-device verification.
- The app had no safe subscription/operator model or explicit Version 1 cash-payment completion record; the older money core could still show a platform fee while digital payments were disabled.

### Important usability gaps

- The home page's main local-work action was less prominent than the large feature grid.
- Notification and Settings shortcuts did not communicate state clearly enough to assistive technology.
- Admin mobile navigation disappeared at narrow widths.
- Generic generated translations produced weak labels in a few high-value flows; these required reviewed, context-specific language.
- The admin console could create but not edit commercial plans and initially overflowed horizontally at a real narrow viewport.

## Improvements implemented

- Added a centralized locale controller backed by Hive and connected it to `MaterialApp` and every API request.
- Enabled Bangla and English in Settings and persisted the user's selection across restart/reopen.
- Localized static system copy across authentication, onboarding, home, catalog, jobs, applications, profile, chat chrome, notifications, settings, verification, attendance, safety and disputes.
- Added reviewed translations for high-risk/contextual copy and a policy test that rejects unmapped static feature strings and Bangla characters in generated English values.
- Preserved user-authored job titles, descriptions, names, messages and comments in their original language. System copy is localized; authored content is never partially machine-translated.
- Retained bilingual catalog/profile/job-summary fields and selected the correct field for the active locale.
- Added bilingual notification fields and cancellation summaries in the API.
- Added a prominent role-aware “jobs near you/find local workers” home action, notification badge and Settings shortcut while retaining the requested centered grid.
- Corrected availability editing to “Default availability,” removed the misleading onboarding step label, localized weekdays/time slots, and clarified account defaults versus each job's scheduled time.
- Corrected scheduled-job labels to “Work time” and reviewed the application amount/message labels.
- Localized button and dashboard semantics, unread counts, notification times and permission statuses.
- Enabled responsive, horizontally accessible admin navigation instead of hiding it on mobile.
- Added network-failure handling around admin session/auth actions and localized admin labels, dates, errors, statuses, entities and dialogs.
- Added operator-neutral subscription status/request/history, explicit pending operator verification, admin plan creation/editing and pricing, access rules, manual external-payment confirmation, and a rollout guard that remains disabled by default.
- Added a cash-on-completion record with zero platform fee, poster-only idempotent confirmation, worker notification, dispute status, audit history, and separate user/admin payment history.
- Added clear “coming soon” states for online payment, mobile banking, wallets, and withdrawals; no fake provider callback or balance movement is present.

## Numbered journey health

1. **Phone and OTP authentication — healthy.** Phone digits, OTP digits, validation and actions are visible on the connected Motorola phone. Development OTP `123456` authenticated successfully against the live local API.
2. **Home and role entry — healthy.** Personalized home, primary local-discovery action, centered action grid, badges and shortcuts render in Bangla and English.
3. **Work type and subtype discovery — healthy.** Grid categories expose working subtypes; selecting Education → Tutoring opens the filtered jobs view.
4. **Job/time discovery — healthy with a launch recommendation.** Type and “Match my time” filtering work and scheduled cards show “Work time.” Add explicit travel distance/radius after the backend exposes a reliable distance contract.
5. **Application and verification gate — healthy.** Application copy is clear and requires NID/selfie verification before submission; experience/expertise remains optional. Duplicate/closed-job behavior is covered by backend state rules.
6. **Notifications — healthy.** Bilingual system title/body, unread state, groups, relative times, empty/error/permission states and destinations are implemented. Original job titles can remain Bangla inside an English notification because that is authored content.
7. **Default availability — healthy.** Existing weekday slots load, delete controls are labeled, days and presets are localized, invalid ranges are blocked, and save/update actions are explicit.
8. **Settings/profile/portfolio/safety — healthy.** Role, profile, portfolio, notification preferences, permissions, verification, blocked users, account, support and dispute routes are grouped and responsive.
9. **Admin operations — healthy in local authenticated testing.** Persistent Bangla/English UI, responsive navigation, subscription plan dialog, access rules, subscriber controls and cash-payment oversight pass browser verification without console errors.
10. **Subscription and cash payments — healthy for Version 1.** The phone shows inactive/pending operator state without blocking pilot access, plan-empty and coming-soon states, and separate cash-payment history. A live PostgreSQL/Redis test proves zero commission, one payment row, one audit record and the `PAYMENT_RECORDED` job transition.

## Production review

| Area                         | Status                                       | Evidence / remaining condition                                                                                                                                                     |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication/session       | Ready in code and local integration          | Rotating refresh, protected routes, OTP live pass; production SMS credentials/rate limits must be configured.                                                                      |
| Authorization/roles          | Ready in tested API rules                    | RBAC/policy, moderation and role-mode tests pass.                                                                                                                                  |
| Form/API validation          | Ready for current scope                      | Client validators and Nest DTO/service tests pass; visible field/error states checked.                                                                                             |
| Loading/empty/error/offline  | Ready for current scope                      | Shared states and representative notification/catalog/settings tests pass.                                                                                                         |
| Localization                 | Ready for system UI                          | Persistent Bangla/English, locale API header and static-copy policy. Authored marketplace content intentionally remains in its submitted language.                                 |
| Verification/uploads         | Ready in code                                | Separate NID/selfie selection and upload/service tests pass; production object-store policies and retention require deployment review.                                             |
| Notifications                | Ready in code/local data                     | Bilingual inbox and backend payloads tested; real push/SMS delivery depends on providers.                                                                                          |
| Accessibility/mobile         | Improved and regression-tested               | 320 dp/200% text tests, contrast test and connected-phone semantic tree checks pass.                                                                                               |
| Security/observability       | Strong baseline, operational review required | Secure tokens, redaction, validation, moderation and Sentry hooks exist; secrets, TLS, backups, alerts and an external security review remain deployment work.                     |
| Performance/data efficiency  | Acceptable baseline                          | Cached catalogs/chat and paginated APIs exist; production load tests and slow-query monitoring remain necessary.                                                                   |
| Admin console                | Production build passes                      | Authenticated browser E2E and operator permission matrix should be run in staging.                                                                                                 |
| Subscription/operator access | Ready for disabled pilot display             | Prefixes remain unverified hints and entitlement enforcement stays off; commercial plans, provider contracts, signed callbacks and staged rollback are required before activation. |
| Offline job payment          | Ready for Version 1 cash recording           | Poster-only, zero-fee and audited; KAAJ does not receive or hold the cash. Representative dispute/support journeys still require staging operations rehearsal.                     |

## Prioritized remaining features

### Critical before public production launch

- Configure and stage-test real SMS OTP, push notification and object-storage providers; verify retries, quotas, abuse controls and retention.
- Complete production secrets/TLS, database backups and restore drill, monitoring/alerting, privacy/terms/support contacts and store signing/release configuration.
- Run staging smoke tests with worker, client and moderator accounts, including upload, verification, notification delivery, hire/close/cancel/dispute and account-deletion retention behavior.
- Perform an external security/privacy review and confirm NID/selfie access, encryption, deletion and operator audit policies.
- Approve subscription price/duration/refund policy and tax treatment, sign operator/provider agreements, implement signed billing callbacks and reconciliation, and complete a staged rollback before enabling subscription enforcement.

### Important for launch or early release

- Add travel radius and reliable distance/ETA to local results after defining the API/geospatial contract.
- Add saved searches/alerts and more explicit location-permission fallback for users who only know an area name.
- Autosave job-post drafts and preserve partially completed long forms.
- Improve applicant comparison around availability, verification and relevant skill evidence without adding ranking opacity.
- Add offline read caches/queued retry for a small set of safe actions and production performance dashboards.
- Add data export and a clearly staffed human-support/escalation path.
- Upgrade Android/Kotlin Gradle plugin integration before Flutter removes legacy plugin application support.
- Add dual-control approval and an external payment-evidence reference for manual subscription activation, plus scheduled expiry/reconciliation instead of relying only on read-time expiry updates.

### Future

- Voice-assisted search/posting for low-literacy users.
- Recurring rosters, multi-worker shifts and multi-manager employer accounts.
- Optional translation assistance for user-authored content with clear source-language labeling and consent.
- Advanced marketplace analytics, experimentation and recommendation tooling after enough production data exists.
- Additional operator adapters, contracted mobile banking/card payments, wallet, payout, and withdrawal only after legal, provider, tax, ledger and reconciliation gates are complete.

## Verification performed

- `flutter analyze` — pass, no issues.
- `flutter test` — 83 tests pass.
- Android `assembleDevDebug` — pass; APK produced at `build/app/outputs/flutter-apk/app-dev-debug.apk`.
- Connected Motorola Android 16 phone — OTP login, language persistence after process restart, Bangla and English home, subscription status/operator/no-plan state, cash-payment history, category/subtype, scheduled job/time match, application dialog/input, notifications, Settings and availability checked visually and through the Android accessibility tree.
- Backend Jest — 42 suites / 227 tests pass; seven database-dependent suites / 33 tests remain intentionally skipped by their existing environment conditions.
- Live PostgreSQL/Redis money test — 3/3 pass, including offline cash idempotency, zero fee, audit and job transition.
- Admin TypeScript and optimized production build — pass.
- Authenticated admin browser — English/Bangla subscription and job-payment pages, plan dialog, narrow viewport and console checked; no console error or page overflow remains.

The Flutter test runner prints a non-fatal Linux GTK development-package warning on this host; Android build/run and tests complete. No Linux desktop build is part of the product target.

## Evidence limits

- Screenshots document representative end-to-end states, not every screen and permutation.
- No real SMS, push, payment, production S3, app-store signing, production TLS or deployed monitoring provider was available in this local environment.
- No destructive account deletion, irreversible moderation action or duplicate live job application was submitted during visual QA.
- Authenticated admin automation used the local development administrator and local data; a separate production-like staging permission matrix is still required.
- Passing automated tests and a device smoke journey reduce regression risk but do not replace staging, load, accessibility-specialist or penetration testing.

## Screenshot evidence

- `docs/audit-evidence/2026-09-05/before/` — original dashboard, job list, application requirement, language, notification and availability states.
- `docs/audit-evidence/2026-09-05/after/` — phone/OTP visibility, Bangla and English home, language switch, category/subtype, jobs, application, notifications, availability and Settings.
