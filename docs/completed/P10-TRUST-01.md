# P10-TRUST-01 — Verification pipeline

**Status:** COMPLETE  
**Completed:** 2026-09-04  
**Phase:** Phase 10 — trust, verification, disputes, check-in, and anti-fraud  
**Commit:** This completion record is part of the task commit; exact hash is in Git history and the final task report.  
**Remote:** origin/main

## Scope

Implemented the PHONE → IDENTITY → SKILL → BUSINESS verification pipeline: authenticated user
submission, explicit private-document linking, admin review isolation, monotonic trust progression,
immediate objective badges, user notifications, audit history, and scheduled evidence deletion 90
days after a decision. This task does not implement disputes, check-in, reports, moderation ladders,
anti-fraud scoring, or their mobile screens.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` P10-TRUST-01 and D10 private-field rules.
- Existing private upload validation and storage adapter.
- Existing admin verification queue, trust model, badges, notifications, and audit log.

## Output

- Authenticated `POST /api/v1/verification-requests` and
  `GET /api/v1/verification-requests/mine` endpoints.
- Verification service, trust-ladder rules, and daily purge runner under
  `backend/src/modules/verification/`.
- Explicit `verification_documents` relation with decision-based purge metadata.
- Migrations `20260904090000_verification_pipeline` and
  `20260904100000_backfill_verification_documents`.
- Admin queue and document viewer restricted to evidence linked to the reviewed request.
- Immediate verified/business badge activation, decision notification, and audit records.
- Unit and live PostgreSQL pipeline tests.

## How it operates

A user uploads sanitized evidence through the existing private upload flow, then submits one to five
owned document IDs for the next allowed trust level. PHONE trust remains derived from OTP. Each
higher level requires the preceding level, duplicate pending submissions are rejected, and evidence
cannot be silently attached from another user or another request.

The admin queue loads only explicitly linked evidence. Approval computes the highest of current and
approved trust, so a later lower-level decision cannot downgrade the account. IDENTITY and above
activate the `verified` badge; BUSINESS also activates `business-verified`. Every decision notifies
the user and schedules linked evidence for deletion after 90 days.

The daily purge runner deletes the private object first, soft-deletes its database record, marks the
request link purged, and writes a content-free audit event. Failed storage deletion leaves the record
eligible for retry.

## Process and procedure

1. Mapped existing upload, admin, trust, badge, notification, and retention behavior.
2. Replaced implicit all-user-document exposure with explicit request-document links.
3. Added guarded submission and status APIs.
4. Made admin approval monotonic and transactionally coupled to badges, notifications, retention,
   and auditing.
5. Added the daily purge lifecycle and safe migration backfill for prior linked evidence.
6. Applied migrations, reran the seed, and executed unit, live integration, regression, and build
   checks.

## Verification evidence

- Prisma formatting, validation, generation, migration deployment, and seed: pass.
- Trust-level unit tests: 2/2 pass.
- Live PostgreSQL verification journey: 3/3 pass.
- Full backend tests and production build: pass.
- Root repository tests: pass.

## Acceptance results

- PASS — PHONE trust remains OTP-derived.
- PASS — IDENTITY, SKILL, and BUSINESS submissions enforce sequential prerequisites.
- PASS — only owned, unused, sensitive verification evidence can be submitted.
- PASS — admins see only documents linked to the request being reviewed.
- PASS — approval raises trust without allowing downgrade.
- PASS — approval activates objective verification badges and user notification.
- PASS — decision schedules linked evidence for 90-day purge.
- PASS — purge removes the private object, records deletion, and preserves an audit trail.

## Decisions and limitations

Rejected evidence follows the same 90-day maximum retention window as approved evidence. A rejected
request must use a newly uploaded document for resubmission, avoiding ambiguous reuse across audit
records. The purge runner is intentionally retryable and processes bounded batches. Production
storage credentials and operational monitoring remain release gates.

## Next task

P10-TRUST-02 — disputes, evidence, timers, decisions, appeals, and gated ledger effects.
