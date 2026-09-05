ALTER TABLE "subscription_plans"
  ADD CONSTRAINT "subscription_plans_price_nonnegative_check"
    CHECK ("price_poisha" >= 0),
  ADD CONSTRAINT "subscription_plans_duration_check"
    CHECK ("duration_days" BETWEEN 1 AND 366);

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_date_order_check"
    CHECK ("starts_at" IS NULL OR "expires_at" IS NULL OR "expires_at" > "starts_at");

ALTER TABLE "subscription_payments"
  ADD CONSTRAINT "subscription_payments_amount_nonnegative_check"
    CHECK ("amount_poisha" >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_cash_record_evidence_check"
    CHECK (
      "status" <> 'CASH_RECORDED'
      OR ("cash_recorded_at" IS NOT NULL AND "cash_recorded_by" IS NOT NULL)
    );

CREATE INDEX "payments_cash_recorded_by_idx" ON "payments"("cash_recorded_by");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_cash_recorded_by_fkey"
  FOREIGN KEY ("cash_recorded_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
