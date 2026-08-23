# P1-AUTH-05 — Authorization Foundation

**Status:** IMPLEMENTED LOCALLY
**Completed:** 2026-08-23
**Phase:** Phase 1 — foundation
**Commit:** This record is part of the local task commit; its exact hash is in Git history.
**Remote:** Not pushed because this task did not include external publication authorization.

## Scope

Implemented the default-deny authorization foundation for the NestJS API. The task added global
JWT, role, and policy guards; explicit policy metadata; a pure ability factory; current-user
injection; private-resource non-disclosure; and the authorization matrix that future endpoints must
extend. It did not add profile, taxonomy, job, payment, admin, or Flutter features.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` Part A task loop and Definition of Done
- `KAJ_BUILD_GUIDE.md` D10 privacy and field-exposure matrix
- `KAJ_BUILD_GUIDE.md` E1 API/error conventions
- `KAJ_BUILD_GUIDE.md` P1-AUTH-05 scope, tests, and acceptance
- Existing P1-AUTH-04 access-token claims and authentication endpoints

## Output

- `backend/src/common/guards/jwt.guard.ts`
- `backend/src/common/guards/roles.guard.ts`
- `backend/src/common/policy/*`
- `backend/src/common/decorators/current-user.decorator.ts`
- `backend/src/common/decorators/roles.decorator.ts`
- `backend/src/common/errors/authorization.errors.ts`
- Explicit policies on every existing Auth and Health controller method
- `backend/test/authorization-policy.spec.ts`
- Updated API foundation tests, README, tracker, guards documentation, and changelog

## How it operates

The global `JwtGuard` skips token parsing only for methods explicitly declared public. Every other
declared policy requires a valid access token and attaches server-verified claims to the request.
`RolesGuard` enforces optional role metadata. `PolicyGuard` rejects a method without policy metadata,
then delegates its any-of rules to `AbilityFactory`.

Private-resource rules consume server-loaded ownership facts from `request.policyResource`. A
mismatch or missing resource context returns `404 RESOURCE_NOT_FOUND`, while non-resource denials
return `403 AUTHORIZATION_DENIED`. Client-supplied ownership values are never evaluated.

## Process and procedure

1. Added a failing authorization test that referenced the not-yet-existing ability and policy types.
2. Implemented the minimum policy model, ability factory, decorators, guards, and errors.
3. Registered guards globally and migrated Auth/Health controller methods to explicit policies.
4. Removed the superseded module-local access guard and current-auth decorator.
5. Extended the authorization matrix and migrated API test-only routes to explicit public policies.
6. Ran the affected test, full backend test suite, typecheck, format check, and production build.

## Verification evidence

- Test-first failure: policy modules missing, as expected.
- Target test: `authorization-policy.spec.ts` — 22 passing checks.
- Full backend suite: 7 suites passed, 1 infrastructure suite skipped; 58 passed, 2 skipped.
- `corepack pnpm --filter @kaj/backend run typecheck` — passed.
- `corepack pnpm --filter @kaj/backend run lint` — passed, all files formatted.
- `corepack pnpm --filter @kaj/backend run build` — passed.

## Acceptance results

- PASS — every existing controller method declares an explicit policy.
- PASS — routes without policy metadata are denied by default.
- PASS — valid access tokens populate server-verified current-user claims.
- PASS — admin, role, job-poster, assigned-worker, and conversation-participant rules are table-tested.
- PASS — private-resource mismatches and missing resource contexts fail closed with 404.
- PASS — anonymous access to protected endpoints returns 401.
- PASS — existing Auth/API behavior remains green under global guards.
- N/A — no new business endpoint or user-facing localization key was introduced.
- PENDING — remote publication; not authorized in the current request.

## Decisions and limitations

Resource policies intentionally evaluate only ownership facts loaded by trusted backend code. The
future job, assignment, and conversation modules must attach those facts before policy evaluation
and extend the matrix with every endpoint. The authorization model uses any-of rules so an explicit
admin alternative can be combined with a resource-owner rule without making admin bypass implicit.

## Next task

P1-INF-06 — Adapter interfaces (no vendor lock).
