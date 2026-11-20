-- DB-4: the minute reconciler reads CONFIRMED assignments by start time.
CREATE INDEX IF NOT EXISTS "assignments_status_agreed_starts_at_idx"
  ON "assignments" ("status", "agreed_starts_at");
