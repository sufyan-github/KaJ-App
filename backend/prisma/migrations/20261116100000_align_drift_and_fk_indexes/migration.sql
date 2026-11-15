-- P0.6 step 1: align the database with schema.prisma (no behaviour change),
-- add the missing foreign-key indexes, and add CHECK constraints NOT VALID.
-- NOT VALID takes only a brief lock and checks new writes immediately;
-- existing rows are checked by the next migration (VALIDATE CONSTRAINT),
-- which does not block writes. Rollback: down.sql in this folder.

-- Drift: these columns are @updatedAt in the schema (Prisma sets them), so
-- the database default is dropped, as on every other table.
-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "mobile_operators" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscription_access_rules" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscription_payments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscription_plans" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_operator_identities" ALTER COLUMN "updated_at" DROP DEFAULT;

CREATE INDEX "dispute_appeals_opened_by_user_id_idx" ON "dispute_appeals"("opened_by_user_id");

CREATE INDEX "dispute_appeals_resolved_by_idx" ON "dispute_appeals"("resolved_by");

CREATE INDEX "disputes_resolved_by_idx" ON "disputes"("resolved_by");

CREATE INDEX "jobs_subcategory_id_idx" ON "jobs"("subcategory_id");

CREATE INDEX "refresh_tokens_device_id_idx" ON "refresh_tokens"("device_id");

CREATE INDEX "reports_reporter_user_id_created_at_idx" ON "reports"("reporter_user_id", "created_at" DESC);

CREATE INDEX "reviews_reviewer_user_id_idx" ON "reviews"("reviewer_user_id");

CREATE INDEX "verification_requests_reviewer_user_id_idx" ON "verification_requests"("reviewer_user_id");

-- RenameIndex
ALTER INDEX "risk_identity_observations_kind_value_hash_last_observed_idx" RENAME TO "risk_identity_observations_kind_value_hash_last_observed_at_idx";


-- Range checks the application already enforces, now also in the database.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range_check"
  CHECK ("rating" BETWEEN 1 AND 5) NOT VALID;
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_sub_ratings_range_check"
  CHECK (
    ("punctuality" IS NULL OR "punctuality" BETWEEN 1 AND 5) AND
    ("quality" IS NULL OR "quality" BETWEEN 1 AND 5) AND
    ("communication" IS NULL OR "communication" BETWEEN 1 AND 5) AND
    ("reliability" IS NULL OR "reliability" BETWEEN 1 AND 5)
  ) NOT VALID;
ALTER TABLE "feature_flags"
  ADD CONSTRAINT "feature_flags_rollout_percent_range_check"
  CHECK ("rollout_percent" BETWEEN 0 AND 100) NOT VALID;
ALTER TABLE "availability_rules"
  ADD CONSTRAINT "availability_rules_day_of_week_range_check"
  CHECK ("day_of_week" BETWEEN 0 AND 6) NOT VALID;
