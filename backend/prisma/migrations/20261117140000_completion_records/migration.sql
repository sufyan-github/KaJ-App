-- P1.4: training_certificates becomes the one completion record: a passed
-- quiz (as before) or a mentor-checked learning enrolment. Existing rows are
-- all quiz certificates and satisfy the new CHECKs. One-way once practical
-- records exist (see down.sql).

-- AlterTable
ALTER TABLE "training_certificates" ADD COLUMN     "assignment_id" UUID,
ADD COLUMN     "issued_by_user_id" UUID,
ADD COLUMN     "revoked_reason" TEXT,
ADD COLUMN     "skill_id" UUID,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "course_id" DROP NOT NULL,
ALTER COLUMN "attempt_id" DROP NOT NULL,
ALTER COLUMN "course_version" DROP NOT NULL,
ALTER COLUMN "score_pct" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "training_certificates_assignment_id_key" ON "training_certificates"("assignment_id");

-- CreateIndex
CREATE INDEX "training_certificates_issued_by_user_id_idx" ON "training_certificates"("issued_by_user_id");

-- CreateIndex
CREATE INDEX "training_certificates_skill_id_idx" ON "training_certificates"("skill_id");

-- AddForeignKey
ALTER TABLE "training_certificates" ADD CONSTRAINT "training_certificates_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_certificates" ADD CONSTRAINT "training_certificates_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_certificates" ADD CONSTRAINT "training_certificates_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Exactly one source. Added NOT VALID (brief lock), then validated.
ALTER TABLE "training_certificates" ADD CONSTRAINT "training_certificates_one_source_check"
  CHECK (("attempt_id" IS NOT NULL) <> ("assignment_id" IS NOT NULL)) NOT VALID;
ALTER TABLE "training_certificates" VALIDATE CONSTRAINT "training_certificates_one_source_check";

-- A quiz certificate still names its course, version and score.
ALTER TABLE "training_certificates" ADD CONSTRAINT "training_certificates_quiz_fields_check"
  CHECK ("attempt_id" IS NULL OR ("course_id" IS NOT NULL AND "course_version" IS NOT NULL AND "score_pct" IS NOT NULL)) NOT VALID;
ALTER TABLE "training_certificates" VALIDATE CONSTRAINT "training_certificates_quiz_fields_check";
