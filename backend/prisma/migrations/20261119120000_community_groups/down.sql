-- Rollback of 20261119120000_community_groups. Roll the app back first; the
-- groups' chats stay as GROUP conversations (delete them first if wanted).
DROP TABLE IF EXISTS "community_group_members";
DROP TABLE IF EXISTS "community_groups";
DROP TYPE IF EXISTS "GroupMemberStatus";
DROP TYPE IF EXISTS "GroupMemberRole";
DROP TYPE IF EXISTS "GroupVisibility";
