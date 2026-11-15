# 05 — Phase 01 Backend Stabilization: Completion Report (part 1)

- **Branch:** `claude/phase-01-backend` (base `agent/p1-ui-07-tracker@94adf43`), draft PR #6.
- **Period:** 8 November 2026.
- **Scope:** WP-0 to WP-10 and the first part of WP-11 from `00-phase-01-plan.md`. WP-11's remaining items and WP-12 are still open (section 9).

Security-related details are kept in the private register. Below they are described only as far as the public commit history already shows.

## 1. Summary

The single-worker marketplace loop now works end to end on the server:

| Area                  | What changed                                                                       |
| --------------------- | ---------------------------------------------------------------------------------- |
| Check-in/out          | Accepts the shipped app's real requests                                            |
| Job status changes    | Safe under concurrent requests                                                     |
| Disputes and no-shows | No longer leave jobs stuck                                                         |
| Hiring                | Enforces identity, the worker role, blocks and the category safety rules           |
| Clients               | Receive specific error codes                                                       |
| Admin queues          | Show new work                                                                      |
| Skills                | Saving no longer destroys verification data                                        |
| Reputation            | No longer penalises workers for customers' cancellations or ranks new workers last |

Production dependency advisories went from 13 (3 critical) to 1 documented moderate. Backend/admin CI now runs on every pull request.

## 2. Source files changed

12 commits:

- 83 files changed in total (+3,951 / −669).
- Application code: 54 files (+1,603 / −496).
- Tests: 22 files (+2,114 / −61).

| WP           | Commit               | Main files                                                                                                                                                                                                                                         |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP-0         | `597afe8`, `d0dc37c` | `.github/workflows/backend-admin-ci.yml` (new); root, `admin` and `backend` `package.json` and `pnpm-lock.yaml`; `.prettierignore`; `admin/playwright.config.ts`; `docs/security/dependency-exceptions.md`; `backend/test/bdapps.adapters.spec.ts` |
| WP-1         | `5be4be4`            | `backend/src/common/filters/http-exception.filter.ts`                                                                                                                                                                                              |
| WP-2         | `d321a3e`            | `attendance/dto/attendance.dto.ts`, `attendance/attendance.service.ts`                                                                                                                                                                             |
| WP-6         | `1de8520`            | `chat/chat.gateway.ts`, `chat/dto/chat.dto.ts`, `chat/chat.module.ts`, `common/guards/account-moderation.guard.ts`                                                                                                                                 |
| WP-3         | `8315d34`            | `jobs/state-machine/job-state.machine.ts`, `jobs/jobs.service.ts`, `disputes/disputes.service.ts`, `admin-ops/admin-ops.service.ts`                                                                                                                |
| WP-4/5       | `68f59bc`            | `jobs/hiring-policy.ts` (new), `jobs/jobs.service.ts`, `jobs/jobs.controller.ts`, `jobs/recurrence/recurrence.service.ts`, `disputes/disputes.service.ts`                                                                                          |
| WP-7         | `6cf6917`            | `auth/*` (service, repository, password service, rate limiter), `admin-auth/*`, `users/users.service.ts`, `config/environment.ts`, `app.bootstrap.ts`, `admin/lib/backend.ts`, `admin/app/api/admin/*`, `.env.example`                             |
| WP-8/9       | `5c3992e`            | `admin-ops/*`, `moderation/*`, `common/api/cursor-page.ts` (new), `catalog/*` (duplicate controller removed), `users/profiles.controller.ts`, `users/users.service.ts`                                                                             |
| WP-10        | `6d7a6fa`, `4053754` | `reviews/badge.rules.ts`, `reviews/reviews.service.ts`, `matching/matching.service.ts`, `jobs/jobs.service.ts`                                                                                                                                     |
| WP-11 (part) | `b41182e`            | `common/scheduling/schedulers-enabled.ts` (new), all six `*.runner.ts`, `notifications/notifications.service.ts`, `config/environment.ts`                                                                                                          |

## 3. Database changes

**None.**

- No migrations, tables, columns, indexes or backfills.
- Cancellation responsibility is derived from the existing `job_status_history`; jobs are single-worker now.
- Planned additive migrations (indexes, `assignments.cancelled_by_*`, constraints) wait for **Gate B**.

## 4. API changes

All changes are additive or tolerant. The response envelope shape is unchanged.

| Change             | Endpoints                                                                                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New                | `GET /api/v1/profiles/me` (own profile, area, roles, worker details, skills); `GET/POST /api/v1/admin/skills`, `PUT /api/v1/admin/skills/:id`                                                                                                                                                                          |
| Removed            | `PATCH /admin/categories/:id`, `PATCH /admin/skills/:id`, `POST /admin/locations` (shadowed), `PATCH /admin/locations/:id`. These lived in `CatalogAdminController` and needed a mobile-token admin flag that no login can produce. The same functions are on admin-session routes                                     |
| Request tolerance  | Check-in/out accept `mockLocation` on both; coordinates and accuracy are rounded, not rejected                                                                                                                                                                                                                         |
| New optional query | `cursor` on `GET /admin/verification-requests`, `/admin/disputes` (also `status`), `/admin/moderation/reports`                                                                                                                                                                                                         |
| Response additions | `nextCursor` on those queues; `unreadCount` on notifications is now exact                                                                                                                                                                                                                                              |
| Default changes    | Admin queues return actionable items unless a status is requested. `GET /jobs/:id` returns 404 for drafts and closed jobs to unrelated users and omits the exact address and pin for non-owners. `GET /jobs/:id/occurrences` is limited to the poster and the series' workers. The job feed omits expired and own jobs |
| New error codes    | `JOB_STATE_CHANGED`, `MULTI_WORKER_NOT_SUPPORTED`, `CATEGORY_POLICY_UNMET` (with `details`), `WORKER_ROLE_REQUIRED`, `HIRING_UNAVAILABLE`, `SLOT_IN_PAST`, `JOB_EXPIRED`, `INVALID_REFERENCE`, `ALREADY_EXISTS`, `CONCURRENT_UPDATE`, `ADMIN_ROLE_FORBIDDEN` (403), `ADMIN_LOGIN_RATE_LIMITED`                         |
| Error behaviour    | Specific codes and messages from the server, such as `SUBSCRIPTION_REQUIRED`, now reach clients. Prisma not-found, unique, foreign-key and serialization errors are 404/409/422/409, not 500                                                                                                                           |
| New cancel reason  | `WORKER_NO_SHOW` (customer only, ≥30 min after the agreed start, no check-in)                                                                                                                                                                                                                                          |
| Transitions        | Disputes may be opened from `IN_PROGRESS`                                                                                                                                                                                                                                                                              |

**New configuration:**

- `TRUST_PROXY_HOPS` (default 0).
- `RUN_SCHEDULERS` (default `true`).
- `attendance.settings.areaGeofenceRadiusM` (default 1500).

Non-production deployments with a non-local `API_BASE_URL` must now set real secrets.

## 5. Mobile changes

**None in this part.** The backend was made tolerant, so installed APKs keep working.

These mobile changes are still needed (Phase 06):

- filter live chat by `conversationId`;
- round GPS on the client;
- fix the 400/422 error mapping and show server `messageKey`s;
- restore state from `GET /profiles/me` after login;
- send real skill levels;
- the location picker for City → Thana → Area;
- a no-show report action and a "what you need" sheet for `CATEGORY_POLICY_UNMET`.

## 6. Admin changes

- The proxy forwards the operator's `X-Forwarded-For` and `User-Agent` (login, TOTP, ops).
- A role mismatch now returns 403, so the console no longer signs staff out.

The console UI is unchanged in this part. Status tabs, paging controls, a skills page and reason dialogs are Phase 07.

## 7. Tests

**Commands:**

- Every work package: `scratchpad/ci-local.sh` (mirrors the CI workflow: lint, typecheck, build, audit, root tests, backend tests with every database suite, admin e2e).
- Before the final push: `fresh-db-tests.sh` (a freshly migrated and seeded database, as in CI).

| Gate                                   | Before (baseline) | After                                                                                                                      |
| -------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Lint                                   | ❌ (lockfile)     | ✅                                                                                                                         |
| Typecheck, build                       | ✅                | ✅                                                                                                                         |
| `pnpm audit --prod --audit-level high` | ❌ 13 findings    | ✅ (1 moderate exception)                                                                                                  |
| Backend tests                          | 312               | **415 passed / 415** (65 suites, all database suites)                                                                      |
| Admin e2e                              | 8/8               | 8/8                                                                                                                        |
| GitHub Actions on PR #6                | —                 | Green through WP-8/9. WP-10's first push failed on a test-isolation bug (fixed in `4053754`, verified on a fresh database) |

**Bug-proving tests:** each of these was also run against the previous code and fails there:

- 5× concurrent publish;
- simultaneous customer/worker cancel;
- role-activation token;
- worker-caused cancellation rate.

The 14 runtime reproductions from the audit (R1–R14) have matching regression tests, except:

- **R8** (review counting): waits for decision D6.
- **R11** (client thread filter): mobile.

## 8. Acceptance criteria (Phase 01)

| Criterion                                              | Status                                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Critical API contract mismatches fixed                 | **PASS (server side)**: attendance, errors, chat validation. App-side fixes are Phase 06                   |
| No duplicate route ambiguity                           | **PASS**: duplicate catalogue controller removed                                                           |
| Authentication and authorization verified              | **PASS** for the items in WP-7. General per-route throttling not yet done                                  |
| Job and application workflows end to end               | **PASS** for single-worker jobs (real-HTTP tests); multi-worker refused clearly                            |
| Attendance accepts valid mobile requests               | **PASS**: exact app payloads tested. Geofence needs area coordinates (owner data, D5)                      |
| Chat history and real-time isolation                   | **PARTIAL**: server validation and moderation PASS; thread filter and history paging are mobile (Phase 06) |
| Notifications registered and delivered by the provider | **BLOCKED**: no push provider configured (D8). Inbox count fixed                                           |
| Profile retrieved and safely updated                   | **PASS**                                                                                                   |
| Existing tests pass or baseline failures documented    | **PASS**                                                                                                   |
| API documentation matches behaviour                    | **NOT DONE**: OpenAPI generation (WP-12) is pending                                                        |

## 9. Remaining issues

**Open in Phase 01:**

- **WP-11 (rest):**
  - Production reference-data command (locations with coordinates, skills).
  - Hot-path indexes and constraints (migrations, need Gate B).
  - Assignment reads still running the time-based updates.
  - Resumable notification campaigns.
  - Feature flags that have no effect.
  - Leases or a queue for background runners.
- **WP-12:** enable the Swagger plugin, add response DTOs, commit `openapi.json` and contract tests.
- **Security:** general per-route rate limiting, plus the production-side items in the private register (owner day-0 actions).

**Owner decisions still open:**

- D1/D2 repository layout;
- D5 area coordinates;
- D6 review counting;
- D7 SMS vendor;
- D8 Firebase;
- D10 fee display.

**Operational notes:**

- Keep one API instance, or set `RUN_SCHEDULERS=false` on extra ones; chat fan-out is still in-process.
- Set `TRUST_PROXY_HOPS` only after confirming Render's proxy chain.

## 10. Next

1. Finish WP-11's code-only items and WP-12, the OpenAPI contract that Phase 06 builds the app integration on.
2. Gate B: approve the first additive migrations (indexes, cancellation attribution columns).
3. Phase 06 mobile contract fixes (section 5), on a branch of `codex/production-hardening`.
