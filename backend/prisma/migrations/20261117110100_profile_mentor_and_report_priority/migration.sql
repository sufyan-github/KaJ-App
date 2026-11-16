-- P1.1 mentor capability columns (+ reports.priority for safety triage).
-- Add-only, constant defaults. Rollback: down.sql.

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "mentor_accepting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mentor_applied_at" TIMESTAMP(3),
ADD COLUMN     "mentor_approved_at" TIMESTAMP(3),
ADD COLUMN     "mentor_bio" TEXT,
ADD COLUMN     "mentor_status" "MentorStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "mentor_years_experience" INTEGER;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "priority" SMALLINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "user_skills" ADD COLUMN     "can_mentor" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "profiles_mentor_status_mentor_accepting_idx" ON "profiles"("mentor_status", "mentor_accepting");

-- CreateIndex
CREATE INDEX "reports_status_priority_created_at_idx" ON "reports"("status", "priority", "created_at");


ALTER TABLE "profiles" ADD CONSTRAINT "profiles_mentor_years_range_check"
  CHECK ("mentor_years_experience" IS NULL OR "mentor_years_experience" BETWEEN 0 AND 70);
