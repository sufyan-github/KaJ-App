-- R7 B1: the gender a person declares with their identity verification.
ALTER TABLE "verification_requests" ADD COLUMN IF NOT EXISTS "declared_gender" "Gender";
