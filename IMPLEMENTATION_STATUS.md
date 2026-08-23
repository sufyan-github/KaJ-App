# KAAJ Mobile Implementation Status

Last verified: 23 August 2026

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

## Next sequential milestone

P1-UI-08 completes the four-screen authentication/onboarding entry budget and its acceptance tests. The currently delivered splash, phone, OTP, and authenticated landing surfaces provide the starting point.

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

## Verification evidence

- `flutter analyze --fatal-infos`: clean
- `flutter test`: 18 passing tests
- `flutter build apk --debug --flavor dev`: successful, 193,012,076 bytes
- `flutter build apk --debug --flavor staging`: successful, 164,844,020 bytes
- `flutter build apk --debug --flavor prod`: successful, 164,843,932 bytes

Flutter emitted a forward-compatibility warning that `sentry_flutter` still applies the Kotlin Gradle Plugin. It does not fail current Flutter 3.44.8 builds and should be rechecked during dependency upgrades.
