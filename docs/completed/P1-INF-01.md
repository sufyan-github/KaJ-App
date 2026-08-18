# P1-INF-01 — Monorepo & tooling

**Status:** COMPLETE
**Completed:** 2026-08-18
**Phase:** Phase 1 — foundation
**Commit:** This completion record is part of the task commit; exact hash is in Git history and the final task report.
**Remote:** `origin/agent/p1-inf-01-monorepo-tooling` (draft pull request to `main`)

## Scope

This task created the pnpm monorepo foundation, root development commands, shared-types workspace,
local PostgreSQL/Redis/MinIO/MailHog stack, environment template, repository policies, and the
minimum executable NestJS/Prisma bootstrap needed to prove the three-command clean-clone contract.

It did not implement the P1-INF-02 response envelopes, validation, request context, redacted logging,
Swagger, or Redis integration. It did not implement the P1-INF-03 domain schema, migrations, or seed
data. Flutter, admin UI, authentication, payments, and AI remain outside this task.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` Parts A, B1–B4, G/P1-INF-01, H1, I1–I2, and L.
- `docs/BUILD_PLAN.md` execution loop and Phase 1 sequence.
- `docs/COMPLETION_TRACKER.md` environment baseline and human gates.
- Owner instruction on 2026-08-18 to start engineering before unfinished Phase 0 fieldwork review.

## Output

- Root workspace/tooling: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, Node pins,
  EditorConfig, Git attributes/ignore rules, Prettier scope, and environment template.
- Repository guidance: updated `README.md`, `CONTRIBUTING.md`, and `SECURITY.md`.
- Local infrastructure: `infrastructure/docker-compose.yml` with PostgreSQL 16, Redis 7, MinIO,
  MailHog, health checks, loopback-only ports, and persistent named volumes.
- Shared workspace: `packages/shared-types/` with strict TypeScript build/typecheck configuration.
- Acceptance bootstrap: a minimal NestJS `/health` route and empty Prisma PostgreSQL schema. The next
  two tasks own the production API foundation and complete domain schema.
- Tests: six root contract checks and one live HTTP integration test.
- Database decision record: `docs/decisions/ADR-0001-database-platform.md`.

## How it operates

Corepack selects pnpm 10.34.5 from the root package metadata. Recursive root commands dispatch to
supporting workspaces. The environment-aware dispatcher loads safe local defaults, then runs dev,
migration, or seed scripts. Docker Compose starts four isolated local dependencies. The minimal API
listens on `PORT` and returns `{ "status": "ok" }` from `GET /health`.

## Process and procedure

1. Re-read the task contract, stack, repository layout, testing rules, and local environment state.
2. Wrote foundation contract tests first and captured five expected missing-file failures.
3. Pinned package versions from the npm registry and generated a deterministic pnpm lockfile.
4. Implemented root tooling, shared-types, Compose services, documentation, and repository policies.
5. Added the minimum API and Prisma bootstrap required by the task's clean-clone acceptance.
6. Installed Docker Desktop 4.87.0 and validated the Compose configuration and service health.
7. Ran tests, formatting/lint, typecheck, build, Prisma validation/deploy, and an HTTP health probe.

## Verification evidence

- `corepack pnpm test`: PASS — 6 root tests and 1 backend HTTP integration test.
- `corepack pnpm lint`: PASS — root, backend, and shared-types formatting checks.
- `corepack pnpm typecheck`: PASS — backend and shared-types strict TypeScript checks.
- `corepack pnpm build`: PASS — NestJS and shared-types builds.
- `prisma validate`: PASS — PostgreSQL datasource schema is valid.
- `corepack pnpm migrate`: PASS against the healthy PostgreSQL 16 container; no migrations exist
  before P1-INF-03, so Prisma reported no pending migrations.
- `docker compose ... config --quiet`: PASS.
- `docker compose ... up -d --wait`: PASS — PostgreSQL, Redis, MinIO, and MailHog healthy/running.
- `GET /health`: PASS — live Nest application returned HTTP 200 and `{ "status": "ok" }`.

## Acceptance results

| Acceptance item | Result | Evidence |
|---|---|---|
| Required monorepo files and shared package exist | PASS | Root contract tests and workspace install. |
| Compose runs PostgreSQL 16, Redis 7, MinIO, MailHog | PASS | Compose config check and four running/healthy services. |
| Root `dev`, `test`, `lint`, `typecheck`, `migrate`, `seed` scripts exist | PASS | Contract test plus executed test/lint/typecheck/build/migrate scripts. |
| `docker compose up -d && pnpm migrate` succeeds | PASS WITH LOCAL PORT OVERRIDE | Port 5432 was already owned by PID 7208, so runtime verification used `POSTGRES_PORT=55432` and the matching `DATABASE_URL`; committed defaults remain 5432. |
| Running API reachable in no more than three documented commands | PASS | README contains exactly three clean-clone commands; HTTP integration reached `/health`. |

## Decisions and limitations

- Node 24.18.0, pnpm 10.34.5, Prettier 3.9.6, TypeScript 5.9.3, NestJS 10.4.22,
  and Prisma 6.19.3 are pinned. Prisma 6 is retained for compatibility with the build guide's schema
  format; a future major upgrade requires its own reviewed task.
- Windows denied Corepack permission to place a global `pnpm` shim in Program Files. Repository
  commands use `corepack pnpm`, which works without that shim.
- Docker Desktop was installed locally. The committed Compose configuration is portable to Compose
  v2 environments and does not depend on that installation path.
- The minimal controller exists only to prove P1-INF-01 startup. P1-INF-02 must replace it with the
  exact API envelope, validation, logging, request-context, and Swagger architecture.
- Phase 0 research and owner review remain incomplete. The owner instruction to start engineering is
  recorded as an execution override, not evidence that research passed.
- The production database remains undecided. P1-INF-03 is blocked on ADR-0001 acceptance.

## Next task

P1-INF-02 — implement the NestJS API foundation, standard success/error envelopes, validation,
request IDs, redacted structured logging, Swagger, and required tests.
