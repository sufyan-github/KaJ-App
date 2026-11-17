# P2 — Business & Ideas: database changes

All migrations are add-only, each with a tested `down.sql`. None has been run
on production.

## 20261118100000_business_profile_v2 (P2.1; plan migrations 5 and 9)

- `business_profiles` (was unused): `stage` (IDEA | INFORMAL | REGISTERED,
  default INFORMAL), `description`, `category_id` → `business_categories`,
  `is_public`, `seeking_partners`, `suspended_at` / `suspension_reason`
  (moderation), `deleted_at`. `address`, `contact_person` and `location_id`
  become optional.
- CHECK `business_profiles_verified_stage_check`: `verification_status` can be
  APPROVED only when `stage` = REGISTERED (an idea or informal business never
  carries the verified badge). The API also resets an approval when the stage
  leaves REGISTERED or the name / trade licence number changes.
- CHECK `business_profiles_employees_count_check`: 0–100000 or NULL.
- `business_members` (OWNER | MANAGER | STAFF; unique per business + user;
  `accepted_at` NULL = invited). Existing businesses get their creator as OWNER.
- `business_categories`: the sector taxonomy for businesses and ideas (tree via
  `parent_id`), seeded by the production-safe reference-data loader with 11
  sectors: agriculture, technology, manufacturing, retail, education, food,
  services, construction, creative, tourism, logistics.
- `verification_requests.business_profile_id` (P2.6).

Pre-check on production (expected empty — the table was unused):

```sql
SELECT count(*) FROM business_profiles;
SELECT count(*) FROM business_profiles WHERE verification_status = 'APPROVED';
```

## 20261118110000_business_offerings (P2.2; plan migration 6, first half)

- `business_offerings`: `kind` (PRODUCT | SERVICE), `title_en` / `title_bn`,
  `description`, `price_min_poisha` / `price_max_poisha`, `price_unit`,
  `is_active`, `sort_order`, `hidden_at` / `hidden_reason` (moderation),
  `deleted_at`. CHECKs: at least one non-blank title; prices ≥ 0 and min ≤ max.

## P2.3 staff jobs (no migration)

`jobs.business_profile_id` already existed (P1 work_learn_job_extensions). The
API now sets it only for an accepted OWNER or MANAGER of an active business,
re-checked at publish.
