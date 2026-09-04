-- P10-TRUST-05: privacy-safe identity observations and human risk review queue.
CREATE TYPE "RiskIdentityKind" AS ENUM ('DEVICE', 'PHONE', 'IP');
CREATE TYPE "RiskReviewStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLEARED', 'ESCALATED');
CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "risk_identity_observations" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "user_id" UUID NOT NULL,
  "kind" "RiskIdentityKind" NOT NULL,
  "value_hash" TEXT NOT NULL,
  "first_observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurrences" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "risk_identity_observations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "risk_review_items" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "subject_user_id" UUID NOT NULL,
  "entity_type" TEXT NOT NULL DEFAULT 'USER',
  "entity_id" UUID,
  "score" INTEGER NOT NULL,
  "severity" "RiskSeverity" NOT NULL,
  "signals_json" JSONB NOT NULL,
  "status" "RiskReviewStatus" NOT NULL DEFAULT 'OPEN',
  "reviewer_user_id" UUID,
  "resolution" TEXT,
  "window_started_at" TIMESTAMP(3) NOT NULL,
  "window_ended_at" TIMESTAMP(3) NOT NULL,
  "last_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "risk_review_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_review_items_score_check" CHECK ("score" BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX "risk_identity_observations_user_id_kind_value_hash_key"
  ON "risk_identity_observations"("user_id", "kind", "value_hash");
CREATE INDEX "risk_identity_observations_kind_value_hash_last_observed_idx"
  ON "risk_identity_observations"("kind", "value_hash", "last_observed_at");
CREATE INDEX "risk_identity_observations_user_id_last_observed_at_idx"
  ON "risk_identity_observations"("user_id", "last_observed_at" DESC);
CREATE INDEX "risk_review_items_status_score_created_at_idx"
  ON "risk_review_items"("status", "score" DESC, "created_at");
CREATE INDEX "risk_review_items_subject_user_id_status_idx"
  ON "risk_review_items"("subject_user_id", "status");
CREATE INDEX "risk_review_items_reviewer_user_id_idx"
  ON "risk_review_items"("reviewer_user_id");
CREATE UNIQUE INDEX "risk_review_items_one_active_per_subject_idx"
  ON "risk_review_items"("subject_user_id")
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW');

ALTER TABLE "risk_identity_observations"
  ADD CONSTRAINT "risk_identity_observations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "risk_review_items"
  ADD CONSTRAINT "risk_review_items_subject_user_id_fkey"
  FOREIGN KEY ("subject_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "risk_review_items_reviewer_user_id_fkey"
  FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
