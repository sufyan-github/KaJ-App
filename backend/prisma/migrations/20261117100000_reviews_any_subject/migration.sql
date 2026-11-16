-- P1.0: reviews can be about any subject (subject_type, subject_id), not only
-- an assignment. Existing rows become ASSIGNMENT reviews with subject_id =
-- assignment_id; the assignment API is unchanged. Rollback: down.sql.

-- CreateEnum
CREATE TYPE "ReviewSubjectType" AS ENUM ('ASSIGNMENT');

-- AlterTable: add the subject, backfill it from the assignment, then require it.
ALTER TABLE "reviews"
  ADD COLUMN "subject_type" "ReviewSubjectType" NOT NULL DEFAULT 'ASSIGNMENT',
  ADD COLUMN "subject_id" UUID;
UPDATE "reviews" SET "subject_id" = "assignment_id" WHERE "subject_id" IS NULL;
ALTER TABLE "reviews" ALTER COLUMN "subject_id" SET NOT NULL;

-- Other subjects have no job or assignment.
ALTER TABLE "reviews"
  ALTER COLUMN "job_id" DROP NOT NULL,
  ALTER COLUMN "assignment_id" DROP NOT NULL;

-- An ASSIGNMENT review must still point at its job and assignment.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_assignment_subject_check" CHECK (
  "subject_type" <> 'ASSIGNMENT'
  OR ("assignment_id" IS NOT NULL AND "job_id" IS NOT NULL AND "subject_id" = "assignment_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_subject_type_subject_id_reviewer_user_id_key" ON "reviews"("subject_type", "subject_id", "reviewer_user_id");
