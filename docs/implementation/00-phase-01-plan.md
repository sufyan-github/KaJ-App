# Phase 00 Summary and Phase 01 Plan

**Status:** Phase 00 (discovery and baseline) is complete. No implementation has started; this plan is waiting for owner approval at Gate A.

This is the public version. Security findings, their evidence and the owner's production actions are kept in a **private security register that is not in Git**. Here, security work packages are listed by name only.

## 1. Platform in one paragraph

KAJ is one product split across two unmerged histories in this repository:

- **`agent/p1-ui-07-tracker`:** NestJS API with 20 modules, 168 routes and Socket.IO chat; Prisma/PostgreSQL 16 with 66 models and 20 migrations; Redis; S3; and the Next.js admin console.
- **`codex/production-hardening`:** the Flutter Android app and the landing page.

Carrier OTP and billing go through an external PHP gateway that is not in this repository. Details are in `00-current-architecture.md`.

## 2. Confirmed working (preserve)

- **Auth and access control:**
  - Default-deny `@Policy` on all routes.
  - OTP and password login with rotating refresh tokens.
  - Admin password + TOTP.
- **Platform services:**
  - Webhook signing.
  - Hardened upload pipeline.
  - Masked public profiles.
  - Production configuration guards.
- **Marketplace:** single-worker job post → apply → accept → confirm.
- **Chat:** REST endpoints with an offline outbox.
- **Notifications:** the in-app inbox.
- **Trust, safety and admin:**
  - Verification capture and admin decision.
  - Moderation and risk queues.
  - Portfolio.
  - Subscription administration.
- **Quality:**
  - Builds, typecheck and Flutter analyze all pass.
  - 146/146 Flutter tests pass.
  - 312/312 backend tests pass in a clean environment.

## 3. Confirmed broken functionality (non-security)

| #   | What fails                                                                                                    | How confirmed  |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Worker check-out is rejected (the app sends `mockLocation`, which the check-out DTO doesn't declare)          | Runtime        |
| 2   | Normal Android GPS values fail `maxDecimalPlaces` on check-in and check-out                                   | Runtime        |
| 3   | Jobs never get coordinates, so geofenced check-in is impossible; enabling `checkin_enabled` blocks completion | Runtime        |
| 4   | Jobs needing more than one worker can't fill a second slot                                                    | Runtime        |
| 5   | After an admin resolves a dispute, the assignment stays unfinished, so reviews and cash recording are blocked | Runtime        |
| 6   | A no-show job is stuck once the clock moves it to IN_PROGRESS                                                 | Runtime        |
| 7   | A declined worker can cancel a job that another worker is booked on                                           | Runtime        |
| 8   | Concurrent requests aren't safe: duplicate publishes, double cancellations, 500s on contended accept          | Runtime        |
| 9   | Error codes are discarded for most errors; unknown ids give 500                                               | Runtime        |
| 10  | Admin review queues hide new items once 100 older ones exist                                                  | Runtime        |
| 11  | Live chat messages are merged into whichever thread is open                                                   | Runtime        |
| 12  | Jobs never expire; past jobs stay in the feed                                                                 | Runtime        |
| 13  | Matching compares UTC job times against Dhaka-local availability; new workers score 0                         | Executed       |
| 14  | One-sided reviews never count; customer cancellations lower worker scores                                     | Runtime / code |
| 15  | Category safety rules (minimum age, licence, identity) are not enforced                                       | Runtime        |
| 16  | Mobile: location picker is root-only; role and area are lost on reinstall; skill edit wipes levels and rates  | Code           |

## 4. Missing functionality

- **Job lifecycle:** edit, close or cancel a job before assignment.
- **Applications:** "my applications", withdraw, shortlist and reject.
- **Profiles:** reading your own profile; editing worker headline, experience and radius; service areas; business profiles.
- **Push notifications:** no FCM yet.
- **Search:** pagination and filters.
- **Admin:**
  - Staff management.
  - Skill CRUD in the console.
  - A dispute workspace.
- **Platform:**
  - A production path for reference data.
  - Data clean-up and account purge.
  - Backend CI.
  - A usable OpenAPI contract.
- **Learning and credentials:** courses, assessments, practical reviews, skill credentials.
- **Reputation:** transparent performance indicators.

Payments remain **deferred** by owner decision.

## 5. Decisions needed from the owner (non-security)

| ID  | Decision                                                      | Recommendation                                                                                                      |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| D1  | Confirm GitHub holds the latest code (no unpushed local work) | Required before branching                                                                                           |
| D2  | Repository layout                                             | Merge `agent/p1-ui-07-tracker` into `main`; import the mobile line as `mobile/` with `git subtree`, keeping history |
| D4  | Multi-worker jobs                                             | Cap at 1 worker in P01; build a per-assignment lifecycle in P02                                                     |
| D5  | Source of area coordinates                                    | Owner-validated area centroids                                                                                      |
| D6  | Review counting (spec RV3)                                    | Double-blind reveal at the 14-day deadline; one-sided reviews count after reveal                                    |
| D7  | SMS vendor for numbers on other operators                     | Needed for Grameenphone, Banglalink and Teletalk users                                                              |
| D8  | Firebase project for push                                     | Needed for push notifications                                                                                       |
| D9  | Experts and assessors for 2–3 pilot categories                | Needed for Phase 04                                                                                                 |
| D10 | Fee display: contract says 8%, cash records show 0%           | Confirm the pilot fee                                                                                               |

## 6. Migration sequence (all additive)

| Wave | Phase | Change                                                                                                                                                                                                                           |
| ---- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W0   | P01   | Settings only: DB `TimeZone=UTC`, Prisma `directUrl`, connection-pool limits                                                                                                                                                     |
| W1   | P01   | `assignments`: nullable `cancelled_by_user_id`, `cancel_reason_code`, `cancel_responsibility`                                                                                                                                    |
| W2   | P01   | Hot-path indexes with `CREATE INDEX CONCURRENTLY`, one migration each. Measured on synthetic data:<br>• refresh-token family: 27 ms → 0.13 ms<br>• feed: 40 → 0.24 ms<br>• assignments: 16 → 0.1 ms<br>• audit log: 38 → 0.03 ms |
| W3   | P01   | Idempotent reference-data command for locations, coordinates and skills (not a migration)                                                                                                                                        |
| W4   | P03   | `verification_requests.skill_id` with a partial unique index on pending rows; category requirement columns; `skill_credentials`; business profile columns                                                                        |
| W5   | P04   | Learning and assessment tables                                                                                                                                                                                                   |
| W6   | P05   | `work_events`, `review_responses`, review reveal columns, `worker_metrics`                                                                                                                                                       |
| W7   | P08   | `CHECK … NOT VALID` then `VALIDATE`; uniqueness rules after a data audit                                                                                                                                                         |
| W8   | Later | TIMESTAMPTZ conversion and removal of deprecated columns (approved separately)                                                                                                                                                   |

**Every wave must have:**

- a recovery note;
- a backfill that is safe to re-run;
- a rehearsal on a production-shaped copy.

**Nothing reaches production** without Gate B/H approval.

## 7. Phase 01 work packages

**Goal:** a stable single-worker marketplace loop, with contracts that both clients can rely on.

**Constraint:** keep the Render instance count at **1** until the scheduler and socket work is done.

| WP                     | Scope                                                                                                                                                                                                                                   | Tests written first                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| WP-0 Foundations       | Implementation branch; backend/admin CI; fix lockfile lint; isolate tests from the ambient env; stop admin e2e rewriting tracked files; dependency upgrades                                                                             | CI itself                           |
| WP-1 Error contract    | Map every `HttpException` and Prisma error to stable codes; log 5xx; fix the app's 400/422 mapping                                                                                                                                      | Filter unit tests                   |
| WP-2 Attendance        | Accept `mockLocation`; tolerant numeric validation with server rounding; round in the app; coordinate fallback to the area centroid                                                                                                     | Old and new app payloads → 201      |
| WP-3 State machine     | Optimistic transitions; take the lock before the snapshot, with P2034 retry; one transition path; dispute resolution via the finish path; no-show exit; guard against declined-worker cancel; `workersRequired` cap; reads stop writing | Concurrency tests                   |
| WP-4 Hiring guards     | One worker-eligibility check for apply, book and confirm; slot and reference validation; job expiry; first `CategoryPolicyService` (age, identity)                                                                                      | Policy unit tests                   |
| WP-5 Privacy hardening | Private security register                                                                                                                                                                                                               | Private                             |
| WP-6 Chat              | Client filters live messages by conversation; emit to the conversation room; gateway hardening (private register)                                                                                                                       | Socket + widget tests               |
| WP-7 Auth hardening    | Private security register                                                                                                                                                                                                               | Private                             |
| WP-8 Admin backend     | Actionable, cursor-paged queues; one catalogue write path with skill CRUD and cache invalidation; guard on "unstick"; resumable campaigns                                                                                               | Queue tests                         |
| WP-9 Profiles & skills | `GET /profiles/me`; skills upsert with selective delete; the app sends real level and years                                                                                                                                             | Save-twice test                     |
| WP-10 Reputation fixes | "Verified" badge requires IDENTITY; keep manually granted badges; record cancellation responsibility; neutral cold start and Dhaka time in matching                                                                                     | Unit tests                          |
| WP-11 Platform         | Scheduler flag + advisory leases; feature flags that take effect; seed never resets flags; reference-data command; correct notification count; hot-path indexes                                                                         | Two-instance runner test, `EXPLAIN` |
| WP-12 Contracts        | Enable the Swagger plugin; response DTOs; committed `openapi.json`; shared fixtures tested by backend and Flutter                                                                                                                       | Contract tests                      |

**Order:**

1. WP-0
2. WP-1
3. WP-2 and WP-6
4. WP-3
5. WP-4 and WP-5
6. WP-7
7. WP-8 and WP-9
8. WP-10 and WP-11
9. WP-12 throughout

**Estimate:** about 3–4 engineer-weeks. Each WP lands as its own reviewable PR with a completion record.

**Blocked inside Phase 01:** push delivery (D8). The rest of the notification work goes ahead.
