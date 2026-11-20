-- R3: check existing rows against the constraints added NOT VALID in
-- 20261121140000. A constraint that old rows break is left NOT VALID (it
-- still guards every new or changed row) and named in a NOTICE, so a
-- deploy never fails on old data; fix those rows and VALIDATE by hand
-- (the deploy runbook lists the queries).
DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('reviews', 'reviews_not_self'),
      ('reports', 'reports_priority_range'),
      ('ledger_entries', 'ledger_entries_amount_positive'),
      ('assignments', 'assignments_price_non_negative'),
      ('business_profiles', 'business_profiles_name_not_blank'),
      ('sessions', 'sessions_title_not_blank'),
      ('introduction_requests', 'introduction_requests_expiry_after_creation'),
      ('idea_detail_views', 'idea_detail_views_basis_known'),
      ('jobs', 'jobs_workers_in_range'),
      ('jobs', 'jobs_budget_ordered')
    ) AS t(table_name, constraint_name)
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', item.table_name, item.constraint_name);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'Constraint % on % stays NOT VALID: existing rows break it.', item.constraint_name, item.table_name;
    END;
  END LOOP;
END $$;
