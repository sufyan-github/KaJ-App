# P1-INF-03 — Prisma schema v1 and migrations

**Status:** COMPLETE
**Completed:** 2026-08-18
**Phase:** Phase 1 — foundation
**Commit:** This completion record is part of the task commit; exact hash is in Git history and the final task report.
**Remote:** `origin/agent/p1-inf-03-prisma-schema` (draft pull request to `main`)

## Scope

This task accepted PostgreSQL as the authoritative transactional database, implemented every D2
table and core enum, generated the first migration, added UUID v7 database defaults and required
indexes, and created an idempotent development seed.

It did not add authentication services, controllers, runtime taxonomy endpoints, verified location
coordinates, fake marketplace activity, production credentials, or Turso synchronization.

## Inputs and instructions followed

- `KAJ_BUILD_GUIDE.md` D2, D6, D8, D11, D12, B5, and P1-INF-03.
- `KAJ_PREBUILD_PLAN.md` taxonomy, location-verification, and seed-data restrictions.
- Accepted `docs/decisions/ADR-0001-database-platform.md` PostgreSQL path.
- P1-INF-01 Compose/environment foundation and P1-INF-02 Prisma service shell.

## Output

- A 46-table relational Prisma schema with foreign keys, unique constraints, soft-delete columns,
  money stored as integer poisha, and contract indexes.
- A PostgreSQL migration enabling `cube`, `earthdistance`, and `pgcrypto`, defining a PostgreSQL
  16-compatible UUID v7 generator, and creating the geographic expression index.
- An idempotent TypeScript seed with eight starter categories, 16 starter skills, 20 Rajshahi
  location nodes, one local admin, 12 disabled feature flags, and three required configuration
  records.
- Prisma schema/seed tests and root migration-reset documentation.

## How it operates

`corepack pnpm migrate` applies committed migrations. `corepack pnpm seed` upserts stable records by
their natural keys and can be rerun without duplication. `corepack pnpm migrate:reset` is explicitly
for the local development database and rebuilds it from migrations.

All model IDs use a database-side UUID v7 default. The seed does not create fake workers, jobs,
reviews, ratings, or counts. Pilot location coordinates remain null until Phase 2 field verification.

## Process and procedure

1. Merged P1-INF-02 and created a task branch from updated `main`.
2. Accepted the recommended PostgreSQL path in ADR-0001.
3. Translated every D2 table, enum, relation, unique rule, and index into Prisma.
4. Generated and augmented the first migration for PostgreSQL extensions, UUID v7, and GIST distance
   search.
5. Added the starter taxonomy, location hierarchy, local admin, flags, and configuration seed.
6. Started an isolated temporary PostgreSQL server, reset the database, seeded it twice, queried the
   result, verified migration drift, stopped the server, and moved its data directory to the Recycle
   Bin.

## Verification evidence

- `prisma validate`: PASS.
- `prisma migrate reset --force --skip-seed`: PASS; first migration applied.
- `corepack pnpm --filter @kaj/backend seed` twice: PASS; both runs completed idempotently.
- `prisma migrate diff ... --exit-code`: PASS — `No difference detected.`
- Direct SQL: PASS — 46 D2 tables, 8 categories, 16 skills, 20 locations, 1 admin, 12 flags,
  0 enabled flags, and 3 config settings.
- Direct SQL: PASS — the seeded user ID reports UUID version 7.
- `prisma-schema.spec.ts`: PASS — required tables, defaults, indexes, flags, and config seeds.
- Backend strict TypeScript including `prisma/seed.ts`: PASS.
- `corepack pnpm test`: PASS — 6 root tests and 15 backend tests.
- `corepack pnpm lint`: PASS — all root and workspace formatting checks.
- `corepack pnpm typecheck`: PASS — backend, seed, and shared types.
- `corepack pnpm build`: PASS — NestJS and shared-types production builds.
- `corepack pnpm audit:prod`: PASS — only four documented, gated exceptions remain; the Prisma
  exception was reviewed at this task's mandatory gate.

## Acceptance results

| Acceptance item                          | Result | Evidence                                                                           |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| Every D2 table and enum exists           | PASS   | Schema test and direct SQL report all 46 specified tables.                         |
| UUID v7 is the ID default                | PASS   | Database function/default plus direct version query.                               |
| Soft-deletable records have `deleted_at` | PASS   | Users, profiles, jobs, messages, and documents carry nullable deletion timestamps. |
| All D2 indexes exist                     | PASS   | Compound indexes plus raw PostgreSQL `ll_to_earth` GIST index verified.            |
| Migration diff is clean                  | PASS   | Prisma reports no difference between migrations and schema.                        |
| Seed creates required baseline           | PASS   | Direct counts and exact disabled/config assertions.                                |
| Reset then seed is usable and idempotent | PASS   | Live isolated PostgreSQL reset followed by two successful seed passes.             |

## Decisions and limitations

- PostgreSQL is authoritative; Turso is excluded from transactional domain data.
- The live acceptance used an isolated PostgreSQL 18.3 binary because Docker was unavailable in this
  session. The migration targets PostgreSQL 16 syntax and supplies its own UUID v7 function rather
  than relying on PostgreSQL 18's native function.
- Starter taxonomy names require Phase 2 user validation. Area-to-thana grouping and coordinates
  require local verification before matching; no coordinates were fabricated.
- The local seed admin uses a deliberately non-routable development identity and no password.
- Phase 0 research and legal gates remain unreviewed under the recorded sequencing override.

## Next task

P1-AUTH-04 — phone OTP authentication, refresh rotation, and refresh-family reuse revocation.
