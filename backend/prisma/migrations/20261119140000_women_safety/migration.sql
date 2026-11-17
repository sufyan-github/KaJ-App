-- P3.7: women-focused work and safety. worker_profiles.prefers_flexible_hours
-- (preferred_arrangements already exists from P1); reports.first_action_at
-- for time-to-first-action in the priority safety queue; an index for the
-- arrangement feed filter. Existing reports get first_action_at from
-- reviewed_at. Rollback: down.sql.

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "first_action_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "worker_profiles" ADD COLUMN     "prefers_flexible_hours" BOOLEAN NOT NULL DEFAULT false;


UPDATE "reports" SET "first_action_at" = "reviewed_at" WHERE "first_action_at" IS NULL AND "reviewed_at" IS NOT NULL;

-- CreateIndex
CREATE INDEX "jobs_opportunity_type_status_work_arrangement_idx" ON "jobs"("opportunity_type", "status", "work_arrangement");
