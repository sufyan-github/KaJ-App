# V1-SUB-PAY-01 — Subscription, operator access, and offline cash payments

**Status:** IMPLEMENTED
**Completed:** 2026-09-05
**Phase:** Phase 9 — gated commercial expansion
**Commit:** This completion record is part of the task commit; the exact hash is in Git history and the final task report.
**Remote:** Not pushed in this task.

## Scope

Extended the existing KAAJ application in place with provider-neutral operator identity,
configurable subscription plans and entitlements, subscription history, audited administration, and
a Version 1 cash-on-completion job-payment record. Robi and Airtel are configured as initial operator
hints. A phone prefix never verifies operator ownership or billing eligibility.

This work does not connect operator billing, charge a phone balance, receive a carrier webhook, move
job funds, calculate cash commission, provide a wallet, or enable worker withdrawal. No commercial
price was invented or seeded.

## Inputs and instructions followed

- The owner-supplied “Add Payment, Subscription & Operator-Based Access to the Existing App”
  specification received on 2026-09-05.
- Existing Prisma payment records, job state machine, authorization, feature flags, audit logs,
  notification service, provider ports, Flutter design system, localization controller, and Next.js
  operations console.
- Existing Phase 9 legal/provider gates and fail-closed payment architecture.

## Output

- Additive Prisma models and migration for mobile operators, operator identity, subscription plans,
  subscriptions, subscription payments, entitlement rules, cash-payment evidence, and disputes.
- Database checks enforce non-negative prices/amounts, bounded durations, valid subscription dates,
  complete cash evidence, and a foreign-key-backed cash recorder.
- A provider-neutral operator port with a fail-closed pending adapter.
- Authenticated subscription status, request, cancellation, and history APIs.
- Audited admin APIs and bilingual UI for plan creation/editing, pricing, visibility, entitlement
  rules, subscriber status, explicit external-payment confirmation, and payment oversight.
- Configurable guards for job posting, applications, worker discovery/hiring, booking, and new direct
  conversations. The global gate remains disabled until an intentional 100% rollout.
- A zero-commission offline cash lifecycle: completion creates a pending record; the job owner can
  mark cash paid once; the worker is notified; the transition and audit record are durable; disputes
  are represented separately.
- Bilingual Flutter subscription and job-payment history screens plus the assignment-level
  “Mark payment done” action.

## How it operates

`GET /api/v1/subscriptions/me` returns the current subscription, supported operators, available
plans, rules, and rollout state. Prefix matching can create only a `PENDING` or `UNSUPPORTED`
operator identity. A request creates a pending subscription and pending subscription-payment record.
Activation requires a verified operator and an existing payment record whose `PAID` status is
explicitly confirmed by an authorized administrator. The admin UI states that this is an external,
manual confirmation and not an online charge.

Entitlement checks are feature-key based. They become restrictive only when
`subscriptions_enabled` is enabled at 100% and the corresponding active rule requires a current,
unexpired subscription. Existing users therefore retain access during the pilot.

When an assignment is completed, KAAJ records the agreed amount as pending cash with zero platform
fee. Only the poster can confirm payment. The operation is advisory-lock protected and idempotent,
advances `COMPLETED` to `PAYMENT_RECORDED`, writes an audit event, and notifies the worker. Job-payment
records and subscription-payment records use different tables and admin views.

## Verification evidence

- Prisma validation/generation and migration deployment: pass.
- Live PostgreSQL/Redis cash lifecycle: 3/3 pass, including concurrency, zero commission,
  idempotency, audit count, and `PAYMENT_RECORDED` transition.
- Backend Jest regression: 42 suites and 227 tests pass; 7 database-dependent suites and 33 tests
  remain intentionally skipped by their existing environment conditions.
- Workspace TypeScript typecheck and backend/admin production build: pass.
- Authenticated live API smoke: subscription status/history, cash capability, and payment history
  returned expected responses; digital payment and withdrawal capabilities returned false.
- Authenticated browser verification: subscription overview, plan form, entitlement rules, job
  payment oversight, English/Bangla switch, narrow viewport, and console error check pass.
- Flutter analyze: pass; Flutter test: 83/83 pass.
- Android dev APK: pass and installed on the connected Motorola Android 16 phone.
- Phone journey: OTP authentication, subscription status/operator pending state/no-plan state,
  cash-payment empty state, English switch, and locale persistence after process restart pass.

## Acceptance results

- PASS — existing product architecture and flows were preserved.
- PASS — subscription and job-payment records are structurally and visibly separate.
- PASS — ACTIVE, INACTIVE, EXPIRED, PENDING, and CANCELLED subscription states are supported.
- PASS — plan, amount, currency, duration, start/end, cancellation, and payment history are stored.
- PASS — Robi/Airtel are initial data, while the schema and adapter port remain operator-neutral.
- PASS — prefix detection cannot produce a verified operator.
- PASS — access rules are configurable and pilot rollout remains fail-open for existing users.
- PASS — offline cash can be pending, recorded, or disputed without claiming KAAJ held funds.
- PASS — online payment, mobile banking, wallet, and withdrawal are shown only as unavailable or
  coming soon.
- PASS — user and admin system UI is available in Bangla and English.
- PASS — protected mutations enforce user/admin ownership, roles, validation, and audit reasons.

## Decisions and limitations

### Critical before enabling subscriptions in production

- Approve commercial plans, prices, durations, refund/cancellation policy, tax treatment, and
  customer-support ownership; then create them through the audited admin console.
- Sign operator/provider agreements and implement a real eligibility, charge, callback/webhook,
  reconciliation, retry, and cancellation adapter with verified request signatures.
- Complete legal/privacy review for phone/operator data and run a staged rollback exercise before
  raising `subscriptions_enabled` to 100%.
- Configure production SMS, push, object storage, TLS, secrets, backups, monitoring, store signing,
  and incident response already identified by the production-readiness audit.

### Important for launch or early release

- Add a dedicated admin payment-evidence reference and dual-control approval for manual external
  subscription activation.
- Add scheduled expiry/reconciliation jobs instead of relying only on read-time expiry cleanup.
- Add subscriber search/export, lifecycle notifications, refund/cancellation reason codes, and
  operator-specific support guidance after commercial policy is approved.
- Run worker/customer/operator-admin staging journeys with representative pending, active, expired,
  cancelled, cash-recorded, and disputed records.

### Future

- Additional operator adapters and configurable operator catalog entries.
- Contracted mobile banking/card payments, signed webhooks, wallet, payout, and withdrawal only
  after the existing legal, provider, tax, ledger, and reconciliation gates are satisfied.
- Promotions, trials, grace periods, recurring renewal, and usage analytics after real pilot data.

## Next task

`V1-SUB-PAY-02` — contracted operator adapter and staging reconciliation, blocked pending approved
commercial plans, provider credentials, signed agreements, and legal/tax decisions.
