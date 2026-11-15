-- P0.6 step 2: check existing rows against the constraints added NOT VALID
-- in 20261116100000. VALIDATE takes a SHARE UPDATE EXCLUSIVE lock, so reads
-- and writes continue. If this fails, a row breaks a rule: find it with the
-- queries in docs/database/p0-6-data-hygiene.md, fix it, then re-run.
ALTER TABLE "reviews" VALIDATE CONSTRAINT "reviews_rating_range_check";
ALTER TABLE "reviews" VALIDATE CONSTRAINT "reviews_sub_ratings_range_check";
ALTER TABLE "feature_flags" VALIDATE CONSTRAINT "feature_flags_rollout_percent_range_check";
ALTER TABLE "availability_rules" VALIDATE CONSTRAINT "availability_rules_day_of_week_range_check";
