-- Rollback of 20261117120000_work_learn_job_extensions.
-- Before rolling the app back, take learning opportunities out of view of
-- code that doesn't know them (it would show them as paid work):
--   UPDATE jobs SET status = 'SUSPENDED' WHERE opportunity_type <> 'WORK';
-- Then run this and delete the migration's row from _prisma_migrations.
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_participant_fee_check";
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_opportunity_terms_check";
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_business_profile_id_fkey";
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_training_course_id_fkey";
DROP INDEX IF EXISTS "jobs_business_profile_id_idx";
DROP INDEX IF EXISTS "jobs_training_course_id_idx";
DROP INDEX IF EXISTS "jobs_opportunity_type_status_published_at_idx";
ALTER TABLE "worker_profiles" DROP COLUMN IF EXISTS "preferred_arrangements";
ALTER TABLE "jobs"
  DROP COLUMN IF EXISTS "business_profile_id",
  DROP COLUMN IF EXISTS "flexible_hours",
  DROP COLUMN IF EXISTS "opportunity_type",
  DROP COLUMN IF EXISTS "participant_fee_poisha",
  DROP COLUMN IF EXISTS "participant_terms",
  DROP COLUMN IF EXISTS "training_course_id",
  DROP COLUMN IF EXISTS "work_arrangement";
