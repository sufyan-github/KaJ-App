# P10-TRUST-05 — Human-reviewed anti-fraud risk queue

**Status:** COMPLETE

**Completed:** 2026-09-05

**Phase:** Phase 10 — trust, verification, disputes, check-in, and anti-fraud

**Commit:** This completion record is part of the task commit; the exact hash is in Git history and the final task report.

## Scope

Implemented deterministic anti-fraud signals for shared identity attributes, impossible travel,
application bursts, repeated reciprocal review loops, and category price anomalies. Signals are
combined into an explainable 0–100 score and create or refresh an admin review item. Detection,
scanning, escalation, and clearing never warn, restrict, suspend, or ban an account automatically.
This task does not introduce machine learning, referral rules before a referral programme exists,
or claim that labeled development fixtures predict production accuracy.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` P10-TRUST-05 and its requirement for labeled fixtures, measured precision,
  and reported false-positive rate.
- `KAJ_PREBUILD_PLAN.md` 7.3 requirement for a daily manual review queue and a human appeal path.
- Existing OTP, device, attendance, application, job, review, admin-session, audit, and progressive
  moderation data and controls.
- The locked rule that automatic bans are forbidden and only automatic rate-limiting is permitted.

## Output

- Risk calculation rules under `backend/src/modules/risk/risk.rules.ts`.
- Daily system scanner, human review service, and admin APIs:
  - `GET /admin/risk/items`
  - `POST /admin/risk/scan`
  - `POST /admin/risk/items/:id/review`
  - `POST /admin/risk/items/:id/decision`
- Migration `20260905100000_risk_review_queue` with HMAC identity observations, scored risk review
  items, human-review states, adjudication evidence, and one-active-item database enforcement.
- Successful OTP verification records namespaced HMAC-SHA-256 observations for phone, device, and
  available network address. Raw values are not stored in risk observations or queue evidence.
- Admin console risk queue with score/severity, explainable signals, operational adjudication
  metrics, reasoned scans, and explicit clear/escalate decisions.

## How it operates

The system runs a scan at service start and every 24 hours; an administrator or moderator may also
run a reasoned scan on demand. Each scan reads bounded windows from existing marketplace facts:
30-day identity observations, seven-day consented attendance locations, 24-hour applications,
30-day reviews, and 90-day category prices. A PostgreSQL advisory transaction prevents overlapping
scans. Signals are scored and grouped per account; one active queue item per account is enforced by
a partial unique index. Later scans refresh active evidence rather than duplicating it.

Identity clusters require two accounts sharing a device or phone observation, while a network
cluster requires four accounts to reduce household/campus false positives. Impossible travel
requires at least 50 km and implied speed over 180 km/h between consented check-ins. Application
spam begins at 20 applications per hour or 60 per day. Review-loop detection requires four
reciprocal assignments with at least 90 percent perfect ratings. Price detection requires a minimum
ten-job category/payment baseline and flags values below 0.2× or above 5× the median. A
client-reported mock-location flag also enters human review, fulfilling the attendance-phase
deferral.

Scores are additive and capped at 100, with deterministic low, medium, high, and critical bands.
Support may claim an open item; only administrators and moderators may scan or decide. A human may
clear unsupported evidence or escalate it to a separate moderation review. Escalation deliberately
contains no moderation action field and leaves the user's account state unchanged. All queue views,
scans, claims, and decisions are audited; concurrent decisions permit exactly one winner.

## Process and procedure

1. Mapped available identity, attendance, application, review, job-price, moderation, and audit
   facts against every locked signal.
2. Added privacy-safe identity observations and risk-review persistence.
3. Implemented deterministic detectors, scoring, scan serialization, active-item deduplication,
   human review, and adjudication metrics.
4. Integrated hashed observations into successful OTP session creation atomically.
5. Added the admin queue and browser flow, labeled unit fixtures, and live PostgreSQL lifecycle
   tests.
6. Ran schema, migration, TypeScript, production build, browser, root, and complete backend checks.

## Verification evidence

- Labeled rule suite: 13 positive/negative fixtures across all required signals; measured precision
  100 percent and false-positive rate 0 percent on those controlled fixtures.
- Live PostgreSQL lifecycle: 4 tests passed for queue creation, scan refresh/deduplication, human
  escalation, concurrency, metrics, and unchanged moderation state.
- Backend: 34 active suites and 191 tests passed; 7 suites/32 tests remained intentionally gated.
- OTP endpoint tests verify three hashed observation types and confirm raw phone/device values are
  absent.
- Prisma schema validation passed; all 15 migrations are applied and current.
- Backend TypeScript checks and production build passed.
- Admin TypeScript check, Next.js production build, and 8 Playwright high-risk flows passed.
- Repository root Node checks: 6 tests passed.

## Acceptance results

- PASS — duplicate device and phone observations create explainable account-cluster signals.
- PASS — shared networks require four accounts before entering review.
- PASS — consented attendance detects impossible travel and reported mock locations.
- PASS — application bursts create a review signal without blocking applications automatically.
- PASS — repeated reciprocal perfect-review loops use a conservative multi-assignment threshold.
- PASS — price anomalies require a minimum category/payment baseline and robust median comparison.
- PASS — every result includes explainable signals, a bounded score, and a human review item.
- PASS — active items are deduplicated and overlapping scans are serialized.
- PASS — claims and decisions are authorized, reasoned, audited, and concurrency-safe.
- PASS — clearing and escalation apply no automatic moderation or account-state change.
- PASS — controlled-fixture precision and false-positive rate are measured and explicitly scoped.

## Decisions and limitations

The fixture metrics validate rule implementation, not real-world efficacy. Production thresholds
must be recalibrated only after enough reviewed cases exist; the queue reports observed adjudication
precision and false-positive rate separately and excludes undecided cases from those metrics.
Network sharing, legitimate repeat hiring, travel, and unusual local prices can all be benign, which
is why every signal requires human review. A staffing owner, appeal response time, and published
warning/restriction policy remain operational human gates. Native trust and safety screens remain in
P10-UI-06.

## Next task

P10-UI-06 — mobile trust, check-in, dispute, and safety guidance surfaces.
