ALTER TYPE "JobStatus" ADD VALUE 'PAYMENT_RECORDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'CASH_RECORDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'DISPUTED';

CREATE TYPE "OperatorVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'UNSUPPORTED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'PENDING', 'CANCELLED');
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('OPERATOR_BILLING', 'MANUAL_ADMIN');

ALTER TABLE "payments"
  ADD COLUMN "cash_recorded_at" TIMESTAMP(3),
  ADD COLUMN "cash_recorded_by" UUID,
  ADD COLUMN "disputed_at" TIMESTAMP(3);

CREATE TABLE "mobile_operators" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "code" TEXT NOT NULL,
  "name_en" TEXT NOT NULL,
  "name_bn" TEXT NOT NULL,
  "number_prefixes" TEXT[] NOT NULL,
  "supports_subscription" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mobile_operators_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_operator_identities" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "user_id" UUID NOT NULL,
  "operator_id" UUID,
  "status" "OperatorVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "provider_ref" TEXT,
  "last_checked_at" TIMESTAMP(3),
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_operator_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_plans" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "code" TEXT NOT NULL,
  "name_en" TEXT NOT NULL,
  "name_bn" TEXT NOT NULL,
  "description_en" TEXT,
  "description_bn" TEXT,
  "price_poisha" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
  "duration_days" INTEGER NOT NULL,
  "feature_keys" TEXT[] NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "user_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "starts_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_payments" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
  "subscription_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "amount_poisha" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'BDT',
  "method" "SubscriptionPaymentMethod" NOT NULL DEFAULT 'OPERATOR_BILLING',
  "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "provider_ref" TEXT,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_access_rules" (
  "feature_key" TEXT NOT NULL,
  "requires_active_subscription" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_access_rules_pkey" PRIMARY KEY ("feature_key")
);

CREATE UNIQUE INDEX "mobile_operators_code_key" ON "mobile_operators"("code");
CREATE INDEX "mobile_operators_is_active_supports_subscription_idx" ON "mobile_operators"("is_active", "supports_subscription");
CREATE UNIQUE INDEX "user_operator_identities_user_id_key" ON "user_operator_identities"("user_id");
CREATE INDEX "user_operator_identities_operator_id_status_idx" ON "user_operator_identities"("operator_id", "status");
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");
CREATE INDEX "subscription_plans_is_active_sort_order_idx" ON "subscription_plans"("is_active", "sort_order");
CREATE INDEX "subscriptions_user_id_status_expires_at_idx" ON "subscriptions"("user_id", "status", "expires_at" DESC);
CREATE INDEX "subscriptions_plan_id_status_idx" ON "subscriptions"("plan_id", "status");
CREATE INDEX "subscription_payments_subscription_id_created_at_idx" ON "subscription_payments"("subscription_id", "created_at" DESC);
CREATE INDEX "subscription_payments_user_id_status_created_at_idx" ON "subscription_payments"("user_id", "status", "created_at" DESC);

ALTER TABLE "user_operator_identities" ADD CONSTRAINT "user_operator_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_operator_identities" ADD CONSTRAINT "user_operator_identities_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "mobile_operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "mobile_operators" ("code", "name_en", "name_bn", "number_prefixes", "supports_subscription") VALUES
  ('ROBI', 'Robi', 'রবি', ARRAY['+88018'], true),
  ('AIRTEL', 'Airtel', 'এয়ারটেল', ARRAY['+88016'], true)
ON CONFLICT ("code") DO UPDATE SET
  "name_en" = EXCLUDED."name_en",
  "name_bn" = EXCLUDED."name_bn",
  "number_prefixes" = EXCLUDED."number_prefixes",
  "supports_subscription" = EXCLUDED."supports_subscription",
  "is_active" = true;

INSERT INTO "subscription_access_rules" ("feature_key", "description") VALUES
  ('JOB_POSTING', 'Create and publish a job'),
  ('JOB_APPLICATION', 'Apply to a job'),
  ('WORKER_DISCOVERY', 'View suggested workers for a job'),
  ('WORKER_HIRING', 'Accept an application or create a booking request'),
  ('DIRECT_CONTACT', 'Start a new job conversation')
ON CONFLICT ("feature_key") DO NOTHING;
