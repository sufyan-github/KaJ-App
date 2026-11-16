-- Rollback of 20261117090000_attendance_checkout_override. Roll the app
-- back first, then run this and delete the migration's row from
-- _prisma_migrations. Checkout-override details are lost (the audit log
-- keeps a copy of each override).
ALTER TABLE "work_sessions" DROP CONSTRAINT IF EXISTS "work_sessions_checkout_overridden_by_user_id_fkey";
DROP INDEX IF EXISTS "work_sessions_checkout_overridden_by_user_id_idx";
ALTER TABLE "work_sessions"
  DROP COLUMN IF EXISTS "checkout_location_unverified",
  DROP COLUMN IF EXISTS "checkout_overridden_at",
  DROP COLUMN IF EXISTS "checkout_overridden_by_actor_type",
  DROP COLUMN IF EXISTS "checkout_overridden_by_user_id",
  DROP COLUMN IF EXISTS "checkout_override_reason";
