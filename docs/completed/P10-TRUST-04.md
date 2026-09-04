# P10-TRUST-04 — Reports, blocks, and moderation

**Status:** COMPLETE

**Completed:** 2026-09-05

**Phase:** Phase 10 — trust, verification, disputes, check-in, and anti-fraud

**Commit:** This completion record is part of the task commit; the exact hash is in Git history and the final task report.

## Scope

Implemented user reports and privacy-safe block listing, an authenticated admin safety queue, and
an audited progressive moderation lifecycle. Enforcement follows exactly one step at a time through
warn, restrict, suspend, and ban. A restriction may require fresh identity verification, and the
account cannot be restored until an administrator approves that evidence. The task does not add
automatic fraud decisions or automatic bans; risk scoring remains P10-TRUST-05.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` P10-TRUST-04 and the existing report/block endpoint inventory.
- J5 incident protocol requiring post-incident review within 48 hours.
- Existing JWT/policy guards, verification workflow, admin sessions, notification system, audit
  logs, chat participant rules, trust levels, and refresh-token revocation behavior.

## Output

- Normalized reporting APIs:
  - `POST /reports`
  - `GET /reports/mine`
- Privacy-safe block management integration:
  - existing `POST /users/:id/block` and `DELETE /users/:id/block`
  - new `GET /me/blocks`
- Admin moderation APIs:
  - `GET /admin/reports`
  - `POST /admin/reports/:id/review`
  - `POST /admin/reports/:id/decision`
  - `POST /admin/users/:id/moderation`
  - `POST /admin/users/:id/moderation/restore`
  - `POST /admin/moderation-actions/:id/post-incident-review`
- Migration `20260904150000_moderation_lifecycle` for report subjects/reviewers/resolutions,
  moderation levels and actions, account restrictions, re-verification state, and review deadlines.
- Global account enforcement for restriction, suspension, banning, pending deletion, and required
  re-verification, with safety/report/verification actions kept available.
- Admin console safety-report queue, review/decision controls, progressive user action controls,
  moderation state, re-verification status, and reasoned restoration.

## How it operates

The server derives a report's subject from the referenced user, job, assignment, conversation, or
message and verifies that the reporter is entitled to reference that object. It normalizes the
reason code and description and prevents an equivalent duplicate for 24 hours. Block lists expose
only the blocked user's public identifier, display name, and block time.

An authorized administrator claims an open report for review, then dismisses it with a reason or
applies the subject's one permitted next moderation level. The server owns the ladder, rejects
skipped or repeated levels, prevents self-moderation, records before/after audit data, creates a
user notification, and sets a 48-hour post-incident review deadline. Restriction and suspension can
have bounded durations; suspension and banning revoke active refresh and admin sessions.

When re-verification is attached to a restriction, existing verified badges are revoked and trust
returns to phone level. The account may still report, block, upload identity evidence, and use
verification routes, but marketplace mutations are denied. Only fresh identity evidence is
accepted. Approval clears the gate, after which a reasoned admin restoration returns the account to
active, unmoderated state.

## Process and procedure

1. Extended the data model and applied the migration to the local PostgreSQL database.
2. Added normalized report resolution, duplicate prevention, block projection, admin queue, and
   progressive moderation services/controllers.
3. Added global account-state enforcement and integrated moderation with verification, trust,
   session revocation, notifications, audit logs, and legacy admin operations.
4. Added the admin safety queue and updated high-risk browser flows.
5. Added focused guard tests and a live PostgreSQL lifecycle suite, then ran the complete backend,
   schema, build, admin build, and browser suites.

## Verification evidence

- Backend: 32 active suites and 183 tests passed; 6 suites/28 tests remained intentionally gated.
- Focused account-guard, authentication, and authorization suites: 41 tests passed.
- Live PostgreSQL moderation lifecycle: 9 tests passed, including concurrent ladder enforcement.
- Prisma schema validation passed; all 14 migrations are applied and current.
- Backend TypeScript checks and production build passed.
- Admin TypeScript check and Next.js production build passed.
- Admin Playwright high-risk workflows: 7 tests passed, including progressive moderation and report
  resolution.
- Repository root Node checks: 6 tests passed.

## Acceptance results

- PASS — reports use an allowlisted target/reason shape and resolve subjects server-side.
- PASS — equivalent reports are deduplicated for 24 hours.
- PASS — report and block safety actions stay available to restricted users.
- PASS — block listing excludes private profile and contact data.
- PASS — admin review and every state-changing action require authorization and an audit trail.
- PASS — moderation can advance only warn → restrict → suspend → ban, one step per decision.
- PASS — session revocation and request-time account enforcement prevent suspended or banned use.
- PASS — re-verification revokes prior verified state and prevents restoration until approved.
- PASS — post-incident reviews are due and traceable within 48 hours.
- PASS — there is no automatic banning or moderation from unreviewed reports.

## Decisions and limitations

Restriction expiry controls request-time enforcement, while clearing the recorded moderation level
remains an explicit, audited admin restoration. P10-TRUST-05 will produce only human-review queue
signals and may not bypass this moderation ladder. Native mobile report, block, verification, and
safety-guidance screens remain in P10-UI-06.

## Next task

P10-TRUST-05 — human-reviewed anti-fraud risk scoring and queue.
