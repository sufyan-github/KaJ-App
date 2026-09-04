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

The API URL must use HTTPS because Android cleartext traffic is disabled. Default flavor endpoints follow the specification:

- dev: `https://api-dev.kaaj.app/api/v1`
- staging: `https://api-staging.kaaj.app/api/v1`
- prod: `https://api.kaaj.app/api/v1`

## Quality gates

```powershell
dart format --output=none --set-exit-if-changed .
flutter analyze --fatal-infos
flutter test
flutter build apk --debug --flavor dev
flutter build apk --debug --flavor staging
flutter build apk --debug --flavor prod
```

## Architecture

Each feature owns `data`, `domain`, and `presentation` layers. Domain code does not import Flutter or data implementations. API DTOs remain in data sources/repositories, while widgets depend on domain contracts through Riverpod providers.

## Deliberate deviation

The source specification is Bangla-first. The project owner explicitly requested English, so English is the authored and default locale in this implementation. The localization boundary remains in place for adding Bangla later.

## Maintenance note

Flutter 3.47.2 currently reports that `sentry_flutter` applies the Kotlin Gradle Plugin and will need a future Built-in Kotlin-compatible release. All three flavor builds currently succeed; this is a forward-compatibility warning, not a failed gate.
