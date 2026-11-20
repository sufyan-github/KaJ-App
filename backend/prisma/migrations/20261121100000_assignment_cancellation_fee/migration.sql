-- W12: record the fee a cancellation's policy set (shown in the preview).
ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "cancellation_fee_poisha" BIGINT;
ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_cancellation_fee_non_negative"
  CHECK ("cancellation_fee_poisha" IS NULL OR "cancellation_fee_poisha" >= 0) NOT VALID;
ALTER TABLE "assignments" VALIDATE CONSTRAINT "assignments_cancellation_fee_non_negative";
