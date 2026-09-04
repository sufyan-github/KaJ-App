-- P10-TRUST-04: normalized report review and progressive moderation controls.
CREATE TYPE "ModerationLevel" AS ENUM ('NONE', 'WARN', 'RESTRICT', 'SUSPEND', 'BAN');

ALTER TABLE "users"
  ADD COLUMN "moderation_level" "ModerationLevel" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "restriction_ends_at" TIMESTAMP(3),
  ADD COLUMN "reverification_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reverification_requested_at" TIMESTAMP(3),
  ADD COLUMN "moderation_reason" TEXT;

ALTER TABLE "reports"
  ADD COLUMN "subject_user_id" UUID,
  ADD COLUMN "reviewer_user_id" UUID,
  ADD COLUMN "resolution" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMP(3);

ALTER TABLE "moderation_actions"
  ADD COLUMN "report_id" UUID,
  ADD COLUMN "previous_level" "ModerationLevel",
  ADD COLUMN "level" "ModerationLevel",
  ADD COLUMN "requires_reverification" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "review_due_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_at" TIMESTAMP(3);

CREATE INDEX "reports_subject_user_id_status_created_at_idx"
  ON "reports"("subject_user_id", "status", "created_at");
CREATE INDEX "reports_reviewer_user_id_idx" ON "reports"("reviewer_user_id");
CREATE INDEX "moderation_actions_report_id_idx" ON "moderation_actions"("report_id");
CREATE INDEX "moderation_actions_review_due_at_reviewed_at_idx"
  ON "moderation_actions"("review_due_at", "reviewed_at");

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "reports_reviewer_user_id_fkey"
  FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "moderation_actions"
  ADD CONSTRAINT "moderation_actions_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "reports"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
