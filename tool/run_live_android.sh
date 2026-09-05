#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <android-device-id>" >&2
  exit 64
fi

KAAJ_DEVICE_ID="$1"
KAAJ_LIVE_API_URL="${KAAJ_LIVE_API_URL:-https://kaaj-api.onrender.com/api/v1}"

exec flutter run \
  -d "$KAAJ_DEVICE_ID" \
  --flavor prod \
  --dart-define="API_BASE_URL=${KAAJ_LIVE_API_URL}"
