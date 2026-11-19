-- P4 AI Opportunity Intelligence. Additive only: two new tables, two enums,
-- four nullable idea columns and one subscription access rule.
-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('IDEA_ANALYSIS', 'OPPORTUNITY_SUGGESTIONS', 'BUSINESS_GROWTH_TIPS');

-- CreateEnum
CREATE TYPE "AiCallOutcome" AS ENUM ('SUCCESS', 'REFUSED', 'INVALID_OUTPUT', 'ERROR');

-- AlterTable
ALTER TABLE "business_ideas" ADD COLUMN     "ai_analysis" JSONB,
ADD COLUMN     "ai_analysis_locale" TEXT,
ADD COLUMN     "ai_analysis_model" TEXT,
ADD COLUMN     "ai_analyzed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ai_consents" (
    "user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "consented_at" TIMESTAMP(3) NOT NULL,
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_consents_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "user_id" UUID,
    "feature" "AiFeature" NOT NULL,
    "outcome" "AiCallOutcome" NOT NULL,
    "model" TEXT NOT NULL,
    "subject_id" UUID,
    "stop_reason" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_creation_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd_micros" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_logs_user_id_created_at_idx" ON "ai_usage_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_usage_logs_feature_created_at_idx" ON "ai_usage_logs"("feature", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_usage_logs_created_at_idx" ON "ai_usage_logs"("created_at");

-- AddForeignKey
ALTER TABLE "ai_consents" ADD CONSTRAINT "ai_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AI idea analysis is for subscribers only (owner decision). Deactivating
-- this rule in the admin console makes it free again.
INSERT INTO "subscription_access_rules" ("feature_key", "description", "updated_at") VALUES
  ('AI_IDEA_ANALYSIS', 'AI analysis of a business idea', CURRENT_TIMESTAMP)
ON CONFLICT ("feature_key") DO NOTHING;
