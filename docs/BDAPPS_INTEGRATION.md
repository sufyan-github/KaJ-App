# bdapps integration (Robi/Cirkle OTP subscription)

KAAJ keeps the BDApps credentials only in the PHP gateway
([`bdapps-gateway/`](../bdapps-gateway/README.md)), which runs on the BDApps
allow-listed server. Nest talks to the gateway with an HMAC signature
(`BDAPPS_INTERNAL_API_KEY` = gateway `INTERNAL_API_KEY`). No BDApps credential,
reference number or subscriber id is ever sent to the Flutter app.

Requesting and verifying a BDApps subscription OTP **is** the subscription
(Tk 2.78/day + VAT, renewed daily by the carrier). The bilingual consent text in
the app must stay in front of every OTP request.

The identity-verification workflow is intentionally separate. Phone/operator
verification never replaces the required NID and selfie review before applying
for work.

## Runtime flow

### OTP request (`POST /api/v1/auth/otp/request`, `…/password/recovery/request`)

1. Nest creates its normal rate-limited OTP challenge (bcrypt-hashed CSPRNG code,
   `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`).
2. With `SMS_PROVIDER=bdapps` the adapter calls `otp_request.php` with
   `tel:<msisdn>`:
   - `S1000` → BDApps sent its OTP. Redis stores `{mode:"carrier", referenceNo}`
     for the challenge lifetime.
   - **`E1351` (already registered, no OTP sent)** → fallback: KAAJ sends its own
     6-digit code (the challenge code) with `sms_send.php` to the stored
     subscriber id (or `tel:<msisdn>`), and Redis stores
     `{mode:"kaaj_sms", codeHash}` (bcrypt). This makes login on a new phone and
     password recovery work for numbers that are already subscribed. If the SMS
     cannot be sent → **503 `OPERATOR_SMS_UNAVAILABLE`**.
   - `E1853` (carrier OTP request limit) → 429 `OTP_RATE_LIMITED`.
   - anything else → 503.

### OTP verify (`POST /api/v1/auth/otp/verify`, `…/password/recovery/verify`)

| Mode / carrier answer       | Result                                                          |
| --------------------------- | --------------------------------------------------------------- |
| `kaaj_sms`                  | code checked locally against the bcrypt hash (same attempt cap) |
| `S1000`                     | valid; carrier `{subscriberId, subscriptionStatus}` returned    |
| `E1850` / `E1357`           | 401 `OTP_INVALID` (attempt counted)                             |
| `E1851` / `E1854` / `E1855` | 422 `OTP_EXPIRED`                                               |
| `E1852`                     | 429 `OTP_ATTEMPTS_EXCEEDED`                                     |
| other / transport failure   | 503 (never automatically retried for recovery)                  |

After the session (or password reset) is committed, `AuthService` calls
`SubscriptionsService.onCarrierVerified()` **best-effort** (a failure is logged
and never fails login): it stores the subscriber id, marks the operator identity
`VERIFIED` and grants the entitlement immediately — no extra round trip. For the
`kaaj_sms` mode the `E1351` answer is the carrier confirmation (status
`REGISTERED`, no new id).

### Masked subscriber ids

Depending on BDApps provisioning, `otp/verify` may return a masked id such as
`tel:B%3C4ZyPUKdG…==` instead of `tel:8801…`. Nest treats every id matching
`^tel:[A-Za-z0-9%+/=._-]{8,160}$` as opaque and stores it in
`user_operator_identities.provider_subscriber_id` (unique; a verified id is moved
from any other account, e.g. a recycled number). **Every later carrier call**
(`getStatus`, `unsubscribe`, fallback SMS) uses the stored id and falls back to
`tel:<msisdn>` only when none is stored. Webhooks resolve the user by the stored
id first, then by parsing a real `tel:8801…` number. A real-number id from verify
must match the challenge phone; a masked id cannot be checked and is accepted.

### Entitlement follows the carrier

Carrier states are normalized to `REGISTERED`, `UNREGISTERED` (also
`UNSUBSCRIBED`, `EXPIRED`, `CANCELLED`) or `CHARGE_PENDING` (`PENDING`, `CHARGE`,
`PENDING CHARGE`) and stored in `user_operator_identities.provider_status`.
All updates go through one transaction that locks the identity row.

- **REGISTERED** (verify, `getStatus`, webhook):
  1. ACTIVE subscription → once less than one plan period of cover remains,
     `expires_at` = max(current, now + `duration_days` + 6 h grace). Renewals write
     a `subscription.operator-renewed` audit row, never a payment row (KAAJ never
     sees an actual charge).
  2. else activate the newest PENDING subscription (payment → PAID);
  3. else create an ACTIVE subscription on the **carrier plan**
     (`SubscriptionPlan.code` = `BDAPPS_PLAN_CODE`, default `bdapps-daily`) with one
     `OPERATOR_BILLING` payment row (`provider_ref = "operator-confirmed"`).
     If that plan is missing or inactive nothing is created, a warning is logged and
     `GET /subscriptions/me` returns `operatorPlanMissing: true`.
- **UNREGISTERED** → cancel ACTIVE subscriptions (identity back to `PENDING`).
- **CHARGE_PENDING** → keep the current entitlement until it expires; never
  extend, never cancel (previously this answered 503).
- The feature gate (`SubscriptionGuard` → `accessFor`) re-checks `getStatus`
  (throttled to once per 60 s per user) when no subscription is active, so daily
  renewals keep access without the user opening the subscription screen.
  `GET /subscriptions/me` uses the same throttled refresh.

### Cancellation (`POST /api/v1/subscriptions/cancel`)

With remote billing and an ACTIVE subscription Nest calls `unsubscribe.php`
(`/subscription/send` action `0`) with the stored id. On `S1000` (or `E1356`,
already unregistered) access ends now: subscriptions `CANCELLED`, identity
`PENDING`, carrier status `UNREGISTERED`, audit `subscription.operator-cancelled`,
and the overview is returned. On failure → **503 `OPERATOR_UNSUBSCRIBE_FAILED`**
with `details: [{ "smsKeyword": "STOP kaaj", "shortCode": "21213" }]` so the app
can offer the SMS fallback. PENDING-only subscriptions are cancelled locally.
The former dead-end `OPERATOR_CANCELLATION_REQUIRED` error no longer exists.

### `GET /api/v1/subscriptions/me` additions

```json
{
  "carrierStatus": "REGISTERED | UNREGISTERED | CHARGE_PENDING | null",
  "operatorPlanMissing": false,
  "cancelInstructions": {
    "smsKeyword": "STOP kaaj",
    "shortCode": "21213",
    "inApp": true
  }
}
```

`carrierStatus` is `null` when `OPERATOR_PROVIDER` is not `bdapps` or the carrier
has not been queried yet. `smsKeyword`/`shortCode` come from
`BDAPPS_SMS_KEYWORD` / `BDAPPS_SHORT_CODE`.

### Subscription notifications

BDApps POSTs `{timeStamp, version, applicationId, password, subscriberId,
frequency, status}` to `callback.php`. It is not signed; the gateway checks
`applicationId`/`password` with `hash_equals`, drops exact replays
(subscriberId + status + timeStamp) and bursts (10 s per subscriber), re-queries
`getStatus`, and forwards
`{subscriberId, status: REGISTERED|UNSUBSCRIBED|CHARGE_PENDING, frequency,
providerTimeStamp, providerEventId, verifiedAt}` to
`POST /api/v1/subscriptions/bdapps/webhook`, signed with `X-Timestamp`,
`X-Nonce`, `X-Signature` (no `X-API-Key`). Nest verifies the HMAC, the ±300 s
window and nonce reuse (Redis). `X-API-Key` is optional on both sides; when
present it must match. BDApps always gets HTTP 200 with
`{"statusCode":"S1000","statusDetail":"Request was successfully processed"}`.
BDApps has no charging/renewal notification: renewals are inferred from
`REGISTERED` (status polls and notifications).

## Configuration

Nest:

```dotenv
SMS_PROVIDER=bdapps
OPERATOR_PROVIDER=bdapps
BDAPPS_GATEWAY_URL=https://gateway.example/api   # HTTPS is enforced only when NODE_ENV=production
BDAPPS_INTERNAL_API_KEY=<same 32+ character HMAC key as PHP INTERNAL_API_KEY>
BDAPPS_PLAN_CODE=bdapps-daily                     # carrier plan code (default)
BDAPPS_SMS_KEYWORD=STOP kaaj                      # SMS cancel fallback keyword
BDAPPS_SHORT_CODE=21213
```

PHP: see `bdapps-gateway/.env.example` (`BDAPPS_APP_ID`, `BDAPPS_PASSWORD`,
`BDAPPS_APP_HASH`, `BDAPPS_APP_CODE`, `BDAPPS_API_BASE`, `INTERNAL_API_KEY`,
`NODE_BACKEND_URL`, `NODE_BACKEND_WEBHOOK_PATH`, `GATEWAY_STORAGE_DIR`). Keep the
env file, logs and the nonce/dedupe storage outside the public document root.

Database: migration `20261111150000_bdapps_subscriber_ids` (additive:
`provider_subscriber_id` unique, `provider_status` with a check constraint).
The development seed adds the `bdapps-daily` plan (278 poisha, 1 day, active,
"দৈনিক সাবস্ক্রিপশন" / "Daily subscription"); production plans are never seeded.

## Deploy order

1. Apply the migration and deploy **Nest first** — it accepts gateway webhooks
   with or without `X-API-Key`.
2. Then deploy the PHP gateway (it no longer requires or sends `X-API-Key`).
3. Then release the mobile build that shows carrier status and in-app cancel.

## Owner checklist (manual, production)

1. **Rotate credentials**: generate a new BDApps API password in the portal and a
   new `INTERNAL_API_KEY`/`BDAPPS_INTERNAL_API_KEY` (`openssl rand -hex 32`); the
   earlier zip bundles contained live values and must be treated as exposed.
2. **Create the production carrier plan** in the admin panel: code
   `bdapps-daily` (or the configured `BDAPPS_PLAN_CODE`), price 278 poisha,
   duration 1 day, active — it must match the BDApps charging product exactly.
   Until it exists, verified subscribers see `operatorPlanMissing: true` and get
   no local entitlement.
3. Set the BDApps **Subscription notification URL** to
   `https://<gateway-host>/…/api/callback.php`.
4. Make sure the gateway server's outbound IP is on the BDApps allow-list
   (`E1303` otherwise).
5. Set `BDAPPS_APP_CODE` to the real Android package name and use the KAAJ
   application hash (never another app's).
6. Test with a **whitelisted** Robi and Cirkle number: new registration (OTP),
   wrong code, already-subscribed login on a second phone (KAAJ SMS code),
   password recovery, in-app cancel (then confirm with `getStatus`), `STOP kaaj`
   to 21213, re-subscribe via notification, the next-day renewal (access must
   continue without opening the subscription screen), and gateway outage.

## Local end-to-end run

```bash
# terminal 1: mock BDApps (OTP is always 123456)
MOCK_PORT=18080 MOCK_CALLBACK_URL=http://127.0.0.1:18081/api/callback.php \
  node bdapps-gateway/dev/mock-bdapps.mjs
# terminal 2: PHP gateway with a throwaway env file (see bdapps-gateway/README.md)
KAAJ_GATEWAY_ENV_FILE=/tmp/kaaj-gw.env php -S 127.0.0.1:18081 -t bdapps-gateway
# terminal 3: Nest
SMS_PROVIDER=bdapps OPERATOR_PROVIDER=bdapps \
BDAPPS_GATEWAY_URL=http://127.0.0.1:18081/api BDAPPS_INTERNAL_API_KEY=<same key> \
  corepack pnpm --filter @kaj/backend dev
```

Tests: unit (`bdapps.adapters.spec.ts`, `bdapps-entitlement.spec.ts`), database
e2e with a fake gateway (`BDAPPS_DATABASE_E2E=1`), and the full stack
(`BDAPPS_STACK_E2E=1`, skipped when `php`/`php-curl` is missing).
`node bdapps-gateway/dev/gateway-smoke.mjs` covers the gateway alone.

## Differences from the official API reference

Checked against the official ReDoc
(`dev.bdapps.com/API_Documentation/bdapps_tap_api.html`):

- `/sms/send` lists `version` as required; the gateway sends `"version": "1.0"`.
  `sourceAddress` is optional (`BDAPPS_SMS_SOURCE_ADDRESS`). A request-level
  `S1000` can hide a failed destination, so `sms_send.php` reports
  `destinationResponses[0].statusCode` when it is not `S1000`.
- The reference documents OTP at `/otp/request` and `/otp/verify`; the gateway
  keeps `/subscription/otp/request|verify`, which production accepted on
  2026-10-03. If BDApps ever rejects it, switch the two paths in
  `BDAppsClient.php`.
- OTP errors also include `E1853` (request limit), `E1854` (OTP not found) and
  `E1855` (invalid reference); they are mapped as above.
- Notification `timeStamp` is documented as `yyMMddHHmm` (minute resolution): two
  notifications with the same status in the same minute are treated as one.
