-- P10-TRUST-03: consent-led foreground attendance with offline sync metadata.
ALTER TABLE "work_sessions"
  ADD COLUMN "checkin_captured_at" TIMESTAMP(3),
  ADD COLUMN "checkin_received_at" TIMESTAMP(3),
  ADD COLUMN "checkin_accuracy_m" DECIMAL(8,2),
  ADD COLUMN "checkin_distance_m" INTEGER,
  ADD COLUMN "checkin_consent_version" TEXT,
  ADD COLUMN "checkin_mock_location" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "checkout_captured_at" TIMESTAMP(3),
  ADD COLUMN "checkout_received_at" TIMESTAMP(3),
  ADD COLUMN "checkout_accuracy_m" DECIMAL(8,2),
  ADD COLUMN "checkout_distance_m" INTEGER,
  ADD COLUMN "checkout_notes" TEXT,
  ADD COLUMN "override_reason" TEXT,
  ADD COLUMN "overridden_by_user_id" UUID,
  ADD COLUMN "overridden_by_actor_type" "JobActorType",
  ADD COLUMN "overridden_at" TIMESTAMP(3);

DROP INDEX IF EXISTS "work_sessions_assignment_id_idx";
CREATE UNIQUE INDEX "work_sessions_assignment_id_key" ON "work_sessions"("assignment_id");
CREATE INDEX "work_sessions_overridden_by_user_id_idx" ON "work_sessions"("overridden_by_user_id");

ALTER TABLE "work_sessions"
  ADD CONSTRAINT "work_sessions_overridden_by_user_id_fkey"
  FOREIGN KEY ("overridden_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "config_settings" ("key", "value_json", "updated_at")
VALUES (
  'attendance.settings',
  '{"geofenceRadiusM":300,"checkinWindowMinutes":60,"maxAccuracyM":100,"maxOfflineSyncMinutes":15,"maxClockSkewSeconds":120,"consentVersion":"location-checkin-v1"}'::jsonb,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
