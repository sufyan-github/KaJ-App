# KAAJ Mobile Implementation Status

Last verified: 1 September 2026

## Delivered

- [x] Android Flutter project in the requested `Kaaj` directory
- [x] Bangla-default localization with complete English/Bangla key parity
- [x] Package identity `app.kaaj.mobile`
- [x] `dev`, `staging`, and `prod` Android flavors
- [x] Android 8.0 minimum, backup disabled, cleartext traffic disabled
- [x] Product color, typography, spacing, input, and button foundations
- [x] shared card, text-field, empty, error, and offline UI states
- [x] feature-first Clean Architecture boundaries
- [x] Riverpod dependency/state composition
- [x] go_router navigation foundation
- [x] Dio API envelope handling
- [x] `Accept-Language: bn`
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
- [x] profile, role, location, skills/rate, availability, and tour onboarding
- [x] persisted mid-flow recovery after app process recreation
- [x] availability editor, skills editor, categories, public preview, settings, and safety screens
- [x] verified `dev` and `staging` debug plus `prod` release APK builds

## Backend contract used

The client is aligned with the currently implemented NestJS routes:

- `POST /api/v1/auth/otp/request`
- `POST /api/v1/auth/otp/verify`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

It also consumes the backend's actual `{ data, meta }` success envelope and `{ error }` failure envelope.

## Completed sequential milestones

P1-UI-08 completes the authentication entry budget. P2-UI-06 implements every Phase 2 screen and
connects onboarding mutations and the D10 public-profile projection to the sibling backend. A timed
human onboarding run remains Phase 2 exit-gate evidence rather than being inferred from tests.

## Phase 2 delivery

P2-TAX-01 and P2-UI-06 are implemented and verified. Catalog data remains persistent and data-driven;
new-user onboarding is Bangla-first, backend-connected, and resumes its exact saved step after relaunch.

## Verification evidence

- `flutter analyze --fatal-infos`: clean on Flutter 3.47.2 / Dart 3.13.2
- `flutter test`: 35 passing tests
- `flutter build apk --debug --flavor dev`: successful
- `flutter build apk --debug --flavor staging`: successful
- `flutter build apk --release --flavor prod`: successful, 58.2 MB

Flutter emitted a forward-compatibility warning that `sentry_flutter` still applies the Kotlin Gradle Plugin. It does not fail current Flutter 3.47.2 builds and should be rechecked during dependency upgrades. Android tooling also warned that the installed command-line tools understand SDK XML up to version 3 while a version 4 file is present; builds still succeed, but the host command-line tools should be updated.
