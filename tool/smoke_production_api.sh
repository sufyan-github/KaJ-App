#!/usr/bin/env bash

set -euo pipefail

KAAJ_API_URL="${KAAJ_API_URL:-https://api.kaaj.app/api/v1}"
KAAJ_SMOKE_ACCESS_TOKEN="${KAAJ_SMOKE_ACCESS_TOKEN:-}"
RESULT_DIRECTORY="$(mktemp -d /tmp/kaaj-api-smoke-XXXXXX)"
FAILED=0

if [[ "$KAAJ_API_URL" != https://* ]]; then
  echo "KAAJ_API_URL must use HTTPS." >&2
  exit 64
fi

API_ORIGIN="${KAAJ_API_URL%/api/v1}"

check() {
  local name="$1"
  local method="$2"
  local url="$3"
  local expected_status="$4"
  local body="${5:-}"
  local output="${RESULT_DIRECTORY}/${name}.json"
  local arguments=(--silent --show-error --max-time 30 --request "$method")

  if [[ -n "$KAAJ_SMOKE_ACCESS_TOKEN" ]]; then
    arguments+=(--header "Authorization: Bearer ${KAAJ_SMOKE_ACCESS_TOKEN}")
  fi
  if [[ -n "$body" ]]; then
    arguments+=(--header 'Content-Type: application/json' --data "$body")
  fi

  local status
  status="$(curl "${arguments[@]}" --output "$output" --write-out '%{http_code}' "$url" || true)"
  if [[ "$status" == "$expected_status" ]]; then
    printf 'PASS  %-24s HTTP %s\n' "$name" "$status"
    return
  fi

  printf 'FAIL  %-24s expected HTTP %s, received %s\n' \
    "$name" "$expected_status" "${status:-request-failed}" >&2
  if [[ -s "$output" ]]; then
    jq -c '{error: .error}' "$output" 2>/dev/null | sed -n '1p' >&2 || true
  fi
  FAILED=1
}

check health GET "${API_ORIGIN}/health" 200
check categories GET "${KAAJ_API_URL}/categories" 200
check locations GET "${KAAJ_API_URL}/locations" 200
check invalid_otp_request POST "${KAAJ_API_URL}/auth/otp/request" 400 \
  '{"phone":"invalid"}'

if [[ -n "$KAAJ_SMOKE_ACCESS_TOKEN" ]]; then
  check session GET "${KAAJ_API_URL}/auth/session" 200
  check jobs GET "${KAAJ_API_URL}/jobs" 200
  check notifications GET "${KAAJ_API_URL}/notifications" 200
else
  check jobs_require_auth GET "${KAAJ_API_URL}/jobs" 401
  echo "SKIP  authenticated reads      set KAAJ_SMOKE_ACCESS_TOKEN"
fi

echo "Response bodies are retained locally in ${RESULT_DIRECTORY}."
exit "$FAILED"
