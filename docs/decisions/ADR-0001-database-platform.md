# ADR-0001 — Database platform direction

**Status:** PROPOSED — owner decision required before P1-INF-03
**Date:** 2026-08-18
**Decision owner:** Abu Sufyan

## Context

The build contract locks PostgreSQL 16 with Prisma and later requires relational transactions,
concurrency controls, and geographic ranking. The owner separately selected a Turso/libSQL database
endpoint. Those choices are not interchangeable: provider syntax, migrations, transaction behavior,
geographic querying, concurrency guarantees, backup/restore, and production topology differ.

No Turso credential is stored in this repository.

## Current foundation decision

P1-INF-01 retains PostgreSQL 16 for the local development stack because that is the explicit task
contract and is sufficient for the database-independent API foundation. This does not select the
production database and does not write application data to the owner-selected Turso database.

## Decision required

Before P1-INF-03 creates the domain schema, the owner must accept one tested path:

1. PostgreSQL remains the authoritative development and production database; Turso is not used for
   transactional domain data.
2. Turso/libSQL becomes authoritative; P1-INF-03 is redesigned around a verified Prisma/libSQL
   adapter or another approved ORM, with compatibility tests for migrations, transactions,
   concurrency, geographic queries, backup/restore, and deployment.
3. A deliberately split architecture is approved with explicit ownership and synchronization rules
   for every data class. This is the highest-complexity option and is not recommended for the MVP.

P1-INF-02 may proceed because its API envelope, validation, logging, health, and request-context work
does not require the final database provider. P1-INF-03 is blocked until this ADR is accepted and the
chosen path is verified.
