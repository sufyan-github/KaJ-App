# KAJ

KAJ is a Bangla-first local work and service marketplace for a pilot in Rajshahi, Bangladesh. This
repository is a pnpm monorepo for the NestJS API, Next.js admin app, shared TypeScript contracts,
Flutter mobile app, and local infrastructure.

## Current status

Engineering foundation work began on 2026-08-18 by explicit owner direction. Phase 0 field
validation and owner review are still incomplete; starting engineering does not mark those evidence
gates as passed. Online payments, AI features, and production launch remain gated.

## Prerequisites

- Node.js 24.18.0 (see `.nvmrc` and `.node-version`)
- Corepack with pnpm 10.34.5 (pinned in `package.json`)
- Docker Desktop or Docker Engine with Compose v2
- Flutter stable/Dart 3 when the mobile workspace is introduced

## Quick start

These are the three clean-clone commands defined by P1-INF-01. They start the API with the complete
D2 domain schema and idempotent development seed.

<!-- quick-start-commands: 3 -->

```sh
corepack pnpm install
docker compose --env-file .env.example -f infrastructure/docker-compose.yml up -d
corepack pnpm migrate && corepack pnpm seed && corepack pnpm dev
```

For day-to-day development, copy `.env.example` to `.env`, replace every blank secret, and pass
`.env` to Compose. Values committed in `.env.example` are local-only and are not production
credentials.

Local services:

| Service                  | Address                                           |
| ------------------------ | ------------------------------------------------- |
| PostgreSQL 16            | `localhost:5432`                                  |
| Redis 7                  | `localhost:6379`                                  |
| MinIO API / console      | `http://localhost:9000` / `http://localhost:9001` |
| MailHog SMTP / UI        | `localhost:1025` / `http://localhost:8025`        |
| KAJ API (from P1-INF-02) | `http://localhost:3000`                           |

## API foundation

- Process liveness: `GET /health` (does not check dependencies)
- Dependency readiness: `GET /ready` (database query and Redis PING; HTTP 503 on failure)
- Versioned business API base: `/api/v1`
- Swagger UI in development/test only: `/docs`
- Every JSON success: `{ "data": ..., "meta": { "requestId": ..., "serverTime": ... } }`
- Every JSON error: `{ "error": { "code": ..., "messageKey": ..., "requestId": ... } }`

The API generates its own request ID and returns it in both the response envelope and
`x-request-id`. Logs are structured JSON and redact authorization, password, OTP code, token, and
phone fields.

Readiness has a three-second response deadline and a five-second in-process result cache.
Concurrent requests share one probe, including when an underlying database query is still
pending. Both operational endpoints send `Cache-Control: no-store`; connection errors and
credentials are never returned. Redis commands and connections have five-second deadlines
and requests have bounded retry attempts.

### Production deployment safety

Do not run `seed` or `seed:demo` during production builds or startup. The main seed resets
admin credentials, feature flags, fee rules, and configuration; it is restricted to explicit
`NODE_ENV=development` or `test`. These environments must only point to disposable databases.
Existing production data must be preserved and initial production provisioning reviewed separately.

The Render build command observed on 2026-10-03 still included `--filter @kaj/backend seed`.
Before deploying this change, remove that step. The intended build command is:

```sh
corepack enable && corepack pnpm install --frozen-lockfile && corepack pnpm --filter @kaj/backend exec prisma generate && corepack pnpm --filter @kaj/backend migrate && corepack pnpm --filter @kaj/backend build
```

Keep `NODE_ENV=production` and the start command `node backend/dist/main.js`. Review pending
migrations and take a restorable backup before deployment. After the new code is deployed,
set the Render health-check path to `/ready`, verify HTTP 200, and verify the public catalog
and authenticated workflows. Do not configure `/ready` before deploying this endpoint.
Use `/health` only for process-liveness diagnostics; a 200 there is not proof that users can log in.

If the development seed has already run against production, audit seeded admin access,
rotate affected credentials and TOTP enrollment, invalidate affected sessions, and review
feature flags, fee rules, and settings with the owner. Do not reset real users or production data.

## Authentication

The versioned API supports Bangladesh phone-number login through one-time challenges:

| Endpoint                          | Purpose                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `POST /api/v1/auth/otp/request`   | Normalize a BD number and queue a five-minute OTP.      |
| `POST /api/v1/auth/otp/verify`    | Consume the challenge and issue an access/refresh pair. |
| `POST /api/v1/auth/refresh`       | Rotate a device-bound refresh token.                    |
| `POST /api/v1/auth/logout`        | Revoke the supplied refresh token.                      |
| `POST /api/v1/auth/logout-all`    | Revoke the refresh-token family.                        |
| `GET /api/v1/auth/session`        | Return the authenticated user, roles, and flags.        |
| `POST /api/v1/auth/devices`       | Register notification metadata for the current device.  |
| `DELETE /api/v1/auth/devices/:id` | Remove one device owned by the authenticated user.      |

The console SMS adapter emits a masked development event and never logs the OTP. Provide real
`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values of at least 32 characters in production.

Authorization is globally default-deny. Every controller method must declare `@Policy(...)`;
omitting it returns `AUTH_POLICY_REQUIRED`. Authenticated policies use the access-token claims,
and private job, assignment, or conversation policies return `404` when the requester is not a
permitted party. This prevents authorization failures from revealing whether a private object
exists.

## Provider adapters

SMS, push, S3-compatible object storage, and payments are consumed through provider-neutral ports
exported by the global infrastructure module. Development uses `SMS_PROVIDER=console`; production
rejects console SMS and fixed OTP codes. Real operator login uses `SMS_PROVIDER=bdapps` and
operator subscriptions use `OPERATOR_PROVIDER=bdapps`, with an HTTPS private gateway and a
server-only internal API key. Configuration alone does not establish successful delivery or billing:
verify these with an approved test number and explicit charge consent. `SMS_PROVIDER=disabled`
and the currently disabled push adapter fail explicitly rather than reporting false delivery.

The S3 adapter signs uploads and downloads locally and validates object keys before signing. The
manual payment adapter only creates/reports a pending reference. It cannot capture, refund, validate
a webhook, or mark a payment successful.

Stop local infrastructure with:

```sh
docker compose --env-file .env.example -f infrastructure/docker-compose.yml down
```

## Root commands

| Command                       | Purpose                                                      |
| ----------------------------- | ------------------------------------------------------------ |
| `corepack pnpm dev`           | Run every workspace development process in parallel.         |
| `corepack pnpm test`          | Run foundation and workspace tests.                          |
| `corepack pnpm lint`          | Check formatting and each workspace linter.                  |
| `corepack pnpm typecheck`     | Type-check every supporting workspace.                       |
| `corepack pnpm migrate`       | Run database migrations supplied by the backend workspace.   |
| `corepack pnpm migrate:reset` | Reset the local development database and reapply migrations. |
| `corepack pnpm seed`          | Seed development data through the backend workspace.         |

The seed is safe to rerun. It upserts the development admin, starter bilingual taxonomy, pilot
location hierarchy, disabled feature flags, and required configuration defaults. Location
coordinates remain null until the Phase 2 on-the-ground verification task supplies validated data.

## Repository map

```text
mobile/                    Flutter app (P1-UI-07)
backend/                   NestJS API (P1-INF-02)
admin/                     Next.js admin app (Phase 8)
packages/shared-types/     Backend/admin DTO and enum package
infrastructure/            Local containers and later deployment assets
docs/                      Plans, research, decisions, and completion evidence
```

## Project documents

- `KAJ_BUILD_GUIDE.md` — authoritative architecture, task order, and acceptance gates.
- `KAJ_UI_REQUIREMENTS.md` — user requirements, UI rules, and traceability.
- `KAJ_PREBUILD_PLAN.md` — legal, operational, vendor, staffing, and launch dependencies.
- `docs/BUILD_PLAN.md` — executable sequence and gate plan.
- `docs/COMPLETION_TRACKER.md` — live progress ledger and next task.
- `docs/completed/` — one evidence report for each completed step.

See `CONTRIBUTING.md` for the task workflow and `SECURITY.md` for private vulnerability reporting.
