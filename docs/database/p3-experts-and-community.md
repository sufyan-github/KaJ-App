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
