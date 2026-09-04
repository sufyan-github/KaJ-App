# P10-TRUST-02 — Dispute lifecycle

**Status:** COMPLETE

**Completed:** 2026-09-04

**Phase:** Phase 10 — trust, verification, disputes, check-in, and anti-fraud

**Commit:** This completion record is part of the task commit; exact hash is in Git history and the final task report.
**Remote:** origin/main

## Scope

Implemented the D9 dispute lifecycle: party-only opening, opening/evidence/appeal windows, automatic
contract/chat/check-in evidence snapshots, private evidence uploads, payment freeze metadata, admin
review and SLA tracking, explicit allocation decisions, cash-safe or balanced digital ledger
outcomes, notifications, one appeal, independent second-admin review, and audit history. This task
does not enable a payment provider or claim that cash refunds were moved by KAAJ.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` D9 and P10-TRUST-02.
- Existing assignment state machine, private uploads, admin console, notification service, payment
  records, and append-only ledger.
- P9-PAY-01 fail-closed payment-provider boundary.

## Output

- Party APIs to open/list/read disputes, add/download evidence, and appeal.
- Dispute service and minute-based evidence-window runner under `backend/src/modules/disputes/`.
- Deterministic balanced dispute-allocation planner.
- Explicit decisions, evidence/SLA deadlines, payment freeze fields, attachment relations, and
  one-per-dispute appeal records.
- Migration `20260904130000_dispute_lifecycle`.
- Audited admin evidence view enriched with contract, transcript, check-in, history, party
  reputation, payment state, appeal, and SLA data.
- Admin start-review action and explicit release/refund controls.
- `DISPUTE_EVIDENCE` private upload policy.
- Unit, live PostgreSQL lifecycle, and Playwright regression tests.

## How it operates

Either assignment party may open one dispute while work is SUBMITTED, CUSTOMER_REVIEW, or COMPLETED
and within seven days of submission/completion. Opening atomically moves the job to DISPUTED,
freezes any payment record, captures contract/chat/check-in state, starts a 48-hour evidence window,
establishes 24/72-hour service targets, audits the transition, and notifies both parties. Non-parties
receive a not-found response.

During the evidence window, either party may add text or an owned private evidence document. A
runner advances expired evidence windows to admin review. Admins explicitly start review, recording
first-response time, then choose RELEASE_FULL, RELEASE_PARTIAL, REFUND_FULL, REFUND_PARTIAL, or
SPLIT. Partial allocations must distribute the entire amount.

Cash decisions update reporting without ledger movement. A digitally held payment uses one balanced
append-only ledger operation and prorates the fee. Resolution unfreezes payment, records the job
transition, notifies both parties, and audits the evidence-backed decision.

Either party may file one appeal within 72 hours. It reopens and refreezes the dispute, assigns an
eligible second reviewer when available, and prohibits the original resolver from deciding it.

## Process and procedure

1. Mapped D9 against the existing admin-only placeholder.
2. Added decisions, deadlines, payment freezing, evidence attachments, and appeal records.
3. Implemented private party APIs, automatic evidence capture, notifications, audits, and timers.
4. Reworked admin review around validated full allocations and second-review rules.
5. Updated admin UI with SLA, review-start, decision, refund, and release controls.
6. Applied migration and ran unit, live integration, regression, build, and Playwright checks.

## Verification evidence

- Prisma formatting, validation, generation, and migration deployment: pass.
- Dispute allocation tests: 7/7 pass across full/partial/split/cash/invalid cases.
- Live PostgreSQL dispute lifecycle: 4/4 pass.
- Admin Playwright high-risk journeys: 6/6 pass.
- Full backend tests, backend production build, admin TypeScript/build, and root tests: pass.

## Acceptance results

- PASS — only poster or assigned worker can open/view; outsider gets not found.
- PASS — seven-day opening, 48-hour evidence, 24-hour first-response, 72-hour resolution, and
  72-hour appeal timing are recorded or enforced.
- PASS — contract, chat, and check-in state is automatically attached.
- PASS — owned private evidence can be added only inside the evidence window.
- PASS — opening freezes payment release and records a job-status transition.
- PASS — all five decisions require complete allocation and produce balanced digital entries.
- PASS — cash decisions never fabricate ledger movement.
- PASS — both parties are notified and every mutation is audited.
- PASS — exactly one appeal is allowed and the first resolver cannot decide it.

## Decisions and limitations

The manual provider keeps runtime decisions as cash-safe records. Digital ledger planning is
deterministic and tested, but no provider call is made. External reversal/settlement remains subject
to the blocked P9 provider, payout, tax, and legal gates. Evidence remains private and needs a fresh
party-authorized signed URL.

## Next task

P10-TRUST-03 — consent-led foreground check-in/check-out, geofence rules, clock window, offline sync,
and manual override.
