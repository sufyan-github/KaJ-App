# Production dependency security exceptions

**Last reviewed:** 2026-08-18

The release-gating command is `corepack pnpm audit:prod`. The reviewed advisory IDs are centralized
in `pnpm.auditConfig.ignoreCves`; the command still fails for any new advisory. Exceptions are
temporary constraints, not statements that the vulnerabilities are safe in all uses.

## Active exceptions

| Advisory                                                                                  | Dependency path                                 | Reason an immediate upgrade is blocked                                                                                                        | Current exposure and control                                                                                                                                                                                 | Mandatory review gate                                                         |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| [CVE-2026-35515 / GHSA-36xv-jgw5-4q75](https://github.com/advisories/GHSA-36xv-jgw5-4q75) | `@nestjs/core@10.4.22`                          | The patch is NestJS 11.1.18, while the build contract locks NestJS 10.                                                                        | The issue requires attacker-influenced SSE `type` or `id` fields. KAJ has no SSE endpoint and must not add one while this exception is active.                                                               | Before any SSE endpoint, before production, or 2026-09-18—whichever is first. |
| [CVE-2026-31808 / GHSA-5v7r-6r5c-r473](https://github.com/advisories/GHSA-5v7r-6r5c-r473) | `@nestjs/common@10.4.22 > file-type@20.4.1`     | The fixed `file-type` line is a major-version override not declared compatible by NestJS 10.                                                  | KAJ currently has no upload or file-type detection endpoint. Untrusted files must not reach this dependency.                                                                                                 | Before P2 upload work, before production, or 2026-09-18.                      |
| [CVE-2026-32630 / GHSA-j47w-4g3g-c36v](https://github.com/advisories/GHSA-j47w-4g3g-c36v) | `@nestjs/common@10.4.22 > file-type@20.4.1`     | The fixed `file-type` line is a major-version override not declared compatible by NestJS 10.                                                  | Same control as CVE-2026-31808; no untrusted file inspection is enabled.                                                                                                                                     | Before P2 upload work, before production, or 2026-09-18.                      |
| [CVE-2026-40345 / GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) | `Prisma 6.19.3 > @prisma/config > deepmerge-ts` | The patch is a major dependency change inside Prisma; Prisma 7 also changes the configuration model and requires a separately tested upgrade. | Reviewed during P1-INF-03: Prisma configuration remains developer-controlled at process startup, and no request or user object reaches `deepmerge-ts`. The exception is retained without expanding exposure. | Before P1-QA-09, before production, or 2026-09-18—whichever is first.         |

## Remediated transitives

P1-INF-02 pins compatible transitive overrides for `multer@2.2.0`, `body-parser@1.20.6`,
`qs@6.15.2`, `js-yaml@4.3.1`, and `lodash@4.18.0`. Those overrides reduced the production audit
from 18 findings to the four explicitly gated exceptions above. All tests, typechecks, and builds
must pass whenever an override changes.
