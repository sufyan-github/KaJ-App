-- Launch content: a stable key so `pnpm seed:launch` updates instead of duplicating.
ALTER TABLE "business_ideas" ADD COLUMN IF NOT EXISTS "seed_key" TEXT;
ALTER TABLE "community_groups" ADD COLUMN IF NOT EXISTS "seed_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "business_ideas_seed_key_key" ON "business_ideas"("seed_key");
CREATE UNIQUE INDEX IF NOT EXISTS "community_groups_seed_key_key" ON "community_groups"("seed_key");
