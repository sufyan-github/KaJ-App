#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPOSITORY_ROOT"

# These names represent server-only credentials. Their appearance in the
# public mobile client or release commands usually means a secret is about to
# be compiled into the APK.
FORBIDDEN_PATTERN='API_KEY|X-API-Key|BDAPPS_(PASSWORD|APP_HASH)|JWT_(ACCESS|REFRESH)_SECRET|DATABASE_URL'
SCOPES=(lib android tool README.md docs)

if rg -n --hidden \
  --glob '!build/**' \
  --glob '!*.lock' \
  --glob '!*.png' \
  --glob '!*.pdf' \
  --glob '!*.apk' \
  --glob '!*.aab' \
  --glob '!tool/check_client_secrets.sh' \
  "$FORBIDDEN_PATTERN" "${SCOPES[@]}"; then
  echo "Server-only credential configuration was found in public client/release files." >&2
  exit 1
fi

if git ls-files -z | xargs -0 rg -l -- \
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' \
  >/tmp/kaaj-secret-scan-findings.txt; then
  echo "A private key, AWS access key, or JWT-like token was found in tracked files:" >&2
  sed -n '1,40p' /tmp/kaaj-secret-scan-findings.txt >&2
  exit 1
fi

echo "Client credential policy scan passed."
