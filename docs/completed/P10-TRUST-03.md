# P10-TRUST-03 — Check-in and check-out

**Status:** COMPLETE

**Completed:** 2026-09-04

**Phase:** Phase 10 — trust, verification, disputes, check-in, and anti-fraud

**Commit:** This completion record is part of the task commit; the exact hash is in Git history and the final task report.

## Scope

Implemented feature-flagged assignment attendance with explicit, versioned location consent; one
foreground coordinate reading per event; server-side geofence, accuracy, time-window, and clock
checks; bounded offline event synchronization; idempotent writes; optional private check-in photos;
server-computed work duration; and reasoned manual override by the poster or an authenticated admin.
No background tracking, automatic penalty, or continuous location collection was added.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` D3, endpoint inventory, P10-TRUST-03, and Phase 10 test requirements.
- Existing job state machine, feature flags, configuration, private uploads, notifications, admin
  authentication, audit logs, and idempotency records.
- The explicit requirement that mock-location evidence creates a review signal and never an
  automatic penalty.

## Output

- Attendance APIs under `backend/src/modules/attendance/`:
  - `GET /assignments/:id/attendance`
  - `POST /assignments/:id/checkin`
  - `POST /assignments/:id/checkout`
  - `POST /assignments/:id/checkin-override`
  - `POST /admin/assignments/:id/checkin-override`
- Configurable defaults: 300 m geofence, ±60-minute check-in window, 100 m maximum accuracy,
  15-minute offline replay, 120-second forward clock tolerance, and consent version.
- Migration `20260904143000_attendance_lifecycle` with captured/received timestamps, accuracy,
  distance, consent, mock-location, checkout, duration, and override evidence.
- Sensitive `CHECKIN_PHOTO` upload policy.
- Bangla and English consent copy returned by the attendance read API.
- Legacy `/submit` bypass disabled while `checkin_enabled` is fully enabled; checkout becomes the
  atomic route into customer review.

## How it operates

The feature remains fail-closed until `checkin_enabled` is enabled at 100 percent. A worker submits
current coordinates, accuracy, current consent version, and an idempotency key. The server checks
the assignment owner and state, validates that the event was captured within the configured
start-time window, rejects stale or excessively future device timestamps, calculates Haversine
distance, and applies the configured radius. Exactly 300 m is accepted; 301 m is outside.

A recent offline capture may be replayed for up to 15 minutes. Both capture and receipt timestamps
are retained so delayed data is never silently presented as live. A retry with the same actor, key,
operation, and payload returns the original response; reuse for a different request returns a
conflict.

Successful check-in creates one work session and moves the job atomically through the authoritative
state machine into work in progress. Check-out verifies the foreground fix, computes minutes from
server-validated attendance timestamps, records notes, and atomically moves the job through
submitted into customer review with the 48-hour completion deadline.

If valid GPS is unavailable, the job poster or an authenticated admin/support/moderation operator
may record a reasoned override. The actor, actor type, reason, time, IP/user agent where available,
and verification source are retained in an audit log. A client-reported mock location is stored and
queued for future human risk review without blocking the worker or applying a penalty.

## Verification evidence

- Geofence unit tests: 299 m accepted, 300 m accepted, 301 m rejected.
- Live PostgreSQL lifecycle tests cover geofence rejection, accuracy, clock skew, stale and valid
  offline sync, idempotency, checkout duration/state/deadline, poster and admin overrides, feature
  gating, and legacy submit bypass prevention.
- Prisma validation/migration, backend full tests/build, root checks, and API boot/smoke checks pass.

## Acceptance results

- PASS — only the assigned worker can use GPS check-in/check-out.
- PASS — check-in requires current explicit consent and never enables background tracking.
- PASS — geofence, accuracy, ±60-minute start window, and clock bounds are server-owned.
- PASS — recent offline capture is distinguishable and bounded; stale capture is rejected.
- PASS — optional photos must be an owned private `CHECKIN_PHOTO` document.
- PASS — every attendance mutation is idempotent.
- PASS — checkout duration and review deadline are calculated on the server.
- PASS — poster/admin overrides require a reason and are audited.
- PASS — mock-location reporting causes no automatic penalty.
- PASS — the feature flag prevents premature rollout and blocks the legacy completion bypass.

## Decisions and limitations

This task supplies backend consent copy and enforcement; the first-use permission sheet, map,
distance meter, and failure guidance remain in P10-UI-06. The mobile client should perform one
foreground location read and send it immediately. It may sync a capture only within the advertised
server window and must label it as delayed. No map-provider integration is required by this task.

## Next task

P10-TRUST-04 — reports, blocks, moderation actions, suspension ladder, and re-verification.
