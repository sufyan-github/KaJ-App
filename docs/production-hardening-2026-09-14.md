# KAAJ production hardening — 14 September 2026

Applied to the Flutter client and consolidated on
`codex/production-hardening`. The production authentication flow remains
server-backed; no demo bypass was added to this branch.

## Verification

| Gate | Result |
| --- | --- |
| `dart format --set-exit-if-changed` | clean |
| `flutter analyze --fatal-infos` | no issues |
| `flutter test` | 112 passing (was 85) |
| `flutter build apk --release --flavor prod --target-platform android-arm64` | 25.5 MB (was 63 MB) |
| release package metadata | `app.kaaj.mobile`, `1.0.1+2` |
| APK signature verification | v2 signature valid |
| configured server secrets in compiled app | absent |
| `flutter build apk --debug --flavor dev` | succeeds |
| `aapt2 dump badging` on the release APK | adaptive icon resolves at every density |

## Build and release

- **R8 code shrinking and resource shrinking enabled** on release, with
  `android/app/proguard-rules.pro` keeping the reflective entry points for
  Flutter, Sentry, the location `MethodChannel` and Play Core. This is the
  single largest change: 63 MB → 25.5 MB for an arm64 device.
- **App Bundle configured** to split by ABI and density but not by language,
  since the Bangla/English switch is in-app.
- **Locale filtering** to `en` and `bn`, dropping every other bundled AndroidX
  translation.
- **`tool/build_release.sh`** builds the signed bundle with `--obfuscate` and
  `--split-debug-info`, and prints where the symbols landed. Those symbols must
  be archived per release or that build's crash reports are unreadable.
- **CI now builds the release APK and fails past a 35 MB budget.** The previous
  workflow only built a debug APK, which cannot catch a shrinking regression.
  Coverage is collected and uploaded.

## Android packaging and security

- **Adaptive launcher icon** generated from `assets/branding/kaaj_launcher_master.png`:
  foreground, background (`#076943`, `KColors.primaryDark`) and a monochrome
  layer for Android 13 themed icons. Previously a legacy square PNG that every
  launcher cropped.
- **`network_security_config.xml`**: TLS only, system trust anchors only, so a
  device-level proxy cannot read NID or selfie uploads. The debug variant adds
  user CAs and loopback cleartext so `tool/run_connected_android.sh` still
  reaches a local API and MinIO.
- **`data_extraction_rules.xml`**: nothing leaves the device through cloud
  backup or device-to-device transfer.
- **Verified App Links** for `kaaj.app` plus a `kaaj://` scheme fallback.
  `autoVerify` needs `/.well-known/assetlinks.json` served from the domain
  before it resolves.
- Removed the stray `android/app/E:` directory (a Windows path artefact).

## Correctness

- **Language switching no longer resets the session.** `dioProvider` used to
  watch the locale, so changing language rebuilt Dio → the auth repository →
  the auth controller, resetting `AuthState` to `initial` and bouncing the user
  to the splash screen with every cache dropped. `Accept-Language` is now read
  per request from a stable `ApiLocale` holder.
  Regression test: `test/core/api_locale_test.dart`.
- **Attendance can no longer be satisfied by a stale GPS fix.** The native
  bridge listened on one provider and, after a timeout, returned
  `getLastKnownLocation` with no age check — a fix from hours ago and kilometres
  away counted as a valid check-in. It now listens on every enabled provider,
  refuses any fallback older than 90 s measured on the elapsed-realtime clock,
  picks the most accurate candidate, and reports `ageMillis` to Dart so the
  server can judge independently. Mock detection uses `isMock` on API 31+.
- **Money is a type, not a string.** `Money` parses at the data boundary; a
  missing amount stays `null` instead of rendering as ৳0. The two duplicated
  `_taka` helpers are gone.
- **Dates and numbers are localized.** `KFormat` passes the active locale to
  `intl`, and `initializeDateFormatting` runs at bootstrap. Bangla screens
  previously printed "5 Sep 2026, 9:41 AM"; relative times were produced by
  substring-replacing Bangla words and could say "1 days ago".
- **Publishing a job is idempotent per user action.** Create and publish now
  share one idempotency key, so a retry on a dropped connection cannot create a
  second draft. A publish failure raises `JobDraftPublishFailure` carrying the
  draft id, and the UI tells the poster the job was saved as a draft instead of
  implying nothing happened.
- **Analytics cannot crash a flow.** The PII guard dropped events by throwing
  `ArgumentError`. It now reports through an `onRejected` callback and returns;
  a throwing sink is swallowed the same way.
- **Chat image upload obeys the error contract.** All three steps share one
  `try`/`ErrorMapper`, the upload client has explicit timeouts sized for a
  mobile uplink, and `onSendProgress` is exposed. `markRead` and `blockUser`
  were also unwrapped and now map their failures.
- **Chat realtime recovers from an expired token.** The socket captured the
  access token once, so after expiry it reconnected forever with a dead
  credential and no handler noticed. It now re-reads the token on connect
  error, exposes a `ChatConnectionState` stream, and has `refreshSession()`.

## Network and performance

- **Offline detection confirms reachability.** Transport presence is a hint;
  a cheap probe against `/health` decides, with a 15 s result cache, a 30 s
  poll, and any successful API response short-circuiting the next probe. The
  old check reported online on a dead 2G cell or behind a captive portal.
  Tests: `test/core/connectivity_service_test.dart`.
- **The offline banner no longer shifts the app.** It was a sibling in a
  `Column`, so every connectivity flicker resized the whole navigator. It is now
  an animated overlay in a `Stack`.
- **Remote images are disk-cached.** Every `Image.network` is replaced by
  `KNetworkImage`, which caches to disk, decodes to the drawn size, and has real
  placeholder and error states. Portfolio and chat photos were re-downloading on
  every scroll, on prepaid data.
- **The notification inbox is virtualized.** It built every card eagerly into a
  plain `ListView`; day grouping is now a flat row model behind
  `ListView.builder`.
- **Request timeouts widened** to 20 s connect / 40 s receive / 60 s send, sized
  for a slow 3G handover rather than a fast office connection.

## Privacy

- **User-authored content is out of route URLs.** Job titles and counterparty
  names travelled as query parameters so an app bar could render instantly,
  which put them into navigation history and anything that logs a route. They
  now travel through GoRouter `extra`; a cold deep link falls back to localized
  wording. This also removed the three hardcoded Bangla strings in the router
  that no language switch could ever translate.

## Repository hygiene

- `.gitignore` now covers `*.apk`, `*.aab`, `/output/`, `/tmp/`, `/exports/`
  and the landing page's `node_modules`/`dist`. A 63 MB APK was untracked but
  not ignored, one `git add -A` away from entering history permanently.

## Still outstanding

Ranked, and none of it is hidden by the code:

1. **Push notifications.** No FCM, so nothing reaches a closed app. This is the
   largest remaining gap in the product loop and needs a Firebase project plus
   backend fan-out.
2. **Operator lock-in at registration.** Left in place because authentication
   stays in its testing phase. Needs an operator-neutral SMS gateway before
   Grameenphone, Banglalink and Teletalk users can register.
3. **Localization architecture.** 510 Bangla sentences still act as lookup keys
   across 460 call sites. `KFormat` removes the worst of the number and date
   hacks, but the migration to ARB with semantic keys is still owed.
4. **Light theme.** `KColors` is referenced directly at 273 sites; a light theme
   needs those moved to a `ThemeExtension` first.
5. **Pagination.** Feeds, conversations and message history still fetch
   unbounded collections. The rendering side is fine — every unbounded list
   already used a `.builder`, and the inbox was the one exception.
6. **Test coverage.** Chat (1,033 LOC) and home (723 LOC) still have no tests.
