-- Rollback of 20261118100000_business_profile_v2. Roll the app back first.
-- address, contact_person and location_id become required again: fill them
-- on any row that lacks them before running this.
ALTER TABLE "verification_requests" DROP CONSTRAINT IF EXISTS "verification_requests_business_profile_id_fkey";
DROP INDEX IF EXISTS "verification_requests_business_profile_id_idx";
ALTER TABLE "verification_requests" DROP COLUMN IF EXISTS "business_profile_id";
DROP TABLE IF EXISTS "business_members";
ALTER TABLE "business_profiles" DROP CONSTRAINT IF EXISTS "business_profiles_verified_stage_check";
ALTER TABLE "business_profiles" DROP CONSTRAINT IF EXISTS "business_profiles_employees_count_check";
ALTER TABLE "business_profiles" DROP CONSTRAINT IF EXISTS "business_profiles_category_id_fkey";
DROP INDEX IF EXISTS "business_profiles_category_id_idx";
DROP INDEX IF EXISTS "business_profiles_is_public_seeking_partners_category_id_lo_idx";
ALTER TABLE "business_profiles"
  DROP COLUMN IF EXISTS "category_id",
  DROP COLUMN IF EXISTS "deleted_at",
  DROP COLUMN IF EXISTS "description",
  DROP COLUMN IF EXISTS "is_public",
  DROP COLUMN IF EXISTS "seeking_partners",
  DROP COLUMN IF EXISTS "stage",
  DROP COLUMN IF EXISTS "suspended_at",
  DROP COLUMN IF EXISTS "suspension_reason";
ALTER TABLE "business_profiles"
  ALTER COLUMN "address" SET NOT NULL,
  ALTER COLUMN "location_id" SET NOT NULL,
  ALTER COLUMN "contact_person" SET NOT NULL;
DROP TABLE IF EXISTS "business_categories";
DROP TYPE IF EXISTS "BusinessMemberRole";
DROP TYPE IF EXISTS "BusinessStage";
