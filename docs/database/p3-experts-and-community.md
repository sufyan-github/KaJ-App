# P3 — Experts & Community: database changes

All migrations are add-only, each with a tested `down.sql`. None has been run
on production.

## 20261119090000_introductions (P3.1; plan migration 12)

- `introduction_requests`: requester, target (an approved mentor taking
  requests), `context_type` (IDEA | BUSINESS | LEARNING_GOAL), `context_id`
  (NULL for a learning goal; CHECK), `context_summary` (the public summary
  frozen when sent), `message`, `status` (PENDING | ACCEPTED | DECLINED |
  EXPIRED | WITHDRAWN), `allow_idea_access` / `idea_access_granted` (IDEA
  only; CHECK), `conversation_id` (opened on accept), `expires_at` (7 days),
  `decided_at`, `decline_reason`, `hidden_at` (moderation).
- Partial unique index: one PENDING request per requester and expert.
  CHECK requester ≠ target.
- An in-process runner (schedulers enabled) expires due requests every 10
  minutes; reads also expire a due request.

## 20261119100000_sessions (P3.2; plan migration 13)

Replaces the `community_events` / `community_event_rsvps` tables proposed in
migration 8 (never created).

- `sessions`: host, optional expert, `kind` (CONSULTATION | GROUP_DISCUSSION |
  WORKSHOP | EVENT), title, description, optional subject (IDEA | BUSINESS |
  GROUP + id), `starts_at`, `duration_minutes`, `mode` (IN_PERSON with an area
  `location_id` only | ONLINE with `online_link` | IN_APP_CHAT), `capacity`,
  `price_model` (FREE | CASH) + `price_poisha`, `status` (DRAFT | SCHEDULED |
  CANCELLED | COMPLETED), `women_only`, `home_based_friendly`, optional
  `introduction_id`, `reminder_sent_at`, cancel/complete times, moderation hide.
- `session_participants`: role (HOST | EXPERT | PARTICIPANT), status (INVITED |
  ACCEPTED | DECLINED | ATTENDED | NO_SHOW), inviter, response/attendance times,
  cash recorded per participant (amount, when, by whom). Unique per session+user.
- CHECKs: duration 15–720, capacity 1–1000, a consultation has capacity 1,
  subject type and id together; IN_PERSON needs an area, ONLINE a link once
  scheduled; FREE has no price, CASH a positive one; cash ≥ 0.
- `ReviewSubjectType.SESSION` (feedback; enum value stays on rollback).
- A runner (schedulers enabled) sends reminders an hour ahead, once.

## 20261119110000_group_conversations (P3.3)

- `conversations.kind` (DIRECT default | GROUP), `title`, `subject_type`
  (IDEA_ROOM | SESSION | COMMUNITY_GROUP) + `subject_id`, indexed. CHECK: a
  GROUP has a subject, a DIRECT conversation has none. Existing rows → DIRECT.
- Group members are kept equal to the subject's members by the API (idea
  owner + team; session host + confirmed participants).
- Blocks in a group: the two people don't see each other's messages (REST
  paging, socket delivery, notifications); the group goes on for others.
- Realtime: `SOCKET_REDIS_ADAPTER=true` (with `REDIS_URL`) puts socket.io on
  the Redis adapter (`@socket.io/redis-adapter` 8.3.0) so several API
  instances share rooms and deliveries. Off by default.

## 20261119120000_community_groups (P3.4; plan migration 8, groups half)

- `community_groups`: creator, name (CHECK 3–80 characters), description,
  `visibility` (PUBLIC | PRIVATE), `women_only` (opt-in), area
  (`location_id`), work category (`category_id`), moderation hide, soft delete.
- `community_group_members`: role (MEMBER | MODERATOR | AMBASSADOR), status
  (PENDING | ACTIVE | REMOVED), `invited_by_user_id` (set = invitation, null =
  join request), `joined_at` / `removed_at` (CHECK with status). Unique per
  group + user.
- Each group's chat is a GROUP conversation (subject COMMUNITY_GROUP) kept
  equal to its ACTIVE members.

## 20261119130000_group_sessions (P3.5)

- `sessions.group_id` → `community_groups` (cascade), with subject GROUP
  (CHECK uses IS NOT DISTINCT FROM so a NULL subject fails); `venue_lat` /
  `venue_lng` (both or neither): a private venue pin used only for check-in,
  never returned by the API.
- `session_participants`: `checked_in_at`, `checkin_distance_m`,
  `checkin_accuracy_m`, `checkin_consent_version` (no coordinates are
  stored), `waitlisted_at`; status value WAITLISTED (stays on rollback).
- Check-in reuses the job attendance rules (`checkin_enabled` flag, current
  consent version, accuracy, geofence round the venue pin or the area's
  centre and radius), from an hour before the start until the end.

## P3.6 announcements and ambassadors (no migration)

- Group announcements are SYSTEM messages in the group's chat, attributed to
  the moderator or ambassador who posted them (`sender_user_id`), plus a
  COMMUNITY_ANNOUNCEMENT notification to members not in a block with them.
- The "community-ambassador" badge (created on first use, also in the dev
  seed) is held while the person is an ACTIVE AMBASSADOR of a visible group.
- Platform announcements use the existing notification campaigns; segments
  now also take `role: MENTOR`, `locationId` (area and what lies inside it,
  by the profile's area) and `communityGroupId` (active members).

## 20261119140000_women_safety (P3.7)

- `worker_profiles.prefers_flexible_hours` (`preferred_arrangements` exists
  since P1); `PUT /profiles/me/worker` saves both.
- `reports.first_action_at` (backfilled from `reviewed_at`): set by the first
  review start, decision or content hide; with `reports.priority` (P1) it
  drives the priority safety queue: SEXUAL_HARASSMENT / STALKING → 2 (first
  action within 1 hour), UNSAFE_LOCATION / HARASSMENT / UNSAFE_WORK → 1 (24
  hours), others 0 (72 hours).
- Index `jobs(opportunity_type, status, work_arrangement)` for the feed filter.
- Job posts are checked for gender restrictions (bn/en phrasings); there is no
  gender field on jobs.
