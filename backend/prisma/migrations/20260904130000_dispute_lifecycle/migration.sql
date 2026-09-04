CREATE TYPE "DisputeDecision" AS ENUM (
  'RELEASE_FULL', 'RELEASE_PARTIAL', 'REFUND_FULL', 'REFUND_PARTIAL', 'SPLIT'
);
CREATE TYPE "DisputeAppealStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');

ALTER TABLE "payments"
  ADD COLUMN "frozen_at" TIMESTAMP(3),
  ADD COLUMN "freeze_reason" TEXT;

ALTER TABLE "disputes"
  ADD COLUMN "release_poisha" BIGINT,
  ADD COLUMN "decision" "DisputeDecision",
  ADD COLUMN "evidence_due_at" TIMESTAMP(3),
  ADD COLUMN "first_response_at" TIMESTAMP(3),
  ADD COLUMN "resolution_due_at" TIMESTAMP(3);
UPDATE "disputes" SET
  "evidence_due_at" = "created_at" + INTERVAL '48 hours',
  "resolution_due_at" = "created_at" + INTERVAL '72 hours';
ALTER TABLE "disputes"
  ALTER COLUMN "evidence_due_at" SET NOT NULL,
  ALTER COLUMN "resolution_due_at" SET NOT NULL;

DROP INDEX IF EXISTS "disputes_assignment_id_idx";
CREATE UNIQUE INDEX "disputes_assignment_id_key" ON "disputes"("assignment_id");

ALTER TABLE "dispute_evidence" ADD COLUMN "document_id" UUID;
CREATE INDEX "dispute_evidence_document_id_idx" ON "dispute_evidence"("document_id");
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "dispute_appeals" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "dispute_id" UUID NOT NULL,
  "opened_by_user_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "DisputeAppealStatus" NOT NULL DEFAULT 'PENDING',
  "assigned_admin_id" UUID,
  "resolved_by" UUID,
  "resolution" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "dispute_appeals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dispute_appeals_dispute_id_key" ON "dispute_appeals"("dispute_id");
CREATE INDEX "dispute_appeals_status_created_at_idx" ON "dispute_appeals"("status", "created_at");
CREATE INDEX "dispute_appeals_assigned_admin_id_idx" ON "dispute_appeals"("assigned_admin_id");
ALTER TABLE "dispute_appeals" ADD CONSTRAINT "dispute_appeals_dispute_id_fkey"
  FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispute_appeals" ADD CONSTRAINT "dispute_appeals_opened_by_user_id_fkey"
  FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispute_appeals" ADD CONSTRAINT "dispute_appeals_assigned_admin_id_fkey"
  FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispute_appeals" ADD CONSTRAINT "dispute_appeals_resolved_by_fkey"
  FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
