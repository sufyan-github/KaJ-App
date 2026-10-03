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

## Mobile password authentication (3 October 2026; pending deployment)

Existing subscribers can authenticate with their mobile number and password.
Login creates only a session/device record and existing risk observations; it
does not call OTP, subscription registration or payment APIs. The client then
reads the existing `/subscriptions/me` decision. An inactive subscriber remains
authenticated and is directed to the existing subscription page. Subscription
plans, prices, duration, renewal, callbacks, provider adapters and access flags
are unchanged. In particular, the existing disabled production access gate and
missing local plan/subscription records remain a separate launch blocker.

New authenticated subscribers can set a password once existing verification
shows an active paid subscription or verified remote-carrier subscription.
Passwords use the project's existing bcrypt library at cost 12, with a minimum
of 12 characters and a maximum of 72 UTF-8 bytes (reject rather than truncate).
The existing admin `password_hash` is never overwritten by mobile setup/reset.
See [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

| Route (under `/api/v1`)                | Authentication                               | Purpose                                                            |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `POST /auth/password/login`            | Public                                       | Existing mobile number/password; returns current-format token pair |
| `GET /auth/password/status`            | Session                                      | Whether this account has a mobile password                         |
| `POST /auth/password/setup`            | Session + existing subscription verification | First password only; cannot overwrite                              |
| `POST /auth/password/recovery/request` | Public + `subscriptionConsent: true`         | Existing-account recovery OTP                                      |
| `POST /auth/password/recovery/verify`  | Public + `subscriptionConsent: true`         | Recovery code + new password; revokes old mobile sessions          |

Per the owner's explicit instruction, recovery reuses the existing **paid**
bdApps subscription OTP. The bilingual UI asks for consent both before requesting
and verifying a code, explains BDT 2.78/day and daily renewal until unsubscribed,
and never promises a free reset or a one-off charge. Actual carrier billing
remains controlled by the unchanged gateway. Product approval is not permission
to run another live paid test.

Recovery challenges are purpose-bound, time-limited, attempt-limited and
single-use. A database claim prevents concurrent verification of one challenge.
If provider verification times out or its outcome becomes uncertain, the claim
is retained to prevent automatic repetition of a paid call. The user must check
the subscription outcome and explicitly request a new code if needed; a crashed
verification is not silently retried. Unknown accounts receive a generic request
response without sending SMS or creating a user. Successful reset increments a
mobile auth version and revokes all refresh tokens; HTTP and chat check that
version, including existing chat send/receive activity. Old JWTs without a version
remain compatible at version zero until the first reset.

### Migration and release order

Migration `20261003060000_mobile_password_auth` adds nullable
`users.mobile_password_hash`, `users.mobile_auth_version` (default zero), and
`otp_challenges.recovery_verifying` (default false). It does not delete data,
backfill passwords, or touch subscription/payment tables. Apply it with
`corepack pnpm --filter @kaj/backend migrate` against the intended database after
the normal backup/review process. Never run the development seed in production.
Deploy the backend before distributing the updated Flutter client. No new
gateway secret or environment variable is required. A rollback must retain
auth-version enforcement once resets have occurred; an old binary would not
honor that revocation mechanism.

### Verification

- All 308 backend tests passed in 55 suites with none skipped, using isolated
  PostgreSQL/Redis. Carrier delivery and eligibility were mocked; no live charge
  was performed for this change.
- New database tests cover repeated/multi-device login without billing changes,
  expired/cancelled/inactive subscribers, existing renewal and preserved history,
  initial OTP account/password setup, admin-credential isolation, reset/expiry/
  replay/concurrency, consent validation, rate limits and the existing pilot gate.
- Dedicated chat tests cover revocation during connection, send, join and delivery.
- Flutter: all 130 tests and analyzer passed, including Bangla/English at 200%
  text size, password mismatch/UTF-8 limits, inactive routing, both recovery
  consent steps and suppression of automatic recovery-request replay.
- This update is not yet deployed. Actual recovery delivery and carrier charging
  still require a separately approved live test.
