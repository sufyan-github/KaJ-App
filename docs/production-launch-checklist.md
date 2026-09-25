# KAAJ production launch checklist

Last audited: 25 September 2026. A checkbox is complete only when the evidence
described below has been observed against the production system.

## Current decision

**NOT YET PRODUCTION READY**

## Completed locally

- [x] Flutter formatting, analyzer and 112 automated tests pass.
- [x] A signed arm64 production APK builds and its v2 signature verifies.
- [x] Release secrets are stored outside Git and password files use mode 0600.
- [x] The public client no longer accepts, stores or sends a provider API key.
- [x] The previous exposed credential was removed from Dart, scripts and docs.
- [x] Production version advanced to `1.0.1+2`.
- [x] CI has client-secret policy and Git-history secret scanning gates.
- [x] A non-mutating production API smoke-test script exists.

## Blocked or failing

- [ ] `kaaj.app` resolves publicly and serves HTTPS.
- [ ] `api.kaaj.app` resolves publicly and serves the production API over HTTPS.
- [ ] `/api/v1/categories` returns 200 from production (currently 500 on Render).
- [ ] `/api/v1/locations` returns 200 from production (currently 500 on Render).
- [ ] Rotated bdApps credentials are installed only in the private gateway.
- [ ] The previously exposed bdApps credential has been revoked.
- [ ] Real Robi/Airtel OTP request and verification pass with whitelisted users.
- [ ] Subscription callbacks, idempotency, cancellation and reconciliation pass.
- [ ] Firebase/FCM is configured and tested in foreground/background/terminated states.
- [ ] A production Sentry DSN is configured and a filtered test event arrives.
- [ ] Database backups, retention and a restore drill are verified.
- [ ] Public homepage, privacy, terms and support pages contain approved content.
- [ ] `/.well-known/assetlinks.json` is live and verified on a physical device.
- [ ] The production repository has an approved Git remote and protected CI branch.
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

## User-controlled dependencies

1. DNS control for `kaaj.app` and `api.kaaj.app`.
2. A newly rotated bdApps production credential and confirmation the old one is revoked.
3. Render service and production database log/console access.
4. Firebase Android project configuration for `app.kaaj.mobile`.
5. Production Sentry Flutter/backend projects and DSNs.
6. Backup-provider access for a real restore drill.
7. Approved legal entity name, address, privacy contact and support contact.
8. The GitHub repository URL that should become this checkout's remote.
