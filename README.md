# KAAJ Mobile

Android-first Flutter client for KAAJ, a local work marketplace connecting customers and workers in Rajshahi.

## Current delivery

This repository contains the English-first mobile foundation and the backend-integrated phone OTP authentication flow:

- Android package `app.kaaj.mobile` with `dev`, `staging`, and `prod` flavors
- Material 3 design tokens from the product specification
- reusable `KCard`, `KTextField`, primary button, empty, error, and offline states
- English localization through Flutter `gen_l10n`
- feature-first Clean Architecture foundation
- Riverpod state management and go_router navigation
- Dio API client with locale, bearer-token, refresh-token, and idempotency handling
- deterministic mock HTTP adapter coverage for interceptor round trips
- access token held in memory; rotating refresh token and device ID in secure storage
- persistent connectivity banner, privacy-filtered analytics, and permission gateway
- phone entry, OTP verification, session restoration, and logout
- guarded authenticated routes, OTP expiry/resend handling, and coordinated token refresh
- structured server error rendering with support request IDs
- Android 8.0 minimum and cleartext/backup protection
- analyzer, unit, policy, offline-state, and 200% text-scale widget tests

The backend currently exposes authentication and session endpoints. Profile, onboarding, catalog, jobs, and marketplace flows must be connected as their backend contracts land; production paths intentionally contain no fabricated marketplace data.

## Run

```powershell
flutter pub get
flutter run --flavor dev --dart-define=API_BASE_URL=https://your-dev-api.example/api/v1
```

For a physical Android phone connected by USB to the local backend and MinIO,
use the helper below. It forwards both the API port and the signed-upload port;
forwarding only the API port makes NID, selfie, chat-photo, and evidence uploads
fail after the signing step.

```bash
./tool/run_connected_android.sh <android-device-id>
```

The local defaults are API port `3100` and MinIO port `9000`. Override them with
`KAAJ_API_PORT` and `KAAJ_STORAGE_PORT` when needed.

To run a connected phone against the deployed production API, use:

```bash
./tool/run_live_android.sh <android-device-id>
```

This uses `https://api.kaaj.app/api/v1` by default. Override it with
`KAAJ_LIVE_API_URL` while testing a different public API endpoint. Provider,
database and signing credentials belong on the server and are never passed to
Flutter or embedded in an APK.

The API URL must use HTTPS because Android cleartext traffic is disabled. Default flavor endpoints follow the specification:

- dev: `https://api-dev.kaaj.app/api/v1`
- staging: `https://api-staging.kaaj.app/api/v1`
- prod: `https://api.kaaj.app/api/v1`

## Quality gates

```bash
dart format --output=none --set-exit-if-changed .
flutter analyze --fatal-infos
flutter test --coverage
flutter build apk --release --flavor prod --target-platform android-arm64
```

CI runs all four. The release build is part of the gate on purpose: a debug
build cannot catch an R8 or resource-shrinking regression, and CI fails if the
arm64 release APK grows past 35 MB.

## Release

```bash
KAAJ_API_URL=https://api.kaaj.app/api/v1 \
KAAJ_SENTRY_DSN=<dsn> \
./tool/build_release.sh
```

This produces the signed App Bundle and writes obfuscation symbols to
`build/symbols/<version>/`. **Archive that symbol directory with every
release** — without the symbols for a specific build, its Sentry stack traces
cannot be read.

Release builds have R8 code shrinking, resource shrinking and Dart obfuscation
enabled, and the bundle splits by ABI and density. The arm64 download is about
25 MB; a universal unshrunk APK was 63 MB.

`android/key.properties` is required and is never committed. It supports
`keyPassword`/`storePassword` inline or `keyPasswordFile`/`storePasswordFile`
pointing at files outside the repository.

## Architecture

Each feature owns `data`, `domain`, and `presentation` layers. Domain code does not import Flutter or data implementations. API DTOs remain in data sources/repositories, while widgets depend on domain contracts through Riverpod providers.

Some shared rules that are easy to break by accident:

- **Money is never a string.** Parse API amounts once at the data boundary with
  `Money.tryParse` (optional fields) or `Money.parseOrZero` (required ones), and
  render with `KFormat.money`. A missing amount must stay `null` rather than
  becoming ৳0.
- **Dates and numbers go through `KFormat`.** It takes the active locale, so
  Bangla screens get Bangla numerals and month names. A bare `DateFormat(...)`
  with no locale silently prints English.
- **Remote images use `KNetworkImage`, never `Image.network`.** It disk-caches,
  decodes to the drawn size, and has real placeholder and error states. Repeated
  downloads cost the user prepaid data.
- **`dioProvider` must not depend on the locale.** `Accept-Language` is read per
  request from `ApiLocale`. Making Dio depend on the locale rebuilds the auth
  controller and every repository cache on a language switch; there is a
  regression test for this in `test/core/api_locale_test.dart`.
- **User-authored content stays out of route URLs.** Titles and names travel
  through GoRouter `extra` (see `core/routing/route_arguments.dart`); a cold
  deep link falls back to localized wording.

## Deliberate deviation

The source specification is Bangla-first. The project owner explicitly requested English, so English is the authored and default locale in this implementation. The localization boundary remains in place for adding Bangla later.

## Known gaps

Two things are deliberately not done yet and are not hidden by the code:

- **Push notifications.** There is a notification inbox but no FCM, so nothing
  reaches a user whose app is closed. Realtime is a per-conversation socket only.
- **Authentication remains in its testing phase.** Registration is still
  restricted to Robi (018) and Airtel (016) because OTP and subscription
  charging both run through BDApps. Opening this up to Grameenphone (017/013),
  Banglalink (019/014) and Teletalk (015) needs an operator-neutral SMS gateway
  first. `AuthValidators._bangladeshPhone` already accepts every valid prefix
  and is the switch to flip when that lands.

The app is dark-theme only. `KColors` is referenced directly at 273 call sites,
so adding a light theme means moving those to a `ThemeExtension` first.

## Maintenance note

Flutter 3.47.2 reports that `sentry_flutter` and `flutter_image_compress_common`
apply the Kotlin Gradle Plugin and will need Built-in Kotlin-compatible
releases. All flavor builds currently succeed; this is a forward-compatibility
warning, not a failed gate.
