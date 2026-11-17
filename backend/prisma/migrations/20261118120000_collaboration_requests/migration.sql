-- P2.5: collaboration_requests (plan migrations 6, second half, and 11): a
-- proposal to work together on an IDEA or a BUSINESS subject, with a linked
-- conversation once accepted and an audit history of every status change.
-- Connecting never creates ownership, equity or a legal partnership.
-- Rollback: down.sql.

-- CreateEnum
CREATE TYPE "CollaborationSubjectType" AS ENUM ('IDEA', 'BUSINESS');

-- CreateEnum
CREATE TYPE "CollaborationStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'AGREED', 'ENDED');

-- CreateTable
CREATE TABLE "collaboration_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "requester_user_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "subject_type" "CollaborationSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "idea_role_id" UUID,
    "from_business_profile_id" UUID,
    "message" TEXT NOT NULL,
    "status" "CollaborationStatus" NOT NULL DEFAULT 'PROPOSED',
    "conversation_id" UUID,
    "agreement_summary" TEXT,
    "requester_agreed_at" TIMESTAMP(3),
    "recipient_agreed_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "agreed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "hidden_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaboration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_request_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "request_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "from_status" "CollaborationStatus",
    "to_status" "CollaborationStatus" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaboration_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_requests_conversation_id_key" ON "collaboration_requests"("conversation_id");

-- CreateIndex
CREATE INDEX "collaboration_requests_requester_user_id_created_at_idx" ON "collaboration_requests"("requester_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "collaboration_requests_recipient_user_id_status_idx" ON "collaboration_requests"("recipient_user_id", "status");

-- CreateIndex
CREATE INDEX "collaboration_requests_subject_type_subject_id_idx" ON "collaboration_requests"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "collaboration_requests_from_business_profile_id_idx" ON "collaboration_requests"("from_business_profile_id");

-- CreateIndex
CREATE INDEX "collaboration_request_events_request_id_created_at_idx" ON "collaboration_request_events"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "collaboration_request_events_actor_user_id_idx" ON "collaboration_request_events"("actor_user_id");

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_from_business_profile_id_fkey" FOREIGN KEY ("from_business_profile_id") REFERENCES "business_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_request_events" ADD CONSTRAINT "collaboration_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "collaboration_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_request_events" ADD CONSTRAINT "collaboration_request_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One open request per requester and subject.
CREATE UNIQUE INDEX "collaboration_requests_one_open_per_subject_idx"
  ON "collaboration_requests"("requester_user_id", "subject_type", "subject_id")
  WHERE "status" IN ('PROPOSED', 'ACCEPTED', 'AGREED');

-- Nobody proposes to themselves; AGREED (and ENDED, which only follows
-- AGREED) means both sides confirmed.
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_parties_check"
  CHECK ("requester_user_id" <> "recipient_user_id") NOT VALID;
ALTER TABLE "collaboration_requests" VALIDATE CONSTRAINT "collaboration_requests_parties_check";
ALTER TABLE "collaboration_requests" ADD CONSTRAINT "collaboration_requests_agreed_check"
  CHECK (
    "status" NOT IN ('AGREED', 'ENDED')
    OR ("requester_agreed_at" IS NOT NULL AND "recipient_agreed_at" IS NOT NULL AND "agreed_at" IS NOT NULL)
  ) NOT VALID;
ALTER TABLE "collaboration_requests" VALIDATE CONSTRAINT "collaboration_requests_agreed_check";
