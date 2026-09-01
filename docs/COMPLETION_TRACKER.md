# KAJ Completion Tracker

**Last updated:** 2026-09-01
**Current phase:** Phase 2 — identity, taxonomy, and profiles
**Current task:** Phase 2 exit gate — timed human onboarding evidence
**Product-code gate:** Owner overrode the sequencing gate on 2026-08-18; Phase 0 remains unreviewed

## Status legend

- `PLANNED` — sequenced but not started.
- `IN PROGRESS` — active work; acceptance is not yet satisfied.
- `IMPLEMENTED` — locally committed with verification green; remote publication was not authorized.
- `BLOCKED` — cannot proceed without stated evidence, authority, professional input, or environment capability.
- `COMPLETE` — implemented/documented, verified, committed, and pushed.
- `REVIEWED` — complete and explicitly accepted by the required human gate owner.

## Completed project-control steps

| Step                                   | Status   | Output                                                                        | Verification                                                                              | Git evidence                                            |
| -------------------------------------- | -------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Repository bootstrap                   | COMPLETE | Git repository, `main`, remote, initial README                                | Push to `origin/main` succeeded                                                           | `4ded9b1`                                               |
| P0-PLAN-00 planning and tracking setup | COMPLETE | Source documents tracked; executable plan; live tracker; completion procedure | All Markdown files read; source hierarchy, gates, task sequence, and local tools recorded | Commit containing this row; push required before report |

## Phase 0 — research and validation

| Task                 | Status   | Deliverable / required evidence                                                                                                | Completion record                                         |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| P0-RES-01            | COMPLETE | `docs/competitor-analysis.md` with 28 sourced competitor/informal-channel tables                                               | `docs/completed/P0-RES-01.md`                             |
| P0-RES-02            | COMPLETE | 22-capability evidence-derived gap matrix appended to competitor analysis                                                      | `docs/completed/P0-RES-02.md`                             |
| P0-RES-03            | COMPLETE | `docs/market-research.md` with sourced Rajshahi evidence, three-zone OSM sample, price samples, limitations, and field handoff | `docs/completed/P0-RES-03.md`                             |
| P0-RES-04            | BLOCKED  | `docs/validation.md`; 35 interviews and 5 concierge transactions                                                               | Needs owner-provided field evidence                       |
| P0-RES-05            | PLANNED  | Six evidence-based personas                                                                                                    | Depends on P0-RES-04                                      |
| P0-RES-06            | PLANNED  | Validated/killed opportunity hypotheses                                                                                        | Depends on P0-RES-04                                      |
| P0-RES-07            | PLANNED  | MVP product requirements                                                                                                       | Pending                                                   |
| P0-RES-08            | PLANNED  | Business model scenarios and risk register                                                                                     | Pending                                                   |
| Phase 0 owner review | BLOCKED  | Every Phase 0 deliverable marked `STATUS: reviewed`; legal checklist present                                                   | Requires Abu Sufyan review and professional items flagged |

## Phase 1 — foundation

| Task       | Status      | Notes                                                                                                                                                                                                                                 |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-INF-01  | COMPLETE    | pnpm monorepo, four-service Compose stack, shared-types, minimal `/health` and Prisma bootstrap; completion record `docs/completed/P1-INF-01.md`.                                                                                     |
| P1-INF-02  | COMPLETE    | Exact E1 envelopes, strict validation, request context, redacted Pino logging, Swagger, health, and lazy infra shells; completion record `docs/completed/P1-INF-02.md`.                                                               |
| P1-INF-03  | COMPLETE    | PostgreSQL D2 schema, 46-table migration, UUID v7 defaults, required indexes, and idempotent seed; completion record `docs/completed/P1-INF-03.md`.                                                                                   |
| P1-AUTH-04 | COMPLETE    | BD phone OTP, rate limits, hashed challenges/tokens, protected sessions, device binding, rotation, and family reuse revocation; completion record `docs/completed/P1-AUTH-04.md`.                                                     |
| P1-AUTH-05 | IMPLEMENTED | Global default-deny JWT/role/policy guards, CASL-style ability rules, private-resource 404 handling, and a growing authorization matrix; local completion record `docs/completed/P1-AUTH-05.md`.                                      |
| P1-INF-06  | IMPLEMENTED | Provider-neutral SMS, push, S3 storage, and payment ports; environment-selected fail-closed adapters; local completion record `docs/completed/P1-INF-06.md`.                                                                          |
| P1-UI-07   | IMPLEMENTED | Flutter core, English l10n owner override, shared UI states, network/token/offline/analytics/permission foundation, 18 tests, and all flavor builds; sibling `../Kaaj` commit `7a08d07`, record `../Kaaj/docs/completed/P1-UI-07.md`. |
| P1-UI-08   | PLANNED     | S01–S04 within the six-screen onboarding budget.                                                                                                                                                                                      |
| P1-QA-09   | PLANNED     | GitHub Actions gates.                                                                                                                                                                                                                 |

## Phase 2 — identity, taxonomy, and profiles

| Task              | Status      | Notes                                                                                                                                                                                                                                                                       |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-TAX-01         | IMPLEMENTED | Public bilingual catalog endpoints, tree integrity, Redis caching/invalidation, administrator mutations, typed Flutter contracts, and persistent Hive cache; full backend and Flutter gates green. Completion record: `docs/completed/P2-TAX-01.md`.                        |
| P2-USR-02         | IMPLEMENTED | Profile updates, idempotent dual-role activation, lazy role profiles, PHONE trust initialization, home routing payload, and actionable role-only 403; full backend gates green. Completion record: `docs/completed/P2-USR-02.md`.                                           |
| P2-USR-03         | IMPLEMENTED | Atomic worker skill replacement, 15-skill cap, duplicate/unknown checks, bilingual output, and optional bounded rates; full backend gates green. Completion record: `docs/completed/P2-USR-03.md`.                                                                          |
| P2-USR-04         | IMPLEMENTED | Exact D4 calculator, fixed Dhaka time arithmetic, exceptions, buffered conflicts, recurrence rule, atomic persistence API, and 100% calculator branch coverage. Completion record: `docs/completed/P2-USR-04.md`.                                                           |
| P2-USR-05         | IMPLEMENTED | Private signed uploads, byte-level verification, EXIF-free photo variants, sensitive documents, and owner-scoped signed reads; full backend gates green. Completion record: `docs/completed/P2-USR-05.md`.                                                                  |
| P2-UI-06          | IMPLEMENTED | Bangla-first persisted onboarding, role/location/skills/rates/availability flows, all required Phase 2 destinations, server-backed D10 preview, 35 tests, and all flavor builds. Timed human evidence remains exit-gate work. Record: `../Kaaj/docs/completed/P2-UI-06.md`. |
| Phase 2 exit gate | BLOCKED     | Engineering checks are green, including D10 public masking (`docs/completed/P2-D10-PROJECTION.md`). A human must complete a timed Bangla onboarding run in ≤90 seconds.                                                                                                     |

### Accepted storage direction

ADR-0001 records PostgreSQL 16 as the authoritative transactional database after the owner directed
the recommended path to proceed. Turso/libSQL is not used for domain data. No database credential
may enter Git history, and the previously exposed Turso credential must be rotated.

### Early-engineering override

On 2026-08-18, the owner explicitly instructed the agent to start building the app. This authorizes
Phase 1 engineering to proceed while P0-RES-04 through P0-RES-08 and the Phase 0 review remain open.
It does not mark research as reviewed, validate demand, or authorize pilot launch, payments, AI, or
production handling of personal data.

## Phases 2–8 — cash-first MVP

| Phase   | Status               | Task IDs / exit result                                                      |
| ------- | -------------------- | --------------------------------------------------------------------------- |
| Phase 2 | IN PROGRESS          | All engineering tasks implemented; timed human onboarding evidence remains. |
| Phase 3 | PLANNED              | P3-JOB-01..03, P3-APP-04..05, P3-UI-06; transaction-spine gate.             |
| Phase 4 | PLANNED              | P4-MATCH-01..02, P4-NOTIF-03, P4-UI-04; explainable matching gate.          |
| Phase 5 | PLANNED              | P5-ASSIGN-01..04, P5-UI-05; H4 completion-journey gate.                     |
| Phase 6 | PLANNED              | P6-REV-01..02, P6-UI-03; two-sided reputation gate.                         |
| Phase 7 | PLANNED              | P7-CHAT-01..02, P7-UI-03; secure real-time chat gate.                       |
| Phase 8 | ENGINEERING COMPLETE | P8-ADMIN-01..02 delivered; external pilot gates remain.                     |

## Phases 9–14 — gated expansion and release

| Phase    | Status            | Gate / task family                                                                                  |
| -------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| Phase 9  | PARTIAL / BLOCKED | P9-PAY-01 provider-neutral money core delivered; provider, payout, UI, tax, and legal gates remain. |
| Phase 10 | PLANNED           | P10 trust, verification, disputes, check-in, moderation, anti-fraud.                                |
| Phase 11 | PLANNED           | P11 recurrence, repeat hire, business profiles, shifts, workforce.                                  |
| Phase 12 | BLOCKED           | P12 AI requires real data thresholds, evaluation, and approved flags.                               |
| Phase 13 | PLANNED           | P13 canonical events, metrics, imbalance detection, admin analytics.                                |
| Phase 14 | PLANNED           | P14 security, performance, load, recovery, observability, legal/store, rollout.                     |

### Phase 9 task status

| Task      | Status      | Evidence                                                                                                                                 |
| --------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| P9-PAY-01 | IMPLEMENTED | Server-derived intent, fee chain, durable idempotency, balanced immutable ledger, live concurrency tests; `docs/completed/P9-PAY-01.md`. |
| P9-PAY-02 | BLOCKED     | Requires signed legal/compliance checklist and selected provider contract before adapter/webhook work.                                   |
| P9-PAY-03 | BLOCKED     | Requires approved payout, refund, tax, and flow-of-funds model.                                                                          |
| P9-UI-04  | BLOCKED     | Digital-payment UI must not imply unavailable payment, wallet, refund, or payout capability.                                             |

## Human and professional gates

| Gate                                 | Owner                              | Status  | Evidence needed                                                               |
| ------------------------------------ | ---------------------------------- | ------- | ----------------------------------------------------------------------------- |
| Phase 0 research acceptance          | Abu Sufyan                         | BLOCKED | Reviewed status on every Phase 0 deliverable.                                 |
| Field validation                     | Abu Sufyan / research participants | BLOCKED | Interview notes and concierge-transaction records.                            |
| Entity and registrations             | Abu Sufyan + professionals         | BLOCKED | Chosen entity, trade licence, tax registrations, bank account, DBID decision. |
| Data/labour/payment/minors/liability | Bangladeshi counsel                | BLOCKED | Written answers to pre-build Part 13 questions.                               |
| VAT and withholding                  | Chartered accountant               | BLOCKED | Written tax treatment.                                                        |
| Operations and incident coverage     | Abu Sufyan                         | BLOCKED | Named primary/backup owners and runbooks.                                     |
| Pilot age policy                     | Abu Sufyan + counsel               | BLOCKED | Explicit policy; 18+ is the documented recommendation.                        |
| Production data residency            | Abu Sufyan + counsel               | BLOCKED | Approved hosting and restricted-data replication decision.                    |

## Update rules

1. Update this file in the same commit as every completed task.
2. Add a detailed `docs/completed/<TASK-ID>.md` report using the procedure in `docs/completed/README.md`.
3. Do not use `COMPLETE` until acceptance checks pass and the commit is ready to push.
4. Record human-owned work as `BLOCKED`, not complete, until evidence is supplied.
5. The final assistant report supplies the exact commit hash and push result; Git history is the immutable commit record.
