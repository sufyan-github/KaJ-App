-- R3 schema hygiene.
-- 1. Two columns Prisma invented on community_groups (one-sided relations
--    completed by `prisma format`). Nothing reads or writes them; refuse to
--    drop them if any row has a value, so no data is lost silently.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "community_groups"
    WHERE "userId" IS NOT NULL OR "introductionRequestId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'community_groups has values in "userId"/"introductionRequestId"; check them before dropping (see the deploy runbook).';
  END IF;
END $$;
ALTER TABLE "community_groups" DROP CONSTRAINT IF EXISTS "community_groups_userId_fkey";
ALTER TABLE "community_groups" DROP CONSTRAINT IF EXISTS "community_groups_introductionRequestId_fkey";
ALTER TABLE "community_groups" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "community_groups" DROP COLUMN IF EXISTS "introductionRequestId";

-- 2. The one remaining foreign key without an index.
CREATE INDEX IF NOT EXISTS "collaboration_requests_idea_role_id_idx"
  ON "collaboration_requests" ("idea_role_id");
