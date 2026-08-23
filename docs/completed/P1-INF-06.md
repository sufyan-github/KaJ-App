# P1-INF-06 — Provider-Neutral Adapter Interfaces

**Status:** IMPLEMENTED LOCALLY
**Completed:** 2026-08-23
**Phase:** Phase 1 — foundation
**Commit:** This record is part of the local task commit; its exact hash is in Git history.
**Remote:** Not pushed because this task did not include external publication authorization.

## Scope

Added provider-neutral ports and safe initial adapters for SMS, push, S3-compatible object storage,
and payments. Centralized provider selection inside a global infrastructure module and migrated the
authentication module away from a concrete SMS adapter. This task did not integrate an external SMS
or push vendor, process real payments, expose upload endpoints, or add domain features.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` Part A task loop and Definition of Done
- `KAJ_BUILD_GUIDE.md` B4 environment configuration
- `KAJ_BUILD_GUIDE.md` P1-INF-06 files, interface requirements, and acceptance
- Payment safety rules R5, R6, and the provider-neutral Phase 9 boundary
- Existing console SMS behavior from P1-AUTH-04

## Output

- `backend/src/infra/infrastructure.module.ts`
- `backend/src/infra/sms/sms.provider.ts` and `disabled.adapter.ts`
- `backend/src/infra/push/push.port.ts` and `disabled.adapter.ts`
- `backend/src/infra/storage/storage.port.ts` and `s3.adapter.ts`
- `backend/src/infra/payment/payment.port.ts` and `manual.adapter.ts`
- Pinned AWS S3 client and request-presigner dependencies
- Environment validation and `.env.example` provider settings
- `backend/test/adapter-ports.spec.ts`
- Updated Auth/App modules, README, tracker, changelog, and environment tests

## How it operates

`InfrastructureModule` exports four symbols consumed by domain modules: `SMS_PORT`, `PUSH_PORT`,
`STORAGE_PORT`, and `PAYMENT_PORT`. SMS selection reads only `SMS_PROVIDER`; no authentication code
knows the chosen adapter. Console SMS is development-only and production environment validation
rejects it. Disabled messaging adapters throw explicit configuration errors.

The S3 adapter uses provider SDK types only inside `infra`, rejects traversal/empty/absolute object
keys, applies deterministic injected time, and returns provider-neutral signed URL results. The
manual payment adapter returns only `PENDING`; capture and refund throw, and webhook verification
always returns invalid.

## Process and procedure

1. Added a failing adapter contract suite referencing the not-yet-existing ports and adapters.
2. Added pinned AWS SDK dependencies for standards-compliant S3 signing.
3. Implemented push, storage, payment, and SMS provider-neutral interfaces.
4. Implemented fail-closed initial adapters and a global provider module.
5. Migrated AuthModule to the `SMS_PORT` exported by infrastructure.
6. Added provider configuration validation, production console-SMS rejection, and deterministic tests.
7. Ran the full repository test, formatting/lint, typecheck, and build gates.

## Verification evidence

- Test-first failure: payment, push, SMS selector, and S3 adapter modules missing, as expected.
- Adapter/environment target suite: 9 passing checks before final matrix extension.
- Full root/backend suite: 8 backend suites passed, 1 infrastructure suite skipped; 64 passed,
  2 skipped, plus 6 root foundation tests passed.
- `corepack pnpm lint` — passed.
- `corepack pnpm typecheck` — passed.
- `corepack pnpm build` — passed.

## Acceptance results

- PASS — SMS provider choice is isolated inside `infra`; AuthModule depends only on `SMS_PORT`.
- PASS — changing `SMS_PROVIDER` between console and disabled changes behavior without auth changes.
- PASS — production validation rejects console SMS.
- PASS — push delivery fails explicitly until a vendor adapter exists.
- PASS — storage port exposes no AWS SDK type and signed URL creation makes no network request.
- PASS — unsafe object keys are rejected before signing.
- PASS — payment port contains exactly create, capture, refund, webhook verification, and status operations.
- PASS — manual payment can never return captured/refunded or validate a webhook.
- PASS — provider dependencies are pinned and confined to the backend workspace.
- PENDING — remote publication; not authorized in the current request.

## Decisions and limitations

No vendor was invented. Production SMS remains intentionally disabled until an approved Bangladesh
gateway adapter is implemented. Push is also disabled. S3 signing is ready for MinIO/local and any
S3-compatible deployment, but uploads remain unreachable until the uploads task adds authorized
endpoints and content validation. Manual payment is an abstraction placeholder for cash-first
operations, not a payment processor.

## Next task

P1-UI-07 — Flutter foundation.
