-- Rollback of 20261119140000_women_safety. Roll the app back first.
DROP INDEX IF EXISTS "jobs_opportunity_type_status_work_arrangement_idx";
ALTER TABLE "reports" DROP COLUMN IF EXISTS "first_action_at";
ALTER TABLE "worker_profiles" DROP COLUMN IF EXISTS "prefers_flexible_hours";
