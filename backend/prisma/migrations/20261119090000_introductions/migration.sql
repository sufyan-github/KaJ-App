-- P3.1: introduction_requests (plan migration 12). A consent-based request
-- to meet an expert, sharing only a public summary of an idea, a business
-- or a learning goal. Expires after 7 days. Rollback: down.sql.

-- CreateEnum
CREATE TYPE "IntroductionContextType" AS ENUM ('IDEA', 'BUSINESS', 'LEARNING_GOAL');

-- CreateEnum
CREATE TYPE "IntroductionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "introduction_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "requester_user_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "context_type" "IntroductionContextType" NOT NULL,
    "context_id" UUID,
    "context_summary" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "IntroductionStatus" NOT NULL DEFAULT 'PENDING',
    "allow_idea_access" BOOLEAN NOT NULL DEFAULT false,
    "idea_access_granted" BOOLEAN NOT NULL DEFAULT false,
    "conversation_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "hidden_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "introduction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "introduction_requests_conversation_id_key" ON "introduction_requests"("conversation_id");

-- CreateIndex
CREATE INDEX "introduction_requests_requester_user_id_created_at_idx" ON "introduction_requests"("requester_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "introduction_requests_target_user_id_status_idx" ON "introduction_requests"("target_user_id", "status");

-- CreateIndex
CREATE INDEX "introduction_requests_status_expires_at_idx" ON "introduction_requests"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One pending request per requester and expert.
CREATE UNIQUE INDEX "introduction_requests_one_pending_idx"
  ON "introduction_requests"("requester_user_id", "target_user_id")
  WHERE "status" = 'PENDING';

-- Nobody introduces themselves; an idea or business context names it.
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_parties_check"
  CHECK ("requester_user_id" <> "target_user_id") NOT VALID;
ALTER TABLE "introduction_requests" VALIDATE CONSTRAINT "introduction_requests_parties_check";
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_context_check"
  CHECK (("context_type" = 'LEARNING_GOAL') = ("context_id" IS NULL)) NOT VALID;
ALTER TABLE "introduction_requests" VALIDATE CONSTRAINT "introduction_requests_context_check";
-- Idea access can only be offered (and granted) for an idea.
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_idea_access_check"
  CHECK ("context_type" = 'IDEA' OR (NOT "allow_idea_access" AND NOT "idea_access_granted")) NOT VALID;
ALTER TABLE "introduction_requests" VALIDATE CONSTRAINT "introduction_requests_idea_access_check";
