# P0.6 data hygiene — migrations and rollout notes

Two add-only migrations, in order:

1. `20261116100000_align_drift_and_fk_indexes`
   - Drops the `DEFAULT CURRENT_TIMESTAMP` on `updated_at` of 7 tables that
     are `@updatedAt` in `schema.prisma` (Prisma always sets the value), and
     renames one risk index to the name the schema expects. After this,
     `prisma migrate diff` reports no drift, and CI fails on any new drift.
   - Adds 8 foreign-key indexes: `reports(reporter_user_id, created_at DESC)`,
     `reviews(reviewer_user_id)`, `refresh_tokens(device_id)`,
     `jobs(subcategory_id)`, `verification_requests(reviewer_user_id)`,
     `disputes(resolved_by)`, `dispute_appeals(opened_by_user_id)`,
     `dispute_appeals(resolved_by)`.
   - Adds CHECK constraints `NOT VALID` (new writes are checked at once):
     review rating and sub-ratings 1–5, `feature_flags.rollout_percent`
     0–100, `availability_rules.day_of_week` 0–6.
2. `20261116100100_validate_check_constraints` — `VALIDATE CONSTRAINT` for
   the four checks (does not block reads or writes).

Each folder has a hand-written `down.sql`; `test/migrations-rollback.prisma.e2e-spec.ts`
runs up → down → up on a throwaway database in CI.

## Before deploying to a database with real data

The indexes are created without `CONCURRENTLY` (Prisma runs a migration in a
transaction). At pilot scale this is a short lock; check table sizes first.

If step 2 fails, a stored row breaks a rule. Find it with:

```sql
SELECT id, rating, punctuality, quality, communication, reliability FROM reviews
WHERE rating NOT BETWEEN 1 AND 5
   OR punctuality NOT BETWEEN 1 AND 5 OR quality NOT BETWEEN 1 AND 5
   OR communication NOT BETWEEN 1 AND 5 OR reliability NOT BETWEEN 1 AND 5;
SELECT key, rollout_percent FROM feature_flags WHERE rollout_percent NOT BETWEEN 0 AND 100;
SELECT id, user_id, day_of_week FROM availability_rules WHERE day_of_week NOT BETWEEN 0 AND 6;
```

Fix the rows, then `prisma migrate resolve --rolled-back 20261116100100_validate_check_constraints`
and deploy again.

## Behaviour changes in the same unit

- Admin force-transition now goes through `JobStateMachine`: an admin may
  make any move the system itself may make from the current status (to
  unstick a job) or suspend it. A suspended job can be restored to the status
  it was suspended from, or — if no worker was ever assigned — expired or
  cancelled. A disputed job is settled through dispute resolution. The admin
  job list returns `allowedTransitions` and the console only offers those.
  Refusals are `409 JOB_TRANSITION_NOT_ALLOWED` with the allowed states in
  `details`.
- Disputes already used the state machine (PR #6).
- Suggested workers: the 100 candidates scored are now the nearest to the
  job (worker point or area centre vs. job pin or area centre, via
  `earthdistance`), then the highest rated, instead of an arbitrary 100.
