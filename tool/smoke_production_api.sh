#!/usr/bin/env bash

set -euo pipefail

KAAJ_API_URL="${KAAJ_API_URL:-https://api.kaaj.app/api/v1}"
KAAJ_API_URL="${KAAJ_API_URL%/}"
KAAJ_SMOKE_ACCESS_TOKEN="${KAAJ_SMOKE_ACCESS_TOKEN:-}"
KAAJ_SMOKE_HEALTH_TIMEOUT="${KAAJ_SMOKE_HEALTH_TIMEOUT:-90}"
FAILED=0

if [[ ! "$KAAJ_API_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/api/v1$ ]]; then
  echo "KAAJ_API_URL must be an HTTPS origin followed by /api/v1." >&2
  exit 64
fi
if [[ ! "$KAAJ_SMOKE_HEALTH_TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then
  echo "KAAJ_SMOKE_HEALTH_TIMEOUT must be a positive number of seconds." >&2
  exit 64
fi
for dependency in curl jq; do
  command -v "$dependency" >/dev/null || {
    echo "Required command is missing: $dependency" >&2
    exit 69
  }
done

# Authenticated responses may contain private data; keep all artifacts private.
umask 077
RESULT_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/kaaj-api-smoke-XXXXXX")"

API_ORIGIN="${KAAJ_API_URL%/api/v1}"

check() {
  local name="$1"
  local method="$2"
  local url="$3"
  local expected_status="$4"
  local body="${5:-}"
  local contract="${6:-.data != null}"
  local authenticated="${7:-false}"
  local timeout="${8:-30}"
  local output="${RESULT_DIRECTORY}/${name}.json"
  local arguments=(--silent --show-error --connect-timeout 10 --max-time "$timeout"
    --request "$method" --header 'Accept: application/json')

  if [[ "$authenticated" == true ]]; then
    arguments+=(--header "Authorization: Bearer ${KAAJ_SMOKE_ACCESS_TOKEN}")
  fi
  if [[ -n "$body" ]]; then
    arguments+=(--header 'Content-Type: application/json' --data "$body")
  fi

  local status
  if ! status="$(curl "${arguments[@]}" --output "$output" --write-out '%{http_code}' "$url")"; then
    printf 'FAIL  %-24s transport error (HTTP %s)\n' "$name" "${status:-000}" >&2
    FAILED=1
    return
  fi
  if [[ "$status" == "$expected_status" ]] && jq -e "$contract" "$output" >/dev/null 2>&1; then
    printf 'PASS  %-24s HTTP %s, JSON contract valid\n' "$name" "$status"
    return
  fi

  printf 'FAIL  %-24s expected HTTP %s and valid JSON, received HTTP %s\n' \
    "$name" "$expected_status" "$status" >&2
  if [[ -s "$output" ]]; then
    # Do not print private response data or arbitrary server error messages.
    jq -c '{code: .error.code, requestId: (.error.requestId // .meta.requestId)}' \
      "$output" 2>/dev/null | sed -n '1p' >&2 || true
  fi
  FAILED=1
}

# A free Render instance can take longer than a normal request to wake up.
# This only increases the health request deadline; it never retries an OTP POST.
check health GET "${API_ORIGIN}/health" 200 '' '.data.status == "ok"' false "$KAAJ_SMOKE_HEALTH_TIMEOUT"
check categories GET "${KAAJ_API_URL}/categories" 200 '' '(.data | type) == "array"'
check locations GET "${KAAJ_API_URL}/locations" 200 '' '(.data | type) == "array"'
check invalid_otp_request POST "${KAAJ_API_URL}/auth/otp/request" 400 \
  '{"phone":"invalid"}' '(.error.code | type) == "string"'
check jobs_require_auth GET "${KAAJ_API_URL}/jobs" 401 '' '(.error.code | type) == "string"'

if [[ -n "$KAAJ_SMOKE_ACCESS_TOKEN" ]]; then
  check session GET "${KAAJ_API_URL}/auth/session" 200 '' '.data != null' true
  check jobs GET "${KAAJ_API_URL}/jobs" 200 '' '.data != null' true
  check notifications GET "${KAAJ_API_URL}/notifications" 200 '' '.data != null' true
else
  echo "SKIP  authenticated reads      set KAAJ_SMOKE_ACCESS_TOKEN"
fi

echo "Response bodies are retained locally in ${RESULT_DIRECTORY}."
exit "$FAILED"
