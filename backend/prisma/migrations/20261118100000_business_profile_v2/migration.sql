-- P2.1: business_profile_v2 + business_members + business_categories
-- (plan migrations 5 and 9). business_profiles was unused; it becomes a
-- business or venture with a stage, a sector, public / seeking-partner flags
-- and optional address and contact person. business_members says who acts
-- for it (OWNER, MANAGER, STAFF). verification_requests can point at the
-- business it verifies (P2.6). Only a REGISTERED business can be APPROVED.
-- Rollback: down.sql (address/contact_person/location can only become
-- required again once every row has them).

-- CreateEnum
CREATE TYPE "BusinessStage" AS ENUM ('IDEA', 'INFORMAL', 'REGISTERED');

-- CreateEnum
CREATE TYPE "BusinessMemberRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- AlterTable
ALTER TABLE "business_profiles" ADD COLUMN     "category_id" UUID,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seeking_partners" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stage" "BusinessStage" NOT NULL DEFAULT 'INFORMAL',
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspension_reason" TEXT,
ALTER COLUMN "address" DROP NOT NULL,
ALTER COLUMN "location_id" DROP NOT NULL,
ALTER COLUMN "contact_person" DROP NOT NULL;

-- AlterTable
ALTER TABLE "verification_requests" ADD COLUMN     "business_profile_id" UUID;

-- CreateTable
CREATE TABLE "business_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "business_profile_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "BusinessMemberRole" NOT NULL,
    "invited_by_user_id" UUID,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_categories" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "parent_id" UUID,
    "slug" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_members_user_id_idx" ON "business_members"("user_id");

-- CreateIndex
CREATE INDEX "business_members_invited_by_user_id_idx" ON "business_members"("invited_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_members_business_profile_id_user_id_key" ON "business_members"("business_profile_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_categories_slug_key" ON "business_categories"("slug");

-- CreateIndex
CREATE INDEX "business_categories_parent_id_idx" ON "business_categories"("parent_id");

-- CreateIndex
CREATE INDEX "business_profiles_category_id_idx" ON "business_profiles"("category_id");

-- CreateIndex
CREATE INDEX "business_profiles_is_public_seeking_partners_category_id_lo_idx" ON "business_profiles"("is_public", "seeking_partners", "category_id", "location_id");

-- CreateIndex
CREATE INDEX "verification_requests_business_profile_id_idx" ON "verification_requests"("business_profile_id");

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "business_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_profile_id_fkey" FOREIGN KEY ("business_profile_id") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_categories" ADD CONSTRAINT "business_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "business_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_business_profile_id_fkey" FOREIGN KEY ("business_profile_id") REFERENCES "business_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing rows (none expected): an approved (verified) business is a registered one,
-- and its creator is its owner.
UPDATE "business_profiles" SET "stage" = 'REGISTERED' WHERE "verification_status" = 'APPROVED';
INSERT INTO "business_members" ("business_profile_id", "user_id", "role", "accepted_at", "updated_at")
SELECT "id", "user_id", 'OWNER', "created_at", CURRENT_TIMESTAMP FROM "business_profiles"
ON CONFLICT ("business_profile_id", "user_id") DO NOTHING;

-- An IDEA or INFORMAL business never carries the verified badge.
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_verified_stage_check"
  CHECK ("verification_status" <> 'APPROVED' OR "stage" = 'REGISTERED') NOT VALID;
ALTER TABLE "business_profiles" VALIDATE CONSTRAINT "business_profiles_verified_stage_check";

-- Sensible sizes.
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_employees_count_check"
  CHECK ("employees_count" IS NULL OR "employees_count" BETWEEN 0 AND 100000) NOT VALID;
ALTER TABLE "business_profiles" VALIDATE CONSTRAINT "business_profiles_employees_count_check";
