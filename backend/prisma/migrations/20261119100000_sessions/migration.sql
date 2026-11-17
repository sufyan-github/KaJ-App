-- P3.2: sessions and session_participants (plan migration 13; replaces the
-- community_events / community_event_rsvps tables proposed in migration 8).
-- One model for consultations, group discussions, workshops and events.
-- Adds the SESSION review subject (feedback). Rollback: down.sql; the enum
-- value can't be removed and is added with IF NOT EXISTS.

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('CONSULTATION', 'GROUP_DISCUSSION', 'WORKSHOP', 'EVENT');

-- CreateEnum
CREATE TYPE "SessionSubjectType" AS ENUM ('IDEA', 'BUSINESS', 'GROUP');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('IN_PERSON', 'ONLINE', 'IN_APP_CHAT');

-- CreateEnum
CREATE TYPE "SessionPriceModel" AS ENUM ('FREE', 'CASH');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SessionParticipantRole" AS ENUM ('HOST', 'EXPERT', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "SessionParticipantStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'ATTENDED', 'NO_SHOW');

-- AlterEnum
ALTER TYPE "ReviewSubjectType" ADD VALUE IF NOT EXISTS 'SESSION';

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "host_user_id" UUID NOT NULL,
    "expert_user_id" UUID,
    "kind" "SessionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject_type" "SessionSubjectType",
    "subject_id" UUID,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "mode" "SessionMode" NOT NULL,
    "location_id" UUID,
    "online_link" TEXT,
    "capacity" INTEGER NOT NULL,
    "price_model" "SessionPriceModel" NOT NULL DEFAULT 'FREE',
    "price_poisha" BIGINT,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "women_only" BOOLEAN NOT NULL DEFAULT false,
    "home_based_friendly" BOOLEAN NOT NULL DEFAULT false,
    "introduction_id" UUID,
    "reminder_sent_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "completed_at" TIMESTAMP(3),
    "hidden_at" TIMESTAMP(3),
    "hidden_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "SessionParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
    "status" "SessionParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "invited_by_user_id" UUID,
    "responded_at" TIMESTAMP(3),
    "attendance_marked_at" TIMESTAMP(3),
    "cash_amount_poisha" BIGINT,
    "cash_recorded_at" TIMESTAMP(3),
    "cash_recorded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_host_user_id_starts_at_idx" ON "sessions"("host_user_id", "starts_at");

-- CreateIndex
CREATE INDEX "sessions_expert_user_id_starts_at_idx" ON "sessions"("expert_user_id", "starts_at");

-- CreateIndex
CREATE INDEX "sessions_status_starts_at_idx" ON "sessions"("status", "starts_at");

-- CreateIndex
CREATE INDEX "sessions_subject_type_subject_id_idx" ON "sessions"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "sessions_location_id_idx" ON "sessions"("location_id");

-- CreateIndex
CREATE INDEX "sessions_introduction_id_idx" ON "sessions"("introduction_id");

-- CreateIndex
CREATE INDEX "session_participants_user_id_status_idx" ON "session_participants"("user_id", "status");

-- CreateIndex
CREATE INDEX "session_participants_invited_by_user_id_idx" ON "session_participants"("invited_by_user_id");

-- CreateIndex
CREATE INDEX "session_participants_cash_recorded_by_idx" ON "session_participants"("cash_recorded_by");

-- CreateIndex
CREATE UNIQUE INDEX "session_participants_session_id_user_id_key" ON "session_participants"("session_id", "user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expert_user_id_fkey" FOREIGN KEY ("expert_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_introduction_id_fkey" FOREIGN KEY ("introduction_id") REFERENCES "introduction_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_cash_recorded_by_fkey" FOREIGN KEY ("cash_recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "sessions" ADD CONSTRAINT "sessions_shape_check" CHECK (
  "duration_minutes" BETWEEN 15 AND 720
  AND "capacity" BETWEEN 1 AND 1000
  -- A consultation is one to one.
  AND ("kind" <> 'CONSULTATION' OR "capacity" = 1)
  AND (("subject_type" IS NULL) = ("subject_id" IS NULL))
) NOT VALID;
ALTER TABLE "sessions" VALIDATE CONSTRAINT "sessions_shape_check";

-- In person needs an area; online needs a link once scheduled (a
-- consultation's expert adds it when accepting).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_mode_check" CHECK (
  ("mode" <> 'IN_PERSON' OR "location_id" IS NOT NULL)
  AND ("mode" <> 'ONLINE' OR "online_link" IS NOT NULL OR "status" IN ('DRAFT', 'CANCELLED'))
) NOT VALID;
ALTER TABLE "sessions" VALIDATE CONSTRAINT "sessions_mode_check";

-- FREE has no price; CASH has a positive one.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_price_check" CHECK (
  ("price_model" = 'FREE' AND "price_poisha" IS NULL)
  OR ("price_model" = 'CASH' AND "price_poisha" IS NOT NULL AND "price_poisha" > 0)
) NOT VALID;
ALTER TABLE "sessions" VALIDATE CONSTRAINT "sessions_price_check";

ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_cash_check" CHECK (
  "cash_amount_poisha" IS NULL OR "cash_amount_poisha" >= 0
) NOT VALID;
ALTER TABLE "session_participants" VALIDATE CONSTRAINT "session_participants_cash_check";
