-- Additive only: store the carrier-issued (possibly masked) BDApps subscriber id
-- and the last normalized carrier status per operator identity.
ALTER TABLE "user_operator_identities"
  ADD COLUMN "provider_subscriber_id" TEXT,
  ADD COLUMN "provider_status" TEXT;

CREATE UNIQUE INDEX "user_operator_identities_provider_subscriber_id_key"
  ON "user_operator_identities"("provider_subscriber_id");

ALTER TABLE "user_operator_identities"
  ADD CONSTRAINT "user_operator_identities_provider_status_check"
    CHECK ("provider_status" IS NULL OR "provider_status" IN ('REGISTERED', 'UNREGISTERED', 'CHARGE_PENDING'));
