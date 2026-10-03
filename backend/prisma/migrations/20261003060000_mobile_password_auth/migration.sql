-- Additive only: admin credentials and subscription/payment tables are unchanged.
ALTER TABLE "users" ADD COLUMN "mobile_password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "mobile_auth_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "otp_challenges" ADD COLUMN "recovery_verifying" BOOLEAN NOT NULL DEFAULT false;
