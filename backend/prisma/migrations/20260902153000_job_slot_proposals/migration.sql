ALTER TABLE "applications"
ADD COLUMN "proposed_starts_at" TIMESTAMP(3),
ADD COLUMN "proposed_ends_at" TIMESTAMP(3);

ALTER TABLE "applications"
ADD CONSTRAINT "applications_proposed_window_check"
CHECK (
  ("proposed_starts_at" IS NULL AND "proposed_ends_at" IS NULL)
  OR
  ("proposed_starts_at" IS NOT NULL AND "proposed_ends_at" IS NOT NULL AND "proposed_ends_at" > "proposed_starts_at")
);
