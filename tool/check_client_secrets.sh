#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPOSITORY_ROOT"

for dependency in git rg; do
  command -v "$dependency" >/dev/null || {
    echo "Required command is missing: $dependency" >&2
    exit 69
  }
done
umask 077
SCAN_DIRECTORY="$(mktemp -d "${TMPDIR:-/tmp}/kaaj-secret-scan-XXXXXX")"
trap 'rm -f -- "$SCAN_DIRECTORY/tracked" "$SCAN_DIRECTORY/findings"; rmdir -- "$SCAN_DIRECTORY"' EXIT
# Resolve tracked paths first. A Git failure must never become a successful scan.
git ls-files -z >"$SCAN_DIRECTORY/tracked"
mapfile -d '' -t TRACKED_FILES <"$SCAN_DIRECTORY/tracked"
if [[ ${#TRACKED_FILES[@]} -eq 0 ]]; then
  echo "No tracked files are available to scan." >&2
  exit 1
fi

# These names represent server-only credentials. Their appearance in the
# public mobile client or release commands usually means a secret is about to
# be compiled into the APK.
FORBIDDEN_PATTERN='API_KEY|X-API-Key|BDAPPS_(PASSWORD|APP_HASH)|JWT_(ACCESS|REFRESH)_SECRET|DATABASE_URL'
SCOPES=(lib android tool landing-page README.md docs)

scan_status=0
rg -l --hidden \
  --glob '!build/**' \
  --glob '!*.lock' \
  --glob '!*.png' \
  --glob '!*.pdf' \
  --glob '!*.apk' \
  --glob '!*.aab' \
  --glob '!tool/check_client_secrets.sh' \
  "$FORBIDDEN_PATTERN" "${SCOPES[@]}" >"$SCAN_DIRECTORY/findings" || scan_status=$?
if [[ "$scan_status" -eq 0 ]]; then
  echo "Server-only credential configuration was found in public client/release files." >&2
  sed -n '1,40p' "$SCAN_DIRECTORY/findings" >&2
  exit 1
elif [[ "$scan_status" -ne 1 ]]; then
  echo "Client credential scan failed to read its inputs." >&2
  exit "$scan_status"
fi

scan_status=0
rg -l -- \
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' \
  "${TRACKED_FILES[@]}" >"$SCAN_DIRECTORY/findings" || scan_status=$?
if [[ "$scan_status" -eq 0 ]]; then
  echo "A private key, AWS access key, or JWT-like token was found in tracked files:" >&2
  sed -n '1,40p' "$SCAN_DIRECTORY/findings" >&2
  exit 1
elif [[ "$scan_status" -ne 1 ]]; then
  echo "Tracked-file credential scan failed to read its inputs." >&2
  exit "$scan_status"
fi

echo "Client credential policy scan passed."
