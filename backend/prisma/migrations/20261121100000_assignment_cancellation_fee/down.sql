ALTER TABLE "assignments" DROP CONSTRAINT IF EXISTS "assignments_cancellation_fee_non_negative";
ALTER TABLE "assignments" DROP COLUMN IF EXISTS "cancellation_fee_poisha";
