# Production deployment — 3 October 2026

## Result

Backend fixes deployed successfully. This is **not** full public-launch approval.

- Service: https://kaaj-api.onrender.com
- Commit: `94adf43` — marketplace validation and dependency hardening.
- Render deployment: `dep-db0ge95g1s2s738mgov0`, Live, duration 1m50s.
- Source: `sufyan-github/KaJ-App`, branch `agent/p1-ui-07-tracker`.
- Previous known-good backend: `6cdb27061ec127c2cfd6f41795d148339f447ed2`.
- No billing/entitlement changes; no new schema change or development seed.
- Mobile source committed locally as `4698f91`, version `1.0.2+3`.

## Verification story

Authenticated mobile job discovery calls the deployed worker endpoint; malformed filters
must be rejected by DTO validation before database access. The previous production 500
now returns a structured 400 VALIDATION_FAILED. The successful create-to-complete lifecycle
and duplicate-application count were verified against an isolated database in the preceding
audit, not by creating production jobs during deployment.

| Live check | Observed |
| --- | --- |
| Health, categories, locations | 200; expected JSON contracts |
| Invalid OTP request | 400; no SMS request with a valid number |
| Jobs without session | 401 |
| Root /ready (database/Redis readiness) | 200 |
| Workers with malformed skillId / locationId | Both 400 VALIDATION_FAILED |
| Password status and setup without session | Both 401 ACCESS_TOKEN_INVALID |
| Empty password login | 400 VALIDATION_FAILED |
| Empty recovery request and verification | Both 400 VALIDATION_FAILED |

Total: **13 checks passed**. Successful subscriber authentication, real money movement,
production private-file lifecycle and real push delivery were not exercised. Admin source
updates are in the backend repository commit; a separately hosted admin deployment is not
certified here.

The first readiness probe incorrectly used /api/v1/ready and received 404; source inspection
confirmed that readiness is intentionally mounted at /ready. The corrected probe passed.
No server patch was needed for that diagnostic mistake.

## Release artifacts and blocked inputs

The production release command was executed with the working Render HTTPS endpoint and
stopped with: `KAAJ_SENTRY_DSN is required for a production release.` This gate was preserved.
No new production APK or App Bundle is claimed built by this deployment task.

Needed from owner:

1. Production Sentry DSN (or a secure local configuration file path) and authorization to
   verify one privacy-filtered test event.
2. Original app signing key path for upgrade continuity, or a documented Play signing route.
   The locally available key differs from the installed production app; never uninstall users'
   existing app to conceal this mismatch.
3. Firebase Android configuration and backend service-account file paths to implement/verify
   external push; never embed the backend private key in the mobile client.
4. Completion of GitHub CLI authorization for workflow scope to publish the mobile branch.
5. Separate authorization and acceptance plan for carrier/local entitlement reconciliation;
   previous instruction to preserve billing settings still applies.

Credential rotation, four remaining dependency advisories, backup restore, DNS/legal readiness
and live integration acceptance are still tracked in the launch checklist. No monitoring key,
carrier credential or private signing material was invented or committed.

## Recovery

If the new backend develops a regression, use Render's deployment history to redeploy
`6cdb270`. No audit-specific schema rollback is required. Preserve the no-seed build command
and all current production billing configuration.
