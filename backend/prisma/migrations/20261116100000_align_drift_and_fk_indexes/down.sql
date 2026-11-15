-- Rollback of 20261116100000_align_drift_and_fk_indexes. Run by hand, then
-- delete the row from _prisma_migrations. Also roll back the validate
-- migration first if it was applied (its down.sql is a no-op).
ALTER TABLE "availability_rules" DROP CONSTRAINT IF EXISTS "availability_rules_day_of_week_range_check";
ALTER TABLE "feature_flags" DROP CONSTRAINT IF EXISTS "feature_flags_rollout_percent_range_check";
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_sub_ratings_range_check";
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_rating_range_check";

DROP INDEX IF EXISTS "verification_requests_reviewer_user_id_idx";
DROP INDEX IF EXISTS "reviews_reviewer_user_id_idx";
DROP INDEX IF EXISTS "reports_reporter_user_id_created_at_idx";
DROP INDEX IF EXISTS "refresh_tokens_device_id_idx";
DROP INDEX IF EXISTS "jobs_subcategory_id_idx";
DROP INDEX IF EXISTS "disputes_resolved_by_idx";
DROP INDEX IF EXISTS "dispute_appeals_resolved_by_idx";
DROP INDEX IF EXISTS "dispute_appeals_opened_by_user_id_idx";

ALTER INDEX "risk_identity_observations_kind_value_hash_last_observed_at_idx" RENAME TO "risk_identity_observations_kind_value_hash_last_observed_idx";

ALTER TABLE "conversations" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "mobile_operators" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "subscription_access_rules" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "subscription_payments" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "subscription_plans" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "subscriptions" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "user_operator_identities" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
