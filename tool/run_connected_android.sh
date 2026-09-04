#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <android-device-id>" >&2
  exit 64
fi

KAAJ_DEVICE_ID="$1"
KAAJ_API_PORT="${KAAJ_API_PORT:-3100}"
KAAJ_STORAGE_PORT="${KAAJ_STORAGE_PORT:-9000}"

if command -v adb >/dev/null 2>&1; then
  KAAJ_ADB_BIN="$(command -v adb)"
else
  KAAJ_ANDROID_SDK="$(sed -n 's/^sdk.dir=//p' android/local.properties | head -n 1)"
  KAAJ_ADB_BIN="${KAAJ_ANDROID_SDK}/platform-tools/adb"
fi

if [[ ! -x "$KAAJ_ADB_BIN" ]]; then
  echo "Android adb was not found. Configure sdk.dir in android/local.properties." >&2
  exit 69
fi

"$KAAJ_ADB_BIN" -s "$KAAJ_DEVICE_ID" get-state >/dev/null
"$KAAJ_ADB_BIN" -s "$KAAJ_DEVICE_ID" reverse \
  "tcp:${KAAJ_API_PORT}" "tcp:${KAAJ_API_PORT}"
"$KAAJ_ADB_BIN" -s "$KAAJ_DEVICE_ID" reverse \
  "tcp:${KAAJ_STORAGE_PORT}" "tcp:${KAAJ_STORAGE_PORT}"

echo "Forwarded KAAJ API :${KAAJ_API_PORT} and private uploads :${KAAJ_STORAGE_PORT}."

exec flutter run \
  -d "$KAAJ_DEVICE_ID" \
  --flavor dev \
  --dart-define="API_BASE_URL=http://127.0.0.1:${KAAJ_API_PORT}/api/v1"
