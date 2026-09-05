# P9-PAY-01 — Money core

**Status:** COMPLETE  
**Completed:** 2026-09-02  
**Phase:** Phase 9 — payments and wallet  
**Commit:** This completion record is part of the task commit; exact hash is in Git history and the final task report.  
**Remote:** origin/main

## Scope

Implemented the provider-neutral money core while keeping digital payment movement disabled. This
task adds server-derived payment intents, durable Redis-plus-PostgreSQL idempotency, fee precedence,
an append-only double-entry ledger service, reconciliation, concurrency protection, and audit
records. It does not connect a payment provider, receive webhooks, hold funds, issue payouts, or
claim escrow.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` D6 and P9-PAY-01.
- `docs/BUILD_PLAN.md` Phase 9 legal and provider gate.
- Existing provider-neutral `payment.port.ts`, assignment contracts, feature flags, audit log,
  PostgreSQL, and Redis infrastructure.

## Output

- Money core module, payment-intent endpoint, fee resolver, and ledger service under
  `backend/src/modules/payments/`.
- Prisma fee rules, idempotency records, payment breakdown fields, ledger operation IDs, and user
  fee tier.
- Migrations `20260902235900_money_core` and `20260903000500_scope_payment_idempotency`, including
  immutable-ledger database triggers, the one-payment-per-assignment constraint, and payer-scoped
  idempotency keys.
- Idempotent global fee-rule seed.
- Deterministic and PostgreSQL/Redis concurrency tests.

## How it operates

`POST /api/v1/assignments/:id/payment-intent` accepts an authenticated poster and a required
`Idempotency-Key`; it accepts no client amount or fee. The service locks the idempotency key and
assignment, reads the immutable assignment amount, resolves fees in user → tier → category → global
order, creates at most one payment, audits the mutation, and stores the exact first response in
PostgreSQL and Redis. Until both an approved non-manual provider and the 100% feature flag are
configured, the result remains `CASH_ON_COMPLETION`, its Version 1 fee is zero, and no ledger money
movement occurs.

Ledger posting rejects non-positive or unbalanced operations before insertion. The database rejects
all updates and deletes to ledger entries. Reconciliation independently totals debits and credits.

## Process and procedure

1. Mapped the Phase 9 legal split and existing payment foundations.
2. Extended the schema without enabling any provider.
3. Implemented fee calculation, transparent breakdowns, idempotency, advisory-lock concurrency,
   audit recording, ledger posting, and reconciliation.
4. Applied the migration and reran the idempotent seed.
5. Ran deterministic and live PostgreSQL/Redis acceptance tests.

## Verification evidence

- Prisma format, validation, generation, migration deployment, and seed: pass.
- Backend TypeScript compile: pass.
- `money-core.spec.ts`: 8/8 pass.
- `money-core.prisma.e2e-spec.ts` with live PostgreSQL and Redis: 3/3 pass, including offline cash
  confirmation, audit, and job-state advancement.
- Concurrent distinct idempotency keys converge on one payment row.
- Repeated identical key returns the exact first response.

## Acceptance results

- PASS — charge, release, full refund, partial refund, and payout examples balance to zero.
- PASS — fee precedence is user → tier → category → global.
- PASS — duplicate idempotency key returns the exact first response.
- PASS — concurrent attempts create exactly one payment row.
- PASS — the client supplies no amount or fee.
- PASS — every created payment intent writes an audit record.
- PASS — digital payment remains fail-closed with the manual adapter.

## Decisions and limitations

P9-PAY-02 and P9-PAY-03 remain blocked. No provider adapter, webhook, fund hold, refund movement,
wallet credit, or payout is authorized until the entity, gateway, payout, tax, and written legal
flow-of-funds gates are supplied. The payments flag alone cannot activate digital payment while the
manual adapter is selected.

## Next task

Blocked at P9-PAY-02 pending the signed legal/compliance checklist and selected provider contract.
