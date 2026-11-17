-- P3.4: community_groups and community_group_members (plan migration 8,
-- groups half; events are sessions, migration 13). PUBLIC or PRIVATE,
-- opt-in women-only, area and category; members MEMBER | MODERATOR |
-- AMBASSADOR, PENDING | ACTIVE | REMOVED. Rollback: down.sql.

-- CreateEnum
CREATE TYPE "GroupVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "GroupMemberRole" AS ENUM ('MEMBER', 'MODERATOR', 'AMBASSADOR');

-- CreateEnum
CREATE TYPE "GroupMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'REMOVED');

-- CreateTable
CREATE TABLE "community_groups" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "created_by_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "GroupVisibility" NOT NULL DEFAULT 'PUBLIC',
    "women_only" BOOLEAN NOT NULL DEFAULT false,
    "location_id" UUID,
    "category_id" UUID,
    "hidden_at" TIMESTAMP(3),
    "hidden_reason" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "userId" UUID,
    "introductionRequestId" UUID,

    CONSTRAINT "community_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_group_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "GroupMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "GroupMemberStatus" NOT NULL DEFAULT 'PENDING',
    "invited_by_user_id" UUID,
    "joined_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_groups_visibility_location_id_category_id_idx" ON "community_groups"("visibility", "location_id", "category_id");

-- CreateIndex
CREATE INDEX "community_groups_created_by_user_id_idx" ON "community_groups"("created_by_user_id");

-- CreateIndex
CREATE INDEX "community_groups_location_id_idx" ON "community_groups"("location_id");

-- CreateIndex
CREATE INDEX "community_groups_category_id_idx" ON "community_groups"("category_id");

-- CreateIndex
CREATE INDEX "community_group_members_user_id_status_idx" ON "community_group_members"("user_id", "status");

-- CreateIndex
CREATE INDEX "community_group_members_group_id_status_role_idx" ON "community_group_members"("group_id", "status", "role");

-- CreateIndex
CREATE INDEX "community_group_members_invited_by_user_id_idx" ON "community_group_members"("invited_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_group_members_group_id_user_id_key" ON "community_group_members"("group_id", "user_id");

-- AddForeignKey
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_introductionRequestId_fkey" FOREIGN KEY ("introductionRequestId") REFERENCES "introduction_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_group_members" ADD CONSTRAINT "community_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "community_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_group_members" ADD CONSTRAINT "community_group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_group_members" ADD CONSTRAINT "community_group_members_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_name_check"
  CHECK (char_length(btrim("name")) BETWEEN 3 AND 80) NOT VALID;
ALTER TABLE "community_groups" VALIDATE CONSTRAINT "community_groups_name_check";
-- An active member has a join time; a removed one a removal time.
ALTER TABLE "community_group_members" ADD CONSTRAINT "community_group_members_status_check" CHECK (
  ("status" <> 'ACTIVE' OR "joined_at" IS NOT NULL)
  AND ("status" <> 'REMOVED' OR "removed_at" IS NOT NULL)
) NOT VALID;
ALTER TABLE "community_group_members" VALIDATE CONSTRAINT "community_group_members_status_check";
