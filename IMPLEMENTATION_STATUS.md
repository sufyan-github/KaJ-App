# KAAJ Mobile Implementation Status

Last verified: 1 September 2026

## Delivered

- [x] Android Flutter project in the requested `Kaaj` directory
- [x] English-authored, English-default localization setup
- [x] Package identity `app.kaaj.mobile`
- [x] `dev`, `staging`, and `prod` Android flavors
- [x] Android 8.0 minimum, backup disabled, cleartext traffic disabled
- [x] Product color, typography, spacing, input, and button foundations
- [x] shared card, text-field, empty, error, and offline UI states
- [x] feature-first Clean Architecture boundaries
- [x] Riverpod dependency/state composition
- [x] go_router navigation foundation
- [x] Dio API envelope handling
- [x] `Accept-Language: en`
- [x] bearer access-token attachment
- [x] rotating refresh-token recovery and single retry
- [x] idempotency keys retained on state-changing requests
- [x] deterministic mocked interceptor round trips
- [x] access token in memory only
- [x] refresh token and random device UUID in secure storage
- [x] phone entry, consent, OTP verification, splash restoration, home, and logout
- [x] authenticated route guards and deep-link protection
- [x] OTP expiry feedback, resend cooldown, and replacement challenges
- [x] coordinated rotating-token recovery for concurrent expired requests
- [x] Android activity namespace aligned with `app.kaaj.mobile`
- [x] release builds no longer fall back to debug signing
- [x] structured server error copy and request-reference rendering
- [x] persistent app-wide offline banner with cached-content preservation
- [x] privacy-filtered analytics dispatcher that rejects PII-like fields
- [x] platform permission gateway with explicit denial states
- [x] Sentry bootstrap with PII disabled when a DSN is supplied
- [x] CI workflow for formatting, analysis, tests, and dev APK build
- [x] unit, localization policy, controller, offline, and 200% text-scale widget tests
- [x] verified `dev`, `staging`, and `prod` debug APK builds

## Backend contract used

The client is aligned with the currently implemented NestJS routes:

- `POST /api/v1/auth/otp/request`
- `POST /api/v1/auth/otp/verify`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

It also consumes the backend's actual `{ data, meta }` success envelope and `{ error }` failure envelope.

## Completed sequential milestone

P1-UI-08 completes the four-screen authentication entry budget and its acceptance tests. New-user onboarding remains the next backend-dependent milestone.

## Later backend dependencies

Phase 1 onboarding needs backend contracts that are not present in the current backend checkout:

- runtime configuration and version gate
- current user/profile read and update
- profile photo upload
- role selection
- city, area, and mahalla catalog
- skills and worker profile setup
- availability rules

Those screens should be connected when the endpoints exist. Production paths must not fabricate marketplace data or silently invent API fields.

## Phase 2 delivery

P2-TAX-01 is implemented and verified: typed category, skill, and Rajshahi location contracts connect to public sibling-backend catalog endpoints, and a schema-versioned one-hour Hive cache preserves catalog data across restarts. Backend administrator mutations invalidate Redis immediately.

## Verification evidence

- `flutter analyze --fatal-infos`: clean on Flutter 3.47.2 / Dart 3.13.2
- `flutter test`: 26 passing tests
- `flutter build apk --debug --flavor dev`: successful, 169,437,924 bytes
- `flutter build apk --debug --flavor staging`: successful, 169,438,120 bytes
- `flutter build apk --debug --flavor prod`: successful, 169,437,920 bytes

Flutter emitted a forward-compatibility warning that `sentry_flutter` still applies the Kotlin Gradle Plugin. It does not fail current Flutter 3.47.2 builds and should be rechecked during dependency upgrades. Android tooling also warned that the installed command-line tools understand SDK XML up to version 3 while a version 4 file is present; builds still succeed, but the host command-line tools should be updated.
