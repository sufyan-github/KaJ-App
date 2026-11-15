# 00 — Current Architecture (as built)

Verified against `agent/p1-ui-07-tracker@94adf43` (backend/admin) and `codex/production-hardening@9fe6a54` (mobile). Path references are relative to each repo root.

## 1. System context

```text
 Flutter app (Android, app.kaaj.mobile)                 Next.js admin console
   Dio REST  +  socket.io (/chat)                         browser → Next server proxy
        │                                                  (/api/admin/* → /api/v1/admin/*)
        ▼                                                         │  HttpOnly SameSite=Strict cookie
 ┌──────────────────── NestJS API (single Render service) ───────┴─────────┐
 │ api/v1 (168 HTTP routes, 28 controllers)   /health  /ready   /chat (WS) │
 │ guard chain: Jwt → AccountModeration → Roles → Policy → Subscription    │
 │ 6 in-process setInterval runners (no queue, no distributed scheduler)   │
 └──┬──────────────┬───────────────┬──────────────────┬───────────────────┘
    │              │               │                  │
 PostgreSQL 16   Redis 7        S3 / MinIO       PHP bdApps gateway (external, not in repo)
 (Supabase)      OTP limits,    private bucket,  OTP SMS + carrier subscription billing
 66 models       catalog cache, presigned        HMAC between Nest ⇄ PHP
                 webhook nonces PUT/GET
```

Push (FCM), digital payments and email are **ports with disabled or manual adapters**:

- `PUSH_PORT` is never injected.
- `PAYMENT_PROVIDER` only accepts `manual`.

## 2. Backend modules (`backend/src/modules`)

| Module          | Responsibility (verified)                                                                                                                       | Notes                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `auth`          | Phone OTP (bdApps / console), mobile password login and recovery, refresh rotation with family reuse detection, devices, session                | OTP is Robi/Airtel only (`common/phone.ts`)   |
| `admin-auth`    | Admin email + password + TOTP, opaque HMAC sessions, `AdminSessionGuard`, `@AdminRoles`                                                         | No staff-management UI yet                    |
| `users`         | Profile, role activation, worker skills and rates, portfolio, account deletion request, public profiles and worker directory, blocks, favorites | No GET of the caller's own profile            |
| `catalog`       | Categories, skills, locations (public reads, Redis-cached); `catalog-admin.controller.ts` writes                                                | Duplicates admin-ops writers                  |
| `availability`  | Weekly rules, exceptions, slot calculator (Dhaka offset)                                                                                        | —                                             |
| `jobs`          | Jobs, applications, booking requests, assignments, contract snapshots, state machine (21 job statuses), recurrence                              | One job status drives every assignment        |
| `matching`      | Explainable weighted score for job↔worker                                                                                                       | Ignores the Dhaka offset; cold start scores 0 |
| `attendance`    | Geofenced check-in/out, poster/admin override, consent                                                                                          | Jobs never get coordinates                    |
| `reviews`       | Two-sided reviews, reveal, reputation recompute, badges                                                                                         | Paired-only counting                          |
| `disputes`      | Open, evidence, appeal                                                                                                                          | Resolution side effects incomplete            |
| `chat`          | REST conversations/messages, socket.io gateway, in-memory event bus                                                                             | User-room delivery only                       |
| `notifications` | In-app inbox, preferences, dedupe                                                                                                               | No push                                       |
| `payments`      | Cash payment records, payment intents, ledger (unreachable)                                                                                     | Payments deferred by owner                    |
| `subscriptions` | bdApps plans, operator identities, webhook, `SubscriptionGuard`                                                                                 | Plan `feature_keys` ignored                   |
| `verification`  | Identity, skill and business requests; documents; linear `TrustLevel` ladder; document purge runner                                             | SKILL not tied to a skill                     |
| `uploads`       | Presigned upload, byte-level verification, metadata stripping, signed reads                                                                     | Images and PDF only                           |
| `moderation`    | Reports, staged moderation actions, restore                                                                                                     | —                                             |
| `risk`          | Identity observations, rules, human review queue, advisory-locked scan                                                                          | —                                             |
| `admin-ops`     | 52 admin routes: dashboard, users, jobs, verification, categories, locations, config, flags, disputes, campaigns, analytics, audit              | Oldest-first queues                           |
| `health`        | `/health` liveness, `/ready` DB + Redis readiness                                                                                               | —                                             |

**Cross-cutting:**

- `common/filters/http-exception.filter.ts` builds the error envelope. It only preserves `KajHttpException`.
- `common/interceptors/logging.interceptor.ts` plus pino redaction.
- `common/policy/*`: `@Policy` is mandatory on every route (default-deny).
- `config/environment.ts`: zod environment validation; production refuses console SMS, fixed OTP and short keys.
- `infra/*`: provider-neutral ports for SMS, operator, push, storage and payment.

**Background runners**, each a `setInterval` in every instance:

- `assignment-lifecycle`
- `dispute`
- `recurrence`
- `reputation`
- `risk` (advisory lock)
- `verification-purge`

## 3. Data model (66 models, by domain)

| Domain           | Models                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/auth    | User, UserDevice, RefreshToken, OtpChallenge, AdminCredential, AdminLoginChallenge, AdminSession                                                                |
| Profiles         | Profile, WorkerProfile, CustomerProfile, BusinessProfile*, PortfolioItem, ServiceArea*, Favorite, SavedSearch*                                                  |
| Taxonomy         | Category (with safety-policy columns), Skill, UserSkill, Location (City → Thana → Area)                                                                         |
| Work             | Job, JobSkill, JobSchedule*, JobOccurrence, JobStatusHistory, Application, Assignment, Contract, AvailabilityRule, AvailabilityException, WorkSession           |
| Money (deferred) | Payment, LedgerEntry, FeeRule, IdempotencyRecord, Payout*, Wallet*                                                                                              |
| Subscriptions    | MobileOperator, UserOperatorIdentity, SubscriptionPlan, Subscription, SubscriptionPayment, SubscriptionAccessRule                                               |
| Reputation       | Review, Badge, UserBadge                                                                                                                                        |
| Chat/notify      | Conversation, ConversationParticipant, Message, UserBlock, Notification, NotificationPreference, NotificationCampaign                                           |
| Trust/safety     | VerificationRequest, VerificationDocument, Document, Dispute, DisputeEvidence, DisputeAppeal, Report, ModerationAction, RiskIdentityObservation, RiskReviewItem |
| Ops              | FeatureFlag, ConfigSetting, ConfigRevision, AuditLog                                                                                                            |

\* = table exists but is never written by application code.

**Conventions:**

- snake_case columns and `@@map` table names.
- UUID v7 primary keys.
- Money as BigInt poisha.
- All timestamps are `TIMESTAMP(3)` _without_ time zone (169 columns).

## 4. API conventions (as built)

- **Prefix and envelopes:** `/api/v1`; success `{ data, meta: { requestId, serverTime } }`; error `{ error: { code, messageKey, requestId, … } }`.
- **Validation:** global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`.
- **Authorization:** `@Policy` kinds actually used are `public` (71), `authenticated` (93) and `admin` (4). Ownership is enforced inside services and returns 404 to non-parties.
- **Pagination:** cursor only on chat messages. Elsewhere there are hard `take` caps (50/100) with no cursor.
- **Casing:** mostly camelCase serializers. Jobs, admin dashboard, audit logs and config revisions are raw snake_case Prisma rows.
- **Idempotency:** `Idempotency-Key` is honoured by attendance and payments only.
- **Swagger:** `/docs` outside production, but the schema isn't complete enough to generate clients (only 3 `@ApiProperty` uses; the plugin isn't enabled).

## 5. Mobile architecture (`kaj-mobile/lib`)

- **Folders:** `core/` (api_client with single-flight refresh and idempotency keys, routing, errors, design system `K*`, l10n, location, connectivity) and `features/{auth, billing, bootstrap, catalog, chat, home, jobs, notifications, onboarding, profile, settings, trust_safety}`.
- **State and navigation:** Riverpod providers, none auto-disposed; go_router with 45 routes.
- **Layering:** clean data/domain/presentation only in `auth` and `catalog`. Other features call repositories from widgets.
- **Storage:** Hive for onboarding state, chat outbox, catalog cache and locale; `flutter_secure_storage` for the refresh token; access token in memory.
- **Localization:** 76 ARB keys. Most UI is Bangla literals translated at runtime by `KaajLocalizations.text()`.

## 6. Admin architecture (`kaj-backend/admin`)

- One client component, `app/components/operations-console.tsx` (2,587 lines), switches 17 modules held in local state. There are no URL routes.
- Server routes are `app/api/admin/{login,totp,session,logout}` and `app/api/admin/ops/[...path]`, a proxy that forwards a bearer token from the HttpOnly cookie.
- Data shapes are hand-written inline. There's no shared package and no contract tests.

## 7. Known architectural constraints

These carry into the target architecture:

1. **Single-instance assumptions.** Socket fan-out uses an in-memory event bus, and runners have no leader election. Scaling to two or more Render instances breaks real-time chat and duplicates runner work.
2. **The job-level status machine can't represent multi-worker jobs.**
3. **The error filter discards details.** Clients can't branch on server codes.
4. **There's no contract artifact** (OpenAPI, shared types or generated clients), which is why the client and backend drift.
5. **Time-zone handling is implicit.** It relies on the DB session time zone and on UTC arithmetic in some services.
