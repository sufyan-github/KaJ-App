-- Rollback of 20261117110100_profile_mentor_and_report_priority. Mentor
-- applications and statuses are lost (the verification requests remain).
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_mentor_years_range_check";
DROP INDEX IF EXISTS "reports_status_priority_created_at_idx";
DROP INDEX IF EXISTS "profiles_mentor_status_mentor_accepting_idx";
ALTER TABLE "user_skills" DROP COLUMN IF EXISTS "can_mentor";
ALTER TABLE "reports" DROP COLUMN IF EXISTS "priority";
ALTER TABLE "profiles"
  DROP COLUMN IF EXISTS "mentor_accepting",
  DROP COLUMN IF EXISTS "mentor_applied_at",
  DROP COLUMN IF EXISTS "mentor_approved_at",
  DROP COLUMN IF EXISTS "mentor_bio",
  DROP COLUMN IF EXISTS "mentor_status",
  DROP COLUMN IF EXISTS "mentor_years_experience";
