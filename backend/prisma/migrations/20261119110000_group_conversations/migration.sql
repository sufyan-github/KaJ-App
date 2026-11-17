-- P3.3: group conversations. A conversation is DIRECT (two people, as
-- before) or GROUP (many), with an optional title and the subject whose
-- members it follows (IDEA_ROOM, SESSION, COMMUNITY_GROUP). Existing rows
-- become DIRECT. Rollback: down.sql.

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('DIRECT', 'GROUP');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "kind" "ConversationKind" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "subject_id" UUID,
ADD COLUMN     "subject_type" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "conversations_subject_type_subject_id_idx" ON "conversations"("subject_type", "subject_id");


-- A group names its subject; a direct conversation has none.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_group_subject_check" CHECK (
  ("kind" = 'GROUP') = ("subject_type" IS NOT NULL AND "subject_id" IS NOT NULL)
) NOT VALID;
ALTER TABLE "conversations" VALIDATE CONSTRAINT "conversations_group_subject_check";
