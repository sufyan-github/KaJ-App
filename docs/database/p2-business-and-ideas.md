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

## 20261118120000_collaboration_requests (P2.5; plan migrations 6 and 11)

- `collaboration_requests`: requester, recipient (the subject's owner when
  sent), `subject_type` (IDEA | BUSINESS) + `subject_id` (no FK: either table),
  `idea_role_id` (P2.8; FK added with `idea_roles`), optional
  `from_business_profile_id`, `message`, `status` (PROPOSED | ACCEPTED |
  DECLINED | WITHDRAWN | AGREED | ENDED), `conversation_id` (unique, opened on
  accept), `agreement_summary`, both sides' `*_agreed_at`, `decided_at`,
  `agreed_at`, `closed_at`, `hidden_at` (moderation).
- Partial unique index: one open (PROPOSED/ACCEPTED/AGREED) request per
  requester and subject. CHECKs: requester ≠ recipient; AGREED/ENDED only with
  both confirmations and `agreed_at`.
- `collaboration_request_events`: the audit history (from → to, actor, note).
- Rollback leaves the linked conversations as plain conversations.

## P2.6 business verification (no migration)

Uses `verification_requests.business_profile_id` (added in business_profile_v2).
A BUSINESS request now needs IDENTITY trust (was SKILL) and verifies one
business: approval sets `business_profiles.verification_status`, not the
owner's trust level (it no longer grants TrustLevel.BUSINESS, which sits above
SKILL on the ladder). Existing users who already hold TrustLevel.BUSINESS keep it.
