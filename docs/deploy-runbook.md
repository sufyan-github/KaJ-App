# KAAJ deploy runbook

This runbook covers moving production from `agent/p1-ui-07-tracker` (the current Render source) to the integrated backend (`backend/integration` and branches merged into it).

**Everything here is preparation.** Nothing in this repository applies a migration, changes Render, cPanel or GitHub settings, or touches a production database. The owner runs each step deliberately, in order, with a backup taken first.

## 0. Before you start

- [ ] Take a fresh Render Postgres backup (or `pg_dump -Fc`) and confirm you can restore it. Write down its id/time.
- [ ] Schedule a quiet window. The migrations are add-only, but some take short table locks (see §2).
- [ ] Put the new environment variables in place (§3) **before** the new code starts. The API refuses to boot without `NODE_ENV`.
- [ ] Merge only a branch whose CI (`backend-admin-ci`) is green.
- [ ] Check that no deployed database contains the development seed admin (§5.4).

## 1. Order of operations

1. Backup (§0).
2. Set or rotate env vars on Render (§3, §5).
3. Run `prisma migrate status` against production (read-only) and compare with §2. Exactly the 25 migrations below should be pending.
4. Run the §2 pre-check queries. Fix anything they find before migrating.
5. `pnpm --filter @kaj/backend exec prisma migrate deploy` from a one-off Render shell with production `DATABASE_URL`, or let the release command do it. Do not use `migrate dev` or `db push`.
6. Load the reference data (sectors etc.) with the production-safe loader: `pnpm --filter @kaj/backend seed:reference --dry-run`, then without `--dry-run`. Since R2 it also gives each pilot area without coordinates an approximate centre and radius (`areaCentres` in `prisma/reference-data.ts`), so check-in works for jobs and sessions without a map pin. It never moves a centre that is already set. Have the owner check the centres in the admin console. Never run `prisma db seed` (the development seed) against production; it refuses `NODE_ENV=production` anyway.
7. Deploy the new API build.
8. Run the smoke test (§6).
9. Keep the backup until the smoke test and one day of traffic look right.

## 2. The pending migrations, in order

All are add-only. Each must apply in this order (Prisma applies them by folder name). "down.sql" means a hand-written rollback in the migration folder, tested up → down → up in CI (`migrations-rollback.prisma.e2e-spec.ts`). The general rollback rule is: roll the **app** back first, then run that migration's `down.sql`, then delete the migration's row from `_prisma_migrations`.

Enum values can't be removed in PostgreSQL; rollbacks leave them in place (unused) and the up migrations use `ADD VALUE IF NOT EXISTS`, so they re-apply cleanly.

| #   | Migration                                           | What it does                                                                                                                                                                                                                                             | Pre-check / lock                                                                                                                                                 | Rollback                                                                                                     |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | `20261111090000_assignment_cancellation_actor`      | Who cancelled an assignment and whether it was penalised; backfills from audit logs                                                                                                                                                                      | none                                                                                                                                                             | No down.sql: `ALTER TABLE assignments DROP COLUMN cancelled_by_user_id, DROP COLUMN cancellation_penalised;` |
| 2   | `20261111120000_training_mvp`                       | Training courses, lessons, questions, attempts, certificates; `user_skills.has_prior_training`                                                                                                                                                           | none                                                                                                                                                             | No down.sql: drop the new training tables and enums, drop the column                                         |
| 3   | `20261111150000_bdapps_subscriber_ids`              | Carrier subscriber id and last carrier status                                                                                                                                                                                                            | none                                                                                                                                                             | No down.sql: drop the two columns                                                                            |
| 4   | `20261111170000_operator_rebrand_cirkle`            | Display name Airtel → Cirkle (code AIRTEL kept)                                                                                                                                                                                                          | none                                                                                                                                                             | Update the name back                                                                                         |
| 5   | `20261116100000_align_drift_and_fk_indexes`         | Align defaults with the schema, 8 foreign-key indexes, CHECKs added NOT VALID                                                                                                                                                                            | Index builds take a short lock; check sizes: `SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY 2 DESC;`                                              | down.sql                                                                                                     |
| 6   | `20261116100100_validate_check_constraints`         | VALIDATE the 4 CHECKs (no blocking lock)                                                                                                                                                                                                                 | Run the 3 queries in `docs/database/p0-6-data-hygiene.md`; each must return 0 rows                                                                               | down.sql                                                                                                     |
| 7   | `20261116110000_profile_privacy`                    | Privacy settings (defaults keep today's behaviour; names masked)                                                                                                                                                                                         | none                                                                                                                                                             | down.sql                                                                                                     |
| 8   | `20261117090000_attendance_checkout_override`       | Check-out without coordinates                                                                                                                                                                                                                            | none                                                                                                                                                             | down.sql                                                                                                     |
| 9   | `20261117100000_reviews_any_subject`                | `reviews.subject_type/subject_id`, backfilled from `assignment_id`                                                                                                                                                                                       | `SELECT count(*) FROM reviews WHERE assignment_id IS NULL;` must be 0                                                                                            | down.sql                                                                                                     |
| 10  | `20261117110000_capability_enums`                   | MENTOR role, opportunity and terms enums (alone, so values commit first)                                                                                                                                                                                 | none                                                                                                                                                             | down.sql (enum values stay)                                                                                  |
| 11  | `20261117110100_profile_mentor_and_report_priority` | Mentor columns, `reports.priority`                                                                                                                                                                                                                       | none                                                                                                                                                             | down.sql                                                                                                     |
| 12  | `20261117120000_work_learn_job_extensions`          | `jobs.opportunity_type` (default WORK), terms, arrangement, business link                                                                                                                                                                                | none (constant defaults, no rewrite)                                                                                                                             | down.sql — first `UPDATE jobs SET status='SUSPENDED' WHERE opportunity_type <> 'WORK';`                      |
| 13  | `20261117130000_learning_sessions`                  | New table                                                                                                                                                                                                                                                | none                                                                                                                                                             | down.sql                                                                                                     |
| 14  | `20261117140000_completion_records`                 | `training_certificates` becomes the general completion record                                                                                                                                                                                            | none on production (the table is created by #2 in the same run, so it is empty)                                                                                  | down.sql — only while no practical records exist                                                             |
| 15  | `20261118090000_review_subject_learning`            | Enum value LEARNING_ENROLMENT                                                                                                                                                                                                                            | none                                                                                                                                                             | down.sql (value stays)                                                                                       |
| 16  | `20261118100000_business_profile_v2`                | Business profile v2, `business_members`, `business_categories`, verification link                                                                                                                                                                        | Table was unused: `SELECT count(*) FROM business_profiles;` (expect 0) and `… WHERE verification_status='APPROVED'`                                              | down.sql — address/contact/location become required again                                                    |
| 17  | `20261118110000_business_offerings`                 | New table                                                                                                                                                                                                                                                | none                                                                                                                                                             | down.sql                                                                                                     |
| 18  | `20261118120000_collaboration_requests`             | New tables + partial unique index                                                                                                                                                                                                                        | none                                                                                                                                                             | down.sql (linked conversations remain)                                                                       |
| 19  | `20261118130000_ideas`                              | Ideas, roles, access, view log, team                                                                                                                                                                                                                     | none                                                                                                                                                             | down.sql                                                                                                     |
| 20  | `20261119090000_introductions`                      | Introduction requests                                                                                                                                                                                                                                    | none                                                                                                                                                             | down.sql                                                                                                     |
| 21  | `20261119100000_sessions`                           | Sessions + participants; review subject SESSION                                                                                                                                                                                                          | none                                                                                                                                                             | down.sql (enum value stays)                                                                                  |
| 22  | `20261119110000_group_conversations`                | `conversations.kind` (existing rows → DIRECT), title, subject                                                                                                                                                                                            | Short lock on `conversations` (add column with constant default)                                                                                                 | down.sql — delete GROUP conversations first if wanted                                                        |
| 23  | `20261119120000_community_groups`                   | Groups + members                                                                                                                                                                                                                                         | none                                                                                                                                                             | down.sql                                                                                                     |
| 24  | `20261119130000_group_sessions`                     | Group link, venue pin, check-in fields, WAITLISTED                                                                                                                                                                                                       | none                                                                                                                                                             | down.sql (enum value stays)                                                                                  |
| 25  | `20261119140000_women_safety`                       | `prefers_flexible_hours`, `reports.first_action_at` (backfill), jobs index                                                                                                                                                                               | Index build on `jobs`: short lock                                                                                                                                | down.sql                                                                                                     |
| 26  | `20261120090000_ai_opportunity_intelligence`        | P4 AI: consents, usage logs, `business_ideas.ai_analysis*`, access rule `AI_IDEA_ANALYSIS`                                                                                                                                                               | none                                                                                                                                                             | down.sql (P4; details in `docs/api/ai.md`)                                                                   |
| 27  | `20261121100000_assignment_cancellation_fee`        | R2 W12: nullable `assignments.cancellation_fee_poisha` + CHECK (>= 0, NOT VALID then VALIDATE)                                                                                                                                                           | Short lock on `assignments` (nullable column, no default)                                                                                                        | down.sql                                                                                                     |
| 28  | `20261121110000_account_purge`                      | R2 PRIV-1: nullable `users.purged_at`                                                                                                                                                                                                                    | Short lock on `users` (nullable column)                                                                                                                          | down.sql                                                                                                     |
| 29  | `20261121120000_assignment_reconcile_index`         | R2 DB-4: index `assignments(status, agreed_starts_at)`                                                                                                                                                                                                   | Index build on `assignments`: short lock (see the note below)                                                                                                    | down.sql                                                                                                     |
| 30  | `20261121130000_schema_hygiene`                     | R3: drops the unused camelCase `community_groups."userId"`/`"introductionRequestId"` (and their FKs); index `collaboration_requests(idea_role_id)`                                                                                                       | Pre-check: `SELECT count(*) FROM community_groups WHERE "userId" IS NOT NULL OR "introductionRequestId" IS NOT NULL` must be 0 (the migration refuses otherwise) | down.sql re-adds the empty columns                                                                           |
| 31  | `20261121140000_more_checks`                        | R3: 10 CHECKs added NOT VALID (reviews not self, report priority 0–9, ledger amount > 0, assignment price ≥ 0, business name and session title not blank, introduction expiry after creation, idea view basis, job workers in range, job budget ordered) | none (new and changed rows only)                                                                                                                                 | down.sql drops them                                                                                          |
| 32  | `20261121140100_validate_more_checks`               | Validates each; one that old rows break stays NOT VALID with a NOTICE (the deploy does not fail)                                                                                                                                                         | Read the NOTICEs in the deploy log; see §6.2                                                                                                                     | —                                                                                                            |
| 33  | `20261122090000_verification_declared_gender`       | R7 B1: nullable `verification_requests.declared_gender` (Gender)                                                                                                                                                                                         | None                                                                                                                                                             |
| 34  | `20261124090000_launch_content_seed_key`            | Launch content: nullable unique `seed_key` on `business_ideas` and `community_groups`                                                                                                                                                                    | None                                                                                                                                                             |
| 35  | `20261125090000_training_lesson_steps`              | Lesson steps (`training_lesson_steps`), checkpoints (`training_lesson_checkpoints`), `training_lessons.revision`, `training_questions.lesson_id` and `sort_order`, enum `TrainingStepKind`                                                               | None. Existing lessons show steps derived from their summary until the content is reloaded (`pnpm seed:launch` / `seed:training`)                                | down.sql                                                                                                     |

Indexes are created inside Prisma's migration transaction (not `CONCURRENTLY`). At pilot scale the locks are short. If a table has grown large, run the `CREATE INDEX` statements by hand with `CONCURRENTLY` first, then let the migration's `IF NOT EXISTS` / Prisma state catch up (`prisma migrate resolve --applied <name>` only after checking the result matches the migration exactly).

If a migration fails half-way, Prisma marks it failed and stops. Do not retry blindly: read the error, fix the data, then `prisma migrate resolve --rolled-back <name>` and run `migrate deploy` again.

## 3. Environment variables (Render API service)

Required in production (the API exits at boot if `NODE_ENV` is missing, a secret below is shorter than 32 characters, `OTP_FIXED_CODE` is set, SMS is `console`, or the gateway URL is not https):

| Variable                                                       | Value                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`                                                     | `production`                                                             |
| `PORT`                                                         | Render's port (Render sets it)                                           |
| `API_BASE_URL`                                                 | public https base URL of the API                                         |
| `DATABASE_URL`                                                 | Render Postgres internal URL                                             |
| `REDIS_URL`                                                    | Render Redis (Key Value) internal URL                                    |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                      | 64+ random bytes each, different                                         |
| `ADMIN_SESSION_SECRET`                                         | 64+ random bytes                                                         |
| `ADMIN_TOTP_ENCRYPTION_KEY`                                    | 32-byte key (hex); **changing it breaks every stored admin TOTP** (§5.3) |
| `OTP_HASH_SECRET`                                              | 32+ random bytes                                                         |
| `TRUST_PROXY_HOPS`                                             | number of proxies in front of the API — see §4                           |
| `RUN_SCHEDULERS`                                               | `true` on exactly one instance, `false` on the others                    |
| `SOCKET_REDIS_ADAPTER`                                         | `true` as soon as more than one API instance runs                        |
| `SMS_PROVIDER`, `OPERATOR_PROVIDER`                            | `bdapps`                                                                 |
| `BDAPPS_GATEWAY_URL`                                           | https URL of the PHP gateway's `api/` folder                             |
| `BDAPPS_INTERNAL_API_KEY`                                      | same value as the gateway's `INTERNAL_API_KEY`                           |
| `BDAPPS_PLAN_CODE`, `BDAPPS_SHORT_CODE`, `BDAPPS_SMS_KEYWORD`  | as agreed with BDApps                                                    |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_KEY`, `S3_SECRET`, `S3_REGION` | object storage (private bucket)                                          |

Must **not** be set in production: `OTP_FIXED_CODE`, `ADMIN_SEED_*`.

Optional: `SENTRY_DSN` (unused today), `DEFAULT_LOCALE`, `DEFAULT_TIMEZONE`, `PLATFORM_FEE_DEFAULT_BPS`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `OTP_*` limits.

Admin console (separate Next.js service): `KAJ_API_URL` = the API's https base URL; `KAJ_STORAGE_ORIGINS` = the object storage origin(s), space separated (e.g. `https://<bucket-host>`). It is used for the document-preview CSP and by the console's same-origin upload relay (`/api/admin/uploads`, step pictures), which only forwards PUTs to these origins. The relay PUTs server-side to the presigned URL with the returned `requiredHeaders` (`content-type`) and the exact byte length; no browser CORS is involved.

## 4. Trust proxy (`TRUST_PROXY_HOPS`)

Per-IP rate limits (OTP requests 20/hour per IP, admin login 20/15 min per IP) use `request.ip`. With `TRUST_PROXY_HOPS=0` behind Render's proxy, every request appears to come from the proxy, so one shared bucket would lock everybody out after 20 OTP requests. Production logs a warning at boot while the variable is unset.

1. Set `TRUST_PROXY_HOPS=1` (Render puts one proxy in front of a web service; add one per extra proxy/CDN you put in front, e.g. Cloudflare → 2).
2. Verify after deploy: request an OTP from two different networks (e.g. office Wi-Fi and mobile data) and check in the audit log / logs that the two requests show different client IPs. If both show the same private address, the hop count is too low; if a client can choose its IP with a forged `X-Forwarded-For` header (send `X-Forwarded-For: 1.2.3.4` and see 1.2.3.4 logged), it is too high.

## 5. Credentials

### 5.1 Where they live

- API secrets: Render environment (never in the repo; `.env` files are git-ignored).
- BDApps credentials and `INTERNAL_API_KEY`: only in the PHP gateway's env file (§7).
- Admin logins: `users` + `admin_credentials` rows; TOTP secrets encrypted with `ADMIN_TOTP_ENCRYPTION_KEY`.

### 5.2 Rotating API secrets

| Secret                                                 | Effect of rotating                                    | Steps                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`                                    | access tokens (15 min) stop working; apps refresh     | Set new value, redeploy                                                                            |
| `JWT_REFRESH_SECRET`                                   | every app user is signed out and must log in with OTP | Set new value, redeploy; announce if needed                                                        |
| `ADMIN_SESSION_SECRET`                                 | admin sessions end; staff sign in again               | Set new value, redeploy                                                                            |
| `OTP_HASH_SECRET`                                      | OTPs in flight (5 min) fail; users request a new one  | Set new value, redeploy                                                                            |
| `BDAPPS_INTERNAL_API_KEY` + gateway `INTERNAL_API_KEY` | API ↔ gateway calls fail until both match             | Generate (`openssl rand -hex 32`), set on the gateway first, then on Render, redeploy; test §6 OTP |
| BDApps password / app hash                             | carrier calls fail until updated                      | Change in the BDApps portal, then the gateway env file                                             |
| Database password                                      | API cannot connect until `DATABASE_URL` is updated    | Rotate in Render, update `DATABASE_URL`, redeploy                                                  |
| S3 keys                                                | uploads/downloads fail until updated                  | Create new key, update env, redeploy, delete old key                                               |

### 5.3 `ADMIN_TOTP_ENCRYPTION_KEY`

Rotating it makes every stored TOTP secret unreadable. Only rotate with a planned re-enrolment: set the new key, then for each staff account set a new password and TOTP secret (store the TOTP ciphertext produced with the new key) and give it to the person over a separate channel.

### 5.4 The development seed admin (SEC-1)

The development seed's example login (`admin@kaj.local` and the values in `.env.example`) is public. The seed now refuses those values for any database not on the local machine and creates no admin without explicit values, but older hosted databases may still contain it. Check:

```sql
SELECT u.id, u.email, u.status, c.role FROM users u JOIN admin_credentials c ON c.user_id = u.id;
```

If `admin@kaj.local` (or any account seeded with the example password) exists on a hosted database: create a real ADMIN account with a new password and TOTP secret, sign in with it, then disable the seed account (`UPDATE users SET status='BANNED', is_admin=false, password_hash=NULL WHERE email='admin@kaj.local'; DELETE FROM admin_credentials WHERE user_id = …;`). Keep at least two ADMIN accounts (appeals need a second administrator).

### 5.5 After any suspected leak

Rotate the affected secret (§5.2), revoke admin sessions (`DELETE FROM admin_sessions;`), review `audit_logs` since the suspected time, and rotate the gateway credentials if a gateway zip or env file was ever shared.

## 6. Smoke test after deploy

Run from a laptop against production; use a staff phone number, not a customer's.

1. `curl -fsS https://<api>/health` → `{"status":"ok"}` (liveness: no database or Redis call).
2. `curl -fsS https://<api>/ready` → `{"status":"ok"}` (database `SELECT 1` and Redis `PING`; 503 if either is down). Use `/health` as Render's health-check path; `/ready` for an external monitor.
3. `prisma migrate status` → "Database schema is up to date".
4. App: request an OTP for the staff number → SMS arrives through the gateway; sign in.
5. App: open Home and the job feed; open Learn → mentors; open Business → sectors (`GET /api/v1/business-categories` returns 11 sectors).
6. Admin console: sign in (password + TOTP) with a real ADMIN account; open Users, Safety reports (priority queue filter), Verification.
7. Check logs for the `TRUST_PROXY_HOPS` warning (must be absent) and for 5xx responses.
8. §4 step 2 (client IPs differ).

Roll back if 1–4 fail: redeploy the previous build; the schema is add-only, so the old code runs on the new schema (rolling the schema back is only needed for the cases in §2's "Rollback" column).

### 6.1 One-off data fix after R2 (W10)

Since R2, leaving or being removed from a group gives up the person's places on the group's sessions. People who left or were removed **before** the deploy may still hold an ACCEPTED or WAITLISTED place, and they can no longer open the session. Free those places once, after the deploy (read-only check first):

```sql
-- How many?
SELECT count(*) FROM session_participants sp
JOIN sessions s ON s.id = sp.session_id
WHERE s.group_id IS NOT NULL AND s.status IN ('DRAFT', 'SCHEDULED')
  AND sp.role = 'PARTICIPANT' AND sp.status IN ('INVITED', 'ACCEPTED', 'WAITLISTED')
  AND NOT EXISTS (SELECT 1 FROM community_group_members m
                  WHERE m.group_id = s.group_id AND m.user_id = sp.user_id AND m.status = 'ACTIVE');
-- Free them (same WHERE):
UPDATE session_participants sp SET status = 'DECLINED', responded_at = now()
FROM sessions s
WHERE s.id = sp.session_id AND s.group_id IS NOT NULL AND s.status IN ('DRAFT', 'SCHEDULED')
  AND sp.role = 'PARTICIPANT' AND sp.status IN ('INVITED', 'ACCEPTED', 'WAITLISTED')
  AND NOT EXISTS (SELECT 1 FROM community_group_members m
                  WHERE m.group_id = s.group_id AND m.user_id = sp.user_id AND m.status = 'ACTIVE');
```

Waitlists move up the next time a place changes on each session (a host raising capacity, someone leaving); hosts can also re-invite.

### 6.2 After R3: constraints left NOT VALID

Migration 32 leaves a CHECK NOT VALID when existing rows break it. It still applies to every new or changed row. To find what is left and fix it:

```sql
SELECT conrelid::regclass AS table_name, conname FROM pg_constraint
WHERE NOT convalidated AND contype = 'c';
-- e.g. jobs whose budget is upside down:
SELECT id, budget_min_poisha, budget_max_poisha FROM jobs
WHERE budget_min_poisha > budget_max_poisha;
```

Correct those rows (with the owner), then `ALTER TABLE <table> VALIDATE CONSTRAINT <name>;`.

## 7. PHP BDApps gateway: where the env file must live (GW-3)

The gateway reads its configuration from, in order: `KAAJ_GATEWAY_ENV_FILE`, then `../kaaj-bdapps-gateway.env`, then `.env` in its own folder. When the gateway is installed at `public_html/bdapps/`, the second location (`public_html/kaaj-bdapps-gateway.env`) is **inside the web root** and may be downloadable — the gateway's `.htaccess` does not cover its parent, and nginx, `php -S` and OpenLiteSpeed ignore `FilesMatch`.

Do this:

1. Put the env file outside every document root, e.g. `/home/<user>/private/kaaj-bdapps-gateway.env`, mode `0600`, owned by the PHP user.
2. Point to it explicitly: `SetEnv KAAJ_GATEWAY_ENV_FILE /home/<user>/private/kaaj-bdapps-gateway.env` in the gateway folder's `.htaccess` (or the PHP-FPM pool config).
3. Make sure no `kaaj-bdapps-gateway.env` or `.env` exists anywhere under `public_html/`.
4. Set `GATEWAY_STORAGE_DIR` (and `GATEWAY_LOG_FILE`) to a folder outside `public_html`, e.g. `/home/<user>/kaaj-gateway-storage`, mode `0700`.
5. Verify from outside: `curl -s -o /dev/null -w '%{http_code}' https://<host>/kaaj-bdapps-gateway.env` and `…/bdapps/.env` → 403 or 404, never 200.

## 8. Launch content (`pnpm seed:launch`)

The founder-approved launch content lives in `backend/prisma/launch-content/`: `ideas-and-groups.json` (ideas, partner calls, community groups) and `courses/<slug>.json` (one course per file, the training-content format). CI checks every file (`test/launch-content-files.spec.ts`): the loader schemas, four options a–d with a correct one, and Bangla and English summaries with the same number of lines.

It is **never** part of `seed`, the build or the deploy. Run it on purpose, once:

1. The reference data is loaded (business and work categories, Rajshahi areas) and migration 34 is applied.
2. The owner is an **admin account** (`users.is_admin`): `LAUNCH_OWNER_EMAIL`, else `ADMIN_SEED_EMAIL`, else the only admin when there is exactly one. With no match, or more than one admin and no email, it stops before writing anything. It never creates an account.
3. Optional: a verified woman (identity-verified, gender female) who will moderate the women-only group has signed up. Without her, that group is **held** (not created) and the summary says so. Re-run later with her phone to create it.

```bash
cd backend
LAUNCH_OWNER_EMAIL=admin@example.org \
LAUNCH_WOMEN_MODERATOR_PHONE=+8801YYYYYYYYY \
corepack pnpm seed:launch
```

- The owner's profile is made presentable so cards show a name, not "Name not provided": display name `LAUNCH_OWNER_NAME` (default "KAAJ"; an existing name is kept unless `LAUNCH_OWNER_NAME` is set), shown in full, and placed in Shaheb Bazar when it has no area. Its trust level is **not** changed.
- Ideas and partner calls belong to the owner, with every role's arrangement `UNDECIDED`. Groups are moderated by the owner (the women-only group by the woman moderator only). Groups without an area are placed in the city (Rajshahi).
- Each lesson's first two questions (`lesson: N` in the files) are its checkpoint; steps are derived from the summary lines. In safety-critical courses lessons unlock in order and the final test needs every checkpoint.
- Courses are published, except those marked `isSafetyCritical`: they load **unpublished** until a qualified trainer has reviewed them. Then run again with `--publish-safety` (or publish them in the admin console).
- Re-running is safe: ideas and groups are matched by `seed_key`, courses by slug. Changed text updates in place (a course's version goes up when its lessons or questions change); a role taken out of the content is closed, not deleted; an arrangement chosen later in the app is kept.
- It prints a summary (created, updated, unchanged, held, unpublished) and then the full result as JSON.
- Note: the app requires identity verification to make an idea summary public or to create a group; the loader writes these rows directly for the admin owner, who is not identity-verified, so idea cards show the owner as not verified. Readers can still request access, ask about a role and join a group, and the owner can answer them.

## 9. What this runbook does not cover

- Render service creation, DNS and TLS (owner's account actions).
- Mobile release and store listing.
- Data-retention jobs other than the account purge (PRIV-2). Since R2 a daily runner purges an account 30 days after `DELETE /me`: its documents and photo are deleted from storage, and phone, e-mail, passwords, name, bio, coordinates, birth year, gender and devices are cleared, which frees the number. Work records stay without a name. The window is `ACCOUNT_PURGE_AFTER_DAYS` in `users/account-purge.service.ts`; change it there if a legal retention rule says otherwise.
