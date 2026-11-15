# Production dependency security exceptions

**Last reviewed:** 2026-11-08

The CI release gate is `corepack pnpm audit --prod --audit-level high` (`.github/workflows/backend-admin-ci.yml`). It fails on any high or critical advisory in production dependencies. Moderate and low advisories must be listed below with a review gate.

Exceptions are temporary constraints, not statements that the vulnerabilities are safe in every use.

## Active exceptions

| Advisory                                                                                             | Dependency path        | Reason an immediate upgrade is blocked                                                                           | Current exposure and control                                                                                                                  | Mandatory review gate                                                                |
| ---------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [CVE-2026-35515 / GHSA-36xv-jgw5-4q75](https://github.com/advisories/GHSA-36xv-jgw5-4q75) (moderate) | `@nestjs/core@10.4.22` | The patch is NestJS 11.1.18; moving from NestJS 10 to 11 is a framework upgrade that needs its own tested change | The issue requires attacker-influenced SSE `type` or `id` fields. KAJ has no SSE endpoint and must not add one while this exception is active | Before any SSE endpoint, before production launch, or 2026-12-31, whichever is first |

## Remediated on 2026-11-08 (Phase 01, WP-0)

Root `pnpm.overrides` and direct upgrades took the production audit from 13 findings (3 critical, 6 high, 4 moderate) to the single moderate exception above:

| Package                 | From → to       | Notes                                                                                                                                                   |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next` (admin)          | 16.3.8 → 16.4.2 | Critical RCE and high DoS advisories                                                                                                                    |
| `proxy-addr`            | 2.0.7 → 2.0.8   | Critical IP-spoofing advisory                                                                                                                           |
| `zod` (backend, direct) | 4.4.3 → 4.6.6   | —                                                                                                                                                       |
| `body-parser`           | 1.20.6 → 1.20.9 | —                                                                                                                                                       |
| `multer`                | 2.4.0 → 2.5.0   | —                                                                                                                                                       |
| `qs`                    | 6.16.0 → 6.16.1 | —                                                                                                                                                       |
| `source-map-js`         | 1.2.1 → 1.2.2   | —                                                                                                                                                       |
| `file-type`             | 20.4.1 → 21.3.3 | Major override under `@nestjs/common`. KAJ's upload pipeline does its own magic-byte and `sharp` inspection and does not use Nest's `FileTypeValidator` |
| `deepmerge-ts`          | 7.1.5 → 8.0.1   | Major override under `@prisma/config`; only used at process startup                                                                                     |

Verified after the change: typecheck, all builds, 312/312 backend tests (all database suites) and 8/8 admin e2e.

Every override change must pass the same gates.
