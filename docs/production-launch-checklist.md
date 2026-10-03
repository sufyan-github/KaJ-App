# KAAJ production launch checklist

Last audited: 3 October 2026. A checkbox is complete only when the evidence
described below has been observed against the production system.

## Current decision

**NOT YET PRODUCTION READY**

## Completed locally

- [x] Flutter analyzer and all 114 automated tests passed on 3 October, including
  Bangla/English paid-subscription consent and keyboard-bypass regression tests.
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
- [x] Backend passes all 290 tests in 53 suites with no skipped tests, using
  isolated local PostgreSQL/Redis, plus type checking, build and six tooling tests.
- [x] Admin type checking and eight Playwright UI workflow tests pass. These tests
  mock API responses and do not certify live admin or billing workflows.
- [x] Backend hardening through `c0ba76d` is deployed on Render: dependency
  readiness, bounded Redis waits, a production development-seed guard, and
  graceful risk-scan shutdown before database disconnection.
- [x] A release-signed staging APK with paid-consent UI was installed and launched
  on the connected phone. Its login screen and visible typed input were inspected.
  It uses the LIVE Render API; it is not a sandbox. The original app remains intact.
  Production-package replacement failed because the installed signing key differs;
  resolving signing continuity remains necessary before an upgrade release.

## Production incident evidence

On 26 September, Render logs reported a database pooler error:
`FATAL: (ENOTFOUND) tenant/user ... not found`. The matching Kaaj project in
Supabase was visibly paused. Resuming that project restored all five public
API smoke checks without a code deployment or credential change.

On 3 October, the catalog failure recurred. After the Render instance woke up,
health returned 200, categories and locations returned 500, invalid OTP input
returned 400, and unauthenticated jobs returned 401. After the approved Chrome
restart, the Supabase dashboard showed services coming up, then Database,
PostgREST, and Auth healthy. A later public smoke run passed all five checks:
health 200, categories 200, locations 200, invalid OTP input 400, and unauthenticated
jobs 401. Another pause remains a hypothesis, not a confirmed cause of this recurrence.
No code deployment or credential change was made during this recovery check.

Earlier failed request IDs:

- Categories: `f18b2fcf-6e85-46cf-be2d-9aa2ad040007`
- Locations: `f39e3ed7-4d2c-4161-91b6-99b3d2090129`

The user reported bdApps Active Production on 26 September. The supplied
provider key matched the previously exposed value; rotation is still unverified.
On 3 October the Render dashboard confirmed `NODE_ENV=production`,
`SMS_PROVIDER=bdapps`, `OPERATOR_PROVIDER=bdapps`, and `PUSH_PROVIDER=disabled`.
Real OTP delivery and verification were subsequently tested on 3 October with
the owner's explicit consent to BDT 2.78/day, renewing daily until unsubscribed.
Login succeeded, authenticated session/jobs/notifications reads passed, and the
carrier independently returned `REGISTERED`. The first operator status refresh
failed transiently; a later refresh returned `VERIFIED` without an error.

At the owner's request, the test subscription was then cancelled from the approved
cPanel server using the carrier unsubscribe API. bdApps returned `S1000` and
`UNREGISTERED`; a separate signed gateway status request confirmed `UNREGISTERED`.
Direct requests from the development computer were refused with `E1303` (IP not
allowlisted). No gateway source changes were needed for this one-time cancellation.
The dedicated API test refresh session was revoked (logout HTTP 204).
The owner supplied the SMS fallback: send `STOP Kaaj` to `21213` from the subscribed
number. That SMS was not sent because API cancellation succeeded.

**Billing launch blocker:** `/subscriptions/me` returned no local subscription,
no plans, `gateEnabled: false`, and `accessActive: true` while the carrier was
registered. In-app cancellation is not connected to carrier cancellation. The
manual unsubscribe above does not certify callbacks, reconciliation, charging
amounts, entitlement enforcement, or the full cancellation workflow.

The unsafe development seed was removed from the Render build command before
deploying hardening. The deployed guard refuses production execution. Existing
seeded admin credentials, feature flags, fees, and settings still need an audit;
removing the command does not undo previous seed effects.

## Live checks and remaining launch gates

- [ ] `kaaj.app` resolves publicly and serves HTTPS.
- [ ] `api.kaaj.app` resolves publicly and serves the production API over HTTPS.
- [x] `/api/v1/categories` returns 200 from the Render deployment on 3 October.
- [x] `/api/v1/locations` returns 200 from the Render deployment on 3 October.
- [x] Reviewed backend hardening is deployed; Render uses `/ready`, verified HTTP 200.
- [x] Production build no longer runs the development seed.
- [ ] Seeded admin access, credentials, flags, fee rules, and configuration are
  audited and remediated.
- [ ] Recurring database unavailability is resolved with a verified availability plan.
- [ ] Rotated bdApps credentials are installed only in the private gateway.
- [ ] The previously exposed bdApps credential has been revoked.
- [x] Real Robi OTP request and verification pass with an owner-approved test number.
- [ ] Airtel live delivery and verification pass in an explicitly approved test window.
- [x] This test subscription was cancelled and carrier status independently verified.
- [ ] Production plan, subscription records and entitlement policy match carrier billing.
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
3. Seeded-admin remediation scope and approval; backend deployment was approved and completed.
4. Firebase Android project configuration for `app.kaaj.mobile`.
5. Production Sentry Flutter/backend projects and DSNs.
6. Backup-provider access for a real restore drill.
7. Approved legal entity name, address, privacy contact and support contact.
8. A separate approved Airtel test window, if required; the Robi test is complete and cancelled.

## Verification limits

Not every screen or marketplace mutation was manually tested on the phone.
No real job/application, verification-document, booking, messaging, or hiring
workflow is certified by the read-only live smoke checks. Production release
also remains blocked on signing continuity and the unchecked launch gates above.

## Mobile password update — backend deployed, client release pending

Implemented on 3 October after the live OTP test. Existing subscription/payment
workflow, prices, duration, gateway code and access flags are unchanged, as the
owner explicitly requested. The disabled production access gate and missing
local plans/subscription records are still a separate launch blocker. Do not
interpret successful password authentication as proof of subscription payment.

- Primary login is mobile number + password, without OTP or billing calls.
- After authentication, the app checks the existing subscription access decision.
  When that decision denies access, it keeps the account authenticated, displays
  “Your subscription is inactive. Please subscribe to continue accessing the
  platform.” (with Bangla translation), and opens the existing subscription page.
- Password setup is offered after existing subscription verification. It never
  overwrites a configured password or the separate admin credential.
- Per the owner's instruction, recovery uses the existing paid bdApps OTP, with
  explicit unchecked consent before requesting and before verifying. The UI
  discloses BDT 2.78/day and renewal until unsubscribed. No new live charged test
  was authorized or performed for this change.
- Successful recovery revokes old HTTP/chat access and refresh sessions; replay,
  concurrent verification and uncertain provider outcomes cannot automatically
  repeat a paid verification call.

Modified areas:

- Flutter: `password_repository.dart`, `password_screens.dart`, auth controller/
  providers, OTP success routing, `app_router.dart`, API retry exclusions,
  localized error mapping, subscription-page access messaging, settings entry,
  English/Bangla ARB/generated translations and the existing settings dictionary.
- Flutter tests: new password-screen coverage, routing and API-retry tests.
- Backend (`/home/sufyan/kaaj-production-backend`): new mobile-password service,
  controller, DTOs and errors; auth module, repository, OTP-purpose checks,
  shared risk observations, login throttling and token-version verification;
  chat-session checks; new database and chat-revocation tests.
- Database: additive migration `20261003060000_mobile_password_auth`, adding
  `users.mobile_password_hash`, `users.mobile_auth_version` and
  `otp_challenges.recovery_verifying`. No user/subscription/payment data is deleted.

Verification: 308 backend tests (55 suites, none skipped), 130 Flutter tests,
Flutter analyzer, backend type checking and backend build passed. Database tests
ran against disposable local PostgreSQL/Redis; all carrier operations were mocked.
See the backend README's mobile-password section for endpoint contracts and the
release procedure. The updated arm64 staging APK builds successfully (25.7 MB)
and its Android v2 signature verifies. It is installed as KAAJ Staging on the
connected Motorola, pointing to the live Render API; the original KAAJ app was
not replaced. Client credential-policy checks pass.

### Deployment evidence — 3 October 2026

- User approved deploying the backend and additive migration, preserving billing.
- Backend commit `6cdb27061ec127c2cfd6f41795d148339f447ed2` was pushed to the
  existing Render source branch `agent/p1-ui-07-tracker`.
- Render deploy `dep-db07eseq1p3s73e360s0` succeeded and became live at 09:34
  Asia/Dhaka. Build logs confirmed migration
  `20261003060000_mobile_password_auth` applied successfully. No seed ran.
- Seven live smoke checks passed: `/ready` returned 200; protected password
  status and setup returned 401 without a session; empty login returned 400;
  a synthetic invalid credential request reached the database-backed login
  handler and returned `AUTH_INVALID_CREDENTIALS` (401); both recovery endpoints
  rejected missing consent with 400 and field `subscriptionConsent`.
- The previous password-status 404 deployment blocker is resolved. No SMS,
  paid OTP verification, subscription activation, password mutation, or billing
  configuration change was performed during deployment verification.
- These checks do not prove successful subscriber login, setup, paid recovery,
  or all post-login phone flows. Those still require an authorized test account
  and separate consent for any paid carrier action. Existing production billing
  gate/local-subscription reconciliation blockers remain unchanged.
