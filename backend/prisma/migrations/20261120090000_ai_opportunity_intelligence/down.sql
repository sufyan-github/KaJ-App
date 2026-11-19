-- Rollback of 20261120090000_ai_opportunity_intelligence. Roll the app back first.
DELETE FROM "subscription_access_rules" WHERE "feature_key" = 'AI_IDEA_ANALYSIS';
DROP TABLE IF EXISTS "ai_usage_logs";
DROP TABLE IF EXISTS "ai_consents";
ALTER TABLE "business_ideas" DROP COLUMN IF EXISTS "ai_analyzed_at";
ALTER TABLE "business_ideas" DROP COLUMN IF EXISTS "ai_analysis_model";
ALTER TABLE "business_ideas" DROP COLUMN IF EXISTS "ai_analysis_locale";
ALTER TABLE "business_ideas" DROP COLUMN IF EXISTS "ai_analysis";
DROP TYPE IF EXISTS "AiCallOutcome";
DROP TYPE IF EXISTS "AiFeature";
