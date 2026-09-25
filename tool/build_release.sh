#!/usr/bin/env bash
#
# Builds the artefacts that actually ship.
#
# Obfuscation is on and debug symbols are split out: it shrinks the AOT
# snapshot and it is what lets Sentry symbolicate a production stack trace.
# The symbol directory MUST be archived per release — without the exact
# symbols for a build, its crash reports are unreadable forever.

set -euo pipefail

KAAJ_API_URL="${KAAJ_API_URL:-https://api.kaaj.app/api/v1}"
KAAJ_SENTRY_DSN="${KAAJ_SENTRY_DSN:-}"
VERSION="$(sed -n 's/^version: //p' pubspec.yaml | tr -d '[:space:]')"
SYMBOLS_DIR="build/symbols/${VERSION}"

if [[ ! -f android/key.properties ]]; then
  echo "android/key.properties is missing; the build would not be signed." >&2
  exit 78
fi

if [[ "$KAAJ_API_URL" != https://* ]]; then
  echo "KAAJ_API_URL must be an HTTPS URL." >&2
  exit 78
fi

if [[ -z "$KAAJ_SENTRY_DSN" ]]; then
  echo "KAAJ_SENTRY_DSN is required for a production release." >&2
  exit 78
fi

mkdir -p "$SYMBOLS_DIR"

echo "Building KAAJ ${VERSION} against ${KAAJ_API_URL}"

flutter build appbundle \
  --release \
  --flavor prod \
  --obfuscate \
  --split-debug-info="$SYMBOLS_DIR" \
  --dart-define="API_BASE_URL=${KAAJ_API_URL}" \
  --dart-define="SENTRY_DSN=${KAAJ_SENTRY_DSN}" \
  --dart-define="SENTRY_RELEASE=app.kaaj.mobile@${VERSION}"

BUNDLE=build/app/outputs/bundle/prodRelease/app-prod-release.aab
echo
echo "App Bundle : ${BUNDLE} ($(( $(stat -c%s "$BUNDLE") / 1048576 )) MB)"
echo "Symbols    : ${SYMBOLS_DIR}"
echo
echo "Archive the symbol directory with this release before uploading to Play."
