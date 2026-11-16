-- Rollback of 20261117100000_reviews_any_subject. Only possible while every
-- review is an ASSIGNMENT review (re-adding NOT NULL fails otherwise).
-- Run, then delete the migration's row from _prisma_migrations.
DROP INDEX IF EXISTS "reviews_subject_type_subject_id_reviewer_user_id_key";
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_assignment_subject_check";
ALTER TABLE "reviews"
  ALTER COLUMN "job_id" SET NOT NULL,
  ALTER COLUMN "assignment_id" SET NOT NULL;
ALTER TABLE "reviews"
  DROP COLUMN IF EXISTS "subject_id",
  DROP COLUMN IF EXISTS "subject_type";
DROP TYPE IF EXISTS "ReviewSubjectType";
