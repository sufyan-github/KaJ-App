-- PRIV-1: marks a deleted account whose personal data has been removed.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "purged_at" TIMESTAMP(3);
