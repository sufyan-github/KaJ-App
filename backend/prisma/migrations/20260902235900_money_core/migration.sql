CREATE TYPE "FeeScope" AS ENUM ('USER', 'TIER', 'CATEGORY', 'GLOBAL');

ALTER TABLE "users" ADD COLUMN "fee_tier" TEXT;

ALTER TABLE "payments"
  ADD COLUMN "agreed_amount_poisha" BIGINT,
  ADD COLUMN "worker_earning_poisha" BIGINT,
  ADD COLUMN "fee_rule_key" TEXT,
  ADD COLUMN "fee_payer" TEXT;
UPDATE "payments" SET
  "agreed_amount_poisha" = "amount_poisha",
  "worker_earning_poisha" = GREATEST("amount_poisha" - "fee_poisha", 0),
  "fee_rule_key" = 'GLOBAL:*',
  "fee_payer" = 'worker';
ALTER TABLE "payments"
  ALTER COLUMN "agreed_amount_poisha" SET NOT NULL,
  ALTER COLUMN "worker_earning_poisha" SET NOT NULL,
  ALTER COLUMN "fee_rule_key" SET NOT NULL,
  ALTER COLUMN "fee_payer" SET NOT NULL;

ALTER TABLE "ledger_entries" ADD COLUMN "operation_id" UUID;
UPDATE "ledger_entries" SET "operation_id" = uuid_generate_v7() WHERE "operation_id" IS NULL;
ALTER TABLE "ledger_entries" ALTER COLUMN "operation_id" SET NOT NULL;

DROP INDEX IF EXISTS "payments_assignment_id_idx";
DROP INDEX IF EXISTS "payments_idempotency_key_key";
CREATE UNIQUE INDEX "payments_assignment_id_key" ON "payments"("assignment_id");
CREATE UNIQUE INDEX "payments_payer_user_id_idempotency_key_key"
  ON "payments"("payer_user_id", "idempotency_key");
CREATE INDEX "ledger_entries_operation_id_idx" ON "ledger_entries"("operation_id");

CREATE TABLE "fee_rules" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "scope" "FeeScope" NOT NULL,
  "scope_key" TEXT NOT NULL,
  "fee_bps" INTEGER NOT NULL,
  "min_fee_poisha" BIGINT NOT NULL DEFAULT 0,
  "max_fee_poisha" BIGINT,
  "payer" TEXT NOT NULL DEFAULT 'worker',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fee_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fee_rules_fee_bps_check" CHECK ("fee_bps" BETWEEN 0 AND 10000),
  CONSTRAINT "fee_rules_fee_bounds_check" CHECK (
    "min_fee_poisha" >= 0 AND
    ("max_fee_poisha" IS NULL OR "max_fee_poisha" >= "min_fee_poisha")
  ),
  CONSTRAINT "fee_rules_payer_check" CHECK ("payer" IN ('customer', 'worker', 'split'))
);

CREATE UNIQUE INDEX "fee_rules_scope_key_key" ON "fee_rules"("scope_key");
CREATE INDEX "fee_rules_scope_is_active_idx" ON "fee_rules"("scope", "is_active");
CREATE INDEX "fee_rules_updated_by_idx" ON "fee_rules"("updated_by");
ALTER TABLE "fee_rules" ADD CONSTRAINT "fee_rules_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "actor_user_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "response_json" JSONB,
  "response_code" INTEGER,
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_actor_user_id_key_key"
  ON "idempotency_records"("actor_user_id", "key");
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_no_update"
  BEFORE UPDATE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE TRIGGER "ledger_entries_no_delete"
  BEFORE DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
