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
