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

These are the three clean-clone commands defined by P1-INF-01. They start the foundation API now;
P1-INF-02 hardens that API and P1-INF-03 replaces the empty migration baseline with the domain
schema.

<!-- quick-start-commands: 3 -->

```sh
corepack pnpm install
docker compose --env-file .env.example -f infrastructure/docker-compose.yml up -d
corepack pnpm migrate && corepack pnpm dev
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

- Operational health: `GET /health`
- Versioned business API base: `/api/v1`
- Swagger UI in development/test only: `/docs`
- Every JSON success: `{ "data": ..., "meta": { "requestId": ..., "serverTime": ... } }`
- Every JSON error: `{ "error": { "code": ..., "messageKey": ..., "requestId": ... } }`

The API generates its own request ID and returns it in both the response envelope and
`x-request-id`. Logs are structured JSON and redact authorization, password, OTP code, token, and
phone fields.

Stop local infrastructure with:

```sh
docker compose --env-file .env.example -f infrastructure/docker-compose.yml down
```

## Root commands

| Command                   | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `corepack pnpm dev`       | Run every workspace development process in parallel.       |
| `corepack pnpm test`      | Run foundation and workspace tests.                        |
| `corepack pnpm lint`      | Check formatting and each workspace linter.                |
| `corepack pnpm typecheck` | Type-check every supporting workspace.                     |
| `corepack pnpm migrate`   | Run database migrations supplied by the backend workspace. |
| `corepack pnpm seed`      | Seed development data through the backend workspace.       |

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
