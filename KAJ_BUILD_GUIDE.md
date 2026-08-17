# KAJ — Rajshahi Local Work & Service Marketplace
## Master Build Guide for Codex (or any autonomous coding agent)

> **Working name:** `kaj` (কাজ = "work"). Replace globally if the brand changes.
> **Version:** 1.0 · **Owner:** Abu Sufyan · **Target pilot:** Rajshahi City, Bangladesh
> **This file is the single source of truth.** Codex must re-read the relevant PART before starting any task.

---

## TABLE OF CONTENTS

| Part | Contents |
|---|---|
| **A** | How Codex must use this document (operating rules, session loop, DoD) |
| **B** | Locked technical decisions, repo layout, conventions |
| **C** | Phase 0 — Research & validation deliverables |
| **D** | Domain logic specification (the "brain": state machine, matching, money, trust) |
| **E** | API specification |
| **F** | UI/UX specification (design system + all 52 screens) |
| **G** | Phase-by-phase build instructions (P1 → P14, every task) |
| **H** | Testing strategy (unit → E2E → security → manual QA) |
| **I** | Deployment, infrastructure, and operations |
| **J** | Rajshahi pilot playbook |
| **K** | Copy-paste prompt library for Codex |
| **L** | Master completion checklist |

---
---

# PART A — HOW CODEX MUST USE THIS DOCUMENT

## A1. What this document is

This is a **build contract**, not inspiration. Every task has an ID, an input, an output, a test, and an
acceptance rule. Codex works one task at a time, in order, and stops at each gate.

## A2. Hard operating rules (never violate)

```text
R1.  NEVER generate the whole application in one pass. One task ID per session.
R2.  NEVER invent an API, library, package version, or endpoint. If unsure, stop and ask.
R3.  NEVER hard-code a business rule that PART D marks as "configurable".
R4.  NEVER trust a value sent by the client for money, fees, status, role, or user_id.
R5.  ALL financial math happens server-side, in integer poisha (1 BDT = 100 poisha). No floats.
R6.  NEVER mark a payment successful from a client callback. Only a verified webhook or a
     server-side status poll may move money state.
R7.  NEVER expose exact address, phone number, or ID document before PART D10 allows it.
R8.  NEVER seed or display fake marketplace statistics, fake reviews, or fake worker counts.
R9.  NEVER mark a user "verified" without a stored, admin-approved verification record.
R10. NEVER continue to the next task while any test is failing or any lint error exists.
R11. NEVER delete financial rows. Use soft-delete / reversal entries only.
R12. NEVER add a feature that is not in the current phase scope. Write it to /docs/backlog.md.
R13. EVERY user-facing string goes through i18n. No literal English/Bangla in widgets.
R14. EVERY mutating endpoint is authorized by policy, not by "the frontend hides the button".
R15. EVERY task ends with: tests green → lint green → docs updated → single conventional commit.
```

**Priority order when rules conflict:** `Trust > Reliability > Simplicity > Speed > Features`.

## A3. The per-task session loop

Codex must run this exact loop for every task ID:

```text
1. READ      → this file: PART B + the PART D/E/F sections named in the task
2. RESTATE   → in ≤10 lines: what I will build, files touched, what I will NOT touch
3. PLAN      → list files to create/modify, in order
4. TEST FIRST→ write the failing test(s) listed in the task's "Tests" block
5. IMPLEMENT → minimum code to pass; no speculative abstraction
6. RUN       → unit + affected integration tests; lint; typecheck; build
7. VERIFY    → tick every line of the task's "Acceptance" block, one by one, with evidence
8. DOCUMENT  → update /docs/*.md + CHANGELOG.md + the checklist in PART L
9. COMMIT    → conventional commit, single logical change
10. REPORT   → output: what was built, test results, decisions made, open questions, next task ID
```

**If step 6 fails twice for the same reason → STOP. Report the blocker. Do not "work around" it.**

## A4. Task ID scheme

```text
P<phase>-<module>-<number>       e.g. P3-JOB-04
Modules: INF(infra) AUTH USR TAX(taxonomy) JOB APP(applications) MATCH ASSIGN
         PAY REV(reviews) CHAT NOTIF ADMIN TRUST AI ANALYTICS UI QA
```

## A5. Definition of Done (applies to EVERY task)

```text
[ ] Feature works for the happy path
[ ] Feature fails safely and explicitly for every listed edge case
[ ] Unit tests written and passing (business logic ≥ 90% branch coverage)
[ ] Integration test for every new endpoint (200 + 400 + 401 + 403 + 404 + 409)
[ ] Authorization test: another user's resource returns 403/404, never data
[ ] Input validated with a schema at the boundary (DTO/validator), not inside services
[ ] Errors returned in the PART E standard envelope with an actionable message key
[ ] Strings in en.json AND bn.json; no missing key warnings
[ ] UI: loading, empty, error, offline, and success states all implemented
[ ] UI: works at 320 dp width, 200% font scale, and on a 2 GB RAM Android device
[ ] No secret, key, token, or PII in logs
[ ] OpenAPI/Swagger regenerated; /docs updated; CHANGELOG entry added
[ ] Conventional commit made
```

## A6. Standard prompt Codex receives per task

```text
Read KAJ_BUILD_GUIDE.md PART A, PART B, and the sections listed in task <TASK_ID>.
Execute ONLY task <TASK_ID> using the A3 session loop.
Do not start any other task. Do not refactor unrelated code.
When finished, output the A3 step-10 report.
```

---
---

# PART B — LOCKED TECHNICAL DECISIONS

## B1. Stack (decided — do not re-litigate)

| Layer | Choice | Why this and not the alternative |
|---|---|---|
| Mobile | **Flutter 3.x (stable), Dart 3** | One codebase, excellent low-end Android performance, strong Bangla font rendering |
| State mgmt | **Riverpod 2 (code-gen) + Freezed** | Compile-safe DI, testable without widgets, less boilerplate than Bloc for a 50-screen app |
| Mobile arch | **Feature-first Clean Architecture** (`data/domain/presentation` per feature) | Keeps 50 screens navigable; each feature is independently testable |
| Local cache | **Drift (SQLite)** + `flutter_secure_storage` for tokens | Offline-friendly job feed; secure token storage |
| Backend | **NestJS 10 (TypeScript)** | Same language as admin panel → one hiring pool in Rajshahi; first-class DI, guards, interceptors, queues, WebSockets; Prisma typing removes a whole class of bugs |
| ORM | **Prisma** (+ raw SQL for matching queries) | Type-safe migrations; raw SQL escape hatch for PostGIS-style distance ranking |
| Database | **PostgreSQL 16** (+ `earthdistance`/`cube` or PostGIS in P4) | Relational integrity for money and status history |
| Cache/Queue | **Redis 7** + **BullMQ** | Notifications, matching fan-out, recurring job generation, OTP rate limits |
| Realtime | **Socket.IO (NestJS gateway)** + FCM push | Chat + live job status |
| Storage | **S3-compatible** (start: local MinIO; prod: any S3/Spaces/R2) with signed URLs | Never serve verification docs publicly |
| Admin | **Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + TanStack Query** | Fast internal tooling; shares DTO types with backend |
| Auth | **Phone OTP first**, JWT access (15 min) + rotating refresh (30 d) | BD users have phones, not always email |
| Observability | pino → structured JSON logs, Sentry, `/health` + `/metrics` | Required before pilot |
| CI | GitHub Actions | lint → typecheck → test → build → migrate-check |

> **Rejected:** Laravel (splits the language stack), Firebase-only backend (matching/ledger logic and
> reporting become painful and lock-in is high), MongoDB (money + status history need transactions
> and joins), GraphQL for v1 (extra complexity, no client-shape problem yet).

## B2. Monorepo layout

```text
kaj/
├── mobile/                     # Flutter app
│   ├── lib/
│   │   ├── main.dart
│   │   ├── app.dart
│   │   ├── core/               # errors, network, result type, extensions, utils
│   │   ├── config/             # env, flavors, feature flags
│   │   ├── routing/            # go_router config + guards
│   │   ├── theme/              # design tokens, typography, component themes
│   │   ├── l10n/               # en.arb, bn.arb, generated
│   │   ├── shared/             # reusable widgets: KajButton, KajCard, EmptyState...
│   │   └── features/
│   │       ├── auth/           # data/ domain/ presentation/
│   │       ├── onboarding/
│   │       ├── home/
│   │       ├── taxonomy/
│   │       ├── jobs/
│   │       ├── applications/
│   │       ├── matching/
│   │       ├── assignment/
│   │       ├── schedule/
│   │       ├── availability/
│   │       ├── chat/
│   │       ├── payments/
│   │       ├── reviews/
│   │       ├── notifications/
│   │       ├── verification/
│   │       ├── disputes/
│   │       └── profile/
│   └── test/  integration_test/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── main.ts  app.module.ts
│   │   ├── common/             # filters, guards, interceptors, decorators, pipes
│   │   ├── config/             # zod-validated env config
│   │   ├── infra/              # prisma, redis, queue, storage, sms, push, payment adapters
│   │   └── modules/            # auth users profiles taxonomy locations jobs applications
│   │                           # matching assignments availability payments payouts reviews
│   │                           # messaging notifications verification disputes moderation
│   │                           # subscriptions analytics admin webhooks
│   ├── prisma/                 # schema.prisma, migrations/, seed.ts
│   └── test/                   # e2e
├── admin/                      # Next.js admin panel
├── packages/
│   └── shared-types/           # DTOs + enums shared by backend & admin
├── docs/                       # ALL documents from PART C and beyond
├── infrastructure/             # docker-compose, Dockerfiles, nginx, CI, IaC
├── .github/workflows/
├── README.md  CONTRIBUTING.md  SECURITY.md  CHANGELOG.md
└── KAJ_BUILD_GUIDE.md          # this file
```

## B3. Naming & code conventions

```text
Database        snake_case tables (plural), snake_case columns, PK = id (uuid v7)
                FK = <entity>_id, timestamps = created_at/updated_at/deleted_at
API             kebab-case paths, camelCase JSON bodies, /api/v1 prefix
TypeScript      PascalCase classes, camelCase vars, SCREAMING_SNAKE enums values
Dart            PascalCase classes, lowerCamelCase members, snake_case file names
Money           ALWAYS integer poisha, field suffix `_poisha` (e.g. budget_min_poisha)
Time            ALWAYS store UTC timestamptz; display in Asia/Dhaka (UTC+6)
Enums           Defined ONCE in prisma/schema.prisma → generated into shared-types → mirrored
                in Dart via a generator script (never hand-typed twice)
Commits         feat|fix|chore|docs|test|refactor(scope): message   e.g. feat(jobs): add draft state
Branches        feat/P3-JOB-04-create-job-endpoint
```

## B4. Environment variables (create `.env.example`, never commit `.env`)

```env
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://kaj:kaj@localhost:5432/kaj
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=            # 32+ random bytes
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=60
SMS_PROVIDER=console           # console | <provider> — adapter pattern, see P1-INF-06
S3_ENDPOINT=  S3_BUCKET=  S3_KEY=  S3_SECRET=  S3_REGION=
FCM_SERVICE_ACCOUNT_JSON_PATH=
SENTRY_DSN=
PAYMENT_PROVIDER=manual        # manual | <provider> — see PART D6
PLATFORM_FEE_DEFAULT_BPS=800   # 8.00% — configurable in admin, this is only the bootstrap value
DEFAULT_TIMEZONE=Asia/Dhaka
DEFAULT_LOCALE=bn
```

## B5. Feature flags (DB table `feature_flags`, cached in Redis)

Every post-MVP capability ships behind a flag, defaulted OFF:

```text
payments_enabled            chat_enabled              checkin_enabled
recurring_jobs_enabled      business_module_enabled   ai_job_parsing_enabled
ai_price_hint_enabled       subscriptions_enabled     featured_jobs_enabled
worker_rates_customer       disputes_enabled          referral_enabled
```

---
---

# PART C — PHASE 0: RESEARCH & VALIDATION (no code yet)

**Gate:** No code may be written until every C-deliverable exists in `/docs` and is marked
`STATUS: reviewed` by the human owner.

## C1. Task P0-RES-01 — Competitor study → `/docs/competitor-analysis.md`

Study, at minimum: **Bangladesh** — InstaJob/InstaHire, ProGo, Shomvob, WorkUp BD, MicroJob,
Ajkerkaj, Bazarey Jobs, BDPartTimeJob, Sheba.xyz, HandyMama, Bdjobs, Chakri.com, Kaj Ki Kaj,
plus informal channels (Facebook Marketplace, "Rajshahi Job Circular" style groups, RUET/RU
student groups, coaching-centre tutor boards, local staffing brokers).
**International** — TaskRabbit, Thumbtack, Instawork, Wonolo, Upwork, Fiverr, Indeed, LinkedIn,
Urban Company, Airbnb (trust model only), Uber (dispatch model only).

For each, fill this exact table (one table per competitor):

```markdown
| Field | Value | Evidence/Source | Confidence (H/M/L) |
|---|---|---|---|
| Target users | | | |
| Geography | | | |
| Categories | | | |
| Job types supported | | | |
| Business model | | | |
| Commission / pricing | | | |
| Subscriptions | | | |
| Verification depth | | | |
| Matching method | | | |
| Worker onboarding steps | | | |
| Customer onboarding steps | | | |
| Payment methods | | | |
| Escrow / payment protection | | | |
| Review model (1-way / 2-way) | | | |
| Dispute process | | | |
| Location features | | | |
| Scheduling / recurring | | | |
| Check-in / attendance | | | |
| Cancellation policy | | | |
| Safety features | | | |
| Admin/ops visibility | | | |
| Mobile UX notes | | | |
| Bangla support | | | |
| Strengths (3) | | | |
| Weaknesses (3) | | | |
| Known tech stack | | | |
| Growth strategy | | | |
```

**Rules:** cite a URL or "observed in app on <date>" for every row. Mark anything unverified as
`ASSUMPTION`. Never state a commission rate you did not see published.

## C2. Task P0-RES-02 — Gap matrix → append to `/docs/competitor-analysis.md`

```markdown
| Capability | InstaHire | ProGo | Shomvob | Sheba | TaskRabbit | Instawork | Thumbtack | KAJ (planned) |
|---|---|---|---|---|---|---|---|---|
```
Rows: local physical jobs · household services · student jobs · hourly work · shop/retail shifts ·
recurring schedules · full-time recruitment · digital/remote work · availability-aware matching ·
distance-aware matching · AI/NL job creation · Bangla-first UX · verified identity · worker rating ·
**customer rating** · payment held until completion · dispute resolution · check-in/check-out ·
attendance export · repeat-hire one tap · business workforce dashboard · low-end device performance.

Score each cell `Yes / Partial / No / Unknown`.

## C3. Task P0-RES-03 — Rajshahi market analysis → `/docs/market-research.md`

Required sections, each with a number and a source (survey, interview, or public data — never a
guessed figure):
1. Population & student population (RUET, University of Rajshahi, Rajshahi College, RMC, private
   universities, coaching centres) — with source.
2. Density map of target areas: RUET/Talaimari/Kazla/Binodpur, Motihar, Shaheb Bazar, Laxmipur,
   Court, Boalia, Uposhohor, Padma Residential Area, Hetem Khan, Katakhali, Novotheatre area.
3. Business census sample: number of restaurants/retail/pharmacies/diagnostics/coaching centres
   observed in 3 chosen zones (walk-count is acceptable evidence; label it as such).
4. Current hiring behaviour: how a Shaheb Bazar shop owner finds a temporary helper **today**.
5. Current earning behaviour: how a RUET student finds tutoring/design work **today**.
6. Price reality: observed rates for tutoring, shop-assistant shifts, electrician visits, cleaning,
   poster design, event photography. Ranges only, with sample size.
7. Payment reality: bKash/Nagad/Rocket penetration, cash-on-completion norms, trust concerns.
8. Connectivity & devices: typical phone tier, data plan behaviour.
9. Seasonality: exam periods, semester breaks, Ramadan, Eid, wedding season, monsoon.

## C4. Task P0-RES-04 — Problem validation → `/docs/validation.md`

Minimum evidence before Phase 1 is approved:
```text
[ ] 20 worker-side interviews (12 students, 4 skilled tradespeople, 4 others)
[ ] 15 demand-side interviews (6 households, 6 shops/restaurants, 3 offices/organizers)
[ ] 5 "concierge" transactions manually brokered over WhatsApp/Messenger with NO app
[ ] Documented: how long it took, what broke, who did not show up, how payment happened
[ ] Willingness-to-pay statement from both sides, in their own words
```
Interview guide (ask, do not pitch): last time you needed help → what did you do → how long →
what went wrong → what did you pay → what would make you trust a stranger → what would make you
never use this again.

## C5. Task P0-RES-05 — Personas → `/docs/user-personas.md`

Six personas, each with: name, age, location, device, monthly income, digital comfort (1–5),
Bangla/English preference, goal, current workaround, top 3 anxieties, trigger to try KAJ,
trigger to quit, quote.
Required set: **Rahim** (RUET 3rd-year, wants evening design work) · **Shirin** (housewife,
Uposhohor, needs a trusted cleaner) · **Jamal** (Shaheb Bazar shop owner, needs evening helper) ·
**Nasrin** (SSC tutor seeker's mother) · **Babul** (electrician, 38, low literacy, feature-phone
graduate) · **Tanvir** (café manager, needs 3 staff for Friday shifts, repeatedly).

## C6. Task P0-RES-06 — Ten differentiation gaps → `/docs/opportunity-map.md`

Starting hypotheses (validate or kill each with C4 evidence — do not accept them blindly):

```text
G1  Availability-aware matching: nobody matches "free 6–10 PM on Sun/Tue" to a shift.
G2  Two-sided reputation: customers are never rated in BD platforms → workers get abused/ghosted.
G3  Recurring local shifts: weekly cleaner / daily 5–9 PM cashier is unserved by gig apps.
G4  Distance-first ranking in a mid-size city (everything is <6 km; travel time is the real cost).
G5  Bangla-first, low-literacy UX (icon+voice+Bangla numerals), not an English app with a toggle.
G6  Payment-held-until-completion for small amounts, where cash disputes are the norm.
G7  Student-safe work: verified employer, defined scope, defined pay, reportable.
G8  Repeat-hire as the core loop, not one-off search (liquidity from relationships).
G9  Business workforce lite: attendance + shift roster for a 4-person shop, no ERP.
G10 Honest trust signals: completion %, punctuality, no-show count — instead of a stars-only score.
G11 Offline-tolerant flows: apply/queue actions on a 2G connection without duplicate submissions.
G12 Ops-first admin: a human can rescue any stuck job (this is what makes an MVP marketplace work).
```

## C7. Task P0-RES-07 — MVP definition → `/docs/product-requirements.md`

**IN the MVP (Phases 1–8 of PART G):**
```text
Phone-OTP auth · one account, switchable role (customer ⇄ worker) · profile + skills + availability
· category & location taxonomy · create job (form) · job feed + filters · rule-based matching &
"Jobs for you" · apply / accept / decline · customer selects worker · confirmation + contract record
· job state machine to COMPLETED · in-app chat scoped to a job · push + in-app notifications ·
two-sided reviews · basic reliability badges · admin panel (users, jobs, verification, moderation,
categories, locations, disputes-lite) · Bangla + English · manual/cash payment recording with a
completion confirmation step.
```

**NOT in the MVP (explicitly deferred, with reason):**
```text
Online payments/escrow  → needs a validated transaction volume + legal review (Phase 9)
Subscriptions & featured jobs → monetize after liquidity (Phase 9+)
AI natural-language job creation → after the structured form proves the field set (Phase 12)
ML ranking / price prediction → needs ≥1,000 completed jobs of training data (Phase 12)
Business workforce dashboard → after 30 businesses repeat-hire manually (Phase 11)
Full-time recruitment module → different funnel; do not dilute the core loop (Phase 11)
Check-in/check-out GPS → after disputes prove it's needed (Phase 10, flagged)
Video/voice calling, worker insurance, background checks, multi-city, iOS-first polish, web app
```
Rule: if a proposed feature does not increase **fill rate, completion rate, or repeat-hire rate**,
it goes to `/docs/backlog.md`.

## C8. Task P0-RES-08 — Business model & risks → `/docs/business-model.md`, `/docs/risks.md`

Business model doc must contain: revenue lines (transaction fee, worker subscription, business
subscription, featured jobs, recruitment fee, verification), a unit-economics sheet with **variables
not constants** (`avg_job_value`, `take_rate`, `jobs_per_customer_per_month`, `CAC`, `payment_cost`),
and three scenarios (pessimistic / base / optimistic).

Risks doc must contain at least: cold-start liquidity failure · disintermediation (users take the
deal off-platform) · no-shows destroying trust · payment disputes · safety incident involving a
student or a household · legal/regulatory ambiguity on worker classification · fake accounts ·
a single-founder bus factor. Each with likelihood, impact, early-warning metric, mitigation.

---
---

# PART D — DOMAIN LOGIC SPECIFICATION

> This is the part Codex must never improvise. Every rule below has a home in code.

## D1. Glossary (use these exact words everywhere: code, UI, docs)

| Term | Meaning |
|---|---|
| **Job** | A unit of work posted by a *poster*. Has type, schedule, budget, location. |
| **Poster** | The account acting as demand side for a job (household, shop, business, person). |
| **Worker** | The account acting as supply side. |
| **Application** | A worker's expression of interest; may include a proposed price. |
| **Assignment** | A confirmed worker↔job link. Exactly one per worker slot. |
| **Contract** | Immutable snapshot of agreed terms at confirmation time. |
| **Occurrence** | One dated instance generated from a recurring job. |
| **Work session** | Check-in→check-out record for an occurrence. |
| **Fee** | Platform revenue on a transaction, in poisha, computed server-side. |
| **Trust level** | Verification tier: `NONE → PHONE → IDENTITY → SKILL → BUSINESS`. |

## D2. Data model (Prisma sketch — Codex expands, never contradicts)

Core enums:
```prisma
enum UserStatus     { ACTIVE SUSPENDED BANNED PENDING_DELETION }
enum RoleMode       { CUSTOMER WORKER BUSINESS }
enum TrustLevel     { NONE PHONE IDENTITY SKILL BUSINESS }
enum JobType        { ONE_TIME HOURLY DAILY WEEKLY RECURRING MONTHLY_PART_TIME FULL_TIME PROJECT SERVICE_BOOKING }
enum PaymentModel   { FIXED HOURLY DAILY MONTHLY NEGOTIABLE }
enum JobStatus      { DRAFT PUBLISHED APPLICATIONS_OPEN WORKER_SELECTED CONFIRMATION_PENDING
                      CONFIRMED UPCOMING CHECKED_IN IN_PROGRESS SUBMITTED CUSTOMER_REVIEW
                      COMPLETED PAYMENT_RELEASED REVIEWED EXPIRED CANCELLED_BY_CUSTOMER
                      CANCELLED_BY_WORKER DISPUTED SUSPENDED }
enum ApplicationStatus { PENDING SHORTLISTED WITHDRAWN REJECTED ACCEPTED EXPIRED }
enum UrgencyLevel   { FLEXIBLE NORMAL URGENT }
enum VerificationStatus { NOT_SUBMITTED PENDING APPROVED REJECTED EXPIRED }
enum PaymentStatus  { NONE PENDING HELD RELEASED REFUNDED PARTIALLY_REFUNDED FAILED }
```

Tables (minimum set — create all in P1/P2, even if some columns fill later):
```text
users(id, phone_e164 UNIQUE, email?, password_hash?, status, default_locale, timezone,
      last_active_at, created_at, updated_at, deleted_at)
user_devices(id, user_id, fcm_token, platform, app_version, last_seen_at)
refresh_tokens(id, user_id, token_hash, device_id, expires_at, revoked_at)
otp_challenges(id, phone_e164, code_hash, purpose, attempts, expires_at, consumed_at)
profiles(id, user_id UNIQUE, display_name, photo_key, bio, gender?, birth_year?,
         primary_location_id, lat, lng, trust_level, locale)
worker_profiles(id, user_id UNIQUE, headline, service_radius_km, hourly_rate_poisha,
                daily_rate_poisha, monthly_rate_poisha, experience_years, education,
                transport_mode, is_available_now, accepts_urgent, completed_jobs_count,
                rating_avg, rating_count, response_rate_bps, completion_rate_bps,
                cancellation_rate_bps, no_show_count, reliability_score, last_active_at)
customer_profiles(id, user_id UNIQUE, jobs_posted_count, rating_avg, rating_count,
                  payment_reliability_bps, cancellation_count)
business_profiles(id, user_id, business_name, trade_licence_no?, address, location_id,
                  verification_status, contact_person, employees_count)
skills(id, slug UNIQUE, name_en, name_bn, category_id, is_active)
user_skills(id, user_id, skill_id, level, years, is_verified, verified_at)     -- UNIQUE(user_id,skill_id)
categories(id, parent_id?, slug UNIQUE, name_en, name_bn, icon, sort_order, is_active,
           requires_manual_approval, min_age, requires_certificate)
locations(id, parent_id?, type[CITY|THANA|AREA], name_en, name_bn, lat, lng, radius_km, is_active)
service_areas(id, user_id, location_id, radius_km)
jobs(id, poster_user_id, title, description, category_id, subcategory_id?, job_type, payment_model,
     budget_min_poisha, budget_max_poisha, is_negotiable, currency='BDT',
     location_id, area_label, exact_address_encrypted, lat, lng,
     starts_at, ends_at, duration_minutes, workers_required, workers_filled,
     experience_min_years, urgency, status, published_at, expires_at, filled_at, completed_at,
     applications_count, views_count, is_featured, recurrence_rule?, parent_job_id?,
     created_at, updated_at, deleted_at)
job_skills(job_id, skill_id, is_required)
job_schedules(id, job_id, day_of_week?, date?, start_time, end_time)          -- recurring support
job_status_history(id, job_id, from_status, to_status, actor_user_id?, actor_type, reason, created_at)
applications(id, job_id, worker_user_id, status, message, proposed_price_poisha?,
             match_score, created_at, responded_at, withdrawn_at)             -- UNIQUE(job_id,worker_user_id)
assignments(id, job_id, worker_user_id, application_id, agreed_price_poisha, agreed_starts_at,
            agreed_ends_at, status, confirmed_at, cancelled_at, cancel_reason)
contracts(id, assignment_id UNIQUE, snapshot_json, platform_fee_poisha, worker_earning_poisha,
          cancellation_policy_json, created_at)
availability_rules(id, user_id, day_of_week, start_time, end_time, is_active)
availability_exceptions(id, user_id, starts_at, ends_at, reason)              -- unavailable blocks
work_sessions(id, assignment_id, checkin_at, checkin_lat, checkin_lng, checkin_photo_key?,
              checkout_at, checkout_lat, checkout_lng, minutes_worked, verified_by)
payments(id, job_id, assignment_id, payer_user_id, amount_poisha, fee_poisha, status,
         method, provider_ref, idempotency_key UNIQUE, created_at, updated_at)
ledger_entries(id, payment_id?, account_type, account_ref, direction[DEBIT|CREDIT],
               amount_poisha, currency, memo, created_at)                     -- append-only
payouts(id, worker_user_id, amount_poisha, status, method, provider_ref, requested_at, paid_at)
wallets(id, user_id UNIQUE, available_poisha, pending_poisha, updated_at)
reviews(id, job_id, assignment_id, reviewer_user_id, reviewee_user_id, direction[C2W|W2C],
        rating, punctuality?, quality?, communication?, reliability?, comment, is_visible,
        created_at)                                                            -- UNIQUE(assignment_id,reviewer_user_id)
conversations(id, job_id?, created_at)
conversation_participants(conversation_id, user_id, last_read_at, is_muted)
messages(id, conversation_id, sender_user_id, type[TEXT|IMAGE|SYSTEM], body, attachment_key?,
         created_at, deleted_at)
notifications(id, user_id, type, title_key, body_key, payload_json, read_at, created_at)
notification_preferences(user_id, channel, type, is_enabled, quiet_hours_start, quiet_hours_end)
verification_requests(id, user_id, kind[PHONE|IDENTITY|SKILL|BUSINESS], status, documents_json,
                      reviewer_user_id?, reviewed_at, rejection_reason)
documents(id, user_id, kind, storage_key, mime, size_bytes, is_sensitive, created_at)
disputes(id, job_id, assignment_id, opened_by_user_id, reason_code, description, status,
         resolution, resolved_by, resolved_at, refund_poisha)
dispute_evidence(id, dispute_id, user_id, kind, storage_key?, text?, created_at)
reports(id, reporter_user_id, target_type, target_id, reason_code, description, status)
moderation_actions(id, admin_user_id, target_type, target_id, action, reason, expires_at, created_at)
badges(id, slug, name_en, name_bn, rule_json, icon)
user_badges(user_id, badge_id, granted_at, revoked_at)
saved_searches(id, user_id, filters_json, notify, created_at)
favorites(id, user_id, target_user_id, note)
feature_flags(key PRIMARY, is_enabled, rollout_percent, payload_json)
config_settings(key PRIMARY, value_json, updated_by, updated_at)   -- fees, weights, policies
audit_logs(id, actor_user_id?, action, entity, entity_id, before_json, after_json, ip, ua, created_at)
```

**Index requirements (P2-INF task):**
```sql
CREATE INDEX ON jobs (status, published_at DESC);
CREATE INDEX ON jobs (category_id, status);
CREATE INDEX ON jobs (location_id, status);
CREATE INDEX ON jobs USING gist (ll_to_earth(lat, lng));     -- distance search
CREATE INDEX ON applications (worker_user_id, status);
CREATE INDEX ON applications (job_id, status);
CREATE INDEX ON job_status_history (job_id, created_at);
CREATE UNIQUE INDEX ON payments (idempotency_key);
CREATE INDEX ON messages (conversation_id, created_at DESC);
CREATE INDEX ON notifications (user_id, read_at, created_at DESC);
```

## D3. Job state machine (authoritative)

Only the transitions in this table may exist. Implement as a single `JobStateMachine` service with
a `transition(job, to, actor, reason)` method that (a) validates, (b) writes `job_status_history`
inside the same DB transaction, (c) emits a domain event. **No service may set `job.status` directly.**

| From | To | Allowed actor | Guard conditions |
|---|---|---|---|
| — | DRAFT | poster | — |
| DRAFT | PUBLISHED | poster | all required fields valid; poster trust ≥ PHONE; not banned |
| PUBLISHED | APPLICATIONS_OPEN | system | immediately after matching fan-out completes |
| APPLICATIONS_OPEN | WORKER_SELECTED | poster | ≥1 application with status PENDING/SHORTLISTED |
| WORKER_SELECTED | CONFIRMATION_PENDING | system | assignment row created |
| CONFIRMATION_PENDING | CONFIRMED | worker | worker accepts within `confirm_window_minutes` (config, default 120) |
| CONFIRMATION_PENDING | APPLICATIONS_OPEN | system/worker | worker declines or window expires → reopen, notify poster |
| CONFIRMED | UPCOMING | system | `now >= starts_at - 24h` |
| UPCOMING | CHECKED_IN | worker | flag `checkin_enabled`; within `starts_at ± 60 min`; within geofence radius (config 300 m) |
| UPCOMING / CHECKED_IN | IN_PROGRESS | worker/system | at `starts_at`, or immediately after check-in |
| IN_PROGRESS | SUBMITTED | worker | worker marks work done (+ optional photo) |
| SUBMITTED | CUSTOMER_REVIEW | system | automatic; starts `auto_confirm_hours` timer (config 48) |
| CUSTOMER_REVIEW | COMPLETED | poster / system | poster confirms, or timer expires without a dispute |
| CUSTOMER_REVIEW | DISPUTED | poster/worker | dispute opened before timer expiry |
| COMPLETED | PAYMENT_RELEASED | system | payments off → immediate; payments on → release job runs |
| PAYMENT_RELEASED | REVIEWED | system | both reviews submitted OR `review_window_days` (7) elapsed |
| PUBLISHED / APPLICATIONS_OPEN | EXPIRED | system | `now > expires_at` and no assignment |
| any pre-IN_PROGRESS | CANCELLED_BY_CUSTOMER | poster | cancellation policy applied (D8) |
| any pre-IN_PROGRESS | CANCELLED_BY_WORKER | worker | cancellation policy applied (D8) |
| any | SUSPENDED | admin | moderation action recorded |
| DISPUTED | COMPLETED / CANCELLED_* | admin | resolution recorded, ledger balanced |

**Invariants tested in unit tests:**
```text
I1. transition() rejects any pair not in the table → throws InvalidTransitionError (409)
I2. every successful transition writes exactly one job_status_history row
I3. status change + history write + side-effect event are in ONE transaction
I4. terminal states (REVIEWED, EXPIRED, CANCELLED_*) accept no outgoing transition except by admin
I5. workers_filled never exceeds workers_required
I6. a job cannot reach COMPLETED without an assignment
I7. concurrent double-accept of the last slot → exactly one succeeds (row lock / unique constraint)
```

## D4. Availability engine

```text
INPUT : worker availability_rules (weekly), availability_exceptions (absolute blocks),
        existing assignments (CONFIRMED/UPCOMING/IN_PROGRESS), job window [starts_at, ends_at]
OUTPUT: AvailabilityResult { isAvailable: bool, coverage: 0.0–1.0, conflicts: [...] }

ALGORITHM
1. Convert job window to Asia/Dhaka local time; split across day boundaries if needed.
2. For each local day-slice:
     a. find matching availability_rules for that day_of_week
     b. compute overlap_minutes(rule_window, slice_window)
3. coverage = total_overlap_minutes / total_job_minutes
4. Subtract any availability_exceptions overlapping the window → recompute coverage.
5. Hard conflict: any existing assignment overlapping the window (±travel_buffer_minutes,
   config default 30) → isAvailable = false, conflict listed.
6. isAvailable = (coverage >= min_coverage) AND no hard conflict.  min_coverage config = 1.0 for
   HOURLY/DAILY jobs, 0.6 for PROJECT/flexible jobs, ignored for job_type = PROJECT with no fixed time.

EDGE CASES (must be unit-tested)
- rule crossing midnight (22:00–02:00)
- job crossing midnight
- DST: none in Bangladesh — assert timezone offset is fixed +06:00, no DST math
- worker with zero rules → treated as "unknown availability": coverage = null, ranked lower,
  never hard-excluded (do not punish new workers into invisibility)
- recurring job: evaluate the NEXT 4 occurrences; require availability for ≥3 of them
```

## D5. Matching engine (V1 — deterministic, explainable)

**Two directions, one scorer:**
`rankWorkersForJob(job) → Worker[]` (used at publish, for notifications and for the poster's
"Suggested workers") and `rankJobsForWorker(worker) → Job[]` (used for the "Jobs for you" feed).

```text
STEP 1 — HARD FILTERS (SQL, cheap, must eliminate before scoring)
   job.status IN (PUBLISHED, APPLICATIONS_OPEN)
   worker.status = ACTIVE AND NOT banned/suspended
   worker.user_id != job.poster_user_id
   distance_km(worker.home, job.location) <= MIN(worker.service_radius_km, job.max_worker_radius_km ?? 25)
   worker has ≥1 of job's REQUIRED skills (if job has required skills)
   no hard availability conflict (D4 step 5)
   worker not already rejected/withdrawn on this job
   category policy satisfied (age, certificate, trust_level — see D11)

STEP 2 — COMPONENT SCORES (each normalised to 0..1)
   skillScore        = 0.7 * (matched_required / total_required)
                     + 0.3 * (matched_optional / max(total_optional,1))
                     ; if job has no skills → 0.5 (neutral)
   locationScore     = clamp(1 - (distance_km / effective_radius_km), 0, 1)
   availabilityScore = coverage from D4 ; null → 0.5 (neutral, flagged "unknown")
   budgetScore       = 1                      if worker rate within [budget_min, budget_max]
                     = clamp(1 - (rate - budget_max)/budget_max, 0, 1)   if rate above
                     = 0.9                    if rate below (cheap is fine but slightly suspicious)
                     = 0.5                    if either side has no rate
   experienceScore   = clamp(worker.experience_years / max(job.experience_min_years, 3), 0, 1)
   ratingScore       = worker.rating_count == 0 ? 0.6 (new-worker prior)
                     : (worker.rating_avg - 1) / 4          // 1..5 → 0..1
   reliabilityScore  = 0.5*completion_rate + 0.3*(1 - cancellation_rate) + 0.2*(1 - no_show_rate)
                     ; new worker (0 jobs) → 0.6 prior
   responseScore     = response_rate_bps / 10000 ; new worker → 0.6

STEP 3 — WEIGHTED SUM (weights live in config_settings key 'matching.weights', admin-editable)
   default weights: skill .30 | location .15 | availability .15 | budget .10 |
                    experience .10 | rating .10 | reliability .10   (must sum to 1.00 — validated)
   base = Σ(weight_i * score_i)

STEP 4 — MODIFIERS (multiplicative, capped)
   × 1.10 if worker previously completed a job for this poster (repeat-hire boost)
   × 1.05 if worker.trust_level >= IDENTITY
   × 1.05 if worker is_available_now AND job.urgency = URGENT
   × 0.85 if worker has ≥3 pending applications with no response in 48h (spam damping)
   × 0.90 if worker active applications > config 'matching.max_active_applications' (default 10)
   ×      freshness: new workers with 0 jobs get a +0.05 flat "exploration bonus" on 20% of feeds
          (epsilon-greedy; documented, disable-able) — this is how supply gets its first job
   final = clamp(base * modifiers, 0, 1)

STEP 5 — OUTPUT
   matchScore = round(final * 100)          // integer 0..100, shown as "94% Match"
   reasons[]  = top 3 contributing components, as i18n keys, e.g.
                ["match.reason.skill_exact", "match.reason.distance_1_8km", "match.reason.free_now"]
   PERSIST the score + reasons on the application/feed-impression row for later analysis.

STEP 6 — NOTIFICATION FAN-OUT (BullMQ job, not inline)
   notify top N workers where N = config 'matching.notify_top_n' (default 15)
   AND matchScore >= config 'matching.notify_min_score' (default 55)
   respect notification preferences + quiet hours (D11)
   never notify the same worker about the same job twice
```

**Explainability rule:** every score shown to a user must be reproducible from stored data. Write
`GET /api/v1/matches/:jobId/explain/:workerId` (admin-only) returning every component and weight.

## D6. Money model

```text
UNIT      integer poisha. 500 BDT = 50000. No floats anywhere, including JSON.
ROUNDING  banker's rounding to nearest poisha at the LAST step only.
FEES      fee_poisha = clamp(round(amount * fee_bps / 10000), min_fee_poisha, max_fee_poisha)
          fee_bps, min_fee_poisha, max_fee_poisha come from config_settings and may be
          overridden per category and per subscription tier. Resolution order:
          user_override → subscription_tier → category → global default.
WHO PAYS  configurable: 'customer' | 'worker' | 'split'. MVP default: worker-side, shown
          transparently ("You earn ৳460 of ৳500"). Never hide the fee.
```

**Payment states and the ledger (double-entry, append-only):**
```text
Accounts: CUSTOMER_WALLET, WORKER_WALLET, PLATFORM_FEE, PLATFORM_ESCROW, PROVIDER_CLEARING

Flow (payments_enabled = true):
  charge      DEBIT CUSTOMER_WALLET  amount     / CREDIT PLATFORM_ESCROW amount     → status HELD
  release     DEBIT PLATFORM_ESCROW  amount     / CREDIT WORKER_WALLET  (amount-fee)
                                                / CREDIT PLATFORM_FEE   fee          → RELEASED
  refund      DEBIT PLATFORM_ESCROW  refund     / CREDIT CUSTOMER_WALLET refund      → REFUNDED
  payout      DEBIT WORKER_WALLET    amount     / CREDIT PROVIDER_CLEARING amount

INVARIANT (asserted by a nightly reconciliation job and by a test):
  SUM(debits) == SUM(credits) for every payment_id AND globally.
```

**Non-negotiable payment rules:**
```text
M1. Every write path takes an Idempotency-Key header; duplicate key returns the FIRST result.
M2. Provider webhooks verify signature + timestamp; replayed events are no-ops.
M3. A payment never transitions backwards except via an explicit REFUND entry.
M4. The client never sends amount/fee. It sends job_id + assignment_id only.
M5. Until payments_enabled, use method = CASH_ON_COMPLETION: no money moves, but a payments row
    with status NONE→PENDING→RELEASED is still created so reporting and later migration work.
M6. Payouts require worker trust_level >= IDENTITY.
M7. All payment mutations write an audit_log row.
```

## D7. Reputation & reliability

```text
rating_avg           = mean of visible reviews (Bayesian-damped for small n):
                       damped = (C*m + Σratings) / (C + n), C = 5 prior weight, m = 4.0 prior mean
                       Show raw average AND count; use damped value for ranking only.
completion_rate_bps  = completed_assignments / (completed + cancelled_by_self + no_shows)
cancellation_rate_bps= cancelled_by_self / total_assignments
response_rate_bps    = applications_responded_within_24h / invitations_received
no_show_count        = assignments where status reached UPCOMING and never IN_PROGRESS with no
                       poster-accepted excuse
reliability_score    = 0..100 internal, NEVER shown as a bare number.
                       Shown as badges + plain facts: "38 jobs · 97% completed · usually replies in 2h"
```

**Review rules:**
```text
RV1. Reviews unlock only at COMPLETED; window = 7 days.
RV2. Double-blind: neither side sees the other's review until both submit OR the window closes.
RV3. Both directions required for the pair to count toward rating_count.
RV4. Rating 1–5 + optional sub-scores (worker: punctuality/quality/communication/reliability;
     customer: payment reliability/communication/accuracy/professionalism).
RV5. A review may be hidden by admin (is_visible=false) with a moderation_actions row — never deleted.
RV6. One review per reviewer per assignment (unique constraint).
```

**Badges (objective rules only, stored in `badges.rule_json`, evaluated by a nightly job):**
```text
new_worker         jobs_completed < 3 AND account_age < 30d
verified           trust_level >= IDENTITY
reliable           jobs_completed >= 10 AND completion_rate >= 95%
top_rated          jobs_completed >= 20 AND damped_rating >= 4.7
fast_responder     median first response < 60 min over last 20 invitations
skilled_pro        >=1 verified skill AND jobs_completed >= 15 in that skill's category
student_worker     verified student status (institution email or ID card approved)
business_verified  business trade licence approved
```

## D8. Cancellation policy engine (configurable, `config_settings['cancellation.policy']`)

```json
{
  "tiers": [
    { "minHoursBefore": 24, "customerPenalty": "none",     "workerPenalty": "none",
      "refund": "full" },
    { "minHoursBefore": 6,  "customerPenalty": "warning",  "workerPenalty": "reliability_-2",
      "refund": "full" },
    { "minHoursBefore": 2,  "customerPenalty": "fee_25pct","workerPenalty": "reliability_-5",
      "refund": "partial_75" },
    { "minHoursBefore": 0,  "customerPenalty": "fee_50pct","workerPenalty": "reliability_-10, strike",
      "refund": "partial_50" }
  ],
  "emergencyReasonCodes": ["ILLNESS","ACCIDENT","BEREAVEMENT","NATURAL_EVENT"],
  "emergencyBehaviour": "no_penalty_pending_admin_review",
  "strikesBeforeSuspension": 3,
  "strikeWindowDays": 60
}
```
Rules: an emergency reason suspends the penalty and creates an admin review item — it does not
auto-forgive. Repeated emergency claims (>2 in 60 d) are flagged. Penalties are always shown to the
user **before** they confirm the cancellation.

## D9. Dispute workflow

```text
OPEN (either party, from SUBMITTED/CUSTOMER_REVIEW/COMPLETED within dispute_window_days = 7)
 → job.status = DISPUTED, payment frozen (no release)
 → reason_code ∈ {NOT_COMPLETED, POOR_QUALITY, NO_SHOW, OVERCHARGED, UNSAFE_CONDITIONS,
                  DIFFERENT_SCOPE, PAYMENT_NOT_RECEIVED, HARASSMENT, OTHER}
EVIDENCE window 48h each side: photos, messages (auto-attached), check-in data, contract snapshot
ADMIN REVIEW: sees both sides, contract snapshot, chat transcript, history, both reputations
DECISION ∈ {RELEASE_FULL, RELEASE_PARTIAL(amount), REFUND_FULL, REFUND_PARTIAL(amount), SPLIT}
 → writes ledger entries, resolution text, notifies both, may trigger moderation_actions
APPEAL: one appeal per dispute within 72h, escalates to a second admin.
SLA target: first admin response < 24h, resolution < 72h. Track and report both.
```

## D10. Privacy & field-exposure matrix

| Field | Public feed | Applicant→Poster | Poster→Applicant | After CONFIRMED | Admin |
|---|---|---|---|---|---|
| Display name | first name + initial | full | full | full | full |
| Photo | yes | yes | yes | yes | yes |
| Phone number | never | never | never | **masked relay or revealed 2h before start** | yes (audited) |
| Exact address | never | never | never | yes (worker only) | yes (audited) |
| Area label ("near Talaimari") | yes | yes | yes | yes | yes |
| GPS coordinates | rounded to ~500 m | rounded | rounded | exact | exact |
| ID documents | never | never | never | never | yes (audited, watermarked) |
| Rating / job counts | yes | yes | yes | yes | yes |
| Availability windows | coarse ("evenings") | exact | — | exact | exact |
| Chat content | never | — | — | participants only | on dispute only (audited) |

Additional rules: every admin view of a sensitive field writes an `audit_logs` row. Data export and
account deletion endpoints exist from P1 (`GET /me/export`, `DELETE /me` → 30-day soft delete).
Retention: verification documents deleted 90 days after approval; chat retained 12 months.

## D11. Notification matrix

| Event | Recipient | Channels | Throttle |
|---|---|---|---|
| New matching job (score ≥ threshold) | worker | push + in-app | max 5/day, batched hourly |
| Saved search hit | worker | push + in-app | max 3/day |
| New application on your job | poster | push + in-app | batched, max 1 per 15 min |
| You were selected | worker | push + in-app + SMS fallback | immediate |
| Worker confirmed | poster | push + in-app | immediate |
| Job starts in 1 hour | both | push | once |
| Worker checked in | poster | push | once |
| Work submitted, confirm please | poster | push + in-app | +0h, +24h, +44h |
| Payment released | worker | push + in-app | immediate |
| Review request | both | push | +1h after completion, once |
| Dispute opened / updated | both + admin | push + in-app + email(admin) | immediate |
| Cancellation | affected party | push + in-app + SMS | immediate |

Global rules: quiet hours default 22:00–08:00 Asia/Dhaka (urgent-selection and cancellation
notifications override); every notification is deep-linked; every type is individually switchable;
unread in-app badge is authoritative, push is best-effort.

## D12. Category safety policies (`categories.requires_manual_approval`, etc.)

```text
childcare, elderly_care, domestic_live_in : min worker age 21, IDENTITY required, manual approval,
                                            two references, poster must be IDENTITY verified
electrical, construction, gas, welding    : certificate upload required, min age 18, safety notice
driving                                   : licence upload required, min age 18
security, night_shift                     : min age 18, IDENTITY both sides, safety notice
medical_assistance                        : certificate required, manual approval, disclaimer
tutoring_minors                           : IDENTITY required, safety notice, public-place guidance
all student-flagged workers               : block categories flagged unsafe_for_students
```
Blocked outright: anything involving minors as workers (<16 hard block; 16–17 restricted list only,
with guardian consent flag), hazardous chemicals, anything requiring a licence the platform cannot
verify.

---
---

# PART E — API SPECIFICATION

## E1. Conventions

```text
Base            /api/v1
Auth            Authorization: Bearer <access_jwt>
Headers         X-Device-Id, X-App-Version, Accept-Language: bn|en, Idempotency-Key (writes)
Content         application/json; multipart only for uploads
IDs             uuid v7 strings
Money           integer poisha, field names end with Poisha
Dates           ISO-8601 UTC with Z
Pagination      cursor-based: ?limit=20&cursor=<opaque>  → { items, nextCursor, hasMore }
Sorting         ?sort=field:asc|desc (whitelisted per endpoint)
Filtering       explicit named params only; never a raw query passthrough
Rate limits     global 100 req/min/user; OTP 5/hour/phone + 20/hour/IP; apply 30/hour/worker
```

**Success envelope**
```json
{ "data": { }, "meta": { "requestId": "…", "serverTime": "2026-08-17T12:00:00Z" } }
```

**Error envelope (ALWAYS this shape — the app renders `messageKey`, never `message`)**
```json
{
  "error": {
    "code": "JOB_BUDGET_REQUIRED",
    "messageKey": "error.job.budget_required",
    "message": "Budget is required before publishing.",
    "field": "budgetMinPoisha",
    "details": [],
    "requestId": "01J…",
    "retryable": false,
    "action": { "type": "NAVIGATE", "target": "job.edit.budget" }
  }
}
```
HTTP mapping: `400` validation · `401` missing/expired token · `403` policy denial ·
`404` not found *or hidden by policy* · `409` state/uniqueness conflict · `422` business-rule
violation · `429` rate limited (with `Retry-After`) · `500` unexpected (never leak internals).

## E2. Endpoint inventory

### auth
```text
POST   /auth/otp/request            { phone }                       → { challengeId, expiresIn }
POST   /auth/otp/verify             { challengeId, code, deviceId } → { accessToken, refreshToken, isNewUser }
POST   /auth/refresh                { refreshToken }                → rotated pair
POST   /auth/logout                 { refreshToken }                → 204
GET    /auth/session                                                → current user + roles + flags
POST   /auth/devices                { fcmToken, platform, appVersion }
DELETE /auth/devices/:id
```

### users & profiles
```text
GET    /me                        PATCH /me                 DELETE /me            GET /me/export
GET    /me/roles                  POST  /me/roles/activate   { mode }
GET    /me/worker-profile         PUT   /me/worker-profile
GET    /me/customer-profile       PUT   /me/customer-profile
GET    /me/skills                 PUT   /me/skills           { skillIds[] , levels }
GET    /me/availability           PUT   /me/availability      { rules[] }
POST   /me/availability/exceptions  DELETE /me/availability/exceptions/:id
PUT    /me/service-area           { locationId, radiusKm }
POST   /me/photo                  (multipart → signed upload)
GET    /users/:id/public          → public projection per D10
GET    /users/:id/reviews
```

### taxonomy
```text
GET /categories?tree=true         GET /categories/:id/skills
GET /skills?query=&categoryId=
GET /locations?type=AREA&parentId=
GET /config/public                → currency, flags, min/max, i18n version, policy summaries
```

### jobs
```text
POST   /jobs                      (creates DRAFT)             → job
GET    /jobs/:id                  (projection depends on viewer role & job state)
PATCH  /jobs/:id                  (DRAFT/PUBLISHED only, restricted fields after publish)
POST   /jobs/:id/publish          → validates + PUBLISHED + enqueues matching
POST   /jobs/:id/cancel           { reasonCode, note }
POST   /jobs/:id/close            (stop accepting applications)
DELETE /jobs/:id                  (DRAFT only)
GET    /jobs                      feed: ?scope=for-me|nearby|all &categoryId &jobType &minBudget
                                        &maxBudget &distanceKm &date &availabilityOnly &verifiedOnly
                                        &sort=match|distance|budget|newest
GET    /me/jobs?role=poster&status=…
GET    /jobs/:id/applications     (poster only)
GET    /jobs/:id/suggested-workers(poster only, matching output)
POST   /jobs/:id/view             (impression tracking, fire-and-forget)
```

### applications
```text
POST   /jobs/:id/applications     { message?, proposedPricePoisha? }  → 201 | 409 duplicate
GET    /me/applications?status=
POST   /applications/:id/withdraw
POST   /applications/:id/shortlist     (poster)
POST   /applications/:id/reject        (poster, { reasonCode? })
POST   /applications/:id/accept        (poster) → creates assignment + CONFIRMATION_PENDING
```

### assignments & work
```text
GET    /me/assignments?status=
GET    /assignments/:id
POST   /assignments/:id/confirm        (worker)
POST   /assignments/:id/decline        (worker, { reasonCode })
POST   /assignments/:id/cancel         (either, { reasonCode, note }) → policy preview first
GET    /assignments/:id/cancel-preview → penalty & refund the caller would incur
POST   /assignments/:id/checkin        { lat, lng, photoKey? }
POST   /assignments/:id/checkout       { lat, lng, notes? }
POST   /assignments/:id/submit         (worker: work done)
POST   /assignments/:id/confirm-completion  (poster)
GET    /assignments/:id/contract
```

### reviews
```text
POST /assignments/:id/reviews   { rating, subScores{}, comment }
GET  /me/reviews?direction=received|given
```

### messaging
```text
GET  /conversations                    GET  /conversations/:id/messages?cursor=
POST /conversations/:id/messages       { type, body | attachmentKey }
POST /conversations/:id/read
POST /jobs/:id/conversation            (creates/returns the job-scoped conversation)
WS   /ws  events: message.new, message.read, job.status.changed, application.new,
                  assignment.updated, notification.new, presence.update
```

### notifications, search, misc
```text
GET  /notifications?unread=true        POST /notifications/:id/read     POST /notifications/read-all
GET  /me/notification-preferences      PUT  /me/notification-preferences
GET  /search/jobs?q=       GET /search/workers?q=
GET  /me/saved-searches    POST /me/saved-searches    DELETE /me/saved-searches/:id
GET  /me/favorites         POST /me/favorites         DELETE /me/favorites/:id
POST /uploads/sign         { kind, mime, sizeBytes } → { uploadUrl, key, expiresIn }
POST /reports              { targetType, targetId, reasonCode, description }
GET  /health  /health/ready  /metrics
```

### payments (behind `payments_enabled`)
```text
GET  /assignments/:id/payment-intent      → amount, fee, worker earning breakdown (server-computed)
POST /assignments/:id/payments            Idempotency-Key required → { paymentId, providerPayload }
POST /webhooks/payments/:provider         signature-verified, idempotent
GET  /me/wallet                           GET /me/transactions
POST /me/payouts                          GET /me/payouts
```

### verification & disputes
```text
POST /verification/requests   { kind, documentKeys[] }     GET /verification/requests
POST /disputes                { assignmentId, reasonCode, description }
GET  /disputes/:id            POST /disputes/:id/evidence   POST /disputes/:id/appeal
```

### admin (`/admin/*`, role ADMIN|MODERATOR|SUPPORT, all actions audited)
```text
GET  /admin/metrics/overview                 GET /admin/metrics/liquidity?groupBy=category|area|hour
GET  /admin/users  PATCH /admin/users/:id    POST /admin/users/:id/suspend|ban|unban|reverify
GET  /admin/jobs   POST /admin/jobs/:id/suspend|force-transition
GET  /admin/verification-requests            POST /admin/verification-requests/:id/approve|reject
GET  /admin/disputes                         POST /admin/disputes/:id/resolve
GET  /admin/payments                         POST /admin/payments/:id/refund
CRUD /admin/categories  /admin/locations  /admin/skills  /admin/badges
GET  /admin/config       PUT /admin/config/:key      (fees, matching weights, policies, flags)
POST /admin/notifications/campaign
GET  /admin/audit-logs
```

## E3. Contract examples (Codex must match these shapes exactly)

**POST /jobs** (request)
```json
{
  "title": "দোকানে সহকারী দরকার",
  "description": "৫টা থেকে ৯টা পর্যন্ত দোকানে সাহায্য করতে হবে।",
  "categoryId": "…", "subcategoryId": "…",
  "jobType": "HOURLY", "paymentModel": "FIXED",
  "budgetMinPoisha": 50000, "budgetMaxPoisha": 50000, "isNegotiable": false,
  "locationId": "…", "areaLabel": "RUET এলাকা",
  "exactAddress": "House 12, Road 3, Talaimari",
  "lat": 24.3636, "lng": 88.6241,
  "startsAt": "2026-08-18T11:00:00Z", "endsAt": "2026-08-18T15:00:00Z",
  "workersRequired": 1, "experienceMinYears": 0, "urgency": "NORMAL",
  "requiredSkillIds": ["…"], "optionalSkillIds": [],
  "attachmentKeys": [], "recurrenceRule": null
}
```

**GET /jobs?scope=for-me** (response item)
```json
{
  "id": "…", "title": "Shop Assistant",
  "categoryName": "Retail", "jobType": "HOURLY",
  "areaLabel": "Near Talaimari", "distanceKm": 1.8,
  "startsAt": "…", "endsAt": "…", "durationMinutes": 240,
  "budgetMinPoisha": 50000, "budgetMaxPoisha": 50000, "isNegotiable": false,
  "matchScore": 94,
  "matchReasons": ["match.reason.skill_exact","match.reason.near_you","match.reason.fits_schedule"],
  "posterSummary": { "displayName": "Jamal H.", "ratingAvg": 4.6, "ratingCount": 12,
                     "trustLevel": "IDENTITY", "jobsPosted": 14 },
  "applicationsCount": 3, "hasApplied": false, "expiresAt": "…", "status": "APPLICATIONS_OPEN"
}
```

---
---

# PART F — UI / UX SPECIFICATION

## F1. Design principles (non-negotiable)

```text
1. Bangla first. bn is the DEFAULT locale. English is the toggle, not the baseline.
2. One primary action per screen, always the widest, lowest, most colourful element.
3. Money and time are always visible on any job card. Those are the two decision inputs.
4. Never a dead end: every empty/error state offers at least one button that does something.
5. Assume 320 dp width, 2 GB RAM, 3G, and a user who has never used a marketplace app.
6. Icons always carry a text label. Icon-only buttons are banned outside the app bar.
7. Destructive/irreversible actions require a confirm sheet that states the consequence in words.
8. No horizontal scrolling of primary content. No hidden gestures for essential actions.
```

## F2. Design tokens (`mobile/lib/theme/tokens.dart`)

```dart
// COLOR — light theme (define dark theme mirrors in the same file)
primary          #0B7A4B   // deep green — trust, local, not "another blue app"
primaryContainer #D7F0E3
secondary        #1F6FEB   // links, informational
accent           #F5A524   // urgency, featured, warnings that are not errors
success          #17864A
warning          #B45309
danger           #C0392B
surface          #FFFFFF   surfaceAlt #F6F8F7   border #E2E8E5
textPrimary      #10221A   textSecondary #4B5F57   textMuted #7C8F87
// STATUS COLORS map 1:1 to JobStatus — defined once, used by every chip/badge

// SPACING  4 8 12 16 20 24 32 40 48   (space-x scale, never arbitrary values)
// RADIUS   sm 8 · md 12 · lg 16 · pill 999
// ELEVATION 0 cards default; 1 for sheets; shadows subtle (low-end GPU friendly)

// TYPOGRAPHY
bn font: 'Noto Sans Bengali' (bundled, subset)   en font: 'Inter'
display 28/36 w700 · h1 24/32 w700 · h2 20/28 w600 · h3 17/24 w600
body 15/22 w400 · bodyStrong 15/22 w600 · caption 13/18 w400 · overline 11/16 w600 upper
Minimum body size 15sp. Support textScaleFactor up to 2.0 without clipping (test at 1.0/1.3/2.0).

// TOUCH TARGETS  min 48x48 dp. Primary CTA height 52 dp.
// MOTION  150 ms standard, 250 ms sheets, easing standard. Respect reduce-motion.
```

## F3. Shared component inventory (`mobile/lib/shared/widgets/`)

```text
KajButton (primary|secondary|tertiary|danger, loading, disabled, fullWidth, leadingIcon)
KajTextField (label, hint, helper, error, counter, prefix, suffix, keyboardType, bnDigits)
KajSelectField · KajChipGroup (single/multi) · KajCategoryPicker · KajSkillPicker
KajDateField · KajTimeRangeField · KajDurationDisplay · KajRecurrencePicker
KajMoneyField (৳ prefix, Bangla numeral display option, poisha under the hood)
KajJobCard (compact | detailed | applied) — the single most reused widget
KajWorkerCard (summary | comparison)
KajStatusChip(JobStatus) · KajMatchBadge(score) · KajTrustBadge(level) · KajRatingStars
KajAvatar (initials fallback, never a broken image)
KajEmptyState (illustration, title, body, up to 2 actions)
KajErrorState (messageKey, retry, secondary action)
KajLoadingList (skeleton shimmer, 3 variants: card/list/detail)
KajOfflineBanner (persistent, top, with queued-action count)
KajBottomSheet · KajConfirmSheet(consequenceText) · KajSnack (success|error|info)
KajSectionHeader · KajDivider · KajStepper · KajProgressTracker(JobStatus timeline)
KajMap (static preview + approximate circle before confirmation; pin after)
```

**Rule:** a screen may not define bespoke UI that duplicates any component above. If a new one is
needed, it is added to this inventory in the same PR, with a widget test and a storybook entry.

## F4. Navigation

```text
Role-aware bottom bar (max 5 items, labels always visible)

WORKER:   Home | Jobs | Applications | Schedule | Profile
CUSTOMER: Home | Post | My Jobs | Messages | Profile
BUSINESS (P11): Home | Shifts | Workforce | Messages | Profile

Role switch lives in the Profile tab header AND in the Home app bar as a small segmented control.
Switching is instant, local, and never requires a new account (D: one user, many role modes).
Chat is reachable from: job detail, application, assignment, notifications, and (customer) the
Messages tab. Workers reach chat from Applications/Schedule — no separate tab to keep 5 items.
Deep links: kaj://job/<id>, kaj://application/<id>, kaj://assignment/<id>, kaj://chat/<id>
```

## F5. Screen inventory (52 screens) with per-screen spec format

Each screen must be specified in `/docs/ui/<screen-id>.md` **before** it is coded, using:

```markdown
## S<NN> <Screen name>
Route:            /path
Roles:            worker | customer | both | admin
Entry points:     …
Purpose (1 line): …
Primary action:   …
Data required:    endpoints + fields
States:           loading / empty / error / offline / success / partial
Layout:           top→bottom element list with component names from F3
Validation:       field → rule → messageKey
Edge cases:       …
Analytics events: screen_view, <action>_tapped, …
Test IDs:         keys used by widget & integration tests
```

**Screen list (ID · name · phase):**
```text
AUTH & ONBOARDING
S01 Splash (P1)              S02 Language select (P1)      S03 Phone entry (P1)
S04 OTP verify (P1)          S05 Profile setup (P2)        S06 Role selection (P2)
S07 Location select (P2)     S08 Skills & rate setup (P2)  S09 Availability setup (P2)
S10 Onboarding tour (P2)

WORKER
S11 Worker home (P4)         S12 Job feed (P4)             S13 Job filters sheet (P4)
S14 Job detail (P3)          S15 Apply sheet (P3)          S16 Proposal sheet (P3)
S17 My applications (P3)     S18 Schedule / calendar (P5)  S19 Availability editor (P2)
S20 Assignment detail (P5)   S21 Check-in/out (P10)        S22 Earnings (P9)
S23 Work history (P5)        S24 Worker public profile (P2) S25 Edit skills (P2)
S26 Verification centre (P10) S27 Portfolio (P10)          S28 Reviews received (P6)

CUSTOMER
S29 Customer home (P4)       S30 Create job — step 1 basics (P3)
S31 Create job — step 2 schedule & budget (P3)   S32 Create job — step 3 location & requirements (P3)
S33 Job preview & publish (P3)                   S34 My jobs list (P3)
S35 Job detail (poster view) (P3)                S36 Applications list (P3)
S37 Worker comparison (P4)   S38 Worker profile (poster view) (P4)
S39 Confirm & hire sheet (P5)                    S40 Active job tracker (P5)
S41 Confirm completion (P5)  S42 Payment (P9)    S43 Leave review (P6)

SHARED
S44 Search (P4)              S45 Categories browse (P2)    S46 Chat list (P7)
S47 Chat thread (P7)         S48 Notifications (P7)        S49 Favorites (P6)
S50 Settings (P2)            S51 Help & safety (P2)        S52 Report / dispute (P10)
```

## F6. Two worked screen specs (Codex copies this level of detail for all 52)

### S14 — Job detail (worker view)
```text
Route /jobs/:id  · Role worker · Entry: feed card, notification deep link, search, saved job
Purpose: give a worker everything needed to decide "apply or not" in under 15 seconds.
Primary action: [আবেদন করুন / Apply] — sticky bottom bar, full width, 52 dp.

Layout (top → bottom)
 1 AppBar: back · share · save(bookmark) · report(overflow)
 2 Header card: title (h2) · KajMatchBadge(94%) · KajStatusChip
 3 Money row (largest non-title text): "৳500" + payment model label + "Negotiable" chip if true
 4 When row: date in Bangla ("আগামীকাল, সোম ১৮ আগস্ট") · time range · duration ("৪ ঘণ্টা")
 5 Where row: area label + distanceKm + KajMap approximate circle (NOT the exact pin)
 6 Match reasons: up to 3 chips from matchReasons[]
 7 Description (collapsible after 4 lines)
 8 Requirements: required skills (filled chips) · optional (outlined) · experience · workers needed
 9 Poster card: avatar, name, rating, jobs posted, trust badges, member since, [Message] (disabled
   with tooltip until an application exists — anti-spam)
10 Safety strip: "Never pay to get a job. Meet in a public place first." (i18n, always present)
11 Similar jobs (3 cards, lazy)
Sticky bar: [Apply] + secondary [Save]. If already applied → status chip + [Withdraw].

States
 loading  → KajLoadingList(detail)
 error    → KajErrorState with retry
 offline  → cached copy + KajOfflineBanner; Apply queues and shows "will send when online"
 expired  → banner "This job has expired" + [Find similar jobs]
 filled   → banner "Position filled" + [Find similar jobs]
 own job  → redirect to S35
Edge cases: budget range vs fixed · negotiable → CTA becomes [Send proposal] (S16) · recurring →
 show next 3 occurrence dates · workersRequired>1 → "2 of 3 positions filled" progress.
Analytics: job_detail_view{jobId,matchScore,source}, apply_tapped, save_tapped, poster_profile_tapped
Test IDs: job_detail_title, job_detail_budget, job_detail_apply_btn, job_detail_match_badge
```

### S30–S33 — Create job (customer, 3 steps + preview)
```text
Design rule: NEVER one long form. 3 steps, each fits one screen without scrolling on a 5" phone.
Progress: KajStepper 1/3. Autosave to DRAFT after every step (POST/PATCH /jobs).
Back never loses data. Exit → "Save as draft?" sheet.

Step 1 — What (S30)
  Category picker (icon grid, 2 columns, Bangla labels) → subcategory chips
  Title (prefilled suggestion from subcategory, editable, 5–80 chars)
  Description (min 20 chars, with 3 tappable example prompts, and a hint of what to include)
  Job type selector (icon + label + one-line example for each of the 9 types)
  [পরবর্তী / Next]

Step 2 — When & how much (S31)
  Date picker (Today / Tomorrow / Pick date quick chips)
  Time range (start & end, 15-min steps) → live duration display
  Recurring toggle (flag) → KajRecurrencePicker
  Payment model chips: Fixed | Hourly | Daily | Monthly | Negotiable
  KajMoneyField with a live hint: "Similar jobs here: ৳400–৳650" (ONLY when real data exists —
    otherwise show nothing; never fabricate a range)
  Workers needed stepper (1–20)
  [Next]

Step 3 — Where & who (S32)
  Area select (searchable list of active locations) + "Use my location" (permission rationale first)
  Exact address field with the privacy note: "Shared only after you confirm a worker."
  Required skills (max 5) · optional skills · experience level
  Urgency chips · attachments (max 5 images, compressed client-side to ≤1 MB)
  Safety requirements checkbox list (category-driven)
  [Preview]

Preview & publish (S33)
  Renders the exact KajJobCard the worker will see + a full read-only detail
  Validation summary: any blocking issue shown as a tappable row that jumps to the field
  Fee/expectation note if applicable
  [প্রকাশ করুন / Publish]  → success screen: "Finding workers for you…" + live applicant counter
```

## F7. Empty / error / offline copy rules

```text
NEVER: "Something went wrong" · "Error 500" · "No data" · a blank screen · an infinite spinner
ALWAYS: what happened · why (if known) · what the user can do now (a button)

Examples (bn/en pairs live in the ARB files):
  Feed empty (worker):  "আপনার দক্ষতার সাথে মিলে এমন কাজ এখনো নেই।"
                        [দক্ষতা যোগ করুন] [দূরত্ব বাড়ান] [সময় পরিবর্তন করুন]
  No applications yet:  "এখনো কেউ আবেদন করেনি। সাধারণত ২–৬ ঘণ্টা সময় লাগে।"
                        [Boost visibility] [Edit job] [Share link]
  Publish failed:       "বাজেট না দিলে কাজ প্রকাশ করা যাবে না।" [বাজেট যোগ করুন]
  Offline:              "ইন্টারনেট নেই। ২টি কাজ পাঠানোর জন্য অপেক্ষা করছে।" [আবার চেষ্টা করুন]
```

## F8. Low-end device & network budget (enforced in CI)

```text
Cold start (mid-tier Android, release build)          ≤ 2.5 s to first frame
Feed screen jank                                       0 dropped frames > 16 ms on scroll (profile)
APK size (arm64, split-per-abi)                        ≤ 25 MB
Feed API payload (20 items)                            ≤ 60 KB gzipped
Images                                                 WebP, resized server-side, 3 variants
                                                       (thumb 96, card 320, full 1080); lazy loaded
Lists                                                  ListView.builder + pagination (20), never
                                                       a full-list rebuild; const constructors
Caching                                                Drift cache for feed, categories, locations,
                                                       profile; stale-while-revalidate
Requests                                               debounce search 400 ms; cancel on dispose;
                                                       retry with exponential backoff + jitter; all
                                                       writes carry an idempotency key
Battery                                                no background location; no polling loops;
                                                       socket only while app is foregrounded
```

## F9. Accessibility checklist (every screen)

```text
[ ] Contrast ≥ 4.5:1 body, ≥ 3:1 large text and icons
[ ] Every interactive element has a semantic label (Bangla + English)
[ ] Tap targets ≥ 48 dp with ≥ 8 dp spacing
[ ] Works at textScaleFactor 2.0 (no clipped or overlapping text)
[ ] Focus order is logical; screen reader announces status changes (live region for job status)
[ ] Colour is never the only signal (status chips carry icon + text)
[ ] Form errors are announced and linked to their field
[ ] Bangla numerals option for money/dates, controlled by locale setting
```

---
---

# PART G — PHASE-BY-PHASE BUILD INSTRUCTIONS

> Format for every task: **Goal → Files → Logic → Tests → Acceptance → Codex prompt.**
> Codex executes tasks strictly in ID order. A phase's **Exit Gate** must pass before the next phase.

---

## PHASE 1 — FOUNDATION (backend skeleton, auth, CI)

**Phase goal:** a running API with phone-OTP auth, a migrated database, CI, and a Flutter app that
can log in. **Nothing else.**

### P1-INF-01 — Monorepo & tooling
- **Files:** repo root, `.editorconfig`, `.gitignore`, `README.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `CHANGELOG.md`, `infrastructure/docker-compose.yml`, `packages/shared-types/`.
- **Logic:** docker-compose runs `postgres:16`, `redis:7`, `minio`, `mailhog`. Root scripts:
  `dev`, `test`, `lint`, `typecheck`, `migrate`, `seed`.
- **Tests:** `docker compose up -d && pnpm migrate` succeeds from a clean clone.
- **Acceptance:** a new machine can reach a running API in ≤3 commands, documented in README.

### P1-INF-02 — NestJS skeleton
- **Files:** `backend/src/main.ts`, `app.module.ts`, `config/` (zod env validation),
  `common/filters/http-exception.filter.ts`, `common/interceptors/{response,logging}.interceptor.ts`,
  `common/guards/`, `infra/prisma/`, `infra/redis/`.
- **Logic:** global `ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true})`;
  response interceptor wraps everything in the E1 success envelope; exception filter emits the E1
  error envelope with a `requestId` from an AsyncLocalStorage context; pino logger redacts
  `authorization, password, code, token, phone`; Swagger at `/docs` (non-production only).
- **Tests:** `GET /health` → 200; an unknown route → the E1 error shape; a validation failure → 400
  with `field` populated; logs contain no redacted values.
- **Acceptance:** every response in the app, success or failure, matches PART E1 exactly.

### P1-INF-03 — Prisma schema v1 + migrations
- **Files:** `backend/prisma/schema.prisma`, `migrations/`, `seed.ts`.
- **Logic:** implement every table and enum from D2 (columns may be nullable now, tables may not be
  missing). uuid v7 default. `deleted_at` on soft-deletable tables. All D2 indexes.
- **Tests:** `prisma migrate diff` clean; seed creates categories, locations, skills, admin user,
  feature flags (all off), config_settings defaults (fees, matching weights, cancellation policy).
- **Acceptance:** `pnpm migrate reset && pnpm seed` produces a usable dev database, idempotently.

### P1-AUTH-04 — Phone OTP authentication
- **Files:** `modules/auth/*` (controller, service, dto, guards, strategies), `infra/sms/`.
- **Logic:**
  ```text
  request: normalise phone to E.164 (+880…, reject non-BD in v1), rate-limit 5/hour/phone &
           20/hour/IP, generate 6-digit code, store bcrypt hash + expiry (300 s), send via SMS
           adapter (console adapter prints it in dev), return challengeId (never the code)
  verify : constant-time compare, max 5 attempts then invalidate, consume the challenge,
           upsert user, issue access (15 m) + refresh (30 d, hashed in DB, bound to deviceId)
  refresh: rotation + reuse detection → on reuse, revoke the whole family and force re-login
  logout : revoke that refresh token; logout-all revokes the family
  ```
- **Tests:** happy path · wrong code · expired code · 6th attempt · replayed challenge ·
  rate limit → 429 with Retry-After · refresh rotation · **refresh reuse revokes family** ·
  access token on a protected route · expired access → 401.
- **Acceptance:** no code is ever returned in an API response or written to a log.

### P1-AUTH-05 — AuthZ foundation
- **Files:** `common/guards/jwt.guard.ts`, `roles.guard.ts`, `policy/` (CASL-style ability factory),
  `decorators/current-user.decorator.ts`.
- **Logic:** every controller method declares `@Policy(...)`. Default deny. Resource policies:
  "poster of the job", "assigned worker", "participant of the conversation", "admin".
- **Tests:** a table-driven matrix — for each protected endpoint × {owner, other user, admin,
  anonymous} assert the expected status. **This test file grows with every new endpoint.**
- **Acceptance:** accessing another user's resource never leaks existence (404, not 403, for
  private objects).

### P1-INF-06 — Adapter interfaces (no vendor lock)
- **Files:** `infra/sms/sms.port.ts` + `console.adapter.ts`, `infra/push/push.port.ts`,
  `infra/storage/storage.port.ts` + `s3.adapter.ts`, `infra/payment/payment.port.ts` +
  `manual.adapter.ts`.
- **Logic:** ports are interfaces; adapters are swapped by env. `payment.port.ts` defines
  `createCharge, capture, refund, verifyWebhook, getStatus` and **nothing provider-specific**.
- **Acceptance:** changing `SMS_PROVIDER` changes behaviour with zero changes outside `infra/`.

### P1-UI-07 — Flutter skeleton
- **Files:** `mobile/` project, `theme/tokens.dart` + `theme.dart` (F2), `l10n/{en,bn}.arb`,
  `routing/router.dart` (go_router + auth guard), `core/network/` (dio + interceptors),
  `core/result.dart`, `shared/widgets/` (KajButton, KajTextField, KajEmptyState, KajErrorState,
  KajLoadingList, KajOfflineBanner, KajSnack).
- **Logic:** dio interceptors: auth header, refresh-on-401 (single-flight), locale header,
  idempotency key for writes, retry with backoff, offline detection → typed `AppFailure`.
- **Tests:** widget tests for each shared component in both locales, at textScale 1.0 and 2.0.
- **Acceptance:** `flutter analyze` clean; app builds release APK; no hardcoded strings.

### P1-UI-08 — Screens S01–S04
- Splash (token check → route) · Language select (persisted, default **bn**) · Phone entry (BD
  formatting, validation, terms link) · OTP verify (auto-read where possible, 60 s resend timer,
  attempt counter, clear errors).
- **Tests:** widget tests + an integration test `launch → language → phone → OTP → home` against a
  mocked API; offline behaviour; wrong-code error copy.
- **Acceptance:** a first-time user reaches the home shell in ≤4 taps + code entry.

### P1-QA-09 — CI pipeline
- **Files:** `.github/workflows/ci.yml`.
- **Logic:** jobs — `backend` (install → lint → typecheck → prisma validate → unit → e2e with a
  service Postgres → build), `mobile` (analyze → test → build apk --split-per-abi), `admin` (later).
  Coverage gate: backend business logic ≥ 80% now, ≥ 90% by P5. PR blocked on red.
- **Acceptance:** a deliberately broken test fails the PR.

> **PHASE 1 EXIT GATE**
> ```text
> [ ] Fresh clone → docker compose up → migrate → seed → API healthy
> [ ] A real phone number can log in from the Flutter app and stay logged in after restart
> [ ] Refresh-token rotation and reuse detection proven by tests
> [ ] Every response matches the E1 envelope
> [ ] CI green; coverage gate active; Swagger published
> ```

---

## PHASE 2 — IDENTITY, TAXONOMY & PROFILES

**Goal:** a user can become a real, findable person with skills, a location, and availability.

### P2-TAX-01 — Categories, skills, locations
- **Logic:** hierarchical categories (2 levels), category→skills mapping, locations tree
  (CITY → THANA → AREA) seeded with the Rajshahi areas from PART C3 **as data, never as code**.
  Public read endpoints cached in Redis (TTL 1 h) and in Drift on the client (version-stamped).
- **Tests:** tree integrity (no cycles, depth ≤2), inactive items excluded, cache invalidation on
  admin edit, bn/en names always present.
- **Acceptance:** adding an area in admin makes it selectable in the app without an app release.

### P2-USR-02 — Profile & role modes
- **Logic:** one `users` row; `profiles` always; `worker_profiles`/`customer_profiles` created
  lazily on first role activation. `POST /me/roles/activate` is idempotent. Trust level starts
  PHONE after OTP.
- **Tests:** activating both roles · switching returns correct home payload · a worker-only endpoint
  rejects a customer-mode-only user with 403 and an actionable messageKey.

### P2-USR-03 — Skills & rates
- **Logic:** max 15 skills/user; each with level and years; rates optional but at least one rate
  required before applying to a paid job (validated at apply time, not at profile save time —
  do not block onboarding).
- **Tests:** limits, duplicates, unknown skill id, rate sanity bounds (config: min 5000 poisha,
  max 5,000,000 poisha), i18n of skill names.

### P2-USR-04 — Availability engine (D4)
- **Files:** `modules/availability/availability.service.ts` (+ pure `availability.calculator.ts`).
- **Logic:** implement D4 exactly. The calculator is a **pure function** with no DB access so it can
  be unit-tested exhaustively and later reused in the matching worker.
- **Tests:** the full D4 edge-case list + property test: for 1,000 random rule/window pairs,
  `coverage ∈ [0,1]` and `isAvailable ⇒ coverage ≥ minCoverage`.
- **Acceptance:** ≥95% branch coverage on the calculator file.

### P2-USR-05 — Uploads & photos
- **Logic:** `POST /uploads/sign` validates kind/mime/size, returns a short-lived signed URL;
  server verifies the object after upload (magic bytes, size, dimensions), strips EXIF (GPS!),
  generates 3 variants. Sensitive docs go to a private bucket path with no public read.
- **Tests:** oversize · wrong mime · mime spoofing (jpg header with .exe) · EXIF GPS removed ·
  signed URL expiry · a document key is not readable without a fresh signed GET.

### P2-UI-06 — Screens S05–S10, S19, S24, S25, S45, S50, S51
- Profile setup · role selection (with plain-language explanation of each role) · location select
  (search + "use my location" with a rationale sheet) · skills & rate · availability editor
  (weekly grid, quick presets: "Evenings", "Weekends", "After 6 PM") · onboarding tour (3 cards,
  skippable) · categories browse · public worker profile · settings (language, notifications,
  privacy, delete account) · help & safety.
- **Tests:** integration `signup → profile → role → location → skills → availability → home`,
  in bn, with the app killed and relaunched mid-flow (state must survive).
- **Acceptance:** onboarding completes in ≤ 90 seconds for a test user, with no English fallback text.

> **PHASE 2 EXIT GATE**
> ```text
> [ ] A worker profile can be created end-to-end and viewed publicly with D10 field masking
> [ ] Availability calculator passes all edge cases + property tests
> [ ] Categories/locations are 100% data-driven and admin-editable (via API for now)
> [ ] No EXIF GPS survives an upload
> ```

---

## PHASE 3 — JOBS & APPLICATIONS (the transaction spine)

### P3-JOB-01 — Job creation & lifecycle
- **Logic:** `POST /jobs` → DRAFT; validation split into `draftSchema` (loose) and
  `publishSchema` (strict). Publish validates: title 5–80, description ≥20, category active,
  location active, `endsAt > startsAt`, duration ≤ 24 h per occurrence, budget within category
  bounds, `workersRequired` 1–20, `startsAt` ≥ now+30 min (config), poster not banned, poster
  under `max_active_jobs` (config 10). Sets `expiresAt = startsAt` or +14 d for undated jobs.
- **Logic:** exact address stored encrypted (app-level AES-GCM with a KMS/env key); `areaLabel`
  and coordinates rounded to ~500 m for public projections.
- **Tests:** each validation rule → its own test with the exact `messageKey`; publish twice → 409;
  publish a foreign job → 404; DRAFT patch vs PUBLISHED patch (immutable fields after publish:
  category, jobType, startsAt if applications exist).
- **Acceptance:** the public projection of a job never contains `exactAddress` or precise lat/lng.

### P3-JOB-02 — State machine service (D3)
- **Files:** `modules/jobs/state-machine/` — `transitions.map.ts` (pure data), `guards/`,
  `job-state.service.ts`.
- **Logic:** implement D3 verbatim. `transition()` runs inside `prisma.$transaction`, writes
  history, emits an event on the event bus. Any illegal transition → `InvalidTransitionError` (409).
- **Tests:** a generated matrix test over **every** (from,to) pair — legal pairs pass with a valid
  actor, all others throw. Plus invariants I1–I7, including a concurrency test that fires two
  simultaneous accepts at a 1-slot job and asserts exactly one 200 and one 409.
- **Acceptance:** `grep -r "status = " src/modules --include=*.ts` returns matches only inside the
  state machine directory.

### P3-JOB-03 — Job feed & search
- **Logic:** cursor pagination (keyset on `(published_at, id)`), filters from E2, distance via
  `earth_distance`, `scope=for-me` delegates to the matcher in P4 (until then: newest + distance).
  Exclude own jobs, blocked users, expired, and filled jobs by default.
- **Tests:** each filter independently and combined; cursor stability when new jobs are inserted
  mid-pagination; p95 latency < 300 ms with 10k seeded jobs (perf test, seeded fixtures).

### P3-APP-04 — Applications
- **Logic:** apply guards — job is APPLICATIONS_OPEN, not own job, no existing non-withdrawn
  application (unique index), worker not blocked by poster, category policy satisfied (D12),
  worker has a rate if the job is non-negotiable, per-worker daily apply limit (config 30).
  Proposed price only allowed when `isNegotiable`. Increments `applications_count` atomically.
- **Tests:** duplicate → 409 · own job → 422 · closed job → 409 · price on a fixed job → 400 ·
  limit exceeded → 429 · withdraw then re-apply (allowed once, then blocked) · counter accuracy
  under 50 concurrent applies.

### P3-APP-05 — Poster review of applicants
- **Logic:** shortlist / reject / accept. Accept creates `assignments` + `contracts` snapshot and
  transitions the job (D3), inside one transaction, with a row lock on the job to protect
  `workers_filled`. Rejection reasons are optional and never shown verbatim to the worker (only a
  neutral message) unless the poster opts in.
- **Tests:** accepting when slots are full → 409 · accepting a withdrawn application → 409 ·
  contract snapshot contains agreed price, times, scope, fee, policy · concurrency test.

### P3-UI-06 — Screens S30–S36, S14–S17
- Create-job wizard (F6), preview & publish, my jobs, poster job detail with a live applicant
  counter, applications list, worker job detail, apply/proposal sheets, my applications.
- **Tests:** integration `create → publish → (as worker) see in feed → apply → (as poster) see
  application`; draft autosave survives app kill; validation errors deep-link to the offending field.

> **PHASE 3 EXIT GATE**
> ```text
> [ ] Two real devices/accounts complete: post a job → apply → accept, with correct statuses
> [ ] State machine matrix test green; no direct status writes outside the state machine
> [ ] Feed p95 < 300 ms at 10k jobs; cursor pagination stable
> [ ] Address privacy verified by an automated projection test
> ```

---

## PHASE 4 — MATCHING, FEED PERSONALISATION & NOTIFICATIONS

### P4-MATCH-01 — Scoring engine (D5)
- **Files:** `modules/matching/scoring/` — `score.calculator.ts` (**pure**, no IO),
  `weights.provider.ts` (reads config_settings, validates Σweights = 1.00),
  `hard-filters.sql.ts`, `matching.service.ts`.
- **Tests:** golden-file tests — 20 fixture (job, worker) pairs with hand-computed expected scores;
  weight changes shift scores predictably; a missing-data worker never scores NaN; the exploration
  bonus is deterministic under a seeded RNG; `explain()` output sums to the final score.
- **Acceptance:** changing weights in `config_settings` changes ranking with no deploy.

### P4-MATCH-02 — Ranking endpoints & feed
- **Logic:** `GET /jobs?scope=for-me` = hard filter in SQL (LIMIT 300 candidates by distance +
  recency) → score in memory → sort → paginate on a cached ranked list (Redis, TTL 5 min, keyed by
  `worker:filtersHash`). `GET /jobs/:id/suggested-workers` for the poster.
- **Tests:** ranking is stable within a cache window; a new job invalidates the affected caches;
  a worker with no skills still gets a non-empty feed (fallback: distance + recency).

### P4-NOTIF-03 — Notification service & fan-out
- **Files:** `modules/notifications/` + `queues/matching-fanout.processor.ts`.
- **Logic:** implement D11 exactly: templates with i18n keys, per-user preference and quiet-hours
  checks, dedupe key `(userId, type, entityId)`, batching windows, FCM push + persisted in-app row.
  Fan-out runs in BullMQ with retries (3, exponential) and a dead-letter queue.
- **Tests:** quiet hours suppress non-urgent and never suppress urgent; dedupe prevents doubles;
  a disabled preference blocks the channel but still writes the in-app row; a failed FCM send
  retries then dead-letters without losing the in-app notification.

### P4-UI-04 — Screens S11, S12, S13, S29, S37, S38, S44, S48
- Worker home (greeting, available-now toggle, recommended jobs, nearby, today's schedule),
  job feed with match badges and reasons, filter sheet, customer home, worker comparison
  (side-by-side up to 3), worker profile for posters, search, notifications list.
- **Tests:** widget test that a match badge renders its reasons; filter state survives rotation;
  notification deep links open the right screen from a cold start.

> **PHASE 4 EXIT GATE**
> ```text
> [ ] "94% Match" is explainable: /explain reproduces the number from stored data
> [ ] A published job notifies only relevant workers, respecting preferences and quiet hours
> [ ] Worker feed is genuinely personalised and never empty without an actionable empty state
> ```

---

## PHASE 5 — ASSIGNMENT, CONFIRMATION, COMPLETION

### P5-ASSIGN-01 — Confirmation window
- **Logic:** on accept → CONFIRMATION_PENDING + a delayed BullMQ job at
  `confirm_window_minutes`; worker confirm → CONFIRMED (+ chat unlocked, phone relay armed);
  decline/expiry → reopen the slot, notify the poster, offer the next-best applicants.
- **Tests:** confirm inside/outside the window; decline reopens and restores `workers_filled`;
  the delayed job is cancelled on confirm (no zombie expiry).

### P5-ASSIGN-02 — Contract snapshot
- **Logic:** immutable JSON: job fields at confirmation, agreed price, fee breakdown, times,
  location, scope, cancellation policy version, both parties' identities and trust levels. Any
  later change creates a **new version row**, never an update.
- **Tests:** snapshot is byte-stable; editing the job afterwards does not alter the contract.

### P5-ASSIGN-03 — Work progression & auto-confirm
- **Logic:** UPCOMING (T-24 h job) → IN_PROGRESS (at `startsAt`) → worker SUBMITTED →
  CUSTOMER_REVIEW → auto-COMPLETED after `auto_confirm_hours` (48) unless disputed; reminder
  notifications at 0/24/44 h.
- **Tests:** time-travel tests (injectable clock) for every timer; auto-confirm does not fire if a
  dispute exists; a cancelled job cancels its timers.

### P5-ASSIGN-04 — Cancellation engine (D8)
- **Logic:** `cancel-preview` computes penalty/refund without mutating; `cancel` applies it,
  writes reputation deltas and a strike if applicable, notifies, reopens or closes the job.
- **Tests:** every tier boundary (24 h/6 h/2 h/0 h, exactly on the boundary); emergency reason
  defers the penalty and creates an admin item; the 3rd strike in 60 days suspends.

### P5-UI-05 — Screens S18, S20, S23, S39, S40, S41
- Worker schedule (calendar + list, today highlighted), assignment detail with a
  `KajProgressTracker` timeline of the state machine, work history, confirm-&-hire sheet
  (poster), active job tracker (live status via WS), confirm-completion screen.
- **Tests:** integration of the **full acceptance scenario** (PART H4) minus payment.

> **PHASE 5 EXIT GATE**
> ```text
> [ ] The PART H4 acceptance scenario passes end-to-end in an automated integration test
> [ ] Every timer is tested with an injectable clock; no wall-clock sleeps in tests
> [ ] Cancellation penalties are previewed before confirmation, in words, in Bangla
> ```

---

## PHASE 6 — REVIEWS & REPUTATION

### P6-REV-01 — Two-sided reviews (D7)
- **Logic:** double-blind reveal; window 7 days; aggregates recomputed transactionally; damped
  average used for ranking, raw shown to users; one review per reviewer per assignment.
- **Tests:** a review before COMPLETED → 409; double review → 409; blind rule (the counterpart's
  review is not readable until both submit or the window closes); aggregate correctness after
  100 randomised reviews; hidden reviews are excluded from aggregates.

### P6-REV-02 — Reliability & badges
- **Logic:** nightly BullMQ job recomputes rates, reliability score, and badge grants/revocations,
  writing an audit row for each change. Badges are pure functions of stored counters (D7).
- **Tests:** each badge rule at its boundary; revocation when a rule stops holding; the internal
  score is never present in any public API response (assert by schema test).

### P6-UI-03 — Screens S28, S43, S49 + review prompts
- Leave-review flow (1 tap for stars, optional sub-scores, optional comment), reviews received,
  favorites, and the "Book again" entry point from a completed job.

> **PHASE 6 EXIT GATE:** reputation is computable, explainable, and never a bare opaque number.

---

## PHASE 7 — CHAT & REALTIME

### P7-CHAT-01 — Conversations
- **Logic:** job-scoped conversations; created when an application exists (poster→applicant) or at
  confirmation; participants only; images via signed upload; system messages for status changes;
  soft delete; report/block integrated. Anti-circumvention: a **light** heuristic that shows an
  inline warning ("Keep payments on KAJ so you're protected") when a message matches a phone/
  payment-number pattern — log the event, **do not block, do not read messages for any other
  purpose, do not surface content to staff outside a dispute** (D10).
- **Tests:** a non-participant gets 404; blocked users cannot message; pagination; the warning
  triggers on a BD phone pattern and does not block delivery; message ordering under concurrency.

### P7-CHAT-02 — WebSocket gateway
- **Logic:** JWT-authenticated socket, room per conversation + a per-user room; events from E2;
  reconnect with backoff; missed messages fetched by cursor on reconnect; presence is coarse
  ("active today"), never live GPS.
- **Tests:** auth rejection, room isolation (user A never receives B's events), reconnect
  gap-filling, 500 concurrent sockets smoke test.

### P7-UI-03 — Screens S46, S47 + notification wiring
- Chat list with unread counts, chat thread with the job context header, image send with
  compression, offline queue with a "sending…" state, and a persistent safety banner.

> **PHASE 7 EXIT GATE:** two devices exchange messages in <1 s, survive airplane-mode toggling,
> and no user can read a conversation they are not part of (test-proven).

---

## PHASE 8 — ADMIN PANEL & OPERATIONS (MVP-critical, not optional)

### P8-ADMIN-01 — Admin auth & shell
- Next.js app, email+password + TOTP 2FA for admins, roles ADMIN/MODERATOR/SUPPORT/FINANCE,
  every action writes `audit_logs`, session timeout 30 min.

### P8-ADMIN-02 — Ops modules
```text
Dashboard      live counts, today's jobs, stuck jobs (status age > threshold), open disputes
Users          search/filter, view, verify, suspend, ban, reset, impersonate-read-only (audited)
Jobs           inspect, moderate, force-transition (with a mandatory reason), cancel, feature
Applications   view, unstick
Verification   queue with document viewer (watermarked, audited), approve/reject with reason
Categories     CRUD + safety policy flags (D12)
Locations      CRUD (this is how new areas/cities launch — never a code deploy)
Config         fees, matching weights, cancellation policy, timers, limits — with a diff preview
                and a confirmation step; every change audited and revertible
Flags          feature flags with rollout %
Disputes       evidence view, decision, refund action
Notifications  targeted campaign composer (segment + preview + throttle + dry-run count)
Analytics      PART G Phase 13 metrics
```
- **Tests:** e2e (Playwright) for the 6 highest-risk flows: suspend user, force-transition a job,
  approve verification, resolve a dispute, change the platform fee, run a notification dry-run.
- **Acceptance:** a support person with **no engineer** can rescue any stuck job and answer
  "what happened to job X" from the status history + audit log.

> **PHASE 8 EXIT GATE = MVP GATE.** After this phase the pilot can start with cash payments.

---

## PHASE 9 — PAYMENTS & WALLET (flag-gated)

### P9-PAY-01 — Money core
- Ledger (D6), fee resolution chain, `payment-intent` computed server-side, idempotency middleware
  backed by a Redis+DB key store returning the first response for a repeated key.
- **Tests:** ledger balances to zero for every scenario (charge/release/refund/partial/payout);
  duplicate idempotency key returns the identical response body; concurrent charge attempts create
  exactly one payment row; fee resolution order (user → tier → category → global).

### P9-PAY-02 — Provider adapter + webhooks
- Implement the chosen BD provider(s) behind `payment.port.ts` **only after** the legal/compliance
  checklist in `/docs/legal-checklist.md` is signed off. Webhooks: signature verification,
  timestamp window, replay table, out-of-order tolerance, reconciliation job comparing provider
  status vs local status nightly with an alert on drift.
- **Tests:** invalid signature → 401 and no state change; replayed event → no-op; out-of-order
  (release before charge) → parked in a review queue, never auto-resolved.

### P9-PAY-03 — Payouts, wallet, refunds
- Payout requests require IDENTITY trust; minimum payout config; batch export for manual payout in
  the pilot; refund paths for every dispute decision.

### P9-UI-04 — Screens S22, S42 + fee transparency
- Payment screen with a full breakdown ("You pay ৳500 · Worker receives ৳460 · Platform fee ৳40"),
  earnings screen with pending/available/paid, payout request, transaction history. **Never**
  display a computed amount that came from the client.

> **PHASE 9 EXIT GATE:** a nightly reconciliation job proves `Σdebits == Σcredits`; no client value
> is ever trusted; every money mutation is audited.

---

## PHASE 10 — TRUST, VERIFICATION, DISPUTES, CHECK-IN, ANTI-FRAUD

```text
P10-TRUST-01  Verification pipeline (PHONE→IDENTITY→SKILL→BUSINESS): submission, private storage,
              admin queue, approval → trust_level bump + badge, 90-day document purge job.
P10-TRUST-02  Disputes (D9): open, evidence, timers, admin decision, ledger effects, appeal.
P10-TRUST-03  Check-in/check-out (D3 + flag): geofence radius config, ±60 min window, optional
              photo, offline capture with later sync, manual override by poster or admin.
              NO background tracking; a single foreground location read per event; explicit consent
              copy shown before the first use.
P10-TRUST-04  Reports, blocks, moderation actions, suspension ladder (warn → restrict → suspend →
              ban), re-verification requirement.
P10-TRUST-05  Anti-fraud risk scoring: duplicate device/phone/IP clusters, impossible travel,
              application spam, review-ring detection (mutual review loops), price anomalies.
              Output = a risk score + a REVIEW QUEUE ITEM. Automatic bans are forbidden (R: human
              review required); only automatic rate-limiting is allowed.
P10-UI-06     S21, S26, S27, S52 + safety guidance surfaces.
```
- **Tests:** geofence boundary (299 m / 301 m), clock skew, offline check-in sync, dispute timer
  matrix, risk rules with labelled fixtures (precision measured, false-positive rate reported).

---

## PHASE 11 — RECURRING WORK, REPEAT HIRING, BUSINESS MODULE

```text
P11-JOB-01  Recurrence: RRULE-lite (days of week + time + until/count), an occurrence generator
            job creating instances 14 days ahead, per-occurrence cancellation, series editing rules
            (edit future only), and per-occurrence assignment.
P11-JOB-02  Repeat hire: "Book again" creates a pre-filled job addressed to a specific worker with
            a direct-offer flow (skips open applications), with a 24 h acceptance window.
P11-BIZ-03  Business profile, multiple managers with roles, workplace locations.
P11-BIZ-04  Shifts: create shift templates, roster, request N workers, approve/decline,
            attendance from work sessions, weekly export (CSV/XLSX).
P11-BIZ-05  Worker pool: favourites, invite-only shifts, per-worker notes, performance history.
P11-UI-06   Business tab screens (S47–S52 of the business set: dashboard, create shift, requests,
            workforce, attendance, analytics).
```
- **Tests:** DST-free timezone math over 90 days; editing a series does not mutate past
  occurrences; attendance totals match work sessions exactly; export column contract test.

---

## PHASE 12 — AI FEATURES (only after real data exists)

```text
P12-AI-01  NL job parsing (AI V1): text → structured draft. MANDATORY human confirmation screen
           showing every extracted field with an [edit] affordance. Confidence per field; anything
           below threshold is left blank, never guessed. Bangla + Banglish input. Fallback to the
           manual form on any failure. Never auto-publish.
P12-AI-02  Job description assistance & skill extraction (suggest categories/skills from text).
P12-AI-03  Price insight (AI V2): ONLY from ≥30 real completed jobs in the same
           (category, area, job_type, 90-day window). Below the threshold → show nothing.
           Display as a range with sample size: "Based on 42 similar jobs: ৳400–৳650".
P12-AI-04  Learning-to-rank on top of D5: the model outputs a re-rank score blended with the
           deterministic score (start 20% weight), shadow-tested for 4 weeks before it affects
           anyone, with a kill switch and per-cohort metrics.
P12-AI-05  Fraud/no-show risk prediction feeding the P10 review queue only — never an auto-action.
```
- **Rules:** every AI feature is behind a flag, has a deterministic fallback, logs input/output for
  evaluation, and is measured against a held-out set before rollout. No AI feature may block a user
  from earning. Prompts and model choices live in `/docs/ai-roadmap.md` with an eval table.

---

## PHASE 13 — ANALYTICS & MARKETPLACE HEALTH

```text
P13-ANALYTICS-01  Event tracking spec (`/docs/analytics.md`): a canonical event list with
                  properties; client + server events; no PII in properties.
P13-ANALYTICS-02  Metric jobs (nightly, materialised tables):
                  Supply: active workers, available workers, by category, by area, by hour
                  Demand: jobs posted, by category/area/hour, average budget, urgency mix
                  Liquidity: time-to-first-application, time-to-fill, FILL RATE, completion rate
                  Reliability: cancellation rate, no-show rate, dispute rate, on-time rate
                  Financial: GMV, take rate, revenue, ARPU, payout lag
                  Funnels: install→signup→profile→first apply→first job (worker)
                           install→signup→post→publish→fill→complete→repeat (customer)
P13-ANALYTICS-03  Imbalance detector: per (category × area × time bucket), classify supply/demand
                  as LOW/MED/HIGH and surface an ops action list ("recruit 12 electricians in
                  Motihar"). This is the growth engine — build it, do not skip it.
P13-ANALYTICS-04  Admin analytics screens + a weekly emailed ops digest.
```
**North-star metric:** *weekly completed jobs*. Guardrail metrics: fill rate, completion rate,
dispute rate, D30 repeat-hire rate. Downloads are explicitly NOT a success metric.

---

## PHASE 14 — HARDENING & RELEASE

```text
P14-QA-01  Full security pass (PART H6), dependency audit, secrets scan, penetration checklist
P14-QA-02  Performance pass: F8 budgets enforced, DB slow-query review, N+1 hunt, index verification
P14-QA-03  Load test: 500 concurrent users, 50 jobs/min publish, 200 msg/s chat; document limits
P14-QA-04  Backups: nightly pg_dump + WAL archiving + a RESTORE DRILL (untested backups don't exist)
P14-QA-05  Observability: Sentry, structured logs, dashboards, alerts (error rate, queue depth,
           webhook failures, ledger drift, stuck jobs, OTP failure spike)
P14-QA-06  Legal & store: privacy policy, terms, data-deletion route, Play Store listing (bn+en),
           screenshots, data-safety form, age rating, permission rationales
P14-QA-07  Release: staged rollout 10%→50%→100%, force-update mechanism, maintenance mode,
           rollback plan, on-call runbook (`/docs/runbook.md`)
```

---
---

# PART H — TESTING STRATEGY

## H1. Pyramid & tooling

| Level | Backend | Mobile | Admin | Target |
|---|---|---|---|---|
| Unit | Jest | flutter_test | Vitest | ~70% of all tests; ≥90% branch on business logic |
| Integration | Jest + Supertest + Testcontainers Postgres | Riverpod container + mock dio | RTL | every endpoint, every repository |
| Widget/Component | — | flutter_test golden + semantics | Storybook | every shared widget, 2 locales × 3 text scales |
| E2E | Supertest full-flow | `integration_test/` on a real device/emulator | Playwright | the 8 critical journeys (H3) |
| Non-functional | k6 load, `npm audit`, ZAP baseline | performance overlay, APK size gate | Lighthouse | per release |

**Rules:** no test touches the network or the real clock. Time is injected (`ClockPort`). Randomness
is seeded. Every test is independent and can run in any order. Fixtures live in `test/factories/`
(a builder per entity). The DB is reset per test file via a transaction rollback.

## H2. What must be unit-tested (non-negotiable list)

```text
Matching score calculator (D5)          — golden fixtures + weight sensitivity + NaN safety
Availability calculator (D4)            — edge cases + property tests
Job state machine (D3)                  — full (from,to) matrix + invariants I1–I7
Fee & money math (D6)                   — rounding, min/max clamps, resolution order, poisha only
Ledger balancing (D6)                   — every scenario sums to zero
Cancellation policy engine (D8)         — every tier boundary + emergency + strikes
Reputation aggregation (D7)             — damped average, rate calculations, badge boundaries
Privacy projections (D10)               — per-viewer field masking, table-driven
Notification rules (D11)                — quiet hours, dedupe, preferences, throttles
Category safety policy (D12)            — age/certificate/trust gating per category
Validation schemas                      — every rule → its own test asserting the exact messageKey
i18n                                    — no missing key in bn or en; no hardcoded string in widgets
```

## H3. The 8 critical journeys (E2E, must pass before every release)

```text
J1 Worker signup → profile → skills → availability → sees a relevant feed
J2 Customer signup → post job → publish → receives applications
J3 Apply → accept → confirm → in progress → submit → confirm completion → both reviews
J4 Cancellation by worker 3 h before start → penalty applied → job reopened → refilled
J5 Dispute after submission → evidence → admin resolution → correct ledger outcome
J6 Chat: application → message → image → block → report
J7 Payment (flag on): intent → charge → held → release → payout request
J8 Admin: find a stuck job → force transition → audit log shows who/what/why
```

## H4. MVP acceptance scenario (the "is it real?" test — automate it)

```text
GIVEN  a customer account (verified phone) and a worker account (verified phone,
       skills = [moving, lifting], available Mon 10:00–14:00, home 1.5 km from Talaimari)
WHEN   the customer posts: "Need someone to help move furniture tomorrow 10 AM–1 PM near
       Talaimari, budget ৳1,000"
THEN   1. job publishes with status PUBLISHED → APPLICATIONS_OPEN
       2. the matcher scores the worker ≥ 70 and the worker is in the notify set
       3. the worker receives a push + in-app notification within 60 s
       4. the job appears at the top of the worker's "Jobs for you" with a match badge and reasons
       5. the worker applies; the customer is notified
       6. the customer sees the worker profile with rating, jobs, trust badges, distance
       7. the customer accepts → assignment + contract snapshot created → status CONFIRMATION_PENDING
       8. the worker confirms → CONFIRMED → chat unlocked → exact address revealed to the worker only
       9. at start time → IN_PROGRESS (or CHECKED_IN if the flag is on and the worker is in geofence)
      10. the worker submits → SUBMITTED → CUSTOMER_REVIEW → the customer is reminded
      11. the customer confirms → COMPLETED → payment released per the configured flow
      12. both submit reviews (double-blind) → REVIEWED → aggregates and badges update
      13. the job appears in both histories; "Book again" is available to the customer
ASSERT every status change has a history row; no exact address leaked before step 8;
       fee math is exact; ledger balances; both reputations updated; all copy is in Bangla.
FAIL   ⇒ the MVP is NOT ready. Do not proceed to the pilot.
```

## H5. Manual QA checklist (run per screen, per release)

```text
[ ] Bangla and English both render correctly; no clipped or mixed-script labels
[ ] textScaleFactor 1.0 / 1.3 / 2.0 — nothing overlaps or is cut off
[ ] 320 dp width (small phone) and 480 dp width — no horizontal scroll of primary content
[ ] Airplane mode: offline banner, cached data, queued writes, no crash, no duplicate submit
[ ] Slow 3G (throttled): skeletons appear <300 ms; no frozen UI; requests cancel on back
[ ] Kill and relaunch mid-flow: state restored or a clear restart path
[ ] Rotate device / switch to another app and back
[ ] Back button on every screen goes somewhere sensible; no dead ends
[ ] Every button that can fail shows a loading state and cannot be double-tapped
[ ] Dark mode legible; TalkBack reads every control
[ ] Battery/data: no unexpected background activity after 10 min idle
Device matrix (minimum): 2 GB RAM Android 10 · 4 GB Android 13 · Android 14 · one iPhone (P14)
```

## H6. Security test checklist (P14, and after any auth/payment change)

```text
[ ] IDOR: for every /:id endpoint, another user's id → 404/403, never data (automated matrix)
[ ] Vertical privilege escalation: worker→admin endpoints, role forced in the JWT payload
[ ] JWT: alg=none rejected, expired rejected, tampered signature rejected, refresh reuse detected
[ ] OTP: brute force limited, enumeration impossible (identical response for known/unknown phones)
[ ] Rate limits verified per endpoint class
[ ] SQL injection on every filter/sort/search param (parameterised only; sort whitelisted)
[ ] Mass assignment: extra fields rejected (whitelist validation proven)
[ ] File upload: mime spoofing, oversize, path traversal in keys, SVG/HTML XSS, EXIF GPS stripped
[ ] Signed URLs expire; verification documents unreachable without a fresh signed GET
[ ] Money: client-supplied amount/fee ignored; negative and overflow amounts rejected
[ ] Webhooks: bad signature rejected, replay is a no-op, timestamp window enforced
[ ] PII: no phone/token/document key in logs, Sentry, or analytics events
[ ] Secrets: none in the repo (gitleaks in CI); .env.example only
[ ] Dependencies: audit clean or documented exceptions with dates
[ ] Mobile: no secret in the APK, cert pinning considered, screenshots blocked on document screens
```

---
---

# PART I — DEPLOYMENT & OPERATIONS

## I1. Environments

```text
local    docker-compose: api, postgres, redis, minio, mailhog, admin
staging  a small VPS/managed container; a full copy of prod config with test credentials;
         seeded with synthetic data ONLY (clearly labelled, never real user data)
prod     API (2+ instances behind nginx/ALB) · managed Postgres (daily backup + PITR) ·
         managed Redis · S3-compatible storage · a separate worker instance for BullMQ
```

## I2. Pipeline

```text
PR              lint → typecheck → unit → integration → build → (Playwright on admin) → preview
merge to main   → deploy staging → run E2E (H3) → smoke tests → manual approval
tag v*          → migrate (with a backup taken first) → deploy prod (rolling) → smoke → monitor
                → Play Store staged rollout 10% → 50% → 100% over 72 h
rollback        previous image + `prisma migrate resolve`; migrations MUST be backward compatible
                for one release (expand → migrate → contract, never a destructive one-shot)
```

## I3. Runbook essentials (`/docs/runbook.md`)

```text
Alerts:  5xx rate > 1% (5 min) · p95 > 1 s · queue depth > 1000 · webhook failures > 0 ·
         ledger drift ≠ 0 · stuck jobs (status age > 2× expected) · OTP failure rate > 30% ·
         disk > 80% · failed nightly backup
Playbooks: API down · DB failover · payment provider outage (switch to cash mode via a flag) ·
           SMS provider outage (fallback provider, then a manual code path for support) ·
           mass-notification mistake (kill the queue, publish a correction) ·
           a stuck job (admin force-transition + reason) · a safety incident (see J5)
On-call: single-founder reality — define a 24 h response SLA, an auto-reply, and a status page.
```

---
---

# PART J — RAJSHAHI PILOT PLAYBOOK

## J1. Sequencing (do NOT launch citywide)

```text
Zone 1 (weeks 1–4):  RUET + Talaimari + Kazla + Binodpur   — dense students + shops + households
Zone 2 (weeks 5–8):  University of Rajshahi + Motihar + Kazla extension
Zone 3 (weeks 9–12): Shaheb Bazar + Laxmipur + Uposhohor (commercial + middle-class households)
Only after Zone 1 fill rate > 60% for two consecutive weeks may Zone 2 open.
```

## J2. Supply first (target 150–300 verified workers before any demand marketing)

```text
Channels: RUET clubs & departmental groups · RU & Rajshahi College student groups · coaching
centres · local technician associations · shop-worker networks · Facebook groups · campus posters
with a QR · a 20-person ambassador programme (one per hall/department, paid per ACTIVATED worker —
activated = profile complete + availability set + first application, not per install).
Mix to recruit: 60 students (design/tutoring/data entry/event), 40 shop & restaurant helpers,
25 cleaners/domestic, 20 electricians/plumbers/AC/computer technicians, 15 photographers/event,
10 delivery helpers, 10 tutors. Verify every one of them manually in the first month.
```

## J3. Demand & concierge operations

```text
Onboard 30–100 households/shops face-to-face. For the first 8 weeks run CONCIERGE MODE:
 - an ops person watches every posted job in the admin dashboard
 - if no application within 60 minutes → phone 3 matched workers manually
 - if no worker is available → tell the poster honestly and give an ETA; never leave silence
 - after every completed job, phone both sides for feedback (this is your research pipeline)
Manual work is a feature at this stage. Automate a step only after doing it 20 times by hand.
```

## J4. Pilot success gates (decide with data, not feelings)

```text
Week 4   ≥ 150 verified workers · ≥ 40 jobs posted · fill rate ≥ 40% · ≥ 20 completed jobs
Week 8   fill rate ≥ 60% · completion rate ≥ 85% · time-to-first-application < 2 h (median)
         · repeat-hire rate ≥ 20% · dispute rate < 5% · no-show rate < 8%
Week 12  ≥ 300 completed jobs · ≥ 30% of jobs from returning customers · NPS collected from both
         sides · at least 3 businesses using recurring shifts
GO/NO-GO: expand only if fill rate, completion rate, and repeat-hire rate are all above target.
Otherwise fix liquidity — do NOT build more features.
```

## J5. Safety operations (must exist on day 1 of the pilot)

```text
- A published safety page (bn) + in-app tips at every risky moment
- A support phone number answered during 09:00–22:00
- An incident protocol: log → contact both parties → suspend if needed → escalate to authorities
  where warranted → record in moderation_actions → post-incident review within 48 h
- A student-safety rule set: verified poster required for any job at a private residence involving
  a student worker; encourage public-place first meetings; scope and pay stated in writing
- Zero tolerance: harassment, wage theft, requests for payment from workers to get a job
```

---
---

# PART K — COPY-PASTE PROMPT LIBRARY FOR CODEX

### K1. Phase kickoff
```text
Read KAJ_BUILD_GUIDE.md PART A, PART B, and PART G > PHASE <N>.
Summarise: the phase goal, the task list in order, the files you expect to create, and the exit gate.
Do not write any code yet. Ask me any blocking questions now.
```

### K2. Single task execution
```text
Execute task <TASK_ID> from KAJ_BUILD_GUIDE.md.
Read: PART A (rules + loop), PART B (conventions), and the referenced PART D/E/F sections.
Follow the A3 loop exactly: restate → plan → write failing tests → implement → run → verify
acceptance line by line → update docs → single conventional commit → report.
Constraints: do not touch files outside your plan; do not implement future-phase features;
do not invent APIs or packages. If blocked twice on the same error, stop and report.
```

### K3. Business logic (highest care)
```text
Implement <matching | state machine | availability | fee/ledger | cancellation> exactly as
specified in KAJ_BUILD_GUIDE.md PART D<section>. Requirements:
- the core algorithm is a PURE function in its own file with no IO
- every tunable value comes from config_settings, not from a constant
- write the test table FIRST, including every edge case listed in that PART D section
- expose an explain() that reproduces the result from stored inputs
Show me the pure function and its tests before wiring anything into a controller.
```

### K4. Screen implementation
```text
Implement screen <S##> per KAJ_BUILD_GUIDE.md PART F (F2 tokens, F3 components, F5 format,
F6 examples, F7 copy rules, F8 budgets, F9 accessibility).
Rules: reuse F3 components only (if a new one is needed, add it to the inventory with a widget
test); all strings via l10n in bn AND en; implement loading/empty/error/offline/success states;
add the test IDs from the screen spec; write widget tests in both locales at textScale 1.0 and 2.0.
Output the screen spec file /docs/ui/<S##>.md first, then the code.
```

### K5. Review / audit prompt (run at every exit gate)
```text
Audit the current codebase against KAJ_BUILD_GUIDE.md PART A rules R1–R15, the PART D
specifications, and the PHASE <N> exit gate. For each item output PASS / FAIL / N-A with file:line
evidence. Do not fix anything yet — produce the report and a prioritised fix list first.
```

### K6. Debug prompt
```text
Failing: <test name / error>. Before changing code:
1. State the expected behaviour per KAJ_BUILD_GUIDE.md (quote the section).
2. State the actual behaviour and the minimal reproduction.
3. Give the root cause — not the symptom.
4. Propose the smallest fix and any test that should have caught this earlier.
Then implement, and add the missing test.
```

### K7. Anti-drift reminder (paste when Codex over-builds)
```text
STOP. You are outside the scope of <TASK_ID>. Revert anything not in the task's file list.
Write the extra ideas to /docs/backlog.md with a one-line rationale, then continue the original task.
Remember: Trust > Reliability > Simplicity > Speed > Features.
```

---
---

# PART L — MASTER CHECKLIST

```text
PHASE 0 — RESEARCH
[ ] competitor-analysis.md (per-competitor tables + gap matrix)
[ ] market-research.md (Rajshahi, sourced)
[ ] validation.md (35 interviews + 5 concierge transactions)
[ ] user-personas.md (6 personas)
[ ] opportunity-map.md (10+ validated gaps)
[ ] product-requirements.md (MVP IN / OUT with reasons)
[ ] business-model.md + risks.md
[ ] legal-checklist.md (areas needing professional advice flagged)

PHASE 1 — FOUNDATION
[ ] monorepo + docker + CI     [ ] NestJS skeleton + envelopes    [ ] Prisma schema + seed
[ ] phone OTP + refresh rotation [ ] policy-based authz + matrix test [ ] adapter ports
[ ] Flutter skeleton + tokens + l10n [ ] S01–S04                  [ ] EXIT GATE signed

PHASE 2 — IDENTITY & TAXONOMY
[ ] categories/skills/locations (data-driven) [ ] profiles & role modes [ ] skills & rates
[ ] availability engine (pure + tested)       [ ] uploads (EXIF stripped, signed URLs)
[ ] S05–S10, S19, S24, S25, S45, S50, S51     [ ] EXIT GATE signed

PHASE 3 — JOBS & APPLICATIONS
[ ] job create/publish/validate + address encryption [ ] state machine (matrix tested)
[ ] feed + filters + keyset pagination              [ ] applications + concurrency safety
[ ] poster accept → assignment + contract           [ ] S30–S36, S14–S17
[ ] EXIT GATE signed

PHASE 4 — MATCHING & NOTIFICATIONS
[ ] score calculator (pure, golden tests, explain()) [ ] ranked feed + suggested workers
[ ] notification service (D11) + fan-out queue       [ ] S11–S13, S29, S37, S38, S44, S48
[ ] EXIT GATE signed

PHASE 5 — ASSIGNMENT → COMPLETION
[ ] confirmation window + timers [ ] contract snapshot [ ] progression + auto-confirm
[ ] cancellation engine (D8)     [ ] S18, S20, S23, S39, S40, S41
[ ] H4 acceptance scenario automated and GREEN        [ ] EXIT GATE signed

PHASE 6 — REVIEWS         [ ] two-sided double-blind [ ] reputation + badges [ ] S28, S43, S49
PHASE 7 — CHAT            [ ] conversations + policy [ ] WS gateway [ ] S46, S47
PHASE 8 — ADMIN (MVP GATE)[ ] admin auth + 2FA [ ] all ops modules [ ] audit logs [ ] Playwright e2e
PHASE 9 — PAYMENTS        [ ] ledger + idempotency [ ] provider adapter + webhooks [ ] payouts
                          [ ] S22, S42 [ ] reconciliation proves balance
PHASE 10 — TRUST          [ ] verification [ ] disputes [ ] check-in [ ] moderation [ ] anti-fraud
PHASE 11 — RECURRING/BIZ  [ ] recurrence [ ] repeat hire [ ] business + shifts + attendance
PHASE 12 — AI             [ ] NL parsing (human-confirmed) [ ] price insight (data-gated)
                          [ ] LTR re-rank (shadow-tested) [ ] risk models (review-queue only)
PHASE 13 — ANALYTICS      [ ] event spec [ ] metric jobs [ ] imbalance detector [ ] admin analytics
PHASE 14 — RELEASE        [ ] security pass [ ] performance budgets [ ] load test [ ] backup drill
                          [ ] observability [ ] legal + store assets [ ] staged rollout

PILOT
[ ] 150+ verified workers in Zone 1  [ ] 30+ demand accounts  [ ] concierge ops running
[ ] Week-4 / Week-8 / Week-12 gates measured and recorded
[ ] GO/NO-GO decision documented with data
```

---

## FINAL NOTE TO THE AGENT

The hard part of this product is **not the code**. It is liquidity, trust, and one transaction that
actually works. Build the smallest system in which a person in Rajshahi can reliably find another
person to do a real task — and instrument it so you can see, honestly, whether that is happening.

Everything in Phases 9–13 exists only to make that one loop safer, faster, and repeatable.
If a feature does not increase **fill rate, completion rate, or repeat-hire rate**, it does not ship.

**Trust > Reliability > Simplicity > Speed > Features.**

*END OF BUILD GUIDE*
