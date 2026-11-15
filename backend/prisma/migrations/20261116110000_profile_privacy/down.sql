-- Rollback of 20261116110000_profile_privacy. Roll the app back first (old
-- code ignores these columns), then run this and delete the migration's
-- row from _prisma_migrations. The privacy choices people made are lost.
ALTER TABLE "profiles"
  DROP COLUMN IF EXISTS "allow_messages_from",
  DROP COLUMN IF EXISTS "discoverable",
  DROP COLUMN IF EXISTS "hide_precise_area",
  DROP COLUMN IF EXISTS "photo_visibility",
  DROP COLUMN IF EXISTS "show_full_name";
DROP TYPE IF EXISTS "MessagePermission";
DROP TYPE IF EXISTS "PhotoVisibility";
