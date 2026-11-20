DROP INDEX IF EXISTS "collaboration_requests_idea_role_id_idx";
ALTER TABLE "community_groups" ADD COLUMN IF NOT EXISTS "userId" UUID;
ALTER TABLE "community_groups" ADD COLUMN IF NOT EXISTS "introductionRequestId" UUID;
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "community_groups" ADD CONSTRAINT "community_groups_introductionRequestId_fkey" FOREIGN KEY ("introductionRequestId") REFERENCES "introduction_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
