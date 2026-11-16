-- P0.10 N1: a job with no coordinates can always be checked out. Add-only;
-- constant default, no table rewrite. Rollback: down.sql.

-- AlterTable
ALTER TABLE "work_sessions" ADD COLUMN     "checkout_location_unverified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkout_overridden_at" TIMESTAMP(3),
ADD COLUMN     "checkout_overridden_by_actor_type" "JobActorType",
ADD COLUMN     "checkout_overridden_by_user_id" UUID,
ADD COLUMN     "checkout_override_reason" TEXT;

-- CreateIndex
CREATE INDEX "work_sessions_checkout_overridden_by_user_id_idx" ON "work_sessions"("checkout_overridden_by_user_id");

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_checkout_overridden_by_user_id_fkey" FOREIGN KEY ("checkout_overridden_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

