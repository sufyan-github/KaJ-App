DROP INDEX IF EXISTS "payments_idempotency_key_key";
DROP INDEX IF EXISTS "payments_payer_user_id_idempotency_key_key";
CREATE UNIQUE INDEX "payments_payer_user_id_idempotency_key_key"
  ON "payments"("payer_user_id", "idempotency_key");
