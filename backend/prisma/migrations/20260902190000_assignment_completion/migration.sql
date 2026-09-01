ALTER TABLE "assignments"
  ADD COLUMN "confirmation_deadline_at" TIMESTAMP(3),
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "completion_due_at" TIMESTAMP(3);

ALTER TABLE "contracts" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_assignment_id_key";
CREATE UNIQUE INDEX "contracts_assignment_id_version_key"
  ON "contracts"("assignment_id", "version");
CREATE INDEX "contracts_assignment_id_created_at_idx"
  ON "contracts"("assignment_id", "created_at" DESC);

CREATE INDEX "assignments_confirmation_deadline_at_status_idx"
  ON "assignments"("confirmation_deadline_at", "status");
CREATE INDEX "assignments_completion_due_at_status_idx"
  ON "assignments"("completion_due_at", "status");
