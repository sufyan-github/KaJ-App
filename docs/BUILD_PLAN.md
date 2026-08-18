# KAJ Executable Build Plan

**Status:** Active
**Owner:** Abu Sufyan
**Last updated:** 2026-08-18
**Current stage:** Phase 1 — P1-AUTH-04 phone OTP authentication

## 1. Authority and conflict resolution

The project uses these sources together:

1. `KAJ_BUILD_GUIDE.md` is the authoritative build contract, domain model, API contract, task order, and phase gates.
2. `KAJ_UI_REQUIREMENTS.md` binds user-requirement IDs to screens and tests. Its Part 6 explicitly supersedes the build guide's UI tokens where they differ.
3. `KAJ_PREBUILD_PLAN.md` adds legal, company, operations, vendor, staffing, content, data-residency, and release gates.
4. `docs/COMPLETION_TRACKER.md` records execution status but cannot override the three source documents.

Conflict priority is: trust → reliability → simplicity → speed → features. No task may introduce a future-phase feature.

## 2. Current baseline

| Item             | State on 2026-08-18                 | Consequence                                                                                                  |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Git repository   | `main` tracks `origin/main`         | Each completed step can be committed and pushed immediately.                                                 |
| Product code     | P1-INF-03 database foundation       | API foundation plus the complete PostgreSQL D2 schema, first migration, and idempotent seed are implemented. |
| Source documents | Four Markdown files read completely | Plan incorporates the build, UI, and pre-build constraints.                                                  |
| Node.js          | 24.18.0                             | Compatibility and pinned engine must be verified in P1-INF-01.                                               |
| Corepack         | 0.35.0                              | Available for package-manager setup.                                                                         |
| pnpm             | 10.34.5 via Corepack                | Pinned in `package.json`; global Windows shim is unavailable without elevation.                              |
| Docker           | Desktop 4.87.0 / Engine 29.7.2      | Compose v2 runtime verified with all four local services.                                                    |
| Flutter          | 3.44.8 stable                       | Meets the locked Flutter 3.x stable decision.                                                                |
| Dart             | 3.12.2 stable                       | Meets the locked Dart 3 decision.                                                                            |

## 3. Mandatory execution loop

Exactly one build-guide task is executed at a time.

1. Read Part A, Part B, and every domain/API/UI section referenced by the task.
2. Restate the task in at most ten lines: output, files, and exclusions.
3. List planned file changes in order.
4. Write the specified failing tests first when the task produces testable code.
5. Implement only the minimum task scope.
6. Run affected unit and integration tests, lint, typecheck, and build checks.
7. Verify every acceptance item with concrete evidence.
8. Update relevant docs, `CHANGELOG.md`, `docs/COMPLETION_TRACKER.md`, and create `docs/completed/<TASK-ID>.md`.
9. Create one conventional commit and push it to `origin/main`.
10. Report output, behavior, verification, decisions, open issues, commit hash, push result, and next task.

If the same failure occurs twice, stop and record the blocker. Failed or unverified work remains `BLOCKED` or `IN PROGRESS`; it is never labelled complete.

## 4. Gate map

```text
Phase 0 evidence and owner review
  ↓
Phase 1 foundation → Phase 2 identity → Phase 3 transaction spine
  ↓
Phase 4 matching → Phase 5 completion → Phase 6 reputation → Phase 7 chat
  ↓
Phase 8 admin/operations = cash-first MVP gate
  ↓
Pilot readiness gate (legal + staffing + safety + store + content)
  ↓
Phases 9–13 only when their legal/data/market gates are satisfied
  ↓
Phase 14 hardening and staged release
```

The owner explicitly instructed engineering to begin on 2026-08-18 before the Phase 0 owner-review
gate. Phase 1 may proceed under that sequencing override, but all unfinished Phase 0 work remains
blocked/unreviewed and cannot be represented as validated evidence. Online payments remain disabled
until the legal/compliance gate is signed. AI price hints require at least 30 comparable completed
jobs; learning-to-rank requires real outcome data and shadow testing.

## 5. Build sequence

### Phase 0 — research and validation

| Order | Task      | Output                                               | Completion gate                                                                                         |
| ----: | --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
|     1 | P0-RES-01 | `docs/competitor-analysis.md`                        | Required competitor tables; each assertion sourced or labelled assumption.                              |
|     2 | P0-RES-02 | Gap matrix appended to competitor analysis           | Every listed capability scored Yes/Partial/No/Unknown.                                                  |
|     3 | P0-RES-03 | `docs/market-research.md`                            | Rajshahi figures, observations, prices, devices, payments, and seasonality are sourced.                 |
|     4 | P0-RES-04 | `docs/validation.md`                                 | Owner supplies evidence from 35 interviews and 5 concierge transactions. This is human-fieldwork gated. |
|     5 | P0-RES-05 | `docs/user-personas.md`                              | Six required personas grounded in validation evidence.                                                  |
|     6 | P0-RES-06 | `docs/opportunity-map.md`                            | Each differentiation hypothesis validated or killed with P0-RES-04 evidence.                            |
|     7 | P0-RES-07 | `docs/product-requirements.md`                       | MVP IN/OUT scope and success-metric rule recorded.                                                      |
|     8 | P0-RES-08 | `docs/business-model.md`, `docs/risks.md`            | Variable-based scenarios and full risk controls documented.                                             |
|  Gate | P0 review | All Phase 0 documents plus `docs/legal-checklist.md` | Owner marks each `STATUS: reviewed`; legal questions remain labelled for professionals.                 |

### Phase 1 — foundation

Execute in order: P1-INF-01 monorepo/tooling; P1-INF-02 NestJS skeleton and API envelopes; P1-INF-03 complete Prisma schema/migrations/seed; P1-AUTH-04 OTP authentication; P1-AUTH-05 policy authorization; P1-INF-06 provider ports; P1-UI-07 Flutter skeleton/design system/network core; P1-UI-08 S01–S04; P1-QA-09 CI. Sign the Phase 1 exit gate only after clean-clone startup, real-phone login, refresh reuse tests, envelope conformance, and green CI.

### Phase 2 — identity, taxonomy, and profiles

Execute P2-TAX-01, P2-USR-02, P2-USR-03, P2-USR-04, P2-USR-05, and P2-UI-06. Taxonomy and locations must remain data-driven. Availability is a pure, property-tested calculator. Uploads must strip EXIF GPS and protect sensitive documents.

### Phase 3 — jobs and applications

Execute P3-JOB-01, P3-JOB-02, P3-JOB-03, P3-APP-04, P3-APP-05, and P3-UI-06. This phase builds the cash-first transaction spine. State changes go only through the state-machine service; exact addresses remain masked before confirmation; concurrent last-slot acceptance is tested.

### Phase 4 — matching and notifications

Execute P4-MATCH-01, P4-MATCH-02, P4-NOTIF-03, and P4-UI-04. Ranking is deterministic and explainable, weights are configurable, missing-history users get neutral priors, and notification throttles/preferences/quiet hours are enforced.

### Phase 5 — assignment through completion

Execute P5-ASSIGN-01 through P5-ASSIGN-04, then P5-UI-05. Timers use an injected clock. Contract snapshots are immutable. Cancellation consequences are previewed. The H4 acceptance journey, excluding online payment when disabled, must be automated and green.

### Phases 6–8 — MVP completion

- Phase 6: P6-REV-01, P6-REV-02, P6-UI-03 — double-blind reviews, explainable reputation, objective badges.
- Phase 7: P7-CHAT-01, P7-CHAT-02, P7-UI-03 — job-scoped messaging, isolated real-time rooms, offline recovery.
- Phase 8: P8-ADMIN-01, P8-ADMIN-02 — 2FA admin shell, audited operational rescue tools, Playwright coverage.

Phase 8 is the cash-first MVP gate. A non-engineer must be able to investigate and rescue a stuck job.

### Phases 9–13 — gated expansion

- Phase 9 payments: P9-PAY-01 through P9-PAY-03 and P9-UI-04. Blocked until entity, gateway, payout, tax, and legal flow-of-funds decisions are signed. The platform must not hold funds without an authorized model.
- Phase 10 trust: P10-TRUST-01 through P10-TRUST-05 and P10-UI-06. Manual verification labels exactly what was checked; no automated bans.
- Phase 11 recurring/business: P11-JOB-01, P11-JOB-02, P11-BIZ-03 through P11-BIZ-05, P11-UI-06.
- Phase 12 AI: P12-AI-01 through P12-AI-05. Human confirmation, deterministic fallbacks, sample thresholds, evaluation, shadow mode, and kill switches are mandatory.
- Phase 13 analytics: P13-ANALYTICS-01 through P13-ANALYTICS-04. Weekly completed jobs is the north-star metric; all pilot metrics must be computable.

### Phase 14 — hardening and release

Execute P14-QA-01 through P14-QA-07: security, performance, load, tested backups, observability, legal/store assets, and staged rollout. Production requires an explicit rollback plan and a completed restore drill.

## 6. Parallel non-code workstream

These items may proceed alongside permitted build tasks but cannot be marked complete without owner or professional evidence:

- Entity, trade licence, e-TIN, VAT/BIN, bank account, and DBID applicability.
- Bangladeshi lawyer review of data protection, labour classification, payment flow, minors, liability, and dispute terms.
- Chartered-accountant advice on VAT and withholding.
- Pilot age policy; the pre-build plan recommends 18+ for the pilot.
- Production hosting and restricted-data residency decision.
- SMS trials across GP, Robi, Banglalink, and Teletalk.
- Named operations/support/incident owners and a trained backup.
- Category, skill, location, Bangla copy, legal copy, and visual-asset production.
- Play Console account choice, testing cohort, signing-key custody, and store listing.
- Gateway and worker-disbursement written responses before Phase 9.

## 7. Output and operating behavior by milestone

| Milestone | Usable output                               | How it operates                                                                                     |
| --------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Phase 0   | Reviewed evidence pack and scoped product   | Decisions are grounded in sources, interviews, and concierge transactions; no product code.         |
| Phase 1   | Login-capable Flutter shell and healthy API | Local PostgreSQL/Redis/storage stack; OTP session flow; standard API envelopes; CI.                 |
| Phase 3   | Post → apply → select transaction spine     | Cash-on-completion is recorded; addresses remain private until confirmation.                        |
| Phase 5   | End-to-end work completion                  | Confirmation windows, immutable contracts, timers, cancellation, submission, and completion.        |
| Phase 8   | Pilot-ready cash-first MVP                  | Mobile marketplace plus audited admin rescue and concierge operations.                              |
| Phase 9+  | Legally gated money and expansion modules   | Feature flags keep unapproved or data-insufficient capabilities off.                                |
| Phase 14  | Release candidate                           | Security/performance/load checks, observability, tested recovery, store compliance, staged rollout. |

## 8. Immediate next task

`P1-AUTH-04 — Phone OTP authentication` is the next engineering task. It implements BD-number
normalization, rate-limited OTP challenges, one-time verification, access/refresh issuance, refresh
rotation and reuse-family revocation, and the console SMS adapter.

In the parallel human workstream, `P0-RES-04 — Problem validation` remains blocked on 20 worker-side
interviews, 15 demand-side interviews, and 5 manually brokered concierge transactions. Public-web
research cannot substitute for those interviews or transactions.
