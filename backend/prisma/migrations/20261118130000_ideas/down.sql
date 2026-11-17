-- Rollback of 20261118130000_ideas. Roll the app back first.
ALTER TABLE "collaboration_requests" DROP CONSTRAINT IF EXISTS "collaboration_requests_idea_role_id_fkey";
DROP TABLE IF EXISTS "idea_members";
DROP TABLE IF EXISTS "idea_detail_views";
DROP TABLE IF EXISTS "idea_access";
DROP TABLE IF EXISTS "idea_role_skills";
DROP TABLE IF EXISTS "idea_roles";
DROP TABLE IF EXISTS "business_ideas";
DROP TYPE IF EXISTS "IdeaRoleStatus";
DROP TYPE IF EXISTS "IdeaArrangement";
DROP TYPE IF EXISTS "IdeaTimeCommitment";
DROP TYPE IF EXISTS "IdeaRoleType";
DROP TYPE IF EXISTS "IdeaAccessStatus";
DROP TYPE IF EXISTS "IdeaVisibility";
DROP TYPE IF EXISTS "IdeaStage";
