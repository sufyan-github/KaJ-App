-- P1.2 learning opportunities on jobs (+ arrangement fields). Constant
-- defaults (WORK, ON_SITE), so existing rows stay paid work with no rewrite.
-- Rollback: down.sql (first set non-WORK jobs aside, see the comment there).

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "business_profile_id" UUID,
ADD COLUMN     "flexible_hours" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "opportunity_type" "OpportunityType" NOT NULL DEFAULT 'WORK',
ADD COLUMN     "participant_fee_poisha" BIGINT,
ADD COLUMN     "participant_terms" "ParticipantTerms",
ADD COLUMN     "training_course_id" UUID,
ADD COLUMN     "work_arrangement" "WorkArrangement" NOT NULL DEFAULT 'ON_SITE';

-- AlterTable
ALTER TABLE "worker_profiles" ADD COLUMN     "preferred_arrangements" "WorkArrangement"[] DEFAULT ARRAY[]::"WorkArrangement"[];

-- CreateIndex
CREATE INDEX "jobs_opportunity_type_status_published_at_idx" ON "jobs"("opportunity_type", "status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "jobs_training_course_id_idx" ON "jobs"("training_course_id");

-- CreateIndex
CREATE INDEX "jobs_business_profile_id_idx" ON "jobs"("business_profile_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_training_course_id_fkey" FOREIGN KEY ("training_course_id") REFERENCES "training_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_business_profile_id_fkey" FOREIGN KEY ("business_profile_id") REFERENCES "business_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A learning opportunity always states its terms; paid work never has them.
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_opportunity_terms_check" CHECK (
  ("opportunity_type" = 'WORK') = ("participant_terms" IS NULL)
);
-- A participant fee exists exactly when the participant pays, and is positive.
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_participant_fee_check" CHECK (
  (COALESCE("participant_terms"::text, '') = 'PAID_BY_PARTICIPANT')
    = ("participant_fee_poisha" IS NOT NULL)
  AND ("participant_fee_poisha" IS NULL OR "participant_fee_poisha" > 0)
);
