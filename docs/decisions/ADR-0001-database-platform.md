# ADR-0001 — Database platform direction

**Status:** ACCEPTED — PostgreSQL is authoritative
**Date:** 2026-08-18
**Decision owner:** Abu Sufyan

## Context

The build contract locks PostgreSQL 16 with Prisma and later requires relational transactions,
concurrency controls, and geographic ranking. The owner separately selected a Turso/libSQL database
endpoint. Those choices are not interchangeable: provider syntax, migrations, transaction behavior,
geographic querying, concurrency guarantees, backup/restore, and production topology differ.

No Turso credential is stored in this repository.

## Decision

PostgreSQL 16 is the authoritative development and production database for transactional domain
data. Prisma remains the ORM and migration owner. Turso/libSQL is not used for transactional domain
data and no synchronization path is introduced.

The owner instructed the agent to proceed after PostgreSQL was presented as the recommended choice
and Turso/libSQL redesign was identified as the alternative. P1-INF-03 therefore implements the
locked PostgreSQL path.

## Consequences

- PostgreSQL transactions, foreign keys, expression indexes, and later geographic ranking may be
  implemented directly against the build contract.
- Local development and CI use the same provider as production.
- Any future Turso use requires a new ADR with an explicit non-authoritative data class, ownership,
  synchronization, failure, backup, and recovery design.
- The previously exposed Turso credential remains excluded from Git and must be rotated; this ADR
  does not authorize its use.

## Alternatives rejected

Turso/libSQL as the authoritative database and a split transactional architecture were rejected for
the MVP because they would contradict or materially complicate the locked transaction, concurrency,
geographic-query, migration, backup, and operational requirements.
