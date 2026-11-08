# 00 — Baseline Results (pre-implementation)

**When and where:** 8 November 2026, local cloud sandbox.

**Code under test:**

- Backend + admin: `agent/p1-ui-07-tracker@94adf43`.
- Mobile: `codex/production-hardening@9fe6a54`.

Nothing was changed in either codebase before these runs. The failures below **existed before any implementation work**. New changes must not be blamed for them, and must not make them worse.

## Environment

| Item           | Version                                                               | Pinned                                               |
| -------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| Node           | 24.18.0 (official tarball)                                            | 24.18.0 ✅                                           |
| pnpm           | 10.34.5 (corepack)                                                    | 10.34.5 ✅                                           |
| PostgreSQL     | 16 (`postgres:16` via the repo's `infrastructure/docker-compose.yml`) | 16 ✅                                                |
| Redis          | 7 (`redis:7`)                                                         | 7 ✅                                                 |
| Flutter / Dart | 3.47.9 / 3.13.7                                                       | README says 3.47.2 / 3.13.2 (patch-level difference) |
| Android SDK    | **not available**                                                     | APK builds not run                                   |

**Test database:** `kaj_test`, with all 20 migrations applied and seeded with `NODE_ENV=test`. Redis DB index 1.

**Exact commands:** `scratchpad/baseline-20261108/run.sh`. Every log is kept next to it.

## Results

| Gate                                 | Command                                              | Result                                                         | Notes                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install                              | `corepack pnpm install --frozen-lockfile`            | ✅                                                             | —                                                                                                                                                                                                                                                                                                                                                              |
| Prisma schema                        | `prisma validate`                                    | ✅                                                             | —                                                                                                                                                                                                                                                                                                                                                              |
| Migration status                     | `prisma migrate status`                              | ✅ 20/20 applied                                               | `migrate diff` (data-layer review) shows small drift: 7 `updated_at` defaults, 1 index name, `JobStatus` enum order (KAJ-076)                                                                                                                                                                                                                                  |
| Lint                                 | `corepack pnpm lint`                                 | ❌ **pre-existing**                                            | Only `pnpm-lock.yaml` fails `prettier --check` (KAJ-078), since commit `73da673` (2 Sep). All other paths and workspace linters pass                                                                                                                                                                                                                           |
| Type check                           | `corepack pnpm typecheck`                            | ✅                                                             | admin, backend, backend prisma, shared-types                                                                                                                                                                                                                                                                                                                   |
| Backend tests (all 7 DB-suite flags) | `pnpm --filter @kaj/backend test:coverage`           | ⚠ 310/312, 55/56 suites                                        | Two failures in `test/bdapps.adapters.spec.ts`. **Cause: environment, not product code.** The script loaded `.env.example`, whose empty `BDAPPS_GATEWAY_URL` / `BDAPPS_INTERNAL_API_KEY` take priority over the test's own `ConfigService` values. Re-run in a clean environment: **5/5 pass**. The 7 Nov full run without `.env.example` sourced: **312/312** |
| Backend coverage                     | same                                                 | statements 74.7%, branches 47.8%, functions 60.2%, lines 75.5% | —                                                                                                                                                                                                                                                                                                                                                              |
| Builds                               | `corepack pnpm -r build`                             | ✅                                                             | backend `nest build`; admin `next build` (7 routes: `/`, `/_not-found`, 5 `/api/admin/*`); shared-types                                                                                                                                                                                                                                                        |
| Admin e2e                            | `pnpm --filter @kaj/admin e2e`                       | ✅ 8/8                                                         | **Backend fully mocked**, so this doesn't prove the contract. Running it **rewrites tracked files** `admin/next-env.d.ts` and `admin/tsconfig.json`; both were restored                                                                                                                                                                                        |
| Dependency audit                     | `corepack pnpm audit --prod`                         | ❌ **pre-existing**                                            | 13 advisories in production dependencies (3 critical, 6 high, 4 moderate); upgrade plan in Phase 01 WP-0                                                                                                                                                                                                                                                       |
| Flutter deps                         | `flutter pub get --enforce-lockfile`                 | ✅                                                             | —                                                                                                                                                                                                                                                                                                                                                              |
| Dart format                          | `dart format --set-exit-if-changed .`                | ✅                                                             | —                                                                                                                                                                                                                                                                                                                                                              |
| Flutter analyze                      | `flutter analyze --fatal-infos`                      | ✅ No issues                                                   | —                                                                                                                                                                                                                                                                                                                                                              |
| Flutter tests                        | `flutter test --coverage`                            | ✅ 146/146                                                     | line coverage 43.72% (3,244/7,420)                                                                                                                                                                                                                                                                                                                             |
| Mobile tooling tests                 | `python3 -m unittest discover -s tool/tests` (7 Nov) | ✅ 10/10                                                       | —                                                                                                                                                                                                                                                                                                                                                              |
| Mobile client-secret scan            | `tool/check_client_secrets.sh` (7 Nov)               | ✅                                                             | —                                                                                                                                                                                                                                                                                                                                                              |

**Git status after the run:** clean in both worktrees, after restoring the two admin files the e2e run rewrote.

## Runtime checks done during the audit (7–8 Nov)

The local API was booted from `backend/dist/main.js` against throwaway databases (`kaj_repro`, and the data-layer reviewer's own scratch databases).

| Check                  | Result                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dev mode               | `/health` 200, `/ready` 200, catalogue 200, OTP request 201 (masked log), cooldown 429, validation 400, 404 envelope, Swagger 200                       |
| Production mode        | Refuses to boot with a short TOTP key ✅; `/docs` 404 ✅; OTP with SMS disabled → 500 and the cooldown is still used up (minor)                         |
| Workflow reproductions | 14 scenarios run against the local API; results feed the Phase 01 plan (security-related results tracked in the private security register (not in Git)) |
| Volume tests           | `EXPLAIN ANALYZE` at 100k users / 200k jobs / 1M notifications (index plan in `00-phase-01-plan.md`)                                                    |

## Not tested, and why

| Area                                     | Reason                                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| Android APK build, on-device runs        | No Android SDK in the sandbox                              |
| MinIO uploads end to end                 | No reviewer needed them; the S3 adapter signs URLs locally |
| bdApps SMS, carrier billing, PHP gateway | External provider; gateway code not in the repo            |
| Push notifications                       | Not implemented (port disabled)                            |
| Production API, Render, Supabase         | Deliberately not contacted                                 |
| Load and latency under concurrency       | Only targeted concurrency reproductions; no load test      |

## Test-hygiene issues found while running the baseline

New items for Phase 01:

1. **The admin e2e run rewrites tracked files** (`next-env.d.ts`, `tsconfig.json`). Pin them, or run e2e against `next build && next start`.
2. **Backend unit tests read the ambient environment**, as shown by the bdApps adapter failure. Tests should build an isolated config.
3. **Root lint fails because of the lockfile.** Add `pnpm-lock.yaml` to `.prettierignore`.
4. **DB suites are opt-in through seven environment flags** and are skipped by default (`pnpm test` = 263 passed, 49 skipped). CI should run them with service containers.
