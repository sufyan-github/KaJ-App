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

## 20261118130000_ideas (P2.7–P2.9; plan migration 10)

- `business_ideas`: owner, title, `summary` (the one public line, ≤160),
  private `problem` / `solution` / `details`, sector (`business_categories`),
  area, `stage` (CONCEPT | VALIDATING | PILOT | CONVERTED), `visibility`
  (PRIVATE default | SUMMARY_PUBLIC | MEMBERS), `ai_consent`,
  `converted_business_id` / `converted_at`, `hidden_at` / `hidden_reason`,
  `deleted_at`. Index (visibility, stage, category_id, location_id).
  CHECKs: non-blank title and 1–160-character summary; CONVERTED ⇔ converted_at.
- `idea_roles` (+ `idea_role_skills`): role type (10 kinds), title,
  description, time commitment, arrangement (PAID | EQUITY_TO_DISCUSS |
  VOLUNTEER | UNDECIDED), status (OPEN | FILLED | CLOSED), moderation hide.
- `idea_access`: per idea + user; REQUESTED | APPROVED | DECLINED | REVOKED;
  `confidentiality_accepted_at` (required), `approved_by_user_id` +
  `approved_at` (CHECK: required when APPROVED), `revoked_at`.
- `idea_detail_views`: every view of the private details by someone other
  than the owner (`basis` ACCESS or MEMBER).
- `idea_members`: the team, `agreed_in_principle_at`, linked to the AGREED
  collaboration request (unique) and the role.
- FK `collaboration_requests.idea_role_id` → `idea_roles` (SET NULL).
- Report targets IDEA and IDEA_ROLE (and BUSINESS, BUSINESS_OFFERING,
  COLLABORATION_REQUEST) are API-level: `reports.target_type` is text.

## P2 admin moderation (no migration)

Reports on BUSINESS, BUSINESS_OFFERING, IDEA, IDEA_ROLE and
COLLABORATION_REQUEST show the reported content (title, VISIBLE | HIDDEN |
DELETED) in the admin queue. Deciding ACTIONED with `hideContent: true` hides
it (a business is suspended; the others get `hidden_at`), with or without a
user moderation level; `POST /admin/content/:targetType/:id/hide|restore
{reason}` does it directly. Each is a `moderation_actions` row
(HIDE_CONTENT / RESTORE_CONTENT), an audit entry and a CONTENT_HIDDEN /
CONTENT_RESTORED notification to the owner.
