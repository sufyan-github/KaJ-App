# KAAJ BDApps gateway (PHP)

A small PHP gateway that is the only component holding the BDApps (Robi/Cirkle)
application credentials. BDApps only accepts calls from an allow-listed server
IP, so this gateway runs on the allow-listed cPanel host and the KAAJ Nest API
talks to it over HTTPS with an HMAC signature. See
[`docs/BDAPPS_INTEGRATION.md`](../docs/BDAPPS_INTEGRATION.md) for the full flow.

```
Flutter app ──► Nest API ──HMAC──► gateway/api/*.php ──► developer.bdapps.com
                    ▲                                        │
                    └──HMAC── gateway/api/callback.php ◄─────┘ (subscription notification)
```

## Files

| Path                    | Purpose                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `config.php`            | Loads the env file, constants, redacted logging                             |
| `Security.php`          | HMAC verification, single-use nonces, dedupe/throttle stores                |
| `Http.php`              | POST-only guard, generic JSON responses, input validation                   |
| `BDAppsClient.php`      | BDApps API calls (`BDAPPS_API_BASE`)                                        |
| `api/otp_request.php`   | `/subscription/otp/request` (E1351 = already registered, no OTP sent)       |
| `api/otp_verify.php`    | `/subscription/otp/verify` (returns the real or masked `subscriberId`)      |
| `api/status.php`        | `/subscription/getStatus`                                                   |
| `api/unsubscribe.php`   | `/subscription/send` action `0`; E1356 is returned as S1000 / UNREGISTERED  |
| `api/sms_send.php`      | `/sms/send` to one subscriber (KAAJ code for already-subscribed numbers)    |
| `api/callback.php`      | BDApps subscription notification URL; re-checks status and forwards to Nest |
| `dev/mock-bdapps.mjs`   | In-memory BDApps for local tests (Node, no dependencies)                    |
| `dev/gateway-smoke.mjs` | Starts the mock + `php -S` and exercises every endpoint                     |

## Security model

- Requests from Nest (`otp_request`, `otp_verify`, `status`, `unsubscribe`,
  `sms_send`) must be `POST` (else 405) and carry `X-Timestamp` (±300 s),
  `X-Nonce` (32 hex, single use for 10 min) and
  `X-Signature = hex(HMAC-SHA256(rawBody . timestamp . nonce, INTERNAL_API_KEY))`.
  `X-API-Key` is optional and, when present, must match (`hash_equals`). The
  current Nest client no longer sends it, so the secret never travels in a header.
- Inputs are validated: `subscriberId` `^tel:[A-Za-z0-9%+/=._-]{8,160}$` (real or
  masked), `otp` `^\d{4,8}$`, `referenceNo` `^[A-Za-z0-9_-]{4,64}$`, SMS `message`
  1–160 characters without control characters.
- Error bodies are generic (`GW_FORBIDDEN`, `GW_BAD_REQUEST`,
  `GW_UPSTREAM_UNAVAILABLE`, `GW_UNAVAILABLE`); details go only to the redacted
  log (subscriber ids, OTPs, messages, passwords and signatures are never logged).
- `callback.php` (called by BDApps, which does not sign notifications):
  `applicationId` must equal ours and `password`, when present, must match
  (`hash_equals`) — else 403. Exact replays (subscriberId + status + timeStamp)
  are ignored, bursts per subscriber are throttled (`CALLBACK_THROTTLE_SECONDS`,
  default 10), the posted status is never trusted (the gateway re-queries
  `getStatus`), and the normalized event (`REGISTERED` | `UNSUBSCRIBED` |
  `CHARGE_PENDING`, plus `frequency` and `providerTimeStamp`) is forwarded to Nest
  with the same HMAC scheme (no `X-API-Key`). Authenticated notifications always
  receive HTTP 200 `{"statusCode":"S1000","statusDetail":"Request was successfully processed"}`;
  forward failures are logged and Nest also polls the status.
- `.htaccess` denies dotfiles (`.env`), `*.log`, `*.log.N`, `*.md`, `*.mjs`, the
  library PHP files, `storage/` and `dev/`. `storage/.htaccess` and
  `dev/.htaccess` deny everything as a second layer.

## Deploy on cPanel

1. Upload this folder (without `dev/` if you prefer) to e.g.
   `public_html/bdapps/`. PHP ≥ 8.1 with the `curl` and `json` extensions.
2. Create the configuration from `.env.example`, **outside the document root**,
   permissions `0600`. The loader checks, in order:
   1. the path in the `KAAJ_GATEWAY_ENV_FILE` environment variable — e.g. add
      `SetEnv KAAJ_GATEWAY_ENV_FILE /home/<user>/private/kaaj-bdapps-gateway.env`
      to this folder's `.htaccess` or set it in the PHP-FPM pool;
   2. `../kaaj-bdapps-gateway.env` (the parent folder) — outside the docroot when
      the gateway is its own (sub)domain root such as `/home/<user>/gw.example.com/`;
   3. `.env` in this folder (blocked by `.htaccess`; last resort only).
3. Set `GATEWAY_STORAGE_DIR` (and optionally `GATEWAY_LOG_FILE`) to a writable
   folder outside `public_html`, e.g. `/home/<user>/kaaj-gateway-storage`.
4. Fill in `BDAPPS_APP_ID`, `BDAPPS_PASSWORD`, `BDAPPS_APP_HASH` (the KAAJ app
   hash, never another app's), `BDAPPS_APP_CODE` (Android package name),
   `INTERNAL_API_KEY` (`openssl rand -hex 32`, identical to the Nest
   `BDAPPS_INTERNAL_API_KEY`), `NODE_BACKEND_URL` (HTTPS Nest base URL).
5. In developer.bdapps.com set the **Subscription notification URL** to
   `https://<host>/bdapps/api/callback.php`.
6. Make sure the server's outbound IP is on the BDApps allow-list (otherwise
   BDApps answers `E1303`).
7. Rotate credentials: the BDApps password and the HMAC key that were in earlier
   zip bundles must be considered exposed. Generate a new BDApps password in the
   portal and a new `INTERNAL_API_KEY`, update both env files, redeploy.
8. Smoke test with a whitelisted Robi/Cirkle number (see
   `docs/BDAPPS_INTEGRATION.md` › Owner checklist).

Deploy the Nest API **before** this gateway: the new Nest accepts webhook calls
with or without `X-API-Key`, while this gateway no longer sends it.

## Local test recipe

```bash
# 1. Automated: mock + php -S + HMAC-checking stand-in for Nest
node bdapps-gateway/dev/gateway-smoke.mjs     # exit 0 = pass, 77 = php/php-curl missing

# 2. Manual
node bdapps-gateway/dev/mock-bdapps.mjs &      # MOCK_PORT=18080, OTP 123456
cat > /tmp/kaaj-gw.env <<'ENV'
BDAPPS_APP_ID=test-app-id
BDAPPS_PASSWORD=test-app-password
BDAPPS_APP_HASH=testhash01
BDAPPS_API_BASE=http://127.0.0.1:18080
INTERNAL_API_KEY=<48+ random characters, same as the Nest BDAPPS_INTERNAL_API_KEY>
NODE_BACKEND_URL=http://127.0.0.1:3000
GATEWAY_STORAGE_DIR=/tmp/kaaj-gw-storage
ENV
KAAJ_GATEWAY_ENV_FILE=/tmp/kaaj-gw.env php -S 127.0.0.1:18081 -t bdapps-gateway
```

Mock controls: `GET /__sms`, `GET /__subscribers`, `POST /__config {"mask":true}`,
`POST /__state {"msisdn":"8801...","status":"REGISTERED"}`,
`POST /__notify {"msisdn":"8801...","status":"PENDING CHARGE"}` (needs
`MOCK_CALLBACK_URL=http://127.0.0.1:18081/api/callback.php`), `POST /__replay`,
`POST /__expire`, `POST /__reset`. Never point a production gateway at the mock.
