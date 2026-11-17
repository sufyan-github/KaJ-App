-- Rollback of 20261119110000_group_conversations. Roll the app back first;
-- delete GROUP conversations before running this if they must not remain
-- as (two-person-looking) conversations.
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_group_subject_check";
DROP INDEX IF EXISTS "conversations_subject_type_subject_id_idx";
ALTER TABLE "conversations"
  DROP COLUMN IF EXISTS "kind",
  DROP COLUMN IF EXISTS "subject_id",
  DROP COLUMN IF EXISTS "subject_type",
  DROP COLUMN IF EXISTS "title";
DROP TYPE IF EXISTS "ConversationKind";
