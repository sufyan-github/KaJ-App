-- Rollback of 20261119130000_group_sessions. Roll the app back first.
-- PostgreSQL can't drop an enum value: SessionParticipantStatus.WAITLISTED
-- stays (set such rows to DECLINED first if wanted).
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_group_check";
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_group_id_fkey";
DROP INDEX IF EXISTS "sessions_group_id_starts_at_idx";
ALTER TABLE "sessions"
  DROP COLUMN IF EXISTS "group_id",
  DROP COLUMN IF EXISTS "venue_lat",
  DROP COLUMN IF EXISTS "venue_lng";
ALTER TABLE "session_participants"
  DROP COLUMN IF EXISTS "checked_in_at",
  DROP COLUMN IF EXISTS "checkin_accuracy_m",
  DROP COLUMN IF EXISTS "checkin_consent_version",
  DROP COLUMN IF EXISTS "checkin_distance_m",
  DROP COLUMN IF EXISTS "waitlisted_at";
