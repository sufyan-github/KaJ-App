-- R3 (database.md §2.5): rules the constraint probe showed missing. Added
-- NOT VALID: new and changed rows must follow them at once; existing rows
-- are checked by the next migration.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_not_self" CHECK ("reviewer_user_id" <> "reviewee_user_id") NOT VALID;
ALTER TABLE "reports" ADD CONSTRAINT "reports_priority_range" CHECK ("priority" BETWEEN 0 AND 9) NOT VALID;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount_poisha" > 0) NOT VALID;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_price_non_negative" CHECK ("agreed_price_poisha" >= 0) NOT VALID;
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_name_not_blank" CHECK (btrim("business_name") <> '') NOT VALID;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_title_not_blank" CHECK (btrim("title") <> '') NOT VALID;
ALTER TABLE "introduction_requests" ADD CONSTRAINT "introduction_requests_expiry_after_creation" CHECK ("expires_at" > "created_at") NOT VALID;
ALTER TABLE "idea_detail_views" ADD CONSTRAINT "idea_detail_views_basis_known" CHECK ("basis" IN ('ACCESS', 'MEMBER')) NOT VALID;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workers_in_range" CHECK ("workers_required" >= 1 AND "workers_filled" >= 0 AND "workers_filled" <= "workers_required") NOT VALID;
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_budget_ordered" CHECK ("budget_min_poisha" IS NULL OR "budget_max_poisha" IS NULL OR "budget_min_poisha" <= "budget_max_poisha") NOT VALID;
