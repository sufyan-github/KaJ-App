# Production audit hardening — 3 October 2026

Status: locally verified; deployment requested by owner. Not a public-launch certification.

Scope: duplicate application conflict mapping, worker query UUID validation, targeted dependency
updates, admin localhost dev-origin compatibility, and regression tests. No migration, seed,
carrier action, pricing change or entitlement-setting mutation is part of this deployment.

Verification from the audit: 312 Jest tests in 56 suites with isolated PostgreSQL/Redis and all
database gates enabled; 8 Playwright tests with mocked APIs; 6 workspace tooling tests;
backend/admin type checks, builds and lint passed. One password-reset test exceeded its 5-second
budget during concurrent builds; the unchanged full rerun passed. Public pre-deployment smoke
checks pass. Live post-deployment evidence is recorded separately after deployment completes.

Dependency audit: 0 critical, 1 high and 3 moderate findings remain (deepmerge-ts, two file-type
advisories and Nest SSE). No directly exposed affected call sites found in application source,
but this is not an exploitability guarantee. Framework upgrades/security-owner acceptance are
still required before unrestricted launch. No advisory suppression remains.

Other release blockers remain: carrier/local entitlement reconciliation, push configuration,
credential rotation, crash reporting, signing continuity, backup restore evidence and live
integration acceptance tests. Keep current billing configuration per owner instruction.

Deployment target: existing kaaj-api Render service, source branch agent/p1-ui-07-tracker.
Previous known-good commit: 6cdb27061ec127c2cfd6f41795d148339f447ed2.
Rollback, if the new release fails readiness: redeploy that previous commit; no destructive
schema rollback is needed. Do not run development seed in production.
