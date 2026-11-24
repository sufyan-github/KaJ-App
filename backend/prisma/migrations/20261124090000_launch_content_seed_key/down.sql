DROP INDEX IF EXISTS "community_groups_seed_key_key";
DROP INDEX IF EXISTS "business_ideas_seed_key_key";
ALTER TABLE "community_groups" DROP COLUMN IF EXISTS "seed_key";
ALTER TABLE "business_ideas" DROP COLUMN IF EXISTS "seed_key";
