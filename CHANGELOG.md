# Changelog

All notable project changes are documented here.

## Unreleased

### Engineering

- Initialized the pnpm monorepo with pinned Node/package-manager versions and recursive development,
  test, lint, typecheck, migration, and seed commands.
- Added the PostgreSQL 16, Redis 7, MinIO, and MailHog local Compose stack with health checks,
  loopback-only ports, and persistent volumes.
- Added the shared-types workspace and the minimum NestJS `/health` plus Prisma bootstrap required
  to verify the clean-clone foundation.
- Added environment, contribution, and security guidance and recorded the unresolved
  PostgreSQL-versus-Turso production decision in ADR-0001.

### Documentation

- Added the P0-RES-03 Rajshahi market analysis covering population, named neighbourhood clusters, a reproducible three-zone business sample, current hiring and earning channels, price observations, payments, connectivity, and seasonality.
- Separated sourced observations from inferences and documented the field measurements required for P0-RES-04.
- Added the P0-RES-02 capability gap matrix with all 22 prescribed rows and eight comparison columns.
- Documented the `Yes / Partial / No / Unknown` scoring rubric, evidence interpretation, and distinction between KAJ planned scope and implemented capability.
- Added the P0-RES-01 competitor study with 28 field-by-field comparisons and 71 cited public sources.
- Recorded confidence, explicit assumptions, evidence limitations, and the handoff to the capability gap matrix.
- Recorded Turso/libSQL as the owner-selected storage direction pending a pre-Phase-1 compatibility ADR; no credential was stored.
- Added the executable build plan, live completion tracker, and per-step completion-report procedure.
- Added the master build guide, UI requirements, and pre-build plan to version control.
- Documented the Phase 0 human-review gate and current local toolchain baseline.
