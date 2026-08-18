# P1-INF-02 — NestJS API foundation

**Status:** COMPLETE
**Completed:** 2026-08-18
**Phase:** Phase 1 — foundation
**Commit:** This completion record is part of the task commit; exact hash is in Git history and the final task report.
**Remote:** `origin/agent/p1-inf-02-api-foundation` (draft pull request to `main`)

## Scope

This task implemented the NestJS application foundation: validated configuration, global API
prefixing and validation, exact E1 success/error envelopes, request-scoped IDs backed by
AsyncLocalStorage, structured redacted logging, non-production Swagger, the health module, and lazy
Prisma/Redis infrastructure shells.

It did not add authentication, authorization policies, business endpoints, the domain schema,
migrations, seed data, queues, uploads, payments, mobile UI, or admin UI. The database provider
decision remains outside this task and blocks P1-INF-03.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` Parts A, B1–B4, E1, G/P1-INF-02, H1, H6, and L.
- P1-INF-01 monorepo, environment template, NestJS bootstrap, and completion record.
- `docs/decisions/ADR-0001-database-platform.md` boundary allowing database-independent API work.
- The locked NestJS 10 and Prisma 6 compatibility constraints.

## Output

- `backend/src/app.bootstrap.ts` for global prefix, validation, shutdown hooks, and Swagger setup.
- Zod environment validation with production-only JWT secret requirements.
- AsyncLocalStorage request context and generated request IDs returned in `x-request-id`.
- E1 response interceptor, error filter, typed envelopes, and reusable KAJ HTTP exceptions.
- Pino configuration and logging interceptor that never log bodies, headers, tokens, or PII.
- Health controller/module and lazy Prisma/Redis modules for their later owning tasks.
- Jest/Supertest test harness replacing the temporary Node test.
- Production dependency overrides, gated audit command, and dated exception register.

## How it operates

The application validates environment values during module initialization. Each request receives a
server-generated request ID inside an AsyncLocalStorage scope and an `x-request-id` response header.
Successful controller values are wrapped as `{ data, meta: { requestId, serverTime } }`. All caught
errors are mapped to `{ error: { code, messageKey, message, field, details, requestId, retryable,
action } }` without exposing internal exception content.

Business endpoints use `/api/v1`; operational `GET /health` remains at the root as required by the
task. Swagger is served at `/docs` outside production. The logging interceptor records only method,
path, status, request ID, and duration. Pino redaction independently censors the required sensitive
keys if another caller attempts to log them.

## Process and procedure

1. Merged the verified P1-INF-01 PR and branched from updated `main`.
2. Read the exact E1 envelope, environment, logging, security, and task contracts.
3. Pinned NestJS-10-compatible dependencies from the npm registry.
4. Wrote Jest/Supertest envelope, validation, exception-leak, environment, Swagger, and redaction
   tests first and captured their failing missing-module baseline.
5. Implemented the configuration, context, filter, interceptors, modules, and bootstrap.
6. Corrected only observed compatibility issues: Swagger's class-validator peer line and Express 4
   type declarations.
7. Ran tests, coverage, lint, typecheck, build, dependency audit, and secret/whitespace checks.

## Verification evidence

- `corepack pnpm test`: PASS — 6 root tests and 11 backend Jest/Supertest tests.
- `corepack pnpm lint`: PASS — root, backend, and shared-types formatting checks.
- `corepack pnpm typecheck`: PASS — backend and shared-types strict TypeScript checks.
- `corepack pnpm build`: PASS — NestJS and shared-types production builds.
- `corepack pnpm --filter @kaj/backend test:coverage`: PASS; filters and interceptors each reported
  100% statement/branch/function/line coverage. Overall foundation coverage includes intentionally
  lazy infrastructure shells and is not treated as business-logic coverage.
- The unfiltered production audit before exception registration reported four known findings from
  locked major-version constraints, down from 18 after safe overrides.
- `corepack pnpm audit:prod`: PASS — only the four dated, controlled exceptions in
  `docs/security/dependency-exceptions.md` are ignored; any new advisory fails the command.

## Acceptance results

| Acceptance item | Result | Evidence |
|---|---|---|
| `GET /health` returns HTTP 200 | PASS | Supertest receives the exact E1 success envelope and matching request-ID header. |
| Unknown route returns E1 error shape | PASS | Exact deep-equality assertion for every error-envelope field. |
| Validation failure returns 400 with `field` | PASS | Invalid type and non-whitelisted mass-assignment tests populate `name` and `role`. |
| Logs contain no redacted values | PASS | Pino stream test proves authorization, password, code, token, and phone values are absent. |
| Unexpected errors do not leak internals | PASS | HTTP 500 test proves the thrown internal message is absent. |
| Swagger at `/docs` only outside production | PASS | Non-production integration test serves Swagger; bootstrap condition excludes production. |
| Every controller success/failure matches E1 | PASS | Global interceptor/filter plus exact success, 400, 404, and 500 integration assertions. |

## Decisions and limitations

- Request IDs are server-generated UUIDs; client-supplied correlation IDs are not trusted.
- Tests inject a deterministic clock and request-ID generator. Production uses the system clock and
  cryptographic UUID generation.
- Swagger is an operational HTML tool and is therefore outside the JSON API-envelope contract.
- Prisma and Redis modules are deliberately lazy and are not imported by `AppModule`; P1-INF-03 and
  later infrastructure tasks will activate them with their own integration tests.
- The dependency exception register forbids SSE and untrusted file detection while affected locked
  dependencies remain. It must be reviewed before the listed gates.
- Phase 0 remains unreviewed under the recorded owner sequencing override.
- ADR-0001 remains proposed. P1-INF-03 cannot start until the owner chooses the authoritative
  database direction.

## Next task

P1-INF-03 — complete Prisma schema v1, migrations, indexes, and idempotent seed. This task is blocked
until the owner accepts a database path in ADR-0001.
