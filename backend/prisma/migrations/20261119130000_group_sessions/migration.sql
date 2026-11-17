-- P3.5: group sessions and events. sessions.group_id ties a session to a
-- community group (members only); a private venue pin for check-in;
-- session_participants gets location check-in (consent version, distance
-- and accuracy only - never coordinates) and a WAITLISTED status for RSVPs
-- to a full session. Rollback: down.sql; the enum value stays.

-- AlterEnum
ALTER TYPE "SessionParticipantStatus" ADD VALUE IF NOT EXISTS 'WAITLISTED';

-- AlterTable
ALTER TABLE "session_participants" ADD COLUMN     "checked_in_at" TIMESTAMP(3),
ADD COLUMN     "checkin_accuracy_m" DECIMAL(8,2),
ADD COLUMN     "checkin_consent_version" TEXT,
ADD COLUMN     "checkin_distance_m" INTEGER,
ADD COLUMN     "waitlisted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "group_id" UUID,
ADD COLUMN     "venue_lat" DECIMAL(9,6),
ADD COLUMN     "venue_lng" DECIMAL(9,6);

-- CreateIndex
CREATE INDEX "sessions_group_id_starts_at_idx" ON "sessions"("group_id", "starts_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "community_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A group session names its group as its subject; a venue pin is whole.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_check" CHECK (
  -- IS NOT DISTINCT FROM: a NULL subject must fail, not pass as unknown.
  ("group_id" IS NULL OR (
    "subject_type" IS NOT DISTINCT FROM 'GROUP'
    AND "subject_id" IS NOT DISTINCT FROM "group_id"
  ))
  AND (("venue_lat" IS NULL) = ("venue_lng" IS NULL))
) NOT VALID;
ALTER TABLE "sessions" VALIDATE CONSTRAINT "sessions_group_check";
