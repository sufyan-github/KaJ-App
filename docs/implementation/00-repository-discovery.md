# 00 — Repository Discovery

- **Status:** Phase 00 deliverable. Read-only discovery; no source, schema or configuration was changed.
- **Date:** 8 November 2026.

## 1. Where the code actually is

The local folders named in the original brief (`…/9.App Dev/Kaaj`, `…/9.App Dev/Kaj`) were **not reachable** from this cloud session:

- No Remote Control folder was offered.
- `/mnt/5CCC94D5CC94AB32` doesn't exist here.

Everything below was discovered from the GitHub repository `sufyan-github/KaJ-App`. It's **public** and is readable anonymously through the session git proxy. **No push or GitHub API access is attached.**

> **Risk R-00:** work on the owner's machine that was never pushed is invisible to this audit. Before Gate A, the owner should confirm that GitHub holds the latest code, or push it.

### 1.1 One Git repository, two unrelated histories

| Line             | Branch (tip)                                          | Content                                                                                                                    | Root commit                    | Relationship                                           |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| Backend + admin  | `agent/p1-ui-07-tracker` @ `94adf43` (3 Oct 2026)     | pnpm monorepo: `backend/` NestJS API, `admin/` Next.js console, `packages/shared-types`, `infrastructure/`, specs and docs | `4ded9b1` (shared with `main`) | 39 commits ahead of `main`, 0 behind; **never merged** |
| Mobile + landing | `codex/production-hardening` @ `9fe6a54` (3 Oct 2026) | Flutter Android app (`lib/`, `android/`, `test/`), `landing-page/` (React + Vite), release tooling, CI                     | `7a08d07`                      | **No common ancestor** with `main`                     |

The brief's names map as **Kaaj = mobile line** and **Kaj = backend line**:

- `IMPLEMENTATION_STATUS.md` says "Android Flutter project in the requested `Kaaj` directory".
- `docs/COMPLETION_TRACKER.md` calls the mobile app "sibling `../Kaaj`".

### 1.2 All branches

| Branch                             | Tip       | Date   | Status                                                                                 |
| ---------------------------------- | --------- | ------ | -------------------------------------------------------------------------------------- |
| `main` (default)                   | `2637dff` | 18 Aug | Foundation only: PRs #1–#3 (monorepo tooling, NestJS foundation, Prisma schema v1)     |
| `agent/p1-inf-01-monorepo-tooling` | `aa4a565` | 18 Aug | Merged into `main` (PR #1)                                                             |
| `agent/p1-inf-02-api-foundation`   | `6052ce0` | 18 Aug | Merged (PR #2)                                                                         |
| `agent/p1-inf-03-prisma-schema`    | `e5e2b0c` | 18 Aug | Merged (PR #3)                                                                         |
| `agent/p1-auth-04-phone-otp`       | `51bba0b` | 18 Aug | Contained in `agent/p1-ui-07-tracker`                                                  |
| `codex/production-readiness`       | `c0ba76d` | 3 Oct  | All 37 commits contained in `agent/p1-ui-07-tracker`                                   |
| `agent/p1-ui-07-tracker`           | `94adf43` | 3 Oct  | **Authoritative backend/admin line** (matches what the docs say is deployed to Render) |
| `codex/production-hardening`       | `9fe6a54` | 3 Oct  | **Authoritative mobile line**                                                          |

No commits were made on any branch between 3 Oct and 8 Nov; this was re-fetched on 8 Nov.

### 1.3 Local working copies in this session

| Path                     | Source                                   | Git state                    |
| ------------------------ | ---------------------------------------- | ---------------------------- |
| `/home/user/KaJ-App`     | full clone, all branches                 | `main`, clean                |
| `/home/user/kaj-backend` | worktree of `agent/p1-ui-07-tracker`     | detached at `94adf43`, clean |
| `/home/user/kaj-mobile`  | worktree of `codex/production-hardening` | detached at `9fe6a54`, clean |

I found no uncommitted changes and no in-progress merges or rebases. The open PR list couldn't be read, because the GitHub API isn't attached. `main`'s history shows PRs #1–#3 merged.

## 2. Components and their locations

| Component                | Path                                            | Stack (pinned versions)                                                                                                                                            |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend API              | `kaj-backend/backend/`                          | NestJS 10.4.22 (Express), Prisma 6.19.3, class-validator 0.14.4, zod 4.4.3 (env), nestjs-pino, socket.io 4.8.1, ioredis 6, sharp 0.35.5, AWS SDK v3 S3, bcryptjs 3 |
| Admin console            | `kaj-backend/admin/`                            | Next.js 16.3.8, React 19.2.4, no UI library; Playwright e2e (mocked API)                                                                                           |
| Shared types             | `kaj-backend/packages/shared-types/`            | **Empty** (`export {};`); used by nothing                                                                                                                          |
| Database                 | `kaj-backend/backend/prisma/`                   | PostgreSQL 16; 66 models, 41 enums, 20 migrations (18 Aug → 3 Oct); UUID v7 via `uuid_generate_v7()`                                                               |
| Local infra              | `kaj-backend/infrastructure/docker-compose.yml` | postgres:16, redis:7, MinIO, MailHog                                                                                                                               |
| Mobile app               | `kaj-mobile/lib`, `android/`                    | Flutter 3.47 / Dart 3.13; flutter_riverpod 2.6, go_router 17.5, dio 5.11, hive_ce, flutter_secure_storage 11, socket_io_client 3.1, sentry_flutter 9.27            |
| Landing page             | `kaj-mobile/landing-page/`                      | React 19.2, Vite 6.4, Cloudflare-Worker static host, `contact.php`                                                                                                 |
| Carrier gateway (bdApps) | **Not in either repo**                          | A separate PHP gateway holds bdApps credentials (`docs/BDAPPS_INTEGRATION.md:3-48`). Only a placeholder template exists (`kaj-mobile/.env.example`)                |
| Hosting (from docs)      | —                                               | API on Render (`kaaj-api.onrender.com` / `api.kaaj.app`); Postgres on Supabase; landing on a worker host                                                           |

## 3. Configuration and secrets

**Backend `.env.example`** (names only):

- Runtime: `NODE_ENV`, `PORT`, `API_BASE_URL`.
- Postgres and Redis: `POSTGRES_*`, `DATABASE_URL`, `REDIS_*`.
- JWT: `JWT_ACCESS_SECRET/REFRESH_SECRET/ACCESS_TTL/REFRESH_TTL`.
- Admin: `ADMIN_SESSION_SECRET`, `ADMIN_TOTP_ENCRYPTION_KEY`, `ADMIN_SEED_EMAIL/PASSWORD/TOTP_SECRET`.
- OTP: `OTP_TTL_SECONDS`, `OTP_FIXED_CODE`, `OTP_HASH_SECRET`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN_SECONDS`.
- Providers: `SMS_PROVIDER`, `OPERATOR_PROVIDER`, `BDAPPS_GATEWAY_URL`, `BDAPPS_INTERNAL_API_KEY`, `PUSH_PROVIDER`, `STORAGE_PROVIDER`, `PAYMENT_PROVIDER`.
- Storage and mail: `MINIO_*`, `MAILHOG_*`.
- Other: `FCM_SERVICE_ACCOUNT_JSON_PATH`, `SENTRY_DSN`, `PLATFORM_FEE_DEFAULT_BPS`, `DEFAULT_TIMEZONE`, `DEFAULT_LOCALE`.

Its values are local-development defaults. Production configuration review is tracked in the private security register (not in Git).

**Mobile `.env.example`** holds PHP-gateway settings only: `BDAPPS_APP_ID`, `BDAPPS_PASSWORD`, `BDAPPS_APP_HASH`, `INTERNAL_API_KEY`, `NODE_BACKEND_URL`, `NODE_BACKEND_WEBHOOK_PATH`. On 8 Nov all values were checked and look like placeholders.

**Git history:** scanned on 7 Nov across every branch. It holds no `.env`, keystore, `key.properties`, `google-services.json`, private keys or tokens. Credential-rotation follow-ups are tracked in the private security register (not in Git).

## 4. CI/CD

| Repo line     | CI                                   | Contents                                                                                                                                       |
| ------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend/admin | **None** (no `.github/`)             | `docs/COMPLETION_TRACKER.md` still lists P1-QA-09 "GitHub Actions gates" as PLANNED                                                            |
| Mobile        | `.github/workflows/flutter.yml`      | format, analyze, test with coverage, client-secret scan, history scan, prod arm64 release APK build, package-metadata check, 35 MB size budget |
| Deployment    | Manual Render deploys (docs); no IaC | README records that the Render build ran the dev seed until 3 Oct                                                                              |

## 5. Tests

| Suite              | Location                                              | Size                                                               |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Backend unit + e2e | `kaj-backend/backend/test/`                           | 57 files / 56 Jest suites; 9 DB suites gated by `*_DATABASE_E2E=1` |
| Root foundation    | `kaj-backend/tools`, `test/`                          | node:test, 6 tests                                                 |
| Admin e2e          | `kaj-backend/admin/tests/e2e/high-risk-flows.spec.ts` | 8 Playwright tests, backend fully mocked                           |
| Mobile             | `kaj-mobile/test/`                                    | 33 `_test.dart` files                                              |
| Mobile tooling     | `kaj-mobile/tool/tests`                               | Python unittest, 10 tests                                          |

Fresh results are in `00-baseline-results.md`.

## 6. Documentation already in the repositories

- **Specs (backend line root):** `KAJ_BUILD_GUIDE.md` (authoritative architecture and gates), `KAJ_UI_REQUIREMENTS.md`, `KAJ_PREBUILD_PLAN.md`.
- **Planning:** `docs/BUILD_PLAN.md`, `docs/COMPLETION_TRACKER.md` (stale since 5 Sep), and one completion record per task in `docs/completed/` (27 files).
- **Other backend docs:** ADR-0001 (PostgreSQL 16), `docs/security/dependency-exceptions.md` (exceptions expired 18 Sep), `docs/BDAPPS_INTEGRATION.md`.
- **Mobile docs:** `docs/` with production audits, the deployment record and the launch checklist.

**Placement decision:** new implementation docs go in `docs/implementation/` on the backend line, which already has an established `docs/` tree and is the intended monorepo root (its README lists `mobile/` in the repository map).

## 7. Discovery conclusions

1. **The product is one system split across two unmerged histories.** Production runs code that isn't on `main`.
2. **Before any implementation branch is cut:** merge or confirm the backend line, and decide where the mobile code lives (the recommendation is the monorepo `mobile/`, imported with history via `git subtree`). This is an owner decision for **Gate A**.
3. **Two dependencies are outside the repositories** and can't be audited here: the PHP bdApps gateway, and the production configuration (Render environment, Supabase settings).
4. **The repository is public.** Security findings are kept in a private register and are not committed here.
