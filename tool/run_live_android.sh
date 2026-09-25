#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <android-device-id>" >&2
  exit 64
fi

KAAJ_DEVICE_ID="$1"
KAAJ_LIVE_API_URL="${KAAJ_LIVE_API_URL:-https://api.kaaj.app/api/v1}"

if [[ "$KAAJ_LIVE_API_URL" != https://* ]]; then
  echo "KAAJ_LIVE_API_URL must use HTTPS." >&2
  exit 78
fi

exec flutter run \
  -d "$KAAJ_DEVICE_ID" \
  --flavor prod \
  --dart-define="API_BASE_URL=${KAAJ_LIVE_API_URL}"
