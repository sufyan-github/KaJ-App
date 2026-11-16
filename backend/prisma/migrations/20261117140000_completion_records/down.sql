-- Rollback of 20261117140000_completion_records. Only possible while every
-- record is a quiz certificate: first remove (or archive) practical ones,
--   DELETE FROM training_certificates WHERE assignment_id IS NOT NULL;
-- then run this and delete the migration's row from _prisma_migrations.
ALTER TABLE "training_certificates" DROP CONSTRAINT IF EXISTS "training_certificates_quiz_fields_check";
ALTER TABLE "training_certificates" DROP CONSTRAINT IF EXISTS "training_certificates_one_source_check";
ALTER TABLE "training_certificates" DROP CONSTRAINT IF EXISTS "training_certificates_skill_id_fkey";
ALTER TABLE "training_certificates" DROP CONSTRAINT IF EXISTS "training_certificates_issued_by_user_id_fkey";
ALTER TABLE "training_certificates" DROP CONSTRAINT IF EXISTS "training_certificates_assignment_id_fkey";
DROP INDEX IF EXISTS "training_certificates_skill_id_idx";
DROP INDEX IF EXISTS "training_certificates_issued_by_user_id_idx";
DROP INDEX IF EXISTS "training_certificates_assignment_id_key";
ALTER TABLE "training_certificates"
  ALTER COLUMN "course_id" SET NOT NULL,
  ALTER COLUMN "attempt_id" SET NOT NULL,
  ALTER COLUMN "course_version" SET NOT NULL,
  ALTER COLUMN "score_pct" SET NOT NULL;
ALTER TABLE "training_certificates"
  DROP COLUMN IF EXISTS "assignment_id",
  DROP COLUMN IF EXISTS "issued_by_user_id",
  DROP COLUMN IF EXISTS "revoked_reason",
  DROP COLUMN IF EXISTS "skill_id",
  DROP COLUMN IF EXISTS "title";
