-- W11: one pending booking per worker and slot. A second request for the
-- same worker and the same times waits on the first (the service answers
-- 409 BOOKING_ALREADY_PENDING; this index is the backstop).
-- Pre-check (must return no rows):
--   SELECT worker_user_id, agreed_starts_at, agreed_ends_at, count(*)
--   FROM assignments WHERE status = 'PENDING_CONFIRMATION'
--   GROUP BY 1, 2, 3 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "assignments_one_pending_per_worker_slot"
  ON "assignments" ("worker_user_id", "agreed_starts_at", "agreed_ends_at")
  WHERE "status" = 'PENDING_CONFIRMATION';
