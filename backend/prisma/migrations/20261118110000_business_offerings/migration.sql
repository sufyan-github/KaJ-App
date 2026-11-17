-- P2.2: business_offerings (plan migration 6, first half): the products and
-- services a business shows, with a bn and/or en title and an optional price
-- range. Rollback: down.sql.

-- CreateEnum
CREATE TYPE "OfferingKind" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateTable
CREATE TABLE "business_offerings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "business_profile_id" UUID NOT NULL,
    "kind" "OfferingKind" NOT NULL,
    "title_en" TEXT,
    "title_bn" TEXT,
    "description" TEXT,
    "price_min_poisha" BIGINT,
    "price_max_poisha" BIGINT,
    "price_unit" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "hidden_at" TIMESTAMP(3),
    "hidden_reason" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_offerings_business_profile_id_is_active_idx" ON "business_offerings"("business_profile_id", "is_active");

-- AddForeignKey
ALTER TABLE "business_offerings" ADD CONSTRAINT "business_offerings_business_profile_id_fkey" FOREIGN KEY ("business_profile_id") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At least one title; prices are non-negative and min <= max.
ALTER TABLE "business_offerings" ADD CONSTRAINT "business_offerings_title_check"
  CHECK (coalesce(btrim("title_en"), '') <> '' OR coalesce(btrim("title_bn"), '') <> '') NOT VALID;
ALTER TABLE "business_offerings" VALIDATE CONSTRAINT "business_offerings_title_check";
ALTER TABLE "business_offerings" ADD CONSTRAINT "business_offerings_price_check"
  CHECK (
    ("price_min_poisha" IS NULL OR "price_min_poisha" >= 0)
    AND ("price_max_poisha" IS NULL OR "price_max_poisha" >= 0)
    AND ("price_min_poisha" IS NULL OR "price_max_poisha" IS NULL OR "price_min_poisha" <= "price_max_poisha")
  ) NOT VALID;
ALTER TABLE "business_offerings" VALIDATE CONSTRAINT "business_offerings_price_check";
