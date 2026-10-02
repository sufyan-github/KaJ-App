# KAAJ production launch checklist

Last audited: 3 October 2026. A checkbox is complete only when the evidence
described below has been observed against the production system.

## Current decision

**NOT YET PRODUCTION READY**

## Completed locally

- [x] Flutter formatting, analyzer and 112 automated tests passed on 25 September.
- [x] A signed arm64 production APK builds and its v2 signature verifies.
- [x] Release secrets are stored outside Git and password files use mode 0600.
- [x] The public client no longer accepts, stores or sends a provider API key.
- [x] The previous exposed credential was removed from Dart, scripts and docs.
- [x] Production version advanced to `1.0.1+2`.
- [x] CI has client-secret policy and Git-history secret scanning gates.
- [x] A non-mutating production API smoke-test script exists.
- [x] The public-site production build and all four hosting-worker tests pass.
- [x] Release diagnostics have 10 passing regression tests, included in CI.
- [x] The Git remote matches the repository observed in Render deployment settings.

## Production incident evidence

On 26 September, Render logs reported a database pooler error:
`FATAL: (ENOTFOUND) tenant/user ... not found`. The matching Kaaj project in
Supabase was visibly paused. Resuming that project restored all five public
API smoke checks without a code deployment or credential change.

On 3 October, the catalog failure recurred. After the Render instance woke up,
health returned 200, categories and locations returned 500, invalid OTP input
returned 400, and unauthenticated jobs returned 401. The current database state
has not been inspected; another pause is a hypothesis, not a confirmed cause.

Current failed request IDs:

- Categories: `f18b2fcf-6e85-46cf-be2d-9aa2ad040007`
- Locations: `f39e3ed7-4d2c-4161-91b6-99b3d2090129`

The user reported bdApps Active Production on 26 September. This does not
establish successful OTP delivery, subscription verification, or credential
rotation. The supplied provider key matched the previously exposed value.

## Blocked or failing

- [ ] `kaaj.app` resolves publicly and serves HTTPS.
- [ ] `api.kaaj.app` resolves publicly and serves the production API over HTTPS.
- [ ] `/api/v1/categories` returns 200 from production (currently 500 on Render).
- [ ] `/api/v1/locations` returns 200 from production (currently 500 on Render).
- [ ] Rotated bdApps credentials are installed only in the private gateway.
- [ ] The previously exposed bdApps credential has been revoked.
- [ ] Real Robi/Airtel OTP request and verification pass with an owner-approved test number.
- [ ] Subscription callbacks, idempotency, cancellation and reconciliation pass.
- [ ] Firebase/FCM is configured and tested in foreground/background/terminated states.
- [ ] A production Sentry DSN is configured and a filtered test event arrives.
- [ ] Database backups, retention and a restore drill are verified.
- [ ] Public homepage, privacy, terms and support pages contain approved content.
- [ ] `/.well-known/assetlinks.json` is live and verified on a physical device.
- [ ] CI runs on the remote and the release branch has verified protection rules.
- [ ] A clean, tagged App Bundle is built from a clean commit and archived with symbols.

## Safe smoke test

Public/read-only checks plus invalid-input validation:

```bash
KAAJ_API_URL=https://api.kaaj.app/api/v1 ./tool/smoke_production_api.sh
```

Authenticated read checks can be added using a short-lived dedicated test-user
access token. Never put that token in Git or shell history:

```bash
read -rsp 'Test access token: ' KAAJ_SMOKE_ACCESS_TOKEN
export KAAJ_SMOKE_ACCESS_TOKEN
./tool/smoke_production_api.sh
unset KAAJ_SMOKE_ACCESS_TOKEN
```

The script intentionally does not request a real OTP, charge a subscription,
delete an account or mutate marketplace data. Those checks require an approved
test account and an explicit test window.

The health request allows 90 seconds for a free Render instance to wake up;
subsequent requests allow 30 seconds. Override the health deadline with
`KAAJ_SMOKE_HEALTH_TIMEOUT`. Successful status codes must also match the JSON
contract. Authenticated runs still execute the unauthenticated-access check.
Response files use private permissions; diagnostics print only error codes
and request IDs.

## User-controlled dependencies

1. DNS control for `kaaj.app` and `api.kaaj.app`.
2. A newly rotated bdApps production credential and confirmation the old one is revoked.
3. Restore dashboard browser access to inspect today's database failure.
4. Firebase Android project configuration for `app.kaaj.mobile`.
5. Production Sentry Flutter/backend projects and DSNs.
6. Backup-provider access for a real restore drill.
7. Approved legal entity name, address, privacy contact and support contact.
8. An owner-approved Robi/Airtel test number for the live login test.
